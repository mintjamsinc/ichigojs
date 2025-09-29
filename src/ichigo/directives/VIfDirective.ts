// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "./VDOMUpdater";

/**
 * Directive for conditional rendering in the virtual DOM.
 * This directive conditionally renders elements based on a boolean expression.
 * For example:
 *     <div v-if="isVisible">This div is conditionally rendered.</div>
 * The element and its children are included in the DOM only if the expression evaluates to true.
 * If the expression is false, the element and its children are not rendered.
 */
export class VIfDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #identifiers: string[] = [];

    /*
     * A function that evaluates the directive's condition.
     * It returns true if the condition is met, otherwise false.
     */
    #evaluate: () => boolean;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
        this.#evaluate = this.#createEvaluator(expression);

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_IF;
    }

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
    get bindingsPreparer(): undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get domUpdater(): VDOMUpdater | undefined {
        const identifiers = this.#identifiers;
        const evaluate = this.#evaluate;
        const insertNode = () => this.insertNode();
        const removedNode = () => this.removedNode();

        // Create an updater that handles the conditional rendering
        const updater: VDOMUpdater = {
            get identifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                const shouldRender = evaluate();
                if (shouldRender) {
                    insertNode();
                } else {
                    removedNode();
                }
            }
        };
        return updater;
    }

    /**
     * Inserts the node into the DOM at the position marked by the anchor node, if any.
     * If there is no anchor node, the node is inserted as a child of its parent node.
     * If the node is already in the DOM, no action is taken.
     */
    insertNode(): void {
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
    removedNode(): void {
        if (!this.#vNode.isInDOM) {
            // Already removed from DOM, no action needed
            return;
        }

        this.#vNode.node.parentNode?.removeChild(this.#vNode.node);
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // No resources to clean up in this directive
    }

    /**
     * Creates a function to evaluate the directive's condition.
     * @param expression The expression string to evaluate.
     * @returns A function that evaluates the directive's condition.
     */
    #createEvaluator(expression: string): () => boolean {
        const args = this.#identifiers.join(", ");
        const funcBody = `return (${expression});`;

        // Create a dynamic function with the identifiers as parameters
        const func = new Function(args, funcBody) as (...args: any[]) => any;

        // Return a function that calls the dynamic function with the current values from the virtual node's bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = this.#identifiers.map(id => {
                let value = this.#vNode.vApplication.bindings?.get(id);
                if (this.#vNode.bindings?.has(id)) {
                    value = this.#vNode.bindings.get(id);
                }
                return value;
            });

            // Call the dynamic function with the gathered values and return the result as a boolean
            return Boolean(func(...values));
        };
    }
}
