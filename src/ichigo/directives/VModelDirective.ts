// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../ExpressionEvaluator";

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
        const identifiers = this.#evaluator?.dependentIdentifiers ?? [];

        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM: () => {
                this.#render();
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
                element.checked = !!value;
            } else if (element.type === 'radio') {
                element.checked = element.value === String(value);
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
                    newValue = target.checked;
                } else if (target.type === 'radio') {
                    newValue = target.value;
                } else {
                    newValue = target.value;
                }
            } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
                newValue = target.value;
            }

            // Apply modifiers to the value
            newValue = this.#applyModifiers(newValue);

            // Update the binding
            this.#updateBinding(newValue);
        };

        element.addEventListener(eventName, this.#listener);
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

        const values = [newValue];
        const args = ['$newValue'].join(", ");
        const funcBody = `(this.${expression} = $newValue);`;
        const func = new Function(args, funcBody) as (...args: any[]) => any;
        func.call(this.#vNode.bindings?.raw, ...values);
    }

}
