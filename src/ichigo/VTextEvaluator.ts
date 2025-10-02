// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VBindings } from "./VBindings";

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
     * Constructs a VTextEvaluator instance.
     * @param text The text containing embedded expressions in the form of {{...}}.
     * @param functionDependencies A dictionary mapping function names to their dependencies.
     */
    constructor(text: string, functionDependencies: Record<string, string[]>) {
        // Extract expressions in {{...}} using regex
        const regex = /\{\{([^}]+)\}\}/g;
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
            // Gather identifiers
            this.#identifiers.push(...ids.filter(id => !this.#identifiers.includes(id)));
            const args = ids.join(", ");
            const funcBody = `return (${expression});`;
            return {
                ids,
                func: new Function(args, funcBody) as (...args: any[]) => any
            };
        });

        // Create a function to reconstruct the text with evaluated expressions
        this.#evaluate = (bindings: VBindings) => {
            let result = text;
            evaluators.forEach((evaluator, i) => {
                // Gather the current values of the identifiers from the bindings
                const values = evaluator.ids.map(id => bindings[id]);

                // Evaluate the expression and replace {{...}} in the text
                result = result.replace(matches[i][0], String(evaluator.func(...values)));
            });
            return result;
        };
    }

    /**
     * Checks if the given text contains any expressions in the form of {{...}}.
     * @param text The text to check.
     * @returns True if the text contains expressions, false otherwise.
     */
    static containsExpression(text: string): boolean {
        const regex = /\{\{([^}]+)\}\}/g;
        return regex.test(text);
    }

    /**
     * Gets the list of identifiers extracted from the text expressions.
     */
    get identifiers(): string[] {
        return this.#identifiers;
    }

    /**
     * Evaluates the text with the provided bindings and returns the resulting string.
     * @param bindings The bindings to use for evaluating the expressions.
     */
    evaluate(bindings: VBindings): string {
        return this.#evaluate(bindings);
    }
}
