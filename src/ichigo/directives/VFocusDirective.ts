// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";

/**
 * Directive for managing focus on form elements.
 *
 * Usage:
 *     <input v-focus>                           Focus once on mount.
 *     <input v-focus.select>                    Focus + select all on mount.
 *     <input v-focus="isOpen">                  Focus when expression transitions from falsy to truthy.
 *     <input v-focus.select="isOpen">           Conditional focus + select all.
 *     <input v-focus.cursor-end="isOpen">       Conditional focus + place caret at end.
 *
 * Behavior notes:
 * - Without an expression, the element is focused exactly once after mount.
 * - With an expression, focus fires only on the falsy -> truthy edge,
 *   so the user is not repeatedly re-focused on every reactive update.
 * - If the value is already truthy on mount, the element is focused.
 * - Focus is deferred via requestAnimationFrame so that elements which
 *   become visible just before this directive runs (e.g. inside v-if /
 *   display:none containers) can still receive focus reliably.
 */
export class VFocusDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * Optional expression evaluator. When absent, the directive focuses once on mount.
     */
    #evaluator?: ExpressionEvaluator;

    /**
     * Modifiers extracted from the directive name (e.g. "select", "cursor-end").
     */
    #modifiers: Set<string> = new Set();

    /**
     * Last evaluated boolean value, used for falsy -> truthy edge detection.
     */
    #previousValue: boolean = false;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Extract modifiers from the directive name
        // e.g., "v-focus.select" -> modifiers = {"select"}
        const attrName = context.attribute.name;
        if (attrName.startsWith(StandardDirectiveName.V_FOCUS + '.')) {
            const parts = attrName.split('.');
            parts.slice(1).forEach(mod => this.#modifiers.add(mod));
        }

        // Parse the expression and create the evaluator (optional)
        const expression = context.attribute.value;
        if (expression) {
            if (!context.vNode.bindings) {
                throw new Error('VFocusDirective requires bindings when an expression is provided');
            }
            this.#evaluator = ExpressionEvaluator.create(
                expression,
                context.vNode.bindings,
                context.vNode.vApplication.functionDependencies
            );
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_FOCUS;
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
        // Without an expression, there is nothing reactive to track.
        if (!this.#evaluator) {
            return undefined;
        }

        const identifiers = this.#evaluator.dependentIdentifiers;
        const evaluator = this.#evaluator;
        const focusElement = () => this.#focus();

        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM: () => {
                const value = evaluator.evaluateAsBoolean();
                const previous = this.#previousValue;
                this.#previousValue = value;
                // Edge: falsy -> truthy
                if (!previous && value) {
                    focusElement();
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
        return this.#evaluator?.dependentIdentifiers ?? [];
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
        return () => {
            if (!this.#evaluator) {
                // Unconditional: focus once on mount.
                this.#focus();
                return;
            }

            // Conditional: seed previous value and focus if already truthy on mount.
            const value = this.#evaluator.evaluateAsBoolean();
            this.#previousValue = value;
            if (value) {
                this.#focus();
            }
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
        // No specific cleanup needed for this directive.
    }

    /**
     * Focuses the element, applying any modifier-driven post-focus behavior.
     * Deferred via requestAnimationFrame so that elements transitioning out
     * of display:none (e.g. inside v-if) can receive focus reliably.
     */
    #focus(): void {
        const element = this.#vNode.node as HTMLElement;
        if (!element || typeof element.focus !== 'function') {
            return;
        }

        const applyModifiers = () => this.#applyModifiers();

        requestAnimationFrame(() => {
            // The element may have been unmounted between scheduling and execution.
            if (!element.isConnected) {
                return;
            }
            element.focus();
            applyModifiers();
        });
    }

    /**
     * Applies modifier-driven behavior after focus.
     */
    #applyModifiers(): void {
        const element = this.#vNode.node as HTMLElement;

        if (this.#modifiers.has('select')) {
            const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
            if (typeof inputEl.select === 'function') {
                try {
                    inputEl.select();
                } catch {
                    // Some input types (e.g. number) reject select(); ignore.
                }
            }
            return;
        }

        if (this.#modifiers.has('cursor-end')) {
            const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
            if (typeof inputEl.setSelectionRange === 'function') {
                const len = (inputEl.value ?? '').length;
                try {
                    inputEl.setSelectionRange(len, len);
                } catch {
                    // Some input types (e.g. number) do not support selection ranges; ignore.
                }
            }
        }
    }
}
