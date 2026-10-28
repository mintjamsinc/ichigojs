// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { ReactiveProxy } from "./util/ReactiveProxy";
import { toDisplayString } from "./util/DisplayString";
import { VBindings } from "./VBindings";

/**
 * List of standard JavaScript global objects that should be available in expressions.
 * These are used as fallbacks when the identifier is not found in the bindings.
 */
const GLOBAL_OBJECTS: Record<string, any> = {
    // Math and numbers
    Math,
    Number,
    BigInt,
    Infinity,
    NaN,
    // String and text
    String,
    // Boolean
    Boolean,
    // Objects and arrays
    Object,
    Array,
    // Date and time
    Date,
    // JSON
    JSON,
    // Regular expressions
    RegExp,
    // Errors
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    // Other utilities
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,
    // Collections
    Map,
    Set,
    WeakMap,
    WeakSet,
    // Promises
    Promise,
    // Symbols
    Symbol,
    // Console (for debugging)
    console,
    // undefined is a special case
    undefined,
};

/**
 * A class to evaluate text with embedded expressions in the form of {{...}}.
 * It extracts identifiers from the expressions and evaluates them using provided bindings.
 */
export class VTextEvaluator {
    /**
     * The list of identifiers extracted from the text expressions.
     */
    #identifiers: string[] = [];

    /**
     * The function used to evaluate the text with current bindings.
     */
    #evaluate: (bindings: VBindings) => string;

    /**
     * The source paths read during the last evaluation, recorded only when some
     * expression has a run-time index ("items[i].name") or calls a method.
     */
    #trackedPaths?: Set<string>;

    /**
     * Constructs a VTextEvaluator instance.
     * @param text The text containing embedded expressions in the form of {{...}}.
     * @param functionDependencies A dictionary mapping function names to their dependencies.
     */
    constructor(text: string, functionDependencies: Record<string, string[]>) {
        // Extract expressions in {{...}} using regex.
        // Allow `}` inside the expression as long as it is not followed by another `}`,
        // so that object literals like `{ short: true }` are captured correctly.
        const regex = /\{\{((?:[^}]|\}(?!\}))+)\}\}/g;
        const matches = Array.from(text.matchAll(regex));

        // Gather identifiers from the extracted expressions
        this.#identifiers = [];

        // If there are no expressions, return a function that returns the original text
        if (matches.length === 0) {
            this.#evaluate = () => text;
            return;
        }

        // Generate a function for each expression
        const evaluators = matches.map(match => {
            const expression = match[1].trim();
            const ids = ExpressionUtils.extractIdentifiers(expression, functionDependencies);
            // Keep chain-style identifiers (a, a.b, a.b.c) for metadata
            this.#identifiers.push(...ids.filter(id => !this.#identifiers.includes(id)));

            // Build base parameter names (no dots), preserving order of first appearance
            const baseArgs: string[] = [];
            for (const id of ids) {
                const base = ExpressionUtils.baseIdentifier(id);
                if (!baseArgs.includes(base)) {
                    baseArgs.push(base);
                }
            }

            const args = baseArgs.join(", ");
            const funcBody = `return (${expression});`;
            return {
                ids,
                baseArgs,
                func: new Function(args, funcBody) as (...args: any[]) => any
            };
        });

        // Only an expression with an index known at run time, or one that calls a method
        // (whose reads, such as `this[key]`, the source analysis may not see), needs its
        // reads recorded
        const tracksReads = this.#identifiers.some(id => id.includes('[*]')) ||
            ExpressionUtils.callsFunction(this.#identifiers, functionDependencies);

        // Create a function to reconstruct the text with evaluated expressions. The values
        // are gathered outside the tracked call: a binding passed in by name is already
        // among the identifiers.
        const evaluateText = (bindings: VBindings, paths?: Set<string>) => {
            let result = text;
            evaluators.forEach((evaluator, i) => {
                // Build values for baseArgs (no dots) in the same order as function parameters
                const values = evaluator.baseArgs.map((name: string) => {
                    const value = bindings.get(name);
                    if (value !== undefined) return value;
                    if (name in GLOBAL_OBJECTS) return GLOBAL_OBJECTS[name];
                    return undefined;
                });

                // Evaluate the expression and replace {{...}} in the text.
                // A function replacement keeps `$`-patterns in the value literal.
                const value = paths ? ReactiveProxy.track(paths, () => evaluator.func(...values)) : evaluator.func(...values);
                result = result.replace(matches[i][0], () => toDisplayString(value));
            });
            return result;
        };
        this.#evaluate = tracksReads
            ? (bindings: VBindings) => {
                const paths = new Set<string>();
                this.#trackedPaths = undefined;
                const result = evaluateText(bindings, paths);
                this.#trackedPaths = paths;
                return result;
            }
            : evaluateText;
    }

    /**
     * Checks if the given text contains any expressions in the form of {{...}}.
     * @param text The text to check.
     * @returns True if the text contains expressions, false otherwise.
     */
    static containsExpression(text: string): boolean {
        const regex = /\{\{((?:[^}]|\}(?!\}))+)\}\}/g;
        return regex.test(text);
    }

    /**
     * Gets the list of identifiers extracted from the text expressions.
     */
    get identifiers(): string[] {
        return this.#identifiers;
    }

    /**
     * The source paths read during the last evaluation. Recorded only when an
     * expression has a run-time index ("items[i].name") or calls a method;
     * undefined before the first evaluation and for other texts.
     */
    get trackedPaths(): ReadonlySet<string> | undefined {
        return this.#trackedPaths;
    }

    /**
     * Evaluates the text with the provided bindings and returns the resulting string.
     * @param bindings The bindings to use for evaluating the expressions.
     */
    evaluate(bindings: VBindings): string {
        return this.#evaluate(bindings);
    }
}
