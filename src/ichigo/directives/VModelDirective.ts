// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";

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
     * A list of variable and function names used in the directive's expression.
     */
    #identifiers?: string[];

    /**
     * A function that evaluates the directive's expression.
     * It returns the evaluated value of the expression.
     */
    #evaluate?: () => any;

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

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#expression = expression;
            this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#evaluate = this.#createEvaluator(expression);

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
        const identifiers = this.#identifiers ?? [];
        const render = () => this.#render();

        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                render();
            }
        };
        return updater;
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
        if (!this.#evaluate) {
            return;
        }

        // Evaluate the expression to get the value
        const value = this.#evaluate();

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
            const parsed = Number(result);
            // Only convert if it's a valid number
            if (!isNaN(parsed)) {
                result = parsed;
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

        // Simple property assignment (e.g., "message")
        // For now, only support simple identifiers
        const trimmed = this.#expression.trim();
        if (trimmed && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
            this.#vNode.vApplication.bindings?.set(trimmed, newValue);
        } else {
            // For complex expressions like "user.name", we'd need more sophisticated parsing
            this.#vNode.vApplication.logManager.getLogger('VModelDirective')
                .warn(`v-model only supports simple identifiers for now: ${this.#expression}`);
        }
    }

    /**
     * Creates a function to evaluate the directive's condition.
     * @param expression The expression string to evaluate.
     * @returns A function that evaluates the directive's condition.
     */
    #createEvaluator(expression: string): () => any {
        const identifiers = this.#identifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        // Create a dynamic function with the identifiers as parameters
        const func = new Function(args, funcBody) as (...args: any[]) => any;

        // Return a function that calls the dynamic function with the current values from bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = identifiers.map(id => this.#vNode.vApplication.bindings?.get(id));

            // Call the dynamic function with the gathered values
            return func(...values);
        };
    }
}
