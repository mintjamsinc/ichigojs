// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import * as acorn from "acorn";
import * as walk from "acorn-walk";

/**
 * Utility class for analyzing JavaScript expressions to extract variable and function dependencies.
 */
export class ExpressionUtils {
    /**
     * Extracts variable and function names used in the expression.
     * @param expression The expression string to analyze.
     * @param functionDependencies A dictionary mapping function names to their dependencies.
     * @returns An array of identifier names.
     */
    static extractIdentifiers(expression: string, functionDependencies: Record<string, string[]>): string[] {
        const identifiers = new Set<string>();
        const ast = acorn.parse(`(${expression})`, { ecmaVersion: "latest" });

        // Use walk.full instead of walk.simple to visit ALL nodes including assignment LHS
        walk.full(ast, (node: any) => {
            if (node.type === 'Identifier') {
                identifiers.add(node.name);

                // Check if the identifier is a function name
                if (functionDependencies[node.name]) {
                    // If it is, add its dependencies to the list of identifiers
                    for (const dependency of functionDependencies[node.name]) {
                        identifiers.add(dependency);
                    }
                }
            } else if (node.type === 'MemberExpression') {
                // Reconstruct chain parts from a MemberExpression (e.g. a.b.c)
                const parts: string[] = [];

                let cur: any = node;
                let stop = false;

                while (cur && !stop) {
                    // property part (right side)
                    if (cur.property) {
                        if (!cur.computed && cur.property.type === 'Identifier') {
                            parts.unshift(cur.property.name);
                        } else if (cur.computed && cur.property.type === 'Literal') {
                            parts.unshift(String(cur.property.value));
                        } else if (cur.computed && cur.property.type === 'Identifier') {
                            // e.g. obj[prop] -> include the prop identifier (it will also be added separately)
                            parts.unshift(cur.property.name);
                        } else {
                            // unknown property shape (e.g. expression) — stop adding chain here
                            // inner expressions will be visited separately by walk.full
                            stop = true;
                            break;
                        }
                    }

                    // object part (left side)
                    if (cur.object) {
                        if (cur.object.type === 'Identifier') {
                            parts.unshift(cur.object.name);
                            break;
                        } else if (cur.object.type === 'ThisExpression') {
                            // For `this.x` or `this.a.b` we don't want to include 'this' itself.
                            // Stop unwrapping here; we'll drop a leading 'this' later.
                            break;
                        } else if (cur.object.type === 'MemberExpression') {
                            // continue unwrapping
                            cur = cur.object;
                        } else {
                            // other object types (CallExpression, etc.) — stop here
                            stop = true;
                            break;
                        }
                    } else {
                        break;
                    }
                }

                if (parts.length > 0) {
                    // Add progressive chains: 'a', 'a.b', 'a.b.c'
                    for (let i = 0; i < parts.length; i++) {
                        const chain = parts.slice(0, i + 1).join('.');
                        identifiers.add(chain);

                        // Also apply functionDependencies lookup for the chain key
                        if (functionDependencies[chain]) {
                            for (const dependency of functionDependencies[chain]) {
                                identifiers.add(dependency);
                            }
                        }
                    }
                }
            }
        });

        return Array.from(identifiers);
    }

