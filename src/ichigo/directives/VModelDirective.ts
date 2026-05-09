// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";
import { ExpressionUtils } from "../util/ExpressionUtils";

/**
 * Directive for two-way data binding on form input elements.
 * This directive binds the value of an input element to a data property and updates the property when the input value changes.
 * Example usage:
 *     <input v-model="username" />
 * In this example, the v-model directive binds the value of the input element to the username data property.
 * When the user types in the input field, the username property is automatically updated with the new value.
 * This directive supports various input types, including text, checkbox, radio, and select elements.
 * For checkboxes and radio buttons, it binds to boolean or specific values accordingly.
 * For select elements, it binds to the selected option's value.
 */
export class VModelDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * The expression evaluator for this directive.
     */
    #evaluator?: ExpressionEvaluator;

    /**
     * The expression string (e.g., "message" or "user.name")
     */
    #expression?: string;

    /**
     * The event listener function for handling input changes.
     */
    #listener?: (event: Event) => void;

    /**
     * The modifiers for this v-model directive (e.g., "lazy", "number", "trim")
     */
    #modifiers: Set<string> = new Set();

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Extract modifiers from the directive name
        // e.g., "v-model.lazy.trim" -> modifiers = ["lazy", "trim"]
        const attrName = context.attribute.name;
        if (attrName.startsWith('v-model.')) {
            const parts = attrName.split('.');
            parts.slice(1).forEach(mod => this.#modifiers.add(mod));
        }

        // Parse the expression and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#expression = expression;
            if (context.vNode.bindings) {
                this.#evaluator = ExpressionEvaluator.create(
                    expression,
                    context.vNode.bindings,
                    context.vNode.vApplication.functionDependencies
                );
            }

            // Attach event listener for two-way binding
            this.#attachEventListener();
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_MODEL;
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
        const self = this;
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return self.#collectDependentIdentifiers();
            },
            applyToDOM: () => {
                self.#render();
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
        return this.#collectDependentIdentifiers();
    }

    /**
     * Collects identifiers this directive's render depends on. For checkboxes
     * this includes the v-model expression itself plus the expressions bound to
     * `:value`, `:true-value`, and `:false-value`, since the rendered checked
     * state changes when any of these change.
     */
    #collectDependentIdentifiers(): string[] {
        const ids = new Set<string>(this.#evaluator?.dependentIdentifiers ?? []);

        const element = this.#vNode.node as HTMLElement;
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            const manager = this.#vNode.directiveManager;
            for (const attrName of ['value', 'true-value', 'false-value']) {
                const bindDirective = manager?.findBindDirective(attrName);
                if (bindDirective) {
                    bindDirective.dependentIdentifiers.forEach(id => ids.add(id));
                }
            }
        }

        return Array.from(ids);
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
        const element = this.#vNode.node as HTMLElement;
        // For select elements, re-apply value after mount to ensure
        // options (e.g., generated by v-for) are present in the DOM.
        if (element instanceof HTMLSelectElement) {
            return () => {
                this.#render();
            };
        }
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
        const element = this.#vNode.node as HTMLElement;
        // For select elements, re-apply value after children are updated
        // to ensure dynamically generated options are available.
        if (element instanceof HTMLSelectElement) {
            return () => {
                this.#render();
            };
        }
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
        // Remove event listener when directive is destroyed
        if (this.#listener) {
            const element = this.#vNode.node as HTMLElement;
            const eventName = this.#getEventName();
            element.removeEventListener(eventName, this.#listener);
        }
    }

    /**
     * Renders the directive by evaluating its expression and updating the DOM accordingly.
     * This method is called whenever the directive needs to update its rendering.
     */
    #render(): void {
        const element = this.#vNode.node as HTMLElement;

        // If there's no evaluator, do nothing
        if (!this.#evaluator) {
            return;
        }

        // Evaluate the expression to get the value
        const value = this.#evaluator.evaluate();

        // Update the element based on its type
        if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox') {
                this.#renderCheckbox(element, value);
            } else if (element.type === 'radio') {
                // Prefer the original typed value stored by VBindDirective (:value binding)
                // to avoid type coercion issues (e.g., boolean false vs string "false").
                const radioValue = (element as any)._value !== undefined
                    ? (element as any)._value
                    : element.value;
                element.checked = radioValue === value;
            } else {
                element.value = value ?? '';
            }
        } else if (element instanceof HTMLTextAreaElement) {
            element.value = value ?? '';
        } else if (element instanceof HTMLSelectElement) {
            element.value = value ?? '';
        }
    }

    /**
     * Attaches the event listener for two-way binding.
     */
    #attachEventListener(): void {
        const element = this.#vNode.node as HTMLElement;
        const eventName = this.#getEventName();

        this.#listener = (event: Event) => {
            const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            let newValue: any;

            // Get the new value based on element type
            if (target instanceof HTMLInputElement) {
                if (target.type === 'checkbox') {
                    newValue = this.#computeCheckboxNewValue(target);
                } else if (target.type === 'radio') {
                    // Prefer the original typed value stored by VBindDirective (:value binding)
                    // to preserve the type on write-back (e.g., boolean false, number 0).
                    newValue = (target as any)._value !== undefined
                        ? (target as any)._value
                        : target.value;
                } else {
                    newValue = target.value;
                }
            } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
                newValue = target.value;
            }

            // Apply modifiers to the value (skip for checkboxes: their value
            // is either boolean, a custom true/false value, or an array, none
            // of which should be coerced by .trim or .number).
            const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
            if (!isCheckbox) {
                newValue = this.#applyModifiers(newValue);
            }

            // Update the binding
            this.#updateBinding(newValue);
        };

        element.addEventListener(eventName, this.#listener);
    }

    /**
     * Renders a checkbox in one of three modes (Vue-compatible):
     *   1. Array binding: the bound value is an array; the checkbox is checked
     *      when its element-value is a member of that array.
     *   2. true-value/false-value binding: when `:true-value` (and optionally
     *      `:false-value`) is provided via v-bind, the checkbox is checked
     *      when the bound value strictly equals the resolved true-value.
     *   3. Boolean binding (default): the bound value is coerced to boolean.
     */
    #renderCheckbox(element: HTMLInputElement, value: any): void {
        if (Array.isArray(value)) {
            const elementValue = this.#resolveCheckboxElementValue(element);
            element.checked = value.indexOf(elementValue) !== -1;
            return;
        }

        const trueValueDescriptor = this.#resolveCheckboxTrueFalseValues(element);
        if (trueValueDescriptor) {
            element.checked = value === trueValueDescriptor.trueValue;
            return;
        }

        element.checked = !!value;
    }

    /**
     * Computes the value to write back to the bound expression when a checkbox
     * change event fires. Mirrors the three-mode logic of #renderCheckbox.
     *
     * For array binding, the current value of the bound expression is read so
     * that a fresh array can be returned (the existing array is not mutated,
     * which preserves reactivity semantics).
     */
    #computeCheckboxNewValue(target: HTMLInputElement): any {
        const currentValue = this.#evaluator?.evaluate();

        if (Array.isArray(currentValue)) {
            const elementValue = this.#resolveCheckboxElementValue(target);
            const next = currentValue.slice();
            const index = next.indexOf(elementValue);
            if (target.checked) {
                if (index === -1) {
                    next.push(elementValue);
                }
            } else {
                if (index !== -1) {
                    next.splice(index, 1);
                }
            }
            return next;
        }

        const trueValueDescriptor = this.#resolveCheckboxTrueFalseValues(target);
        if (trueValueDescriptor) {
            return target.checked ? trueValueDescriptor.trueValue : trueValueDescriptor.falseValue;
        }

        return target.checked;
    }

    /**
     * Resolves the typed element value for a checkbox. Prefers the value bound
     * via `:value` (evaluated through the sibling VBindDirective so type is
     * preserved), then the typed value previously stored on the element by
     * VBindDirective, and finally the raw string `value` attribute.
     */
    #resolveCheckboxElementValue(element: HTMLInputElement): any {
        const bindDirective = this.#vNode.directiveManager?.findBindDirective('value');
        if (bindDirective) {
            return bindDirective.evaluate();
        }
        if ((element as any)._value !== undefined) {
            return (element as any)._value;
        }
        return element.value;
    }

    /**
     * Resolves the (true-value, false-value) pair for a checkbox if either is
     * bound via `:true-value` or `:false-value`. Returns undefined when no
     * true/false value binding is present, signalling that the default boolean
     * mode should be used.
     *
     * If only one of the two is bound, the other defaults match Vue: an unbound
     * true-value defaults to literal `true`, an unbound false-value to `false`.
     */
    #resolveCheckboxTrueFalseValues(element: HTMLInputElement): { trueValue: any; falseValue: any } | undefined {
        const manager = this.#vNode.directiveManager;
        const trueBind = manager?.findBindDirective('true-value');
        const falseBind = manager?.findBindDirective('false-value');
        if (!trueBind && !falseBind) {
            return undefined;
        }
        return {
            trueValue: trueBind ? trueBind.evaluate() : true,
            falseValue: falseBind ? falseBind.evaluate() : false,
        };
    }

    /**
     * Applies modifiers to the input value.
     * @param value The value to process.
     * @returns The processed value.
     */
    #applyModifiers(value: any): any {
        // Skip modifier processing for checkbox (boolean values)
        if (typeof value === 'boolean') {
            return value;
        }

        let result = value;

        // .trim modifier: remove whitespace from both ends
        if (this.#modifiers.has('trim') && typeof result === 'string') {
            result = result.trim();
        }

        // .number modifier: convert to number
        if (this.#modifiers.has('number')) {
            // Skip conversion if the value is empty string
            if (result !== '') {
                const parsed = Number(result);
                // Only convert if it's a valid number
                if (!isNaN(parsed)) {
                    result = parsed;
                }
            }
        }

        return result;
    }

    /**
     * Gets the appropriate event name for the element type.
     */
    #getEventName(): string {
        const element = this.#vNode.node as HTMLElement;

        // .lazy modifier: use 'change' event instead of 'input'
        if (this.#modifiers.has('lazy')) {
            return 'change';
        }

        if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox' || element.type === 'radio') {
                return 'change';
            }
            return 'input';
        } else if (element instanceof HTMLSelectElement) {
            return 'change';
        }

        return 'input';
    }

    /**
     * Updates the binding value based on the expression.
     * @param newValue The new value to set.
     */
    #updateBinding(newValue: any): void {
        if (!this.#expression) {
            return;
        }

        const expression = this.#expression.trim();
        const identifiers = this.#evaluator?.dependentIdentifiers ?? [];

        // Rewrite expression to prefix identifiers with 'this.'
        const rewrittenExpr = ExpressionUtils.rewriteExpression(expression, identifiers);

        const values = [newValue];
        const args = ['$newValue'].join(", ");
        const funcBody = `(${rewrittenExpr} = $newValue);`;
        const func = new Function(args, funcBody) as (...args: any[]) => any;
        func.call(this.#vNode.bindings?.raw, ...values);
    }

}
