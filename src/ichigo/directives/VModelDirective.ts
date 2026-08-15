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
     * The argument of the directive (e.g. "size" for `v-model:size`), camelized.
     * Only meaningful on components; selects the target prop and update event
     * (prop `size` + event `update:size`). Undefined = the default `modelValue`.
     */
    #arg?: string;

    /**
     * Ensures the "v-model targets an undeclared prop" warning fires only once.
     */
    #warnedUndeclaredProp: boolean = false;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Extract the optional argument and modifiers from the directive name
        // e.g. "v-model" / "v-model.lazy.trim" / "v-model:size" / "v-model:size.number"
        const attrName = context.attribute.name;
        let rest = attrName.substring(StandardDirectiveName.V_MODEL.length);
        if (rest.startsWith(':')) {
            const dotIndex = rest.indexOf('.');
            const rawArg = dotIndex === -1 ? rest.substring(1) : rest.substring(1, dotIndex);
            if (rawArg) {
                // HTML attribute names are lowercased by the browser, so a
                // camelCase prop is addressed with kebab-case (v-model:inner-title).
                this.#arg = rawArg.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
            }
            rest = dotIndex === -1 ? '' : rest.substring(dotIndex);
        }
        if (rest.startsWith('.')) {
            rest.split('.').slice(1).forEach(mod => this.#modifiers.add(mod));
        }

        const element = context.vNode.node as HTMLElement;
        if (this.#arg && !this.#isComponentElement(element)) {
            console.warn(`[ichigo] v-model:${this.#arg} is only supported on components; the argument is ignored on <${element.tagName.toLowerCase()}>`);
            this.#arg = undefined;
        }
        if (this.#isComponentElement(element) && this.#modifiers.has('lazy')) {
            console.warn(`[ichigo] <${element.tagName.toLowerCase()}>: the .lazy modifier has no effect on components (the component decides when to emit 'update:${this.#propName}')`);
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
        if (element instanceof HTMLInputElement) {
            const manager = this.#vNode.directiveManager;

            // For checkboxes and radios, v-model's rendered state depends on
            // the element's typed `:value` binding (if present). Checkboxes
            // additionally depend on `:true-value` / `:false-value` bindings.
            if (element.type === 'checkbox' || element.type === 'radio') {
                const valueBind = manager?.findBindDirective('value');
                if (valueBind) {
                    valueBind.dependentIdentifiers.forEach(id => ids.add(id));
                }
            }

            if (element.type === 'checkbox') {
                for (const attrName of ['true-value', 'false-value']) {
                    const bindDirective = manager?.findBindDirective(attrName);
                    if (bindDirective) {
                        bindDirective.dependentIdentifiers.forEach(id => ids.add(id));
                    }
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

        // Components: deliver the value as a property (prop `modelValue`, or the
        // directive argument). For ichigo components this reaches the reactive
        // bindings through the generated prop setter.
        if (this.#isComponentElement(element)) {
            const propName = this.#resolveComponentPropName(element);
            (element as any)[propName] = value;
            return;
        }

        // Update the element based on its type
        if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox') {
                this.#renderCheckbox(element, value);
            } else if (element.type === 'radio') {
                // Prefer the typed value from a sibling :value binding when present,
                // falling back to any stored `_value` or the raw string `value`.
                const manager = this.#vNode.directiveManager;
                const bindDirective = manager?.findBindDirective('value');
                const radioValue = bindDirective !== undefined
                    ? bindDirective.evaluate()
                    : ((element as any)._value !== undefined ? (element as any)._value : element.value);
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
            // Components: the payload of the `update:<prop>` CustomEvent is the
            // new value. Only events emitted by this component itself are
            // accepted — the default $emit fires on the component's root element
            // (a direct child of the host), so an event whose target lies deeper
            // was emitted by a nested component and bubbled through.
            if (this.#isComponentElement(element)) {
                const src = event.target as Node | null;
                if (src !== element && src?.parentElement !== element) {
                    return;
                }
                this.#updateBinding(this.#applyModifiers((event as CustomEvent).detail));
                return;
            }

            const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            let newValue: any;

            // Get the new value based on element type
            if (target instanceof HTMLInputElement) {
                if (target.type === 'checkbox') {
                    newValue = this.#computeCheckboxNewValue(target);
                } else if (target.type === 'radio') {
                    // Prefer the typed value from a sibling :value binding when present,
                    // falling back to any stored `_value` or the raw string `value`.
                    const manager = this.#vNode.directiveManager;
                    const bindDirective = manager?.findBindDirective('value');
                    newValue = bindDirective !== undefined
                        ? bindDirective.evaluate()
                        : ((target as any)._value !== undefined ? (target as any)._value : target.value);
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
     * The target prop name on a component: the camelized directive argument,
     * or the `modelValue` convention when no argument is given.
     */
    get #propName(): string {
        return this.#arg ?? 'modelValue';
    }

    /**
     * Returns true when the bound element is a component (custom element).
     * The `modelValue` / `update:modelValue` contract works for any custom
     * element that follows it, not only ichigo components.
     */
    #isComponentElement(element: HTMLElement): boolean {
        return element.tagName.includes('-');
    }

    /**
     * Resolves the property name to assign on a component. For ichigo
     * components the declared prop list fixes up case-insensitive mismatches
     * (HTML-lowercased arguments vs. camelCase props) and an undeclared target
     * prop logs a one-time development warning.
     */
    #resolveComponentPropName(element: HTMLElement): string {
        const name = this.#propName;
        const props: string[] | undefined = (element.constructor as any)._props;
        if (Array.isArray(props)) {
            const lower = name.toLowerCase();
            const canonical = props.find(p => p.toLowerCase() === lower);
            if (canonical) {
                return canonical;
            }
            if (!this.#warnedUndeclaredProp) {
                this.#warnedUndeclaredProp = true;
                console.warn(`[ichigo] <${element.tagName.toLowerCase()}>: v-model targets prop '${name}', which is not declared in the component's props`);
            }
        }
        return name;
    }

    /**
     * Gets the appropriate event name for the element type.
     */
    #getEventName(): string {
        const element = this.#vNode.node as HTMLElement;

        // Components: listen for the `update:<prop>` convention event.
        if (this.#isComponentElement(element)) {
            return 'update:' + this.#propName;
        }

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
