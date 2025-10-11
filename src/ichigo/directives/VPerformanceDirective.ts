// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";

/**
 * Directive for observing performance metrics using PerformanceObserver.
 * The `v-performance` directive allows you to monitor various performance entries.
 *
 * Example usage:
 *     <div v-performance="handlePerformance">Performance monitoring</div>
 *     <div v-performance="handlePerformance" :options.performance="{entryTypes: ['measure']}">Performance monitoring</div>
 *
 * By default (without options), it observes 'mark' and 'measure' entry types.
 *
 * The handler receives PerformanceObserverEntryList, PerformanceObserver, options (with droppedEntriesCount), and $ctx as arguments:
 *     handlePerformance(entries, observer, options, $ctx) {
 *       entries.getEntries().forEach(entry => {
 *         console.log(`${entry.name}: ${entry.duration}ms`);
 *       });
 *       if (options?.droppedEntriesCount) {
 *         console.log(`Dropped entries: ${options.droppedEntriesCount}`);
 *       }
 *     }
 *
 * Options can be provided via :options or :options.performance attribute:
 *     :options="{entryTypes: ['measure', 'mark']}"
 *     :options.performance="{type: 'navigation', buffered: true}"
 *
 * This directive is useful for performance monitoring, profiling, and identifying
 * performance bottlenecks in your application.
 */
export class VPerformanceDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #dependentIdentifiers?: string[];

    /**
     * The performance handler wrapper function.
     */
    #handlerWrapper?: (entries: PerformanceObserverEntryList, observer: PerformanceObserver, options?: { droppedEntriesCount: number }) => any;

    /**
     * The PerformanceObserver instance.
     */
    #performanceObserver?: PerformanceObserver;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression to extract identifiers and create the handler wrapper
        const expression = context.attribute.value;
        if (expression) {
            this.#dependentIdentifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#handlerWrapper = this.#createPerformanceHandlerWrapper(expression);
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_PERFORMANCE;
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

        const handler = this.#handlerWrapper;

        return () => {
            // Get options from :options.performance or :options directive
            let optionsDirective = this.#vNode.directiveManager?.optionsDirective('performance');

            // Evaluate the options expression
            let options: PerformanceObserverInit | undefined;
            if (optionsDirective && optionsDirective.expression) {
                // Evaluate the options expression
                const identifiers = optionsDirective.dependentIdentifiers;
                const values = identifiers.map(id => this.#vNode.bindings?.get(id));
                const args = identifiers.join(", ");
                const funcBody = `return (${optionsDirective.expression});`;
                const func = new Function(args, funcBody) as (...args: any[]) => any;
                options = func(...values);
            }

            // Create PerformanceObserver and start observing
            // Note: The callback receives a third argument 'options' with droppedEntriesCount in modern browsers
            // TypeScript's type definition only includes 2 arguments, so we use type assertion
            this.#performanceObserver = new PerformanceObserver(((...args: any[]) => {
                const [entries, observer, callbackOptions] = args;
                handler(entries, observer, callbackOptions);
            }) as PerformanceObserverCallback);

            // If no options provided, use default: observe marks and measures
            if (!options) {
                options = { entryTypes: ['mark', 'measure'] };
            }

            // Start observing with options
            this.#performanceObserver.observe(options);
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
        // Disconnect the PerformanceObserver when the directive is destroyed
        if (this.#performanceObserver) {
            this.#performanceObserver.disconnect();
            this.#performanceObserver = undefined;
        }
    }

    /**
     * Creates a wrapper function for performance handlers.
     * @param expression The expression string to evaluate.
     * @returns A function that handles the performance event.
     */
    #createPerformanceHandlerWrapper(expression: string): (entries: PerformanceObserverEntryList, observer: PerformanceObserver, options?: { droppedEntriesCount: number }) => any {
        const identifiers = this.#dependentIdentifiers ?? [];
        const vNode = this.#vNode;

        // Return a function that handles the performance event with proper scope
        return (entries: PerformanceObserverEntryList, observer: PerformanceObserver, options?: { droppedEntriesCount: number }) => {
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
                // Pass entries, observer, options, and $ctx as arguments
                return originalMethod(entries, observer, options, $ctx);
            }

            // For inline expressions, evaluate normally
            // Note: inline expressions receive entries, observer, options, and $ctx as parameters
            const values = identifiers.map(id => vNode.bindings?.get(id));
            const args = [...identifiers, 'entries', 'observer', 'options', '$ctx'].join(", ");
            const funcBody = `return (${expression});`;
            const func = new Function(args, funcBody) as (...args: any[]) => any;
            return func.call(bindings?.raw, ...values, entries, observer, options, $ctx);
        };
    }
}
