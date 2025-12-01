// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Options for expression evaluation.
 */
export interface ExpressionEvaluatorOptions {
    /**
     * Additional context variables to be available in the expression (e.g., 'event', '$ctx').
     */
    additionalContext?: Record<string, any>;

    /**
     * If true, allows assignment expressions (e.g., "count++", "value = 10").
     * This is used by VOnDirective to support inline assignments.
     * Default: false
     */
    allowAssignment?: boolean;

    /**
     * A custom function to rewrite the expression before evaluation.
     * This is used by VOnDirective to transform identifiers into 'this.identifier' form.
     */
    rewriteExpression?: (expression: string, identifiers: string[]) => string;
}
