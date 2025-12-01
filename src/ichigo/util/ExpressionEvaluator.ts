// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./ExpressionUtils";
import { VBindings } from "../VBindings";
import { ExpressionEvaluatorOptions } from "./ExpressionEvaluatorOptions";

/**
 * A centralized expression evaluator that normalizes expression evaluation across all directives.
 *
 * This class provides:
 * - Consistent identifier extraction and binding resolution
 * - Unified global object whitelisting (Math, Date, JSON, etc.)
 * - Expression caching for performance
 * - Centralized error handling
 * - Support for custom expression rewriting (for VOnDirective)
 *
 * Example usage:
 * ```typescript
 * const evaluator = ExpressionEvaluator.create(
 *   "count + 1",
 *   bindings,
 *   functionDependencies
 * );
 * const result = evaluator.evaluate();
 * ```
 */
export class ExpressionEvaluator {
    /**
     * Cache for compiled expression functions.
     * Key: expression string
     * Value: compiled function
     */
    private static readonly cache = new Map<string, Function>();

    /**
     * Global objects that are whitelisted for use in expressions.
     * These objects are available to all expressions for convenience and compatibility.
     */
    private static readonly GLOBAL_WHITELIST = {
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURI,
        decodeURI,
        encodeURIComponent,
        decodeURIComponent
    };

    /**
     * The original expression string.
     */
    private readonly expression: string;

    /**
     * The identifiers extracted from the expression.
     */
    private readonly identifiers: string[];
    // The original extracted identifiers (may include member chains like 'a.b')
    private readonly originalIdentifiers: string[];

    /**
     * The bindings to use for evaluating the expression.
     */
    private readonly bindings: VBindings;

    /**
     * The compiled function for evaluating the expression.
     */
    private readonly evaluatorFunc: Function;

    /**
     * Additional context variables (e.g., 'event', '$ctx').
     */
    private readonly additionalContext?: Record<string, any>;

    /**
     * Private constructor. Use ExpressionEvaluator.create() to create instances.
     */
    private constructor(
        expression: string,
        bindings: VBindings,
        identifiers: string[],
        originalIdentifiers: string[],
        evaluatorFunc: Function,
        additionalContext?: Record<string, any>
    ) {
        this.expression = expression;
        this.bindings = bindings;
        this.identifiers = identifiers;
        this.originalIdentifiers = originalIdentifiers;
        this.evaluatorFunc = evaluatorFunc;
        this.additionalContext = additionalContext;
    }

    /**
     * Creates an ExpressionEvaluator instance.
     *
     * @param expression The expression string to evaluate.
     * @param bindings The bindings to use for evaluating the expression.
     * @param functionDependencies A dictionary mapping function names to their dependencies.
     * @param options Optional configuration for the evaluator.
     * @returns An ExpressionEvaluator instance.
     */
    static create(
        expression: string,
        bindings: VBindings,
        functionDependencies: Record<string, string[]>,
        options?: ExpressionEvaluatorOptions
    ): ExpressionEvaluator {
        // Extract identifiers from the expression (may include member chains like 'a.b')
        const extractedIdentifiers = ExpressionUtils.extractIdentifiers(expression, functionDependencies);

        // For compilation we must only pass simple identifier names (no dots).
        // Use the base (left-most) segment of member chains and preserve order.
        const baseIdentifiers: string[] = [];
        for (const id of extractedIdentifiers) {
            const base = id.split('.')[0];
            if (!baseIdentifiers.includes(base)) {
                baseIdentifiers.push(base);
            }
        }

        // Apply custom rewrite if provided (used by VOnDirective)
        let processedExpression = expression;
        if (options?.rewriteExpression) {
            // Pass the original extracted identifiers (may include member chains)
            processedExpression = options.rewriteExpression(expression, extractedIdentifiers);
        }

        // Build cache key including options that affect compilation
        const cacheKey = JSON.stringify({
            expr: processedExpression,
            additionalCtx: options?.additionalContext ? Object.keys(options.additionalContext).sort() : []
        });

        // Check cache
        let evaluatorFunc = this.cache.get(cacheKey);

        if (!evaluatorFunc) {
            // Compile the expression using base identifiers (no dots)
            evaluatorFunc = this.compileExpression(processedExpression, baseIdentifiers, options);

            // Cache the compiled function
            this.cache.set(cacheKey, evaluatorFunc);
        }

        return new ExpressionEvaluator(
            expression,
            bindings,
            baseIdentifiers,
            extractedIdentifiers,
            evaluatorFunc,
            options?.additionalContext
        );
    }

    /**
     * Compiles an expression into a function.
     *
     * @param expression The expression string to compile.
     * @param identifiers The identifiers extracted from the expression.
     * @param options Optional configuration.
     * @returns A compiled function.
     */
    private static compileExpression(
        expression: string,
        identifiers: string[],
        options?: ExpressionEvaluatorOptions
    ): Function {
        // Build parameter list: globals first, then identifiers (base names), then additional context
        const params: string[] = [
            ...Object.keys(ExpressionEvaluator.GLOBAL_WHITELIST),
            ...identifiers
        ];

        // Add additional context parameters if provided
        if (options?.additionalContext) {
            params.push(...Object.keys(options.additionalContext));
        }

        const args = params.join(", ");
        const funcBody = `return (${expression});`;

        try {
            // Create the function with error handling
            return new Function(args, funcBody);
        } catch (error) {
            throw new Error(`Failed to compile expression: ${expression}\nError: ${error}`);
        }
    }

    /**
     * Evaluates the expression with the current bindings.
     *
     * @returns The result of the expression evaluation.
     */
    evaluate(): any {
        try {
            // Build arguments: globals first, then identifiers, then additional context
            const values: any[] = [
                // Global whitelist values
                ...Object.values(ExpressionEvaluator.GLOBAL_WHITELIST),
                // Identifier values from bindings
                ...this.identifiers.map(id => this.bindings.get(id))
            ];

            // Add additional context values if provided
            if (this.additionalContext) {
                values.push(...Object.values(this.additionalContext));
            }

            // Call the compiled function with the gathered values
            return this.evaluatorFunc(...values);
        } catch (error) {
            console.error(`[ichigo.js] Error evaluating expression: ${this.expression}`, error);
            throw error;
        }
    }

    /**
     * Evaluates the expression and returns the result as a boolean.
     *
     * @returns The boolean result of the expression evaluation.
     */
    evaluateAsBoolean(): boolean {
        return Boolean(this.evaluate());
    }

    /**
     * Gets the list of identifiers extracted from the expression.
     */
    get dependentIdentifiers(): string[] {
        // Return the original extracted identifiers (may include member chains like 'a.b')
        return this.originalIdentifiers;
    }

    /**
     * Clears the expression cache.
     * This should be called sparingly, as it will force recompilation of all expressions.
     */
    static clearCache(): void {
        this.cache.clear();
    }
}
