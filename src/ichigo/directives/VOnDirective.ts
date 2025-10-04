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

        // Return a function that evaluates the expression with proper scope
        return () => {
            // Gather the current values of the identifiers from the bindings
            const bindings = this.#vNode.bindings ?? {};

            // If the expression is just a method name, we need to wrap it
            // so that when it's called, the method has access to all its dependencies
            const trimmedExpr = expression.trim();
            if (identifiers.includes(trimmedExpr) && typeof bindings[trimmedExpr] === 'function') {
                const methodName = trimmedExpr;
                const originalMethod = bindings[methodName];
                const dependencies = this.#vNode.vApplication.functionDependencies[methodName] || [];

                // Return a wrapper function that will be called with the event
                return (event: Event) => {
                    // Get the method source code
                    let methodSource = originalMethod.toString();

                    // Extract the function body from the method
                    // Handle different function formats:
                    // - "methodName() { ... }" (method shorthand)
                    // - "function() { ... }" (function expression)
                    // - "() => { ... }" or "() => expr" (arrow function)
                    const arrowMatch = methodSource.match(/^\s*(?:\(.*?\)|[a-zA-Z_$][\w$]*)\s*=>\s*(.+)$/s);
                    const functionMatch = methodSource.match(/^(?:async\s+)?function\s*[^(]*\([^)]*\)\s*\{([\s\S]*)\}$/);
                    const methodMatch = methodSource.match(/^(?:async\s+)?[a-zA-Z_$][\w$]*\s*\([^)]*\)\s*\{([\s\S]*)\}$/);

                    let functionBody: string;
                    if (arrowMatch) {
                        // Arrow function - check if it has a block or is an expression
                        const body = arrowMatch[1].trim();
                        if (body.startsWith('{')) {
                            functionBody = body.slice(1, -1); // Remove { }
                        } else {
                            functionBody = `return ${body};`;
                        }
                    } else if (functionMatch) {
                        functionBody = functionMatch[1];
                    } else if (methodMatch) {
                        functionBody = methodMatch[1];
                    } else {
                        // Fallback: couldn't parse, just call the original method
                        return originalMethod.call(bindings, event);
                    }

                    // Create a new function with all dependencies as parameters
                    const allIdentifiers = [...new Set([...dependencies, 'event'])];
                    const wrapper = new Function(...allIdentifiers, functionBody);

                    // Get dependency values from bindings or global scope
                    const depValues = allIdentifiers.map((id: string) => {
                        if (id === 'event') {
                            return event;
                        }
                        // Try to get from bindings first, then from global scope
                        if (id in bindings) {
                            return bindings[id];
                        }
                        // Check if it's a global variable (performance, Math, console, etc.)
                        if (typeof window !== 'undefined' && id in window) {
                            return (window as any)[id];
                        }
                        if (typeof globalThis !== 'undefined' && id in globalThis) {
                            return (globalThis as any)[id];
                        }
                        return undefined;
                    });

                    // Execute the wrapper with all dependencies in scope
                    return wrapper(...depValues);
                };
            }

            // For inline expressions, evaluate normally
            const values = identifiers.map(id => bindings[id]);
            const args = identifiers.join(", ");
            const funcBody = `return (${expression});`;
            const func = new Function(args, funcBody) as (...args: any[]) => any;
            return func(...values);
        };
    }
}
