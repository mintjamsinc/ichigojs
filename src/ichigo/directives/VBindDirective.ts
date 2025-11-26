// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../ExpressionEvaluator";

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
     * The expression evaluator for this directive.
     */
    #evaluator?: ExpressionEvaluator;

    /**
     * The name of the attribute to bind (e.g., "src", "class", "style").
     */
    #attributeName?: string;

    /**
     * The original expression string from the directive.
     */
    #expression?: string;

    /**
     * The set of class names managed by this directive (used when binding to the "class" attribute).
     * This helps in tracking which classes were added by this directive to avoid conflicts with other class manipulations.
     */
    #managedClasses: Set<string> = new Set();

    /**
     * The set of style properties managed by this directive (used when binding to the "style" attribute).
     * This helps in tracking which styles were added by this directive to avoid conflicts with other style manipulations.
     */
    #managedStyles: Set<string> = new Set();

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

        // Parse the expression and create the evaluator
        this.#expression = context.attribute.value;
        if (this.#expression && context.vNode.bindings) {
            this.#evaluator = ExpressionEvaluator.create(
                this.#expression,
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
    get bindingsPreparer(): VBindingsPreparer | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get domUpdater(): VDOMUpdater | undefined {
        const identifiers = this.#evaluator?.dependentIdentifiers ?? [];

        // Create an updater that handles the attribute binding
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
     * Indicates if this directive is binding the "key" attribute.
     * The "key" attribute is special and is used for optimizing rendering of lists.
     * If this directive is binding the "key" attribute, it will be handled by the VForDirective.
     */
    get isKey(): boolean {
        return (this.#attributeName === 'key');
    }

    /**
     * Indicates if this directive is binding the "options" attribute or any of its sub-properties (e.g., "options.intersection").
     * The "options" attribute is special and is used for passing options to certain directives like VIntersectionDirective.
     */
    get isOptions(): boolean {
        return (this.#attributeName === 'options' || this.#attributeName?.startsWith('options.') === true);
    }

    /**
     * Gets the name of the attribute being bound (e.g., "src", "class", "options", "options.intersection").
     */
    get attributeName(): string | undefined {
        return this.#attributeName;
    }

    /**
     * Gets the original expression string from the directive.
     */
    get expression(): string | undefined {
        return this.#expression;
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
        // Do nothing. No special cleanup needed.
    }

    /**
     * Renders the bound attribute by evaluating the expression and updating the DOM element.
     */
    #render(): void {
        // Do nothing for special attributes
        if (this.isKey || this.isOptions) {
            return;
        }

        const element = this.#vNode.node as HTMLElement;
        const attributeName = this.#attributeName;

        // If there's no evaluator or attribute name, do nothing
        if (!this.#evaluator || !attributeName) {
            return;
        }

        // Evaluate the expression to get the value
        const value = this.#evaluator.evaluate();

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
        // Determine the new set of classes to apply
        let newClasses: string[] = [];
        if (typeof value === 'string') {
            newClasses = value.split(/\s+/).filter(Boolean);
        } else if (Array.isArray(value)) {
            // Flatten array elements that may contain space-separated class names
            newClasses = value
                .filter(Boolean)
                .flatMap(cls => typeof cls === 'string' ? cls.split(/\s+/).filter(Boolean) : []);
        } else if (typeof value === 'object' && value !== null) {
            newClasses = Object.keys(value).filter(key => value[key]);
        }

        // Remove previously managed classes
        this.#managedClasses.forEach(cls => element.classList.remove(cls));

        // Add newly managed classes
        newClasses.forEach(cls => element.classList.add(cls));

        // Update managed classes list
        this.#managedClasses = new Set(newClasses);
    }

    /**
     * Updates the style attribute with support for object format.
     */
    #updateStyle(element: HTMLElement, value: any): void {
        let newStyles: string[] = [];

        if (typeof value === 'string') {
            // Directly set the style string
            element.style.cssText = value;
            // Extract managed properties
            newStyles = value.split(';').map(s => s.split(':')[0].trim()).filter(Boolean);
        } else if (typeof value === 'object' && value !== null) {
            // Remove all previously managed properties
            this.#managedStyles.forEach(prop => {
                element.style.removeProperty(this.#camelToKebab(prop));
            });

            // Add newly managed properties
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const cssKey = this.#camelToKebab(key);
                    const cssValue = value[key];
                    if (cssValue != null) {
                        element.style.setProperty(cssKey, String(cssValue));
                        newStyles.push(key);
                    }
                }
            }
        }

        // Update managed properties list
        this.#managedStyles = new Set(newStyles);
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

}
