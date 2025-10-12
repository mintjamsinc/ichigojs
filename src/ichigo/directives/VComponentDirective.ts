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
     * The component ID expression.
     */
    #expression: string;

    /**
     * Whether the component ID is static (not reactive).
     */
    #isStatic: boolean = false;

    /**
     * The component ID to render.
     */
    #componentId?: string;

    /**
     * The child application instance for the component.
     */
    #childApp?: VApplication;

    /**
     * Whether the component has been activated.
     */
    #isActivated: boolean = false;

    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;
        this.#expression = context.attribute.value;

        // Check for .static modifier
        const attrName = context.attribute.name;
        this.#isStatic = attrName.includes('.static');

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
        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return [];
            },
            applyToDOM: () => {
                if (!this.#isActivated) {
                    this.renderComponent();
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
        return () => this.cleanupComponent();
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
        this.cleanupComponent();
    }

    /**
     * Renders the component.
     */
    private renderComponent(): void {
        const element = this.#vNode.node as HTMLElement;
        if (!element) {
            return;
        }

        // For now, only support static component IDs
        const componentId = this.#expression.trim();

        if (!componentId) {
            console.warn(`Component ID is empty for v-component directive`);
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

        // Store component ID
        this.#componentId = componentId;

        // Get component definition from the application's component registry
        const vApplication = this.#vNode.vApplication;
        if (!vApplication) {
            console.error('VApplication not found on VNode');
            return;
        }

        const component = vApplication.componentRegistry.get(componentId);
        if (!component) {
            console.error(`Component '${componentId}' not found in registry`);
            return;
        }

        // Get template element
        const finalTemplateID = component.templateID;
        const templateElement = document.querySelector(`#${finalTemplateID}`);
        if (!templateElement || !(templateElement instanceof HTMLTemplateElement)) {
            console.error(`Template element '#${finalTemplateID}' not found`);
            return;
        }

        // Clone template content
        const fragment = templateElement.content.cloneNode(true) as DocumentFragment;
        const childNodes = Array.from(fragment.childNodes);

        // Find the first element node
        let componentElement: Element | undefined;
        for (const node of childNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                componentElement = node as Element;
                break;
            }
        }

        if (!componentElement) {
            console.error(`No element found in template '#${finalTemplateID}'`);
            return;
        }

        // Replace element with component element
        const parent = element.parentNode;
        if (!parent) {
            console.error(`Element has no parent node. Component '${componentId}' cannot be mounted.`);
            return;
        }

        parent.insertBefore(componentElement, element);
        parent.removeChild(element);

        // Create component instance
        const instance = component.createInstance(properties);

        // Create and mount child application using the parent application's registries
        this.#childApp = vApplication.createChildApp(instance);
        this.#childApp.mount(componentElement as HTMLElement);
        this.#isActivated = true;
    }

    /**
     * Cleans up the component.
     */
    private cleanupComponent(): void {
        if (this.#childApp) {
            // TODO: Implement unmount when available in VApplication
            // this.#childApp.unmount();
            this.#childApp = undefined;
        }
        this.#isActivated = false;
    }
}
