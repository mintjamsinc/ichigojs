// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";

/**
 * Directive for setting raw HTML content of an element.
 * This directive evaluates an expression and sets the result as the innerHTML of the element.
 * For example:
 *     <div v-html="htmlContent"></div>
 * The element's innerHTML will be replaced with the value of htmlContent.
 *
 * WARNING: Dynamically rendering arbitrary HTML can be very dangerous because it can easily lead to XSS attacks.
 * Only use v-html on trusted content and never on user-provided content.
 */
export class VHtmlDirective implements VDirective {
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
            throw new Error('VHtmlDirective requires bindings');
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
        return StandardDirectiveName.V_HTML;
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

        // Create an updater that sets the innerHTML
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                const element = vNode.node as HTMLElement;
                const htmlContent = evaluator.evaluate();
                element.innerHTML = htmlContent ?? '';
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
