// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from '../VApplication';
import { VApplicationOptions } from '../VApplicationOptions';
import { VDOM } from '../VDOM';
import { PropOptions } from './IchigoComponentOptions';
import type { VNode } from '../VNode';

/**
 * A scoped slot template captured from the host element's children:
 * the `<template v-slot:name="scopeVar">` element and the scope variable name
 * its content receives the slot props under (may be empty when no variable
 * was declared).
 */
export interface ScopedSlotEntry {
    template: HTMLTemplateElement;
    scopeVar: string;
}

/**
 * Base class for ichigo.js-backed Web Components (Light DOM, no Shadow DOM).
 *
 * Expansion — cloning the template into this element — is driven by the
 * application that owns the element, not by connectedCallback: VNode compiles
 * the element first (installing the host context, delivering the prop values
 * and compiling the authored slot content in the owner's scope) and only then
 * calls {@link _ichigoExpand}. That leaves connectedCallback a single job,
 * re-attachment; see there.
 *
 * The component's <template> must be present in the document, and
 * defineComponent() must have run, before the owning application is mounted.
 * That is the application's responsibility. A missing template is reported as
 * a warning and the element is left empty — it is never silently retried,
 * because an app that renders anyway is an app whose bug cannot be found.
 *
 * Mount timing:
 *  - If the component declares no props, the VApplication is mounted synchronously
 *    at the end of connectedCallback (the template is known, no props to wait for).
 *  - If the component declares props, a mount microtask is scheduled at the end of
 *    connectedCallback. Prop values delivered synchronously by the parent framework
 *    (VBindDirective runs within the parent's mount task) are stored before the
 *    microtask fires, so data() can read them. A component used without any prop
 *    binding still mounts — with its declared defaults — instead of waiting forever.
 *
 * Slot content is captured on the first connection and cached, so a component
 * that is moved in the DOM (e.g. reordered by v-for) re-expands its template
 * and redistributes the same slot nodes on reconnection.
 *
 * Subclasses must set the static fields _template, _props, _propOptions and
 * _buildOptions before calling customElements.define(). defineComponent()
 * handles this automatically.
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

    /**
     * Slot content captured on the first connection. Reused on reconnection
     * (v-for reorder moves the host element, which re-runs connectedCallback
     * with the previously expanded template as children — not authored slot
     * content — so the original capture must be redistributed instead).
     * `scopedSlots` holds `<template v-slot:...>` children by slot name; they
     * are rendered per outlet by VSlotOutletDirective, not distributed here.
     */
    #slotCache?: {
        defaultNodes: Node[];
        namedNodes: Map<string, Node[]>;
        scopedSlots: Map<string, ScopedSlotEntry>;
    };

    /**
     * True once this element's children are the expanded component template.
     * Read by VNode during compilation: a parent application must not compile
     * an expanded component's internals as its own template (the internals
     * belong to this component's VApplication and scope).
     */
    _ichigoExpanded: boolean = false;

    /**
     * Host context installed by the parent application's VNode when it
     * compiles this element. Gives component-boundary features (e.g. scoped
     * slot outlets) access to the parent scope. Undefined when the element is
     * placed outside any ichigo application.
     *
     * Declared with `declare` on purpose: the application installs it BEFORE
     * the element is upgraded whenever the element comes from a `<template>`
     * (v-if / v-for on a `<template>` clones `content`, whose owner document
     * has no browsing context, so custom elements there stay uncustomized
     * until the clone is inserted). A real class field would be re-defined as
     * undefined by the upgrade — erasing the host context and leaving scoped
     * slot outlets without a parent scope.
     */
    declare _ichigoHost?: { vNode: VNode };

    /**
     * The scoped slot templates captured from this element's children, keyed
     * by slot name ('default' for `v-slot` without a name). Read by
     * VSlotOutletDirective when the component template renders a `<slot>`.
     */
    get _ichigoScopedSlots(): Map<string, ScopedSlotEntry> | undefined {
        return this.#slotCache?.scopedSlots;
    }

    /**
     * Handles RE-attachment, and nothing else.
     *
     * A first connection is not what expands this element: the owning
     * application does that from {@link _ichigoExpand} once it has compiled the
     * element. So a connection event on a not-yet-expanded element means the
     * owner has not reached it yet, and the right thing to do is nothing. That
     * covers every case the old guards enumerated one by one — a v-if / v-for
     * template source, an element inside an enclosing component's template
     * clone, a clone inserted before its directive expands it.
     *
     * An expanded element whose mount root has been torn down, on the other
     * hand, was disconnected and is now coming back: v-for reorders relocate
     * the host element, which disconnects and reconnects it. Its children are
     * the previous expansion, not authored slot content, so it re-expands from
     * the cached slot nodes. Testing the mount root rather than the expansion
     * flag alone keeps this from firing on an element that was expanded while
     * detached and is being inserted for the first time.
     */
    connectedCallback(): void {
        if (this._ichigoExpanded && !this.#mountRoot) {
            this._ichigoExpand();
        }
    }

    /**
     * Expands this element's template. Called by the application that owns the
     * element, right after it compiled it (VNode.expandComponents): the host
     * context is installed, the prop bindings have delivered their values and
     * the authored slot content has been compiled in the owner's scope, so the
     * capture below sees owner-compiled nodes and the component's own
     * application starts with its props already in hand.
     *
     * Also called by {@link connectedCallback} to rebuild the expansion after a
     * move.
     */
    _ichigoExpand(): void {
        // --- 0b. Reclaim prop values assigned before upgrade ---
        // A plain property set on the instance (e.g. by a binding delivered
        // while the element was detached or not yet upgraded) is an own data
        // property that shadows the prototype accessor generated by
        // defineComponent — later assignments would keep writing to it and
        // never reach _setProp. Delete the own property and replay the value
        // through the accessor.
        const ctor = this.constructor as typeof IchigoElement;
        for (const prop of ctor._props) {
            if (Object.prototype.hasOwnProperty.call(this, prop)) {
                const value = (this as any)[prop];
                delete (this as any)[prop];
                (this as any)[prop] = value;
            }
        }

        // --- 0c. Resolve the template ---
        // Having the <template> in the document by now is the application's
        // contract (see the class doc). Report the breach and leave the element
        // empty: rendering something plausible here would hide the bug at the
        // one moment it is still cheap to find.
        const templateEl = document.querySelector(ctor._template);
        if (!templateEl || !(templateEl instanceof HTMLTemplateElement)) {
            IchigoElement.#warnOncePerTag(this.tagName,
                `template '${ctor._template}' was not found in the document. `
                + 'Inject the <template> and call defineComponent() before mounting the application.');
            return;
        }

        // --- 1. Capture slot content (first connection only) ---
        if (!this.#slotCache) {
            const defaultNodes: Node[] = [];
            const namedNodes: Map<string, Node[]> = new Map();
            const scopedSlots: Map<string, ScopedSlotEntry> = new Map();

            for (const child of Array.from(this.childNodes)) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child as Element;

                    // <template v-slot:name="scopeVar"> — a scoped slot template.
                    // Captured for per-outlet rendering (VSlotOutletDirective),
                    // not distributed statically.
                    if (el instanceof HTMLTemplateElement) {
                        const scoped = this.#parseVSlotAttribute(el);
                        if (scoped) {
                            scopedSlots.set(scoped.name, { template: el, scopeVar: scoped.scopeVar });
                            continue;
                        }
                    }

                    const slotName = el.getAttribute('slot');
                    if (slotName) {
                        if (!namedNodes.has(slotName)) {
                            namedNodes.set(slotName, []);
                        }
                        namedNodes.get(slotName)!.push(el);
                        // Remove slot attribute so ichigo.js doesn't try to bind it
                        el.removeAttribute('slot');
                    } else {
                        defaultNodes.push(el);
                    }
                } else if (child.nodeType === Node.TEXT_NODE) {
                    if ((child.textContent ?? '').trim()) {
                        defaultNodes.push(child);
                    }
                }
            }

            this.#slotCache = { defaultNodes, namedNodes, scopedSlots };
        }
        const { defaultNodes, namedNodes } = this.#slotCache;

        // Clear host element so we can append the cloned template.
        // (On reconnection this discards the previous expansion; the cached slot
        // nodes are still referenced and are moved into the fresh clone below.)
        while (this.firstChild) {
            this.removeChild(this.firstChild);
        }

        // --- 2. Clone the component template ---
        const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
        const root = this.#findRootElement(fragment);

        // --- 3. Distribute named slot content ---
        for (const [name, nodes] of namedNodes) {
            const slot = root.querySelector(`slot[name="${name}"]`);
            if (slot) {
                slot.replaceWith(...nodes);
            }
        }

        // --- 4. Distribute default slot content ---
        const defaultSlot = root.querySelector('slot:not([name])');
        if (defaultSlot && defaultNodes.length > 0) {
            defaultSlot.replaceWith(...defaultNodes);
        }

        // Attach the populated template to the host element
        this.appendChild(root);
        this.#mountRoot = root;
        this._ichigoExpanded = true;

        // --- 5. Mount strategy ---
        // No declared props: mount immediately (nothing to wait for).
        // Declared props: schedule a mount microtask unconditionally. Prop values
        // pushed synchronously by the parent (VBindDirective) land before the
        // microtask runs; a component used without any binding still mounts,
        // with its declared defaults.
        if (ctor._props.length === 0) {
            this.#doMount();
        } else {
            this.#scheduleMountIfNeeded();
        }
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
     * An undefined value is replaced by the prop's declared default, if any.
     */
    _setProp(name: string, value: any): void {
        const ctor = this.constructor as typeof IchigoElement;
        const opts = ctor._propOptions[name];
        if (opts) {
            if (value === undefined) {
                value = IchigoElement.#resolveDefault(opts);
            }
            this.#validateProp(name, value, opts);
        }

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
     * List of declared prop names. Used to decide whether to defer mounting,
     * and by VBindDirective to resolve kebab-case attributes to prop names.
     */
    static _props: string[] = [];

    /**
     * Per-prop declaration options (type / default / required / validator),
     * keyed by prop name. Normalized by defineComponent(): a prop declared
     * without options gets an empty object.
     */
    static _propOptions: Record<string, PropOptions> = {};

    /**
     * Factory that builds VApplicationOptions from the current prop values.
     * Implemented by defineComponent() as a closure that captures the user's options.
     */
    static _buildOptions: (propValues: Record<string, any>) => VApplicationOptions;

    // --- Private helpers ---

    /**
     * Schedules a mount microtask if the DOM root is ready and no mount is pending.
     * Called from connectedCallback and _setProp() so the mount happens after
     * synchronously delivered prop values are stored.
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

        // Attribute fallback: a prop that never received a property value may
        // have been provided as a plain HTML attribute — static usage like
        // <my-badge label="x">, or a binding delivered by setAttribute before
        // the element was upgraded. Attribute values are strings; a declared
        // Boolean type turns presence ("") into true, and a declared Number
        // type parses numeric strings.
        for (const name of ctor._props) {
            if (this.#propValues[name] !== undefined) {
                continue;
            }
            const attr = this.getAttribute(IchigoElement.#camelToKebab(name)) ?? this.getAttribute(name.toLowerCase());
            if (attr === null) {
                continue;
            }
            const opts = ctor._propOptions[name];
            let value: any = attr;
            if (opts && IchigoElement.#typeIncludes(opts.type, Boolean) && attr === '') {
                value = true;
            } else if (opts && IchigoElement.#typeIncludes(opts.type, Number) && attr !== '' && !Number.isNaN(Number(attr))) {
                value = Number(attr);
            }
            if (opts) {
                this.#validateProp(name, value, opts);
            }
            this.#propValues[name] = value;
        }

        // Resolve defaults for props that never received a value, and report
        // missing required props (warning only; the mount proceeds either way).
        for (const [name, opts] of Object.entries(ctor._propOptions)) {
            if (this.#propValues[name] === undefined) {
                const resolved = IchigoElement.#resolveDefault(opts);
                if (resolved !== undefined) {
                    this.#propValues[name] = resolved;
                } else if (opts.required) {
                    this.#warn(`required prop '${name}' is missing`);
                }
            }
        }

        const options = ctor._buildOptions(this.#propValues);
        this.#app = VDOM.createApp(options);
        // Give the application a handle back to this host element so
        // component-boundary features (e.g. scoped slot outlets) can reach the
        // captured slot templates and the parent application scope.
        this.#app.hostElement = this;
        this.#app.mount(this.#mountRoot);
    }

    /**
     * Parses a `v-slot` declaration on a `<template>` child, accepting
     * `v-slot` / `v-slot:name` and the `#name` shorthand. Returns the slot
     * name ('default' when omitted) and the scope variable name, or undefined
     * when the template carries no v-slot attribute. The scope variable must
     * be a single identifier; an invalid one is ignored with a warning.
     */
    #parseVSlotAttribute(template: HTMLTemplateElement): { name: string; scopeVar: string } | undefined {
        for (const attr of Array.from(template.attributes)) {
            let name: string | undefined;
            if (attr.name === 'v-slot') {
                name = 'default';
            } else if (attr.name.startsWith('v-slot:')) {
                name = attr.name.substring(7);
            } else if (attr.name.startsWith('#')) {
                name = attr.name.substring(1);
            }
            if (name === undefined || name === '') {
                continue;
            }

            let scopeVar = attr.value.trim();
            if (scopeVar && !/^[A-Za-z_$][\w$]*$/.test(scopeVar)) {
                this.#warn(`v-slot scope must be a single identifier; '${scopeVar}' is ignored (destructuring is not supported)`);
                scopeVar = '';
            }
            return { name, scopeVar };
        }
        return undefined;
    }

    #findRootElement(fragment: DocumentFragment): HTMLElement {
        for (const node of Array.from(fragment.childNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                return node as HTMLElement;
            }
        }
        throw new Error(`IchigoElement: no root element found in template '${(this.constructor as typeof IchigoElement)._template}'`);
    }

    /**
     * Resolves a prop's default value. A function default is called as a
     * factory unless the declared type includes Function, in which case the
     * function itself is the value.
     */
    static #resolveDefault(opts: PropOptions): any {
        const def = opts.default;
        if (def === undefined) {
            return undefined;
        }
        if (typeof def === 'function' && !IchigoElement.#typeIncludes(opts.type, Function)) {
            return def();
        }
        return def;
    }

    static #typeIncludes(type: Function | Function[] | undefined, ctor: Function): boolean {
        if (!type) {
            return false;
        }
        return Array.isArray(type) ? type.includes(ctor) : type === ctor;
    }

    static #camelToKebab(str: string): string {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    /**
     * Validates a delivered prop value against its declaration.
     * Warnings only — the value is stored and delivered regardless.
     * null/undefined values skip both checks (undefined is handled by
     * default/required; null is an explicit "no value").
     */
    #validateProp(name: string, value: any, opts: PropOptions): void {
        if (value === null || value === undefined) {
            return;
        }

        if (opts.type) {
            const types = Array.isArray(opts.type) ? opts.type : [opts.type];
            if (!types.some(t => IchigoElement.#matchesType(value, t))) {
                const expected = types.map(t => (t as { name?: string }).name ?? String(t)).join(' | ');
                const actual = typeof value === 'object'
                    ? (value?.constructor?.name ?? 'object')
                    : typeof value;
                this.#warn(`prop '${name}' expects ${expected}, got ${actual}`);
            }
        }

        if (opts.validator && !opts.validator(value)) {
            this.#warn(`prop '${name}' failed its validator`);
        }
    }

    static #matchesType(value: any, type: Function): boolean {
        switch (type) {
            case String: return typeof value === 'string';
            case Number: return typeof value === 'number';
            case Boolean: return typeof value === 'boolean';
            case Function: return typeof value === 'function';
            case Array: return Array.isArray(value);
            case Object: return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                try {
                    return value instanceof (type as any);
                } catch {
                    return false;
                }
        }
    }

    #warn(message: string): void {
        console.warn(`[ichigo] <${this.tagName.toLowerCase()}>: ${message}`);
    }

    /**
     * Tags already reported by {@link #warnOncePerTag}.
     */
    static #warnedTags: Set<string> = new Set();

    /**
     * Reports a per-component-type problem once. A missing template breaks
     * every instance, and a v-for over a hundred rows would otherwise print a
     * hundred identical lines and bury the first one.
     */
    static #warnOncePerTag(tagName: string, message: string): void {
        const tag = tagName.toLowerCase();
        if (IchigoElement.#warnedTags.has(tag)) {
            return;
        }
        IchigoElement.#warnedTags.add(tag);
        console.warn(`[ichigo] <${tag}>: ${message}`);
    }
}
