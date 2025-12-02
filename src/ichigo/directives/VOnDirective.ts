// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";

/**
 * Directive for binding event listeners to DOM elements and lifecycle hooks.
 * The `v-on` directive allows you to listen to DOM events and execute specified methods when those events are triggered.
 * The syntax for using the `v-on` directive is `v-on:event="methodName"`, where `event` is the name of the event to listen for (e.g., `click`, `mouseover`, etc.), and `methodName` is the name of the method to be called when the event occurs.
 * Example usage:
 *     <button v-on:click="handleClick">Click Me</button>
 * In this example, when the button is clicked, the `handleClick` method will be executed.
 * You can also use the shorthand `@event` instead of `v-on:event`. For example, `@click="handleClick"` is equivalent to `v-on:click="handleClick"`.
 * The `v-on` directive supports event modifiers such as `.stop`, `.prevent`, `.capture`, `.self`, and `.once` to modify the behavior of the event listener.
 * For example, `v-on:click.stop="handleClick"` will stop the event from propagating up the DOM tree.
 *
 * Additionally, this directive supports lifecycle hooks:
 *     @mount="onMount"       - Called before the VNode is mounted to the DOM element
 *     @mounted="onMounted"   - Called after the VNode is mounted to the DOM element
 *     @update="onUpdate"     - Called before the element is updated
 *     @updated="onUpdated"   - Called after the element is updated
 *     @unmount="onUnmount"   - Called before VNode cleanup begins
 *     @unmounted="onUnmounted" - Called after VNode cleanup is complete (element reference still available)
 *
 * This directive is essential for handling user interactions and lifecycle events in your application.
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
    #dependentIdentifiers?: string[];

    /**
     * The event handler wrapper function, generated once and reused.
     * For lifecycle hooks, this is a no-argument function.
     * For DOM events, this accepts an Event parameter.
     */
    #handlerWrapper?: ((event: Event) => any) | (() => any);

    /**
     * The event name (e.g., "click", "input", "keydown") or lifecycle hook name (e.g., "mount", "mounted").
     */
    #eventName?: string;

    /**
     * The event modifiers (e.g., "stop", "prevent", "capture", "self", "once").
     */
    #modifiers: Set<string> = new Set();

    /**
     * The event listener function for DOM events.
     */
    #listener?: (event: Event) => void;

    /**
     * Map of lifecycle hook names to their handler functions.
     */
    #lifecycleHooks: Map<string, () => void> = new Map();

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


        // Parse the expression to extract identifiers and create the handler wrapper
        const expression = context.attribute.value;
        if (expression) {
            this.#dependentIdentifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
        }

        // Check if this is a lifecycle hook or a regular event
        if (this.#eventName && this.#isLifecycleHook(this.#eventName)) {
            // Create handler wrapper for lifecycle hook (no event parameter)
            if (expression) {
                const handler = this.#createLifecycleHandlerWrapper(expression);
                this.#handlerWrapper = handler;
                this.#lifecycleHooks.set(this.#eventName, handler);
            }
        } else if (this.#eventName) {
            // Create handler wrapper for DOM event (with event parameter)
            if (expression) {
                this.#handlerWrapper = this.#createEventHandlerWrapper(expression);
            }
            // Create and attach DOM event listener
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
        return this.#lifecycleHooks.get('mount');
    }

    /**
     * @inheritdoc
     */
    get onMounted(): (() => void) | undefined {
        return this.#lifecycleHooks.get('mounted');
    }

    /**
     * @inheritdoc
     */
    get onUpdate(): (() => void) | undefined {
        return this.#lifecycleHooks.get('update');
    }

    /**
     * @inheritdoc
     */
    get onUpdated(): (() => void) | undefined {
        return this.#lifecycleHooks.get('updated');
    }

    /**
     * @inheritdoc
     */
    get onUnmount(): (() => void) | undefined {
        return this.#lifecycleHooks.get('unmount');
    }

    /**
     * @inheritdoc
     */
    get onUnmounted(): (() => void) | undefined {
        return this.#lifecycleHooks.get('unmounted');
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
     * Event listener is attached if there's a handler or if there are modifiers
     * that need to be applied (e.g., .stop, .prevent).
     */
    #attachEventListener(): void {
        // Attach listener if there's a handler or if there are modifiers to apply
        const hasModifiersToApply = this.#modifiers.has('stop') || this.#modifiers.has('prevent');
        if (!this.#eventName || (!this.#handlerWrapper && !hasModifiersToApply)) {
            return;
        }

        const element = this.#vNode.node as HTMLElement;
        const eventName = this.#eventName;
        const useCapture = this.#modifiers.has('capture');
        const isOnce = this.#modifiers.has('once');

        // Create the event listener function
        this.#listener = (event: Event) => {
            // Check key modifiers for keyboard events
            if (event instanceof KeyboardEvent) {
                const keyModifiers = ['enter', 'tab', 'delete', 'esc', 'space', 'up', 'down', 'left', 'right'];
                const hasKeyModifier = keyModifiers.some(key => this.#modifiers.has(key));

                if (hasKeyModifier) {
                    const keyMap: Record<string, string> = {
                        'enter': 'Enter',
                        'tab': 'Tab',
                        'delete': 'Delete',
                        'esc': 'Escape',
                        'space': ' ',
                        'up': 'ArrowUp',
                        'down': 'ArrowDown',
                        'left': 'ArrowLeft',
                        'right': 'ArrowRight'
                    };

                    let keyMatched = false;
                    for (const [modifier, keyValue] of Object.entries(keyMap)) {
                        if (this.#modifiers.has(modifier) && event.key === keyValue) {
                            keyMatched = true;
                            break;
                        }
                    }

                    // If key modifier specified but key doesn't match, return early
                    if (!keyMatched) {
                        return;
                    }
                }
            }

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

            // Call the pre-generated handler wrapper (if exists)
            if (this.#handlerWrapper) {
                this.#handlerWrapper(event);
            }

            // Note: DOM update is automatically scheduled by ReactiveProxy when bindings change
            // No need to manually call scheduleUpdate() here

            // If 'once' modifier is used, remove the listener after first execution
            if (isOnce && this.#listener) {
                element.removeEventListener(eventName, this.#listener, useCapture);
            }
        };

        // Attach the event listener
        element.addEventListener(eventName, this.#listener, useCapture);
    }

    /**
     * Checks if the event name is a lifecycle hook.
     * @param eventName The event name to check.
     * @returns True if the event name is a lifecycle hook, false otherwise.
     */
    #isLifecycleHook(eventName: string): boolean {
        return ['mount', 'mounted', 'update', 'updated', 'unmount', 'unmounted'].includes(eventName);
    }

    /**
     * Creates a wrapper function for lifecycle hooks (with context parameter).
     * @param expression The expression string to evaluate.
     * @returns A function that handles the lifecycle hook.
     */
    #createLifecycleHandlerWrapper(expression: string): () => any {
        const identifiers = this.#dependentIdentifiers ?? [];
        const vNode = this.#vNode;

        // Return a function that handles the lifecycle hook with proper scope
        return () => {
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

                // Call the method with bindings as 'this' context and context as parameter
                // This allows the method to access the DOM element, VNode, and userData
                return originalMethod($ctx);
            }

            // For inline expressions, rewrite to use 'this' context
            // This allows assignments like "currentTab = 'shop'" to work correctly
            const rewrittenExpr = this.#rewriteExpression(expression, identifiers);
            const funcBody = `return (${rewrittenExpr});`;
            const func = new Function('$ctx', funcBody) as (...args: any[]) => any;
            return func.call(bindings?.raw, $ctx);
        };
    }

    /**
     * Creates a wrapper function for DOM event handlers (with event and $ctx parameters).
     * @param expression The expression string to evaluate.
     * @returns A function that handles the event.
     */
    #createEventHandlerWrapper(expression: string): (event: Event) => any {
        const identifiers = this.#dependentIdentifiers ?? [];
        const vNode = this.#vNode;

        // Return a function that handles the event with proper scope
        return (event: Event) => {
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
                // Pass event as first argument and $ctx as second argument
                return originalMethod(event, $ctx);
            }

            // For inline expressions, rewrite to use 'this' context
            // This allows assignments like "currentTab = 'shop'" to work correctly
            const rewrittenExpr = this.#rewriteExpression(expression, identifiers);
            const funcBody = `return (${rewrittenExpr});`;
            const func = new Function('event', '$ctx', funcBody) as (...args: any[]) => any;
            return func.call(bindings?.raw, event, $ctx);
        };
    }

    /**
     * Rewrites an expression to replace identifiers with 'this.identifier'.
     * This allows direct property access and assignment without using 'with' statement.
     * Uses AST parsing to accurately identify which identifiers to replace.
     * @param expression The original expression string.
     * @param identifiers The list of identifiers that are available in bindings.
     * @returns The rewritten expression.
     */
    #rewriteExpression(expression: string, identifiers: string[]): string {
        // Reserved words and built-in objects that should not be prefixed with 'this.'
        const reserved = new Set([
            'event', '$ctx',
            'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
            'Math', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object',
            'JSON', 'console', 'window', 'document', 'navigator',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite',
            'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent'
        ]);

        // Extract ALL identifiers from the expression (including assignment left-hand side)
        // This is necessary because the passed 'identifiers' parameter only includes
        // identifiers that are used (right-hand side), not assigned to (left-hand side)
        let allIdentifiersInExpression: string[];
        try {
            allIdentifiersInExpression = ExpressionUtils.extractIdentifiers(expression, {});
        } catch (error) {
            console.warn('[ichigo.js] Failed to extract identifiers from expression:', expression, error);
            return expression;
        }

        // Create a Set of identifiers available in bindings (from data, computed, methods)
        // We need to know which identifiers are valid binding properties
        const bindingIdentifiers = new Set(identifiers.filter(id => !reserved.has(id)));

        // For assignment expressions, we also need to include the left-hand side identifier
        // even if it's not in the tracking identifiers (because it's being assigned, not read)
        for (const id of allIdentifiersInExpression) {
            if (!reserved.has(id)) {
                bindingIdentifiers.add(id);
            }
        }

        if (bindingIdentifiers.size === 0) {
            return expression;
        }

        try {
            // Build a map of positions to replace: { start: number, end: number, name: string }[]
            const replacements: { start: number, end: number, name: string }[] = [];

            const parsedAst = acorn.parse(`(${expression})`, { ecmaVersion: 'latest' });

            // Collect all identifier nodes that should be replaced
            // Use walk.ancestor to check parent context and skip MemberExpression properties
            walk.ancestor(parsedAst, {
                Identifier(node: any, _state: any, ancestors: any[]) {
                    // Skip if not in our identifier set
                    if (!bindingIdentifiers.has(node.name)) {
                        return;
                    }

                    // Check if this identifier is a property of a MemberExpression
                    // (e.g., in 'obj.prop', we should skip 'prop')
                    if (ancestors.length >= 2) {
                        const parent = ancestors[ancestors.length - 2];
                        if (parent.type === 'MemberExpression') {
                            // Skip if this identifier is the property (not the object) of a non-computed member access
                            if (!parent.computed && parent.property === node) {
                                return;
                            }
                        }
                    }

                    // Add to replacements list (adjust for the wrapping parentheses)
                    replacements.push({
                        start: node.start - 1,
                        end: node.end - 1,
                        name: node.name
                    });
                }
            });

            // Sort replacements by start position (descending) to replace from end to start
            replacements.sort((a, b) => b.start - a.start);

            // Apply replacements
            let result = expression;
            for (const replacement of replacements) {
                result = result.substring(0, replacement.start) +
                         `this.${replacement.name}` +
                         result.substring(replacement.end);
            }

            return result;
        } catch (error) {
            // If AST parsing fails, fall back to the original expression
            console.warn('Failed to rewrite expression:', expression, error);
            return expression;
        }
    }
}
