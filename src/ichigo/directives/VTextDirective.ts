// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../ExpressionEvaluator";

/**
 * Directive for setting text content of an element.
 * This directive evaluates an expression and sets the result as the textContent of the element.
 * For example:
 *     <div v-text="message"></div>
 * The element's textContent will be replaced with the value of message.
 *
 * Unlike v-html, this directive safely escapes HTML content, preventing XSS attacks.
 * Use this directive when you want to display plain text.
 */
export class VTextDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * The expression evaluator for this directive.
     */
    #evaluator: ExpressionEvaluator;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression and create the evaluator
        const expression = context.attribute.value;
        if (!context.vNode.bindings) {
            throw new Error('VTextDirective requires bindings');
        }
        this.#evaluator = ExpressionEvaluator.create(
            expression,
            context.vNode.bindings,
            context.vNode.vApplication.functionDependencies
        );

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_TEXT;
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
        const vNode = this.#vNode;

        // Create an updater that sets the textContent
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                const element = vNode.node as HTMLElement;
                const textContent = evaluator.evaluate();
                element.textContent = textContent ?? '';
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
