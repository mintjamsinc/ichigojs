// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "./VDOMUpdater";

/**
 * Directive for binding dynamic attributes to DOM elements.
 * The `v-bind` directive allows you to bind HTML attributes to expressions in your data model.
 * The syntax for using the `v-bind` directive is `v-bind:attribute="expression"`, where `attribute` is the name of the HTML attribute you want to bind (e.g., `src`, `href`, `class`, etc.), and `expression` is a JavaScript expression that evaluates to the value you want to assign to that attribute.
 * Example usage:
 *     <img v-bind:src="imageSrc" />
 * The value of `imageSrc` should be defined in the component's data object.
 * When the value of `imageSrc` changes, the `src` attribute of the `<img>` element will automatically update to reflect the new value.
 * This directive is particularly useful for dynamically updating attributes based on user interactions or other data changes in your application.
 * It helps keep the DOM in sync with the underlying data model, making it easier to build reactive user interfaces.
 * The `v-bind` directive can also be used with shorthand syntax using a colon (:).
 * For example, `:src="imageSrc"` is equivalent to `v-bind:src="imageSrc"`.
 * This shorthand syntax is often used for brevity and improved readability in templates.
 * Overall, the `v-bind` directive is a powerful tool for creating dynamic and responsive web applications by allowing seamless integration between the data model and the DOM.
 */
export class VBindDirective implements VDirective {
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
     * The name of the attribute to bind (e.g., "src", "class", "style").
     */
    #attributeName?: string;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Extract the attribute name from the directive
        // e.g., "v-bind:src" -> "src", ":href" -> "href"
        const attrName = context.attribute.name;
        if (attrName.startsWith('v-bind:')) {
            this.#attributeName = attrName.substring(7);
        } else if (attrName.startsWith(':')) {
            this.#attributeName = attrName.substring(1);
        }

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#evaluate = this.#createEvaluator(expression);
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_BIND;
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
    get bindingsPreparer(): undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get domUpdater(): VDOMUpdater | undefined {
        const identifiers = this.#identifiers ?? [];
        const render = () => this.#render();

        // Create an updater that handles the attribute binding
        const updater: VDOMUpdater = {
            get identifiers(): string[] {
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
        // Do nothing. No special cleanup needed.
    }

    /**
     * Renders the bound attribute by evaluating the expression and updating the DOM element.
     */
    #render(): void {
        const element = this.#vNode.node as HTMLElement;
        const attributeName = this.#attributeName;

        // If there's no evaluator or attribute name, do nothing
        if (!this.#evaluate || !attributeName) {
            return;
        }

        // Evaluate the expression to get the value
        const value = this.#evaluate();

        // If the value is undefined, remove the attribute
        if (value === undefined) {
            element.removeAttribute(attributeName);
            return;
        }

        // Handle different attribute types
        if (attributeName === 'class') {
            this.#updateClass(element, value);
        } else if (attributeName === 'style') {
            this.#updateStyle(element, value);
        } else if (this.#isDOMProperty(attributeName)) {
            this.#updateProperty(element, attributeName, value);
        } else if (this.#isBooleanAttribute(attributeName)) {
            this.#updateBooleanAttribute(element, attributeName, value);
        } else {
            this.#updateAttribute(element, attributeName, value);
        }
    }

    /**
     * Updates the class attribute with support for string, array, and object formats.
     */
    #updateClass(element: HTMLElement, value: any): void {
        // Clear existing classes
        element.className = '';

        if (typeof value === 'string') {
            element.className = value;
        } else if (Array.isArray(value)) {
            element.className = value.filter(Boolean).join(' ');
        } else if (typeof value === 'object' && value !== null) {
            const classes = Object.keys(value).filter(key => value[key]);
            element.className = classes.join(' ');
        }
    }

    /**
     * Updates the style attribute with support for object format.
     */
    #updateStyle(element: HTMLElement, value: any): void {
        if (typeof value === 'string') {
            element.style.cssText = value;
        } else if (typeof value === 'object' && value !== null) {
            // Clear existing inline styles
            element.style.cssText = '';

            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const cssKey = this.#camelToKebab(key);
                    const cssValue = value[key];
                    if (cssValue != null) {
                        element.style.setProperty(cssKey, String(cssValue));
                    }
                }
            }
        }
    }

    /**
     * Converts camelCase to kebab-case for CSS properties.
     */
    #camelToKebab(str: string): string {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    /**
     * Checks if the attribute should be set as a DOM property.
     */
    #isDOMProperty(name: string): boolean {
        const domProperties = ['value', 'checked', 'selected', 'innerHTML', 'textContent'];
        return domProperties.includes(name);
    }

    /**
     * Checks if the attribute is a boolean attribute.
     */
    #isBooleanAttribute(name: string): boolean {
        const booleanAttributes = [
            'disabled', 'readonly', 'required', 'checked', 'selected',
            'multiple', 'autofocus', 'autoplay', 'controls', 'loop',
            'muted', 'open', 'hidden'
        ];
        return booleanAttributes.includes(name);
    }

    /**
     * Updates a DOM property.
     */
    #updateProperty(element: HTMLElement, name: string, value: any): void {
        (element as any)[name] = value;
    }

    /**
     * Updates a boolean attribute.
     */
    #updateBooleanAttribute(element: HTMLElement, name: string, value: any): void {
        if (value) {
            element.setAttribute(name, '');
        } else {
            element.removeAttribute(name);
        }
    }

    /**
     * Updates a regular attribute.
     */
    #updateAttribute(element: HTMLElement, name: string, value: any): void {
        if (value == null || value === false) {
            element.removeAttribute(name);
        } else {
            element.setAttribute(name, String(value));
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

        // Return a function that calls the dynamic function with the current values from the virtual node's bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = identifiers.map(id => this.#vNode.bindings?.get(id));

            // Call the dynamic function with the gathered values and return the result as a boolean
            return func(...values);
        };
    }
}