    /**
     * Analyzes the dependencies of functions in the provided dictionary.
     * @param functions A dictionary mapping function names to their implementations.
     * @returns A dictionary mapping function names to arrays of their dependencies.
     */
    static analyzeFunctionDependencies(functions: Record<string, Function>): Record<string, string[]> {
        const functionDependencies: Record<string, string[]> = {};

        // First pass: collect direct dependencies for each function
        for (const [funcName, func] of Object.entries(functions)) {
            try {
                let source = func.toString();

                // Handle different function formats
                // Arrow function: () => expr or (args) => { ... }
                // Method shorthand: methodName() { ... }
                // Function expression: function() { ... }

                // Detect function type more accurately
                const isArrowFunction = /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(source);
                const isFunctionExpression = source.startsWith('function');
                const isAsyncFunction = source.startsWith('async');

                // If it's a method shorthand (e.g., "methodName() { ... }" or "async methodName() { ... }"), convert to function expression
                if (!isFunctionExpression && !isArrowFunction) {
                    // It's likely a method shorthand, convert to function expression
                    if (isAsyncFunction) {
                        // Remove 'async' prefix and add 'async function' prefix
                        source = `async function ${source.substring(5).trim()}`;
                    } else {
                        source = `function ${source}`;
                    }
                }

                // Wrap in parentheses for parsing
                source = `(${source})`;

                const ast = acorn.parse(source, { ecmaVersion: "latest" });
                const dependencies = new Set<string>();
                const declaredVariables = new Set<string>();

                // First, collect all declared variables (const, let, var, function params, etc.)
                walk.ancestor(ast, {
                    VariableDeclarator(node: any) {
                        if (node.id.type === 'Identifier') {
                            declaredVariables.add(node.id.name);
                        }
                    },
                    FunctionDeclaration(node: any) {
                        if (node.id && node.id.type === 'Identifier') {
                            declaredVariables.add(node.id.name);
                        }
                        // Add function parameters
                        node.params.forEach((param: any) => {
                            if (param.type === 'Identifier') {
                                declaredVariables.add(param.name);
                            }
                        });
                    },
                    FunctionExpression(node: any, ancestors: any[]) {
                        // Only process the outermost function (skip nested functions)
                        const functionAncestors = ancestors.filter((n: any) =>
                            n.type === 'FunctionExpression' ||
                            n.type === 'FunctionDeclaration' ||
                            n.type === 'ArrowFunctionExpression'
                        );
                        if (functionAncestors.length === 1) {
                            // Add function parameters of the main function
                            node.params.forEach((param: any) => {
                                if (param.type === 'Identifier') {
                                    declaredVariables.add(param.name);
                                }
                            });
                        }
                    },
                    ArrowFunctionExpression(node: any, ancestors: any[]) {
                        // Only process the outermost function (skip nested functions)
                        const functionAncestors = ancestors.filter((n: any) =>
                            n.type === 'FunctionExpression' ||
                            n.type === 'FunctionDeclaration' ||
                            n.type === 'ArrowFunctionExpression'
                        );
                        if (functionAncestors.length === 1) {
                            // Add function parameters of the main function
                            node.params.forEach((param: any) => {
                                if (param.type === 'Identifier') {
                                    declaredVariables.add(param.name);
                                }
                            });
                        }
                    }
                });

                // Then, collect identifiers that are not declared within the function
                walk.simple(ast, {
                    Identifier(node: any) {
                        // Skip the function name itself, declared variables, and common globals
                        if (node.name !== funcName && !declaredVariables.has(node.name)) {
                            dependencies.add(node.name);
                        }
                    },
                    MemberExpression(node: any) {
                        // Handle 'this.propertyName' patterns
                        if (node.object.type === 'ThisExpression' && node.property.type === 'Identifier') {
                            dependencies.add(node.property.name);
                        }
                    }
                });

                functionDependencies[funcName] = Array.from(dependencies);
            } catch (error) {
                console.warn(`Failed to analyze function '${funcName}':`, error);
                // If parsing fails, assume no dependencies
                functionDependencies[funcName] = [];
            }
        }

        // Second pass: recursively resolve function dependencies
        const resolvedDependencies: Record<string, string[]> = {};
        const resolving = new Set<string>(); // To detect circular dependencies

        const resolveDependencies = (funcName: string): string[] => {
            // If already resolved, return cached result
            if (resolvedDependencies[funcName]) {
                return resolvedDependencies[funcName];
            }

            // Check for circular dependency
            if (resolving.has(funcName)) {
                console.warn(`Circular dependency detected for function: ${funcName}`);
                return [];
            }

            resolving.add(funcName);
            const allDependencies = new Set<string>();
            const directDependencies = functionDependencies[funcName] || [];

            for (const dep of directDependencies) {
                if (functions[dep]) {
                    // It's a function, recursively resolve its dependencies
                    const subDependencies = resolveDependencies(dep);
                    subDependencies.forEach(subDep => allDependencies.add(subDep));
                } else {
                    // It's a variable, add directly
                    allDependencies.add(dep);
                }
            }

            resolving.delete(funcName);
            resolvedDependencies[funcName] = Array.from(allDependencies);
            return resolvedDependencies[funcName];
        };

        // Resolve all functions
        for (const funcName of Object.keys(functions)) {
            resolveDependencies(funcName);
        }

        return resolvedDependencies;
    }

