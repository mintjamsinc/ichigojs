// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";

/**
 * Directive for conditionally displaying an element.
 * This directive shows or hides an element based on a boolean expression.
 * For example:
 *     <div v-show="isVisible">This element is conditionally visible.</div>
 * The element is included in the DOM regardless of the expression's value, but its visibility is controlled via CSS (display property).
 * If the expression evaluates to true, the element is visible; if false, it is hidden (display: none).
 * This directive is useful for toggling visibility without removing the element from the DOM.
 * Note that this directive does not support v-else or v-else-if.
 */
export class VShowDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * The expression evaluator for this directive.
     */
    #evaluator: ExpressionEvaluator;

    /**
     * The original display style of the element before the directive was applied.
     */
    #originalDisplayStyle: string;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression and create the evaluator
        const expression = context.attribute.value;
        if (!context.vNode.bindings) {
            throw new Error('VShowDirective requires bindings');
        }
        this.#evaluator = ExpressionEvaluator.create(
            expression,
            context.vNode.bindings,
            context.vNode.vApplication.functionDependencies
        );

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);

        // Store the original display style
        const element = this.#vNode.node as HTMLElement;
        this.#originalDisplayStyle = element.style.display === "none" ? "" : element.style.display;
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_SHOW;
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
        return false;
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
        const identifiers = this.#evaluator.dependentIdentifiers;
        const evaluator = this.#evaluator;
        const visibleNode = () => this.visibleNode();
        const invisibleNode = () => this.invisibleNode();

        // Create an updater that handles the conditional rendering
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                const shouldRender = evaluator.evaluateAsBoolean();
                if (shouldRender) {
                    visibleNode();
                } else {
                    invisibleNode();
                }
            }
        };
        return updater;
    }

    /**
     * @inheritdoc
     */
    get templatize(): boolean {
        return false;
    }

    /**
     * @inheritdoc
     */
    get dependentIdentifiers(): string[] {
        return this.#evaluator.dependentIdentifiers;
    }

    /**
     * Makes the node visible by resetting its display style.
     * If the node is already visible, no action is taken.
     */
    visibleNode(): void {
        const element = this.#vNode.node as HTMLElement;
        if (element.style.display !== "none") {
            // Already visible, no action needed
            return;
        }

        // Restore the original display style to make the element visible
        element.style.display = this.#originalDisplayStyle;
    }

    /**
     * Hides the node by setting its display style to "none".
     * This effectively removes the node from the layout.
     * If the node is already hidden, no action is taken.
     */
    invisibleNode(): void {
        const element = this.#vNode.node as HTMLElement;
        if (element.style.display === "none") {
            // Already invisible, no action needed
            return;
        }

        // Store the original display style before hiding
        this.#originalDisplayStyle = element.style.display === "none" ? "" : element.style.display;

        // Hide the element
        element.style.display = "none";
    }

    /**
     * @inheritdoc
     */
    get onMount(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onMounted(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUpdate(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUpdated(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUnmount(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUnmounted(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // No specific cleanup needed for this directive
    }

}
