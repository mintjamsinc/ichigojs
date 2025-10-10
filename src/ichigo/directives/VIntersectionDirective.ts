// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";

/**
 * Directive for observing element intersection with viewport or ancestor elements using IntersectionObserver.
 * The `v-intersection` directive allows you to respond to changes in an element's visibility.
 *
 * Example usage:
 *     <div v-intersection="handleIntersection">Observable content</div>
 *     <div v-intersection="handleIntersection" :options.intersection="{threshold: 0.5}">Observable content</div>
 *
 * The handler receives IntersectionObserverEntry array as the first argument and $ctx as the second:
 *     handleIntersection(entries, $ctx) {
 *       const entry = entries[0];
 *       if (entry.isIntersecting) {
 *         console.log('Element is visible!');
 *       }
 *     }
 *
 * Options can be provided via :options or :options.intersection attribute:
 *     :options="{root: null, threshold: 0.5, rootMargin: '0px'}"
 *     :options.intersection="{root: null, threshold: 0.5, rootMargin: '0px'}"
 *
 * This directive is useful for lazy-loading, infinite scrolling, animation triggers,
 * and other features that depend on element visibility.
 */
export class VIntersectionDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #dependentIdentifiers?: string[];

    /**
     * The intersection handler wrapper function.
     */
    #handlerWrapper?: (entries: IntersectionObserverEntry[]) => any;

    /**
     * The IntersectionObserver instance.
     */
    #intersectionObserver?: IntersectionObserver;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression to extract identifiers and create the handler wrapper
        const expression = context.attribute.value;
        if (expression) {
            this.#dependentIdentifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#handlerWrapper = this.#createIntersectionHandlerWrapper(expression);
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_INTERSECTION;
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
        return undefined;
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
        return this.#dependentIdentifiers ?? [];
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
        if (!this.#handlerWrapper) {
            return undefined;
        }

        const element = this.#vNode.node as HTMLElement;
        const handler = this.#handlerWrapper;

        return () => {
            // Get options from :options.intersection or :options directive
            let optionsDirective = this.#vNode.directiveManager?.optionsDirective('intersection');

            // Evaluate the options expression
            let options: IntersectionObserverInit | undefined;
            if (optionsDirective && optionsDirective.expression) {
                // Evaluate the options expression
                const identifiers = optionsDirective.dependentIdentifiers;
                const values = identifiers.map(id => this.#vNode.bindings?.get(id));
                const args = identifiers.join(", ");
                const funcBody = `return (${optionsDirective.expression});`;
                const func = new Function(args, funcBody) as (...args: any[]) => any;
                options = func(...values);
            }

            // Create IntersectionObserver and start observing
            this.#intersectionObserver = new IntersectionObserver((entries) => {
                handler(entries);
            }, options);

            this.#intersectionObserver.observe(element);
        };
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
        // Disconnect the IntersectionObserver when the directive is destroyed
        if (this.#intersectionObserver) {
            this.#intersectionObserver.disconnect();
            this.#intersectionObserver = undefined;
        }
    }

    /**
     * Creates a wrapper function for intersection handlers.
     * @param expression The expression string to evaluate.
     * @returns A function that handles the intersection event.
     */
    #createIntersectionHandlerWrapper(expression: string): (entries: IntersectionObserverEntry[]) => any {
        const identifiers = this.#dependentIdentifiers ?? [];
        const vNode = this.#vNode;

        // Return a function that handles the intersection event with proper scope
        return (entries: IntersectionObserverEntry[]) => {
            const bindings = vNode.bindings;
            const $ctx = {
                element: vNode.node as HTMLElement,
                vnode: vNode,
                userData: vNode.userData
            };

            // If the expression is just a method name, call it with bindings as 'this'
            const trimmedExpr = expression.trim();
            if (identifiers.includes(trimmedExpr) && typeof bindings?.get(trimmedExpr) === 'function') {
                const methodName = trimmedExpr;
                const originalMethod = bindings?.get(methodName);

                // Call the method with bindings as 'this' context
                // Pass entries as first argument and $ctx as second argument
                return originalMethod(entries, $ctx);
            }

            // For inline expressions, evaluate normally
            // Note: inline expressions receive entries and $ctx as parameters
            const values = identifiers.map(id => vNode.bindings?.get(id));
            const args = [...identifiers, 'entries', '$ctx'].join(", ");
            const funcBody = `return (${expression});`;
            const func = new Function(args, funcBody) as (...args: any[]) => any;
            return func.call(bindings?.raw, ...values, entries, $ctx);
        };
    }
}