    /**
     * Rewrites an expression to replace identifiers with 'this.identifier'.
     * This allows direct property access and assignment without using 'with' statement.
     * Uses AST parsing to accurately identify which identifiers to replace.
     * @param expression The original expression string.
     * @param identifiers The list of identifiers that are available in bindings.
     * @returns The rewritten expression.
     */
    static rewriteExpression(expression: string, identifiers: string[]): string {
        // Reserved words and built-in objects that should not be prefixed with 'this.'
        const reserved = new Set([
            'event', '$ctx', '$newValue',
            'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
            'Math', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object',
            'JSON', 'console', 'window', 'document', 'navigator',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite',
            'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent'
        ]);

        // Extract ALL identifiers from the expression (including assignment left-hand side)
        // This is necessary because the passed 'identifiers' parameter only includes
        // identifiers that are used (right-hand side), not assigned to (left-hand side)
        let allIdentifiersInExpression: string[];
        try {
            allIdentifiersInExpression = ExpressionUtils.extractIdentifiers(expression, {});
        } catch (error) {
            console.warn('[ichigo.js] Failed to extract identifiers from expression:', expression, error);
            return expression;
        }

        // Create a Set of identifiers available in bindings (from data, computed, methods)
        // We need to know which identifiers are valid binding properties
        const bindingIdentifiers = new Set(identifiers.filter(id => !reserved.has(id)));

        // For assignment expressions, we also need to include the left-hand side identifier
        // even if it's not in the tracking identifiers (because it's being assigned, not read)
        for (const id of allIdentifiersInExpression) {
            if (!reserved.has(id)) {
                bindingIdentifiers.add(id);
            }
        }

        if (bindingIdentifiers.size === 0) {
            return expression;
        }

        try {
            // Build a map of positions to replace: { start: number, end: number, name: string }[]
            const replacements: { start: number, end: number, name: string }[] = [];

            const parsedAst = acorn.parse(`(${expression})`, { ecmaVersion: 'latest' });

            // Collect all identifier nodes that should be replaced
            // Use walk.fullAncestor to visit ALL nodes (including assignment LHS) while tracking ancestors
            walk.fullAncestor(parsedAst, (node: any, _state: any, ancestors: any[]) => {
                if (node.type !== 'Identifier') {
                    return;
                }

                // Skip if not in our identifier set
                if (!bindingIdentifiers.has(node.name)) {
                    return;
                }

                // Check if this identifier is a property of a MemberExpression
                // (e.g., in 'obj.prop', we should skip 'prop')
                if (ancestors.length >= 1) {
                    const parent = ancestors[ancestors.length - 1];
                    if (parent.type === 'MemberExpression') {
                        // Skip if this identifier is the property (not the object) of a non-computed member access
                        if (!parent.computed && parent.property === node) {
                            return;
                        }
                    }
                }

                // Add to replacements list (adjust for the wrapping parentheses)
                replacements.push({
                    start: node.start - 1,
                    end: node.end - 1,
                    name: node.name
                });
            });

            // Sort replacements by start position (descending) to replace from end to start
            replacements.sort((a, b) => b.start - a.start);

            // Apply replacements
            let result = expression;
            for (const replacement of replacements) {
                result = result.substring(0, replacement.start) +
                         `this.${replacement.name}` +
                         result.substring(replacement.end);
            }

            return result;
        } catch (error) {
            // If AST parsing fails, fall back to the original expression
            console.warn('Failed to rewrite expression:', expression, error);
            return expression;
        }
    }
}

