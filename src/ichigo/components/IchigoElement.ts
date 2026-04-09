// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from '../VApplication';
import { VApplicationOptions } from '../VApplicationOptions';
import { VDOM } from '../VDOM';

/**
 * Base class for ichigo.js-backed Web Components (Light DOM, no Shadow DOM).
 *
 * Mount timing:
 *  - If the component declares no props, the VApplication is mounted synchronously
 *    at the end of connectedCallback (the template is known, no props to wait for).
 *  - If the component declares props, the VApplication is mounted the first time
 *    _setProp() is called after connectedCallback has prepared the DOM. This
 *    guarantees that the parent framework (e.g. ichigo.js VBindDirective) has
 *    already delivered at least one prop value before data() is evaluated.
 *
 * Subclasses must set the static fields _template, _props and _buildOptions before
 * calling customElements.define(). defineComponent() handles this automatically.
 */
export class IchigoElement extends HTMLElement {
    /**
     * The mounted VApplication instance, present only while connected to the DOM.
     */
    #app?: VApplication;

    /**
     * Stores prop values received at any time (before or after mount).
     */
    #propValues: Record<string, any> = {};

    /**
     * The root element cloned from the template, ready for mounting.
     * Set by connectedCallback; cleared on disconnect.
     */
    #mountRoot?: HTMLElement;

    /**
     * Whether a mount microtask is already queued to avoid double-mounting.
     */
    #mountScheduled: boolean = false;

    connectedCallback(): void {
        // --- 0. Guard: skip if template not yet loaded ---
        // customElements.define() may run before loadComponent() completes (e.g. when
        // dynamic imports are inlined by the bundler). The static placeholder element
        // in the HTML will be removed and replaced by v-for once the template is ready,
        // so it is safe to do nothing here.
        const ctor = this.constructor as typeof IchigoElement;
        const templateEl = document.querySelector(ctor._template);
        if (!templateEl || !(templateEl instanceof HTMLTemplateElement)) {
            return;
        }

        // --- 1. Capture slot content before clearing children ---
        const defaultSlotNodes: Node[] = [];
        const namedSlotNodes: Map<string, Node[]> = new Map();

        for (const child of Array.from(this.childNodes)) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as Element;
                const slotName = el.getAttribute('slot');
                if (slotName) {
                    if (!namedSlotNodes.has(slotName)) {
                        namedSlotNodes.set(slotName, []);
                    }
                    namedSlotNodes.get(slotName)!.push(el);
                    // Remove slot attribute so ichigo.js doesn't try to bind it
                    el.removeAttribute('slot');
                } else {
                    defaultSlotNodes.push(el);
                }
            } else if (child.nodeType === Node.TEXT_NODE) {
                if ((child.textContent ?? '').trim()) {
                    defaultSlotNodes.push(child);
                }
            }
        }

        // Clear host element so we can append the cloned template
        while (this.firstChild) {
            this.removeChild(this.firstChild);
        }

        // --- 2. Clone the component template ---
        const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
        const root = this.#findRootElement(fragment);

        // --- 3. Distribute named slot content ---
        for (const [name, nodes] of namedSlotNodes) {
            const slot = root.querySelector(`slot[name="${name}"]`);
            if (slot) {
                slot.replaceWith(...nodes);
            }
        }

        // --- 4. Distribute default slot content ---
        const defaultSlot = root.querySelector('slot:not([name])');
        if (defaultSlot && defaultSlotNodes.length > 0) {
            defaultSlot.replaceWith(...defaultSlotNodes);
        }

        // Attach the populated template to the host element
        this.appendChild(root);
        this.#mountRoot = root;

        // If props were set before connectedCallback, ensure mount is scheduled
        this.#scheduleMountIfNeeded();

        // --- 5. Mount strategy ---
        // If this component has no declared props, mount immediately.
        // If it has props, mount will be triggered from _setProp() once the parent
        // delivers the first prop value (via VBindDirective / forceUpdate).
        if (ctor._props.length === 0) {
            this.#doMount();
        }
        // else: wait for _setProp() to trigger #scheduleMountIfNeeded()
    }

    disconnectedCallback(): void {
        this.#mountRoot = undefined;
        this.#mountScheduled = false;
        if (this.#app) {
            this.#app.unmount();
            this.#app = undefined;
        }
    }

    /**
     * Called by the property setters generated by defineComponent().
     * Before mount: stores the value and schedules a mount microtask.
     * After mount: pushes the value directly into the reactive bindings.
     */
    _setProp(name: string, value: any): void {
        this.#propValues[name] = value;
        if (this.#app) {
            this.#app.bindings?.set(name, value);
        } else {
            this.#scheduleMountIfNeeded();
        }
    }

    /**
     * Called by the property getters generated by defineComponent().
     */
    _getProp(name: string): any {
        return this.#propValues[name];
    }

    // --- Static fields set by defineComponent() ---

    /**
     * CSS selector for the component's <template> element (e.g. '#my-card').
     */
    static _template: string;

    /**
     * List of declared prop names. Used to decide whether to defer mounting.
     */
    static _props: string[] = [];

    /**
     * Factory that builds VApplicationOptions from the current prop values.
     * Implemented by defineComponent() as a closure that captures the user's options.
     */
    static _buildOptions: (propValues: Record<string, any>) => VApplicationOptions;

    // --- Private helpers ---

    /**
     * Schedules a mount microtask if the DOM root is ready and no mount is pending.
     * Called from _setProp() so the mount happens after the prop value is stored.
     */
    #scheduleMountIfNeeded(): void {
        if (this.#mountScheduled || this.#app || !this.#mountRoot) {
            return;
        }
        this.#mountScheduled = true;
        queueMicrotask(() => {
            this.#mountScheduled = false;
            this.#doMount();
        });
    }

    #doMount(): void {
        if (this.#app || !this.#mountRoot) {
            return;
        }
        const ctor = this.constructor as typeof IchigoElement;
        const options = ctor._buildOptions(this.#propValues);
        this.#app = VDOM.createApp(options);
        this.#app.mount(this.#mountRoot);
    }

    #findRootElement(fragment: DocumentFragment): HTMLElement {
        for (const node of Array.from(fragment.childNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                return node as HTMLElement;
            }
        }
        throw new Error(`IchigoElement: no root element found in template '${(this.constructor as typeof IchigoElement)._template}'`);
    }
}
