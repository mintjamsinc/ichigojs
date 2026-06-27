// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";

/**
 * Directive for registering template references (Vue's `ref` / `$refs`).
 *
 * Usage:
 *     <input ref="search">                     Static name. $refs.search === the element.
 *     <my-card ref="card"></my-card>           On a component: $refs.card === the host element.
 *     <li v-for="i in items" ref="rows">       Inside v-for: $refs.rows === array of elements.
 *     <input :ref="dynamicName">               Dynamic name from an expression (evaluated at mount).
 *     <input :ref="el => collect(el)">          Function ref: called with the element on mount,
 *                                              and with null on unmount (great for v-for / dynamic).
 *
 * Behavior notes:
 * - The reference is registered during the mount phase (before any `@mounted` hook fires) and
 *   removed during the unmount phase, mirroring Vue's lifecycle for `$refs`.
 * - `$refs` is intentionally NON-reactive: registering or clearing a ref never schedules a render
 *   and must not be used to drive reactive template output (this matches Vue).
 * - When the same `ref` name appears inside a `v-for` (i.e. one of the element's ancestors is a
 *   `v-for` template), the entries are collected into an array, in registration order. Reused
 *   v-for rows are not re-registered, so the array order is not guaranteed to match DOM order after
 *   reordering — the same caveat Vue documents.
 * - Cleanup is identity-safe: a ref slot (or array entry) is only cleared when it still points at
 *   THIS element, so a freshly mounted element that reused the name is never clobbered by the
 *   teardown of the element it replaced.
 *
 * The directive is purely lifecycle-driven: it has no DOM updater and never templatizes the node.
 */
export class VRefDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * The static ref name parsed from `ref="name"`. Undefined for the dynamic `:ref` form.
     */
    #staticName?: string;

    /**
     * Expression evaluator for the dynamic `:ref` / `v-bind:ref` form. Undefined for static refs.
     */
    #evaluator?: ExpressionEvaluator;

    /**
     * The name under which this element was actually registered, retained so unmount removes the
     * exact same slot it created (the dynamic name is evaluated once at mount and may differ from
     * the source expression). Undefined when nothing was registered (function ref, or empty value).
     */
    #registeredName?: string;

    /**
     * The function supplied by a function ref (`:ref="el => ..."`), retained so it can be invoked
     * with null on unmount. Undefined unless a function ref was used.
     */
    #functionRef?: (el: Element | null) => void;

    /**
     * Whether this ref is registered in array mode (collected because it lives inside a v-for).
     * Resolved lazily at mount time via {@link #isInsideForLoop}.
     */
    #asArray: boolean = false;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        const attrName = context.attribute.name;
        const isDynamic = attrName !== StandardDirectiveName.REF; // ":ref" or "v-bind:ref"

        if (isDynamic) {
            // Dynamic / function ref: the value is an expression.
            const expression = context.attribute.value;
            if (expression && context.vNode.bindings) {
                this.#evaluator = ExpressionEvaluator.create(
                    expression,
                    context.vNode.bindings,
                    context.vNode.vApplication.functionDependencies
                );
            }
        } else {
            // Static ref: the value is the literal name.
            const name = context.attribute.value.trim();
            this.#staticName = name.length > 0 ? name : undefined;
        }

        // Remove the directive attribute from the element so it does not linger in the DOM.
        (this.#vNode.node as HTMLElement).removeAttribute(attrName);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.REF;
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
        // Refs are resolved once at mount; they are deliberately not reactive (see class docs).
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
        // This directive never drives reactive updates, so it contributes no dependencies.
        return [];
    }

    /**
     * @inheritdoc
     */
    get onMount(): (() => void) | undefined {
        // Register during the mount phase so the reference is available before any `@mounted`
        // hook runs (those fire a frame later via requestAnimationFrame).
        return () => this.#register();
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
        // Clear during the unmount phase. The element reference is still valid here.
        return () => this.#unregister();
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // No additional cleanup beyond onUnmounted; kept for interface completeness.
    }

    /**
     * Registers this element under its resolved ref name (or invokes its function ref).
     */
    #register(): void {
        const element = this.#vNode.node as Element;

        if (this.#evaluator) {
            // Dynamic / function ref.
            let value: unknown;
            try {
                value = this.#evaluator.evaluate();
            } catch {
                // Evaluation errors are already logged by ExpressionEvaluator; nothing to register.
                return;
            }

            if (typeof value === 'function') {
                this.#functionRef = value as (el: Element | null) => void;
                this.#functionRef(element);
                return;
            }

            if (value === null || value === undefined || value === '') {
                return; // Nothing to register under an empty dynamic name.
            }

            this.#registeredName = String(value);
        } else if (this.#staticName) {
            this.#registeredName = this.#staticName;
        }

        if (!this.#registeredName) {
            return;
        }

        this.#asArray = this.#isInsideForLoop();
        this.#vNode.vApplication.registerRef(this.#registeredName, element, this.#asArray);
    }

    /**
     * Removes this element's reference (or invokes its function ref with null).
     */
    #unregister(): void {
        if (this.#functionRef) {
            this.#functionRef(null);
            this.#functionRef = undefined;
            return;
        }

        if (this.#registeredName) {
            this.#vNode.vApplication.unregisterRef(this.#registeredName, this.#vNode.node as Element);
            this.#registeredName = undefined;
        }
    }

    /**
     * Determines whether this element is rendered inside a `v-for` by walking up the VNode tree.
     * A `v-for` multiplies its template into N rows, so a static ref name on (or within) a row is
     * shared by N elements and must be collected into an array — matching Vue's documented
     * "ref inside v-for yields an array" behavior. The walk inspects ancestors only: the directive
     * lives on a cloned row (or a descendant of one), and the clone's parent chain leads back to the
     * `v-for` template node, which still carries the `v-for` directive.
     */
    #isInsideForLoop(): boolean {
        for (let ancestor = this.#vNode.parentVNode; ancestor; ancestor = ancestor.parentVNode) {
            const hasFor = ancestor.directiveManager?.directives?.some(
                d => d.name === StandardDirectiveName.V_FOR
            );
            if (hasFor) {
                return true;
            }
        }
        return false;
    }
}
