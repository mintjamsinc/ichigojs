// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import * as acorn from "acorn";
import * as walk from "acorn-walk";

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

        walk.simple(ast, {
            Identifier(node: any) {
                // Check if the identifier is a function name
                if (functionDependencies[node.name]) {
                    // If it is, add its dependencies to the list of identifiers
                    for (const dependency of functionDependencies[node.name]) {
                        identifiers.add(dependency);
                    }
                } else {
                    // Otherwise, add the identifier itself
                    identifiers.add(node.name);
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

                // If it's a method shorthand (e.g., "methodName() { ... }"), convert to function expression
                if (!isFunctionExpression && !isArrowFunction && !isAsyncFunction) {
                    // It's likely a method shorthand, convert to function expression
                    source = `function ${source}`;
                }

                // Wrap in parentheses for parsing
                source = `(${source})`;

                const ast = acorn.parse(source, { ecmaVersion: "latest" });
                const dependencies = new Set<string>();

                walk.simple(ast, {
                    Identifier(node: any) {
                        // Skip the function name itself and function parameters
                        if (node.name !== funcName) {
                            dependencies.add(node.name);
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
}
