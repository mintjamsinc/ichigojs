// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

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
 * Key modifiers (KeyboardEvent): `.enter`, `.tab`, `.delete` (Delete/Backspace), `.esc` / `.escape`, `.space`, `.up`, `.down`, `.left`, `.right`.
 * Mouse button modifiers (MouseEvent): `.left`, `.middle`, `.right`.
 * System modifiers (KeyboardEvent and MouseEvent): `.shift`, `.ctrl`, `.alt`, `.meta`, plus `.exact` to require that no other system modifiers are held.
 *
 * Listen target and filter modifiers (two orthogonal axes):
 *   - Listen target (where the listener is attached): `.window`, `.document`. When omitted the listener
 *     is attached to the bound element. This is useful for global / cross-component events, e.g.
 *     `@webtop-message.document="onMessage"`, and the listener is removed automatically on unmount.
 *   - Filter (whether the handler runs): `.self` fires only when `event.target` is the bound element;
 *     `.outside` fires only when `event.target` is outside the bound element (e.g. click-outside to
 *     close a popup). `.outside` implies listening on `document` (capture phase) even without `.document`,
 *     and `.self` / `.outside` are mutually exclusive.
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
     * The resolved target the listener is attached to (element, document, or window).
     * Stored so destroy() removes the listener from the same target it was added to.
     */
    #resolvedTarget?: EventTarget;

    /**
     * The resolved capture flag. Shared by attach and destroy so they stay in sync,
     * since `.outside` forces capture phase regardless of the `.capture` modifier.
     */
    #useCapture: boolean = false;

    /**
     * Whether the listener has actually been attached. `.outside` defers attachment by a
     * microtask, so destroy() must not attempt removal before it is attached.
     */
    #attached: boolean = false;

    /**
     * Whether the directive has been destroyed. Guards the deferred `.outside` attachment
     * from attaching after the node was already unmounted.
     */
    #destroyed: boolean = false;

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


        // `.self` and `.outside` are mutually exclusive filters; together they can never fire.
        if (this.#modifiers.has('self') && this.#modifiers.has('outside')) {
            context.vNode.vApplication.logManager
                .getLogger('VOnDirective')
                .warn(`The '.self' and '.outside' modifiers on '${attrName}' are mutually exclusive; the handler will never fire.`);
        }

        // Parse the expression to extract identifiers and create the handler wrapper.
        // Event handlers are parsed in script mode so that users can write multi-statement bodies
        // (e.g. "a=1; b=2"), declarations, and control-flow constructs — matching Vue semantics.
        const expression = context.attribute.value;
        if (expression) {
            this.#dependentIdentifiers = ExpressionUtils.extractIdentifiers(
                expression,
                context.vNode.vApplication.functionDependencies,
                { asScript: true }
            );
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
        this.#destroyed = true;
        // Remove the event listener from the same target/phase it was attached to.
        if (this.#eventName && this.#listener && this.#resolvedTarget && this.#attached) {
            this.#resolvedTarget.removeEventListener(this.#eventName, this.#listener, this.#useCapture);
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
        const isOnce = this.#modifiers.has('once');
        const isOutside = this.#modifiers.has('outside');

        // Resolve the listen target (orthogonal to filters): `.window` / `.document` attach
        // the listener globally; `.outside` also requires a global listener to detect events
        // originating outside the element, so it implies `document`.
        this.#resolvedTarget = this.#modifiers.has('window')
            ? window
            : (this.#modifiers.has('document') || isOutside)
                ? document
                : element;

        // `.outside` listens in capture phase so it is not suppressed by a descendant's
        // stopPropagation(); otherwise the capture flag follows the `.capture` modifier.
        this.#useCapture = this.#modifiers.has('capture') || isOutside;
        const useCapture = this.#useCapture;
        const target = this.#resolvedTarget;

        // System modifier keys (held during the event) shared by KeyboardEvent and MouseEvent.
        const systemModifiers = ['shift', 'ctrl', 'alt', 'meta'] as const;

        // Create the event listener function
        this.#listener = (event: Event) => {
            // Check key modifiers for keyboard events.
            // The `.left` / `.right` aliases here mean ArrowLeft / ArrowRight; the same tokens
            // map to mouse buttons further below, dispatched by event type to avoid ambiguity.
            if (event instanceof KeyboardEvent) {
                const keyMap: Record<string, string[]> = {
                    'enter': ['Enter'],
                    'tab': ['Tab'],
                    'delete': ['Delete', 'Backspace'],
                    'esc': ['Escape'],
                    'escape': ['Escape'],
                    'space': [' '],
                    'up': ['ArrowUp'],
                    'down': ['ArrowDown'],
                    'left': ['ArrowLeft'],
                    'right': ['ArrowRight']
                };

                const hasKeyModifier = Object.keys(keyMap).some(key => this.#modifiers.has(key));

                if (hasKeyModifier) {
                    let keyMatched = false;
                    for (const [modifier, keyValues] of Object.entries(keyMap)) {
                        if (this.#modifiers.has(modifier) && keyValues.includes(event.key)) {
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

            // Check mouse button modifiers for mouse events.
            // `.left` / `.middle` / `.right` map to MouseEvent.button values 0 / 1 / 2.
            if (event instanceof MouseEvent) {
                const buttonMap: Record<string, number> = {
                    'left': 0,
                    'middle': 1,
                    'right': 2
                };

                const hasButtonModifier = Object.keys(buttonMap).some(b => this.#modifiers.has(b));

                if (hasButtonModifier) {
                    let buttonMatched = false;
                    for (const [modifier, buttonValue] of Object.entries(buttonMap)) {
                        if (this.#modifiers.has(modifier) && event.button === buttonValue) {
                            buttonMatched = true;
                            break;
                        }
                    }

                    if (!buttonMatched) {
                        return;
                    }
                }
            }

            // Check system modifier keys (shift / ctrl / alt / meta) and `.exact`.
            // These properties exist on both KeyboardEvent and MouseEvent.
            if (event instanceof KeyboardEvent || event instanceof MouseEvent) {
                // Required system modifiers must be held.
                for (const mod of systemModifiers) {
                    if (this.#modifiers.has(mod) && !(event as any)[`${mod}Key`]) {
                        return;
                    }
                }

                // `.exact` rejects events with extra system modifiers held that weren't listed.
                if (this.#modifiers.has('exact')) {
                    for (const mod of systemModifiers) {
                        if ((event as any)[`${mod}Key`] && !this.#modifiers.has(mod)) {
                            return;
                        }
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
            // `.outside`: only fire when the event originates outside the bound element.
            // A non-Node target (e.g. window) is treated as outside.
            if (isOutside) {
                const eventTarget = event.target;
                if (eventTarget instanceof Node && element.contains(eventTarget)) {
                    return;
                }
            }

            // Call the pre-generated handler wrapper (if exists)
            if (this.#handlerWrapper) {
                this.#handlerWrapper(event);
            }

            // Note: DOM update is automatically scheduled by ReactiveProxy when bindings change
            // No need to manually call scheduleUpdate() here

            // If 'once' modifier is used, remove the listener after first execution
            if (isOnce && this.#listener) {
                target.removeEventListener(eventName, this.#listener, useCapture);
                this.#attached = false;
            }
        };

        if (isOutside) {
            // Defer attachment by one microtask so the listener does not catch the same
            // interaction that mounted this element (e.g. the click that opened a popup,
            // which would otherwise immediately close it). Skip if already destroyed.
            queueMicrotask(() => {
                if (this.#destroyed || !this.#listener) {
                    return;
                }
                target.addEventListener(eventName, this.#listener, useCapture);
                this.#attached = true;
            });
        } else {
            target.addEventListener(eventName, this.#listener, useCapture);
            this.#attached = true;
        }
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

            // For inline bodies, rewrite to use 'this' context
            // This allows assignments like "currentTab = 'shop'" to work correctly.
            // Script mode allows multi-statement bodies (e.g. "a=1; init()") and control-flow.
            const rewrittenExpr = this.#rewriteExpression(expression, identifiers, { asScript: true });
            const funcBody = rewrittenExpr;
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

            // For inline bodies, rewrite to use 'this' context
            // This allows assignments like "currentTab = 'shop'" to work correctly.
            // Script mode allows multi-statement bodies (e.g. "a=1; b=2") and control-flow,
            // so we emit the rewritten source directly as the function body (no `return (...)`).
            const rewrittenExpr = this.#rewriteExpression(expression, identifiers, { asScript: true });
            const funcBody = rewrittenExpr;
            // '$event' is an alias for 'event' for Vue compatibility
            const func = new Function('event', '$event', '$ctx', funcBody) as (...args: any[]) => any;
            return func.call(bindings?.raw, event, event, $ctx);
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
    #rewriteExpression(expression: string, identifiers: string[], options?: { asScript?: boolean }): string {
        return ExpressionUtils.rewriteExpression(expression, identifiers, options);
    }
}
