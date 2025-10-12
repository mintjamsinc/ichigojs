// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VDirective } from './VDirective';
import { VNode } from '../VNode';
import { VApplication } from '../VApplication';
import { StandardDirectiveName } from './StandardDirectiveName';
import { VDirectiveParseContext } from './VDirectiveParseContext';
import { VBindingsPreparer } from '../VBindingsPreparer';
import { VDOMUpdater } from '../VDOMUpdater';

/**
 * Directive for rendering components.
 * Usage: <div v-component="componentId" :options="props"></div>
 *
 * The :options binding is used to pass properties to the component.
 * Example:
 *   <div v-component="my-component" :options="{message: 'Hello'}"></div>
 */
export class VComponentDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * The component ID to render.
     */
    #componentId: string;

    /**
     * The application instance for the component.
     */
    #componentApp?: VApplication;

    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;
        this.#componentId = context.attribute.value.trim();

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_COMPONENT;
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
        return true;
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
        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return [];
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
        return true;
    }

    /**
     * @inheritdoc
     */
    get dependentIdentifiers(): string[] {
        return [];
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
     * Clones the component's template and returns the root element.
     * @returns The cloned root HTMLElement of the component.
     * @throws Error if the component or its template is not found.
     */
    cloneNode(): HTMLElement {
        // Get component definition from the application's component registry
        const component = this.#vNode.vApplication.componentRegistry.get(this.#componentId);
        if (!component) {
            throw new Error(`Component '${this.#componentId}' not found in registry`);
        }

        // Get template element
        const finalTemplateID = component.templateID || component.id;
        const templateElement = document.querySelector(`#${finalTemplateID}`);
        if (!templateElement || !(templateElement instanceof HTMLTemplateElement)) {
            throw new Error(`Template element '#${finalTemplateID}' not found`);
        }

        // Clone template content
        const fragment = templateElement.content.cloneNode(true) as DocumentFragment;
        const childNodes = Array.from(fragment.childNodes);

        // Find the first element node
        for (const node of childNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                return node as HTMLElement;
            }
        }

        throw new Error(`No element found in template '#${finalTemplateID}'`);
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        if (!this.#componentApp) {
            // Not rendered, no action needed
            return;
        }

        // Destroy component application first (calls @unmount hooks while DOM is still accessible)
        this.#componentApp.unmount();

        // Then remove from DOM
        const componentVNode = this.#componentApp.rootVNode;
        if (componentVNode?.node.parentNode) {
            componentVNode.node.parentNode.removeChild(componentVNode.node);
        }
        this.#componentApp = undefined;
    }

    /**
     * Renders the component.
     */
    #render(): void {
        if (this.#componentApp) {
            // Already rendered, no action needed
            return;
        }

        // Get properties from :options or :options.component directive
        let properties: any = {};
        const optionsDirective = this.#vNode.directiveManager?.optionsDirective('component');
        if (optionsDirective && optionsDirective.expression) {
            // Evaluate the options expression
            const identifiers = optionsDirective.dependentIdentifiers;
            const values = identifiers.map(id => this.#vNode.bindings?.get(id));
            const args = identifiers.join(", ");
            const funcBody = `return (${optionsDirective.expression});`;
            const func = new Function(args, funcBody) as (...args: any[]) => any;
            const result = func(...values);

            if (typeof result === 'object' && result !== null) {
                properties = result;
            }
        }

        // Get component definition from the application's component registry
        const component = this.#vNode.vApplication.componentRegistry.get(this.#componentId);
        if (!component) {
            throw new Error(`Component '${this.#componentId}' not found in registry`);
        }

        // Create component instance
        const instance = component.createInstance(properties);

        // Create and mount child application using the parent application's registries
        this.#componentApp = this.#vNode.vApplication.createChildApp(instance);
        this.#componentApp.mount(this.#vNode.node as HTMLElement);
    }
}
