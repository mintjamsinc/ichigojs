// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";

/**
 * Directive for binding event listeners to DOM elements.
 * The `v-on` directive allows you to listen to DOM events and execute specified methods when those events are triggered.
 * The syntax for using the `v-on` directive is `v-on:event="methodName"`, where `event` is the name of the event to listen for (e.g., `click`, `mouseover`, etc.), and `methodName` is the name of the method to be called when the event occurs.
 * Example usage:
 *     <button v-on:click="handleClick">Click Me</button>
 * In this example, when the button is clicked, the `handleClick` method will be executed.
 * You can also use the shorthand `@event` instead of `v-on:event`. For example, `@click="handleClick"` is equivalent to `v-on:click="handleClick"`.
 * The `v-on` directive supports event modifiers such as `.stop`, `.prevent`, `.capture`, `.self`, and `.once` to modify the behavior of the event listener.
 * For example, `v-on:click.stop="handleClick"` will stop the event from propagating up the DOM tree.
 * This directive is essential for handling user interactions in your application.
 * Note that the methods referenced in the directive should be defined in the component's methods object.
 */
export class VOnDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #identifiers?: string[];

    /**
     * A function that evaluates the directive's expression.
     * It returns the evaluated value of the expression.
     */
    #evaluate?: () => any;

    /**
     * The event name (e.g., "click", "input", "keydown").
     */
    #eventName?: string;

    /**
     * The event modifiers (e.g., "stop", "prevent", "capture", "self", "once").
     */
    #modifiers: Set<string> = new Set();

    /**
     * The event listener function.
     */
    #listener?: (event: Event) => void;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Extract the event name and modifiers from the directive
        // e.g., "v-on:click.stop.prevent" -> eventName="click", modifiers=["stop", "prevent"]
        // e.g., "@click" -> eventName="click", modifiers=[]
        const attrName = context.attribute.name;
        if (attrName.startsWith('v-on:')) {
            const parts = attrName.substring(5).split('.');
            this.#eventName = parts[0];
            parts.slice(1).forEach(mod => this.#modifiers.add(mod));
        } else if (attrName.startsWith('@')) {
            const parts = attrName.substring(1).split('.');
            this.#eventName = parts[0];
            parts.slice(1).forEach(mod => this.#modifiers.add(mod));
        }

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#evaluate = this.#createEvaluator(expression);
        }

        // Create and attach the event listener
        if (this.#eventName) {
            this.#attachEventListener();
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_ON;
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
    destroy(): void {
        // Remove the event listener when the directive is destroyed
        if (this.#eventName && this.#listener) {
            const element = this.#vNode.node as HTMLElement;
            const useCapture = this.#modifiers.has('capture');
            element.removeEventListener(this.#eventName, this.#listener, useCapture);
        }
    }

    /**
     * Attaches the event listener to the DOM element.
     */
    #attachEventListener(): void {
        if (!this.#eventName || !this.#evaluate) {
            return;
        }

        const element = this.#vNode.node as HTMLElement;
        const eventName = this.#eventName;
        const useCapture = this.#modifiers.has('capture');
        const isOnce = this.#modifiers.has('once');

        // Create the event listener function
        this.#listener = (event: Event) => {
            // Apply event modifiers
            if (this.#modifiers.has('stop')) {
                event.stopPropagation();
            }
            if (this.#modifiers.has('prevent')) {
                event.preventDefault();
            }
            if (this.#modifiers.has('self') && event.target !== element) {
                return;
            }

            // Evaluate the expression (this will call the handler function)
            const handler = this.#evaluate!();

            // If the handler is a function, call it with the event
            if (typeof handler === 'function') {
                handler(event);
            }

            // If 'once' modifier is used, remove the listener after first execution
            if (isOnce && this.#listener) {
                element.removeEventListener(eventName, this.#listener, useCapture);
            }
        };

        // Attach the event listener
        element.addEventListener(eventName, this.#listener, useCapture);
    }

    /**
     * Creates a function to evaluate the directive's expression.
     * @param expression The expression string to evaluate.
     * @returns A function that evaluates the directive's expression.
     */
    #createEvaluator(expression: string): () => any {
        const identifiers = this.#identifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        // Create a dynamic function with the identifiers as parameters
        const func = new Function(args, funcBody) as (...args: any[]) => any;

        // Return a function that calls the dynamic function with the current values from the virtual node's bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = identifiers.map(id => this.#vNode.bindings?.[id]);

            // Call the dynamic function with the gathered values
            return func(...values);
        };
    }
}
