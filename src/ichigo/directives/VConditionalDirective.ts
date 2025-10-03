// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VConditionalDirectiveContext } from "./VConditionalDirectiveContext";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { StandardDirectiveName } from "./StandardDirectiveName";

export abstract class VConditionalDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     * This may be undefined if the directive does not have an expression (e.g., v-else).
     */
    #identifiers?: string[];

    /*
     * A function that evaluates the directive's condition.
     * It returns true if the condition is met, otherwise false.
     * This may be undefined if the directive does not have an expression (e.g., v-else).
     */
    #evaluate?: () => boolean;

    /**
     * The context for managing related conditional directives (v-if, v-else-if, v-else).
     */
    #conditionalContext: VConditionalDirectiveContext;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#evaluate = this.#createEvaluator(expression);
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);

        // Initialize the conditional context for managing related directives
        this.#conditionalContext = this.#initializeConditionalContext();
        this.#conditionalContext.addDirective(this);
    }

    /**
     * @inheritdoc
     */
    abstract get name(): string;

    /**
     * @inheritdoc
     */
    get vNode(): VNode {
        return this.#vNode;
    }

    /**
     * @inheritdoc
     */
    get needsAnchor(): boolean {
        return true;
    }

    /**
     * @inheritdoc
     */
    get bindingsPreparer(): VBindingsPreparer | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get domUpdater(): VDOMUpdater | undefined {
        const identifiers = this.#identifiers ?? [];
        const render = () => this.#render();

        // Create an updater that handles the conditional rendering
        const updater: VDOMUpdater = {
            get identifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                render();
            }
        };
        return updater;
    }

    /**
     * The context for managing related conditional directives (v-if, v-else-if, v-else).
     */
    get conditionalContext(): VConditionalDirectiveContext {
        return this.#conditionalContext;
    }

    /**
     * Indicates whether the condition for this directive is currently met.
     * For v-if and v-else-if, this depends on the evaluation of their expressions.
     * For v-else, this is always true.
     */
    get conditionIsMet(): boolean {
        if (!this.#evaluate) {
            // No expression means always true (e.g., v-else)
            return true;
        }
        return this.#evaluate();
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // Default implementation does nothing. Override in subclasses if needed.
    }

    /**
     * Renders the node based on the evaluation of the directive's condition.
     * Inserts or removes the node from the DOM as needed.
     */
    #render(): void {
        // Check if any preceding directive's condition is met
        if (this.#conditionalContext.isPrecedingConditionMet(this)) {
            // Previous condition met, ensure node is removed
            this.#removedNode();
            return;
        }

        if (!this.#evaluate) {
            // No expression means always true (e.g., v-else)
            this.#insertNode();
            return;
        }

        // Evaluate the condition and insert or remove the node accordingly
        const shouldRender = this.#evaluate();
        if (shouldRender) {
            this.#insertNode();
        } else {
            this.#removedNode();
        }
    }

    /**
     * Inserts the node into the DOM at the position marked by the anchor node, if any.
     * If there is no anchor node, the node is inserted as a child of its parent node.
     * If the node is already in the DOM, no action is taken.
     */
    #insertNode(): void {
        if (this.#vNode.isInDOM) {
            // Already in DOM, no action needed
            return;
        }

        if (this.#vNode?.anchorNode) {
            // Insert after the anchor node
            this.#vNode.anchorNode.parentNode?.insertBefore(this.#vNode.node, this.#vNode.anchorNode.nextSibling);
        } else if (this.#vNode.parentVNode) {
            // Append to the parent node
            const parentElement = this.#vNode.parentVNode.node as HTMLElement;
            parentElement.appendChild(this.#vNode.node);
        } else {
            // No anchor or parent VNode available
            throw new Error("Cannot insert node: No anchor or parent VNode available.");
        }
    }

    /**
     * Removes the node from the DOM.
     * If the node is not in the DOM, no action is taken.
     */
    #removedNode(): void {
        if (!this.#vNode.isInDOM) {
            // Already removed from DOM, no action needed
            return;
        }

        this.#vNode.node.parentNode?.removeChild(this.#vNode.node);
    }

    /**
     * Creates a function to evaluate the directive's condition.
     * @param expression The expression string to evaluate.
     * @returns A function that evaluates the directive's condition.
     */
    #createEvaluator(expression: string): () => boolean {
        const identifiers = this.#identifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        // Create a dynamic function with the identifiers as parameters
        const func = new Function(args, funcBody) as (...args: any[]) => any;

        // Return a function that calls the dynamic function with the current values from the virtual node's bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = identifiers.map(id => this.#vNode.bindings?.[id]);

            // Call the dynamic function with the gathered values and return the result as a boolean
            return Boolean(func(...values));
        };
    }

    /**
     * Initializes the conditional context for managing related directives.
     */
    #initializeConditionalContext(): VConditionalDirectiveContext {
        // Create a new context if this is a v-if directive
        if (this.name === StandardDirectiveName.V_IF) {
            return new VConditionalDirectiveContext();
        }

        // Link to the existing conditional context from the preceding v-if or v-else-if directive
        const precedingDirective = this.vNode.previousSibling?.directiveManager?.directives?.find(
            d => d.name === StandardDirectiveName.V_IF || d.name === StandardDirectiveName.V_ELSE_IF
        );

        if (!precedingDirective) {
            throw new Error("preceding v-if or v-else-if directive not found.");
        }

        // Cast to VConditionalDirective to access conditionalContext
        const conditionalContext = (precedingDirective as VConditionalDirective).conditionalContext;
        return conditionalContext;
    }
}