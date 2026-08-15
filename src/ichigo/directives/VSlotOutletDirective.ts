// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import type { VNode } from "../VNode";
import { VBindings } from "../VBindings";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDOMUpdater } from "../VDOMUpdater";
import { ExpressionEvaluator } from "../util/ExpressionEvaluator";
import type { IchigoElement, ScopedSlotEntry } from "../components/IchigoElement";

/**
 * Renders a scoped slot outlet: a `<slot>` element inside a component template
 * whose host element received a matching `<template v-slot:name="scope">` from
 * the parent.
 *
 * The slot content is compiled in the PARENT application's scope (the scope in
 * which the template was authored), extended with the slot props — the values
 * bound on the `<slot>` outlet with `v-bind` / `:` — exposed under the single
 * scope variable declared in `v-slot` (e.g. `v-slot:item="row"` makes
 * `row.node`, `row.index`, ... available):
 *
 * ```html
 * <!-- component template -->
 * <li v-for="(node, i) of items">
 *   <slot name="item" :node="node" :index="i">fallback</slot>
 * </li>
 *
 * <!-- usage -->
 * <my-tree :items="nodes">
 *   <template v-slot:item="row">{{ row.node.label }} ({{ appTitle }})</template>
 * </my-tree>
 * ```
 *
 * This directive is created only when a scoped template for the slot's name
 * exists (see {@link VSlotOutletDirective.tryCreate}); otherwise `<slot>`
 * elements keep their existing behavior (static distribution at expansion,
 * or fallback content compiled in the component scope).
 *
 * Rendering happens synchronously in onMount — before the component
 * application would compile the slot's fallback children — by replacing the
 * `<slot>` element with a clone of the scoped template's content. The content
 * VNode is attached under the host element's VNode in the parent application,
 * so parent-side data changes flow through the normal update cycle; slot-prop
 * changes on the component side are pushed by this directive's domUpdater.
 */
export class VSlotOutletDirective implements VDirective {
    /**
     * The virtual node of the `<slot>` element (in the component application).
     */
    #vNode: VNode;

    /**
     * The captured scoped template and its scope variable name.
     */
    #entry: ScopedSlotEntry;

    /**
     * The host element's VNode in the parent application. Slot content is
     * compiled against this node's application and bindings.
     */
    #hostVNode: VNode;

    /**
     * The slot props: camelized names and evaluators for the `v-bind` / `:`
     * attributes found on the `<slot>` outlet (evaluated in component scope).
     */
    #props: { name: string; evaluator?: ExpressionEvaluator }[] = [];

    /**
     * The bindings for the slot content: a child scope of the parent
     * application's bindings holding the scope variable.
     */
    #scopeBindings?: VBindings;

    /**
     * The VNode tree of the rendered slot content (owned by the parent application).
     */
    #contentVNode?: VNode;

    /**
     * Guards against double destruction (the content VNode is reachable from
     * both the parent application's tree and this directive).
     */
    #destroyed: boolean = false;

    /**
     * Tracks host elements that already logged the "no host context" warning.
     */
    static #warnedNoHost: WeakSet<HTMLElement> = new WeakSet();

    /**
     * Creates a slot outlet directive for the given `<slot>` VNode when a
     * scoped template for its slot name was captured on the host element.
     * Returns undefined when there is nothing to do (no component host, no
     * scoped template for this name) so the `<slot>` element keeps its
     * existing behavior.
     */
    static tryCreate(vNode: VNode): VSlotOutletDirective | undefined {
        const host = vNode.vApplication.hostElement as IchigoElement | undefined;
        if (!host) {
            return undefined;
        }

        const scopedSlots = host._ichigoScopedSlots;
        if (!scopedSlots || scopedSlots.size === 0) {
            return undefined;
        }

        const element = vNode.node as HTMLElement;
        const slotName = element.getAttribute('name') || 'default';
        const entry = scopedSlots.get(slotName);
        if (!entry) {
            return undefined;
        }

        const hostVNode = host._ichigoHost?.vNode;
        if (!hostVNode) {
            // The scoped template cannot be rendered without the parent scope.
            // Leave the <slot> alone (fallback content renders in component scope).
            if (!VSlotOutletDirective.#warnedNoHost.has(host)) {
                VSlotOutletDirective.#warnedNoHost.add(host);
                console.warn(`[ichigo] <${host.tagName.toLowerCase()}>: a scoped slot template for '${slotName}' was provided, but the component has no parent application scope to render it in. The fallback content is used instead.`);
            }
            return undefined;
        }

        return new VSlotOutletDirective(vNode, entry, hostVNode);
    }

    private constructor(vNode: VNode, entry: ScopedSlotEntry, hostVNode: VNode) {
        this.#vNode = vNode;
        this.#entry = entry;
        this.#hostVNode = hostVNode;

        // Collect and consume the slot-prop bindings (v-bind / :) so the
        // generic attribute parsing does not also process them.
        const element = vNode.node as HTMLElement;
        for (const attr of Array.from(element.attributes)) {
            let propName: string | undefined;
            if (attr.name.startsWith('v-bind:')) {
                propName = attr.name.substring(7);
            } else if (attr.name.startsWith(':')) {
                propName = attr.name.substring(1);
            }
            if (!propName) {
                continue;
            }

            const evaluator = attr.value && vNode.bindings
                ? ExpressionEvaluator.create(attr.value, vNode.bindings, vNode.vApplication.functionDependencies)
                : undefined;
            this.#props.push({ name: this.#kebabToCamel(propName), evaluator });
            element.removeAttribute(attr.name);
        }
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return 'slot-outlet';
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
        const identifiers = this.dependentIdentifiers;
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM: () => {
                this.#refresh();
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
        const ids = new Set<string>();
        for (const prop of this.#props) {
            prop.evaluator?.dependentIdentifiers.forEach(id => ids.add(id));
        }
        return Array.from(ids);
    }

    /**
     * @inheritdoc
     *
     * The initial render happens here — synchronously during VNode
     * construction, after the directives are created and BEFORE the component
     * application compiles the slot element's children. This guarantees the
     * outlet renders exactly once regardless of whether its slot props have
     * reactive identifiers, and removes the fallback children before they
     * could be compiled in the component scope.
     */
    get onMount(): (() => void) | undefined {
        return () => {
            this.#render();
        };
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
        if (this.#destroyed) {
            return;
        }
        this.#destroyed = true;

        // Destroy the content VNode so its dependency registrations on the
        // host VNode are released (critical for v-for rows that come and go).
        // The content DOM nodes live inside the component's subtree and are
        // removed together with it.
        this.#contentVNode?.destroy();
        this.#contentVNode = undefined;
        this.#scopeBindings = undefined;
    }

    /**
     * Renders the scoped slot content in place of the `<slot>` element.
     */
    #render(): void {
        const slot = this.#vNode.node as HTMLElement;

        // Scope: parent application's bindings + the scope variable
        this.#scopeBindings = new VBindings({ parent: this.#hostVNode.bindings });
        if (this.#entry.scopeVar) {
            this.#scopeBindings.setLocal(this.#entry.scopeVar, this.#buildSlotProps());
        }

        // Clone the scoped template's content and create its VNode tree BEFORE
        // inserting into the DOM, so components inside the slot content are
        // compiled before their connectedCallback can expand them.
        // (Created through the parent application to keep the VNode import
        // type-only; a direct `new VNode` here would close a module cycle
        // VNode -> VDirectiveManager -> VSlotOutletDirective -> VNode.)
        const fragment = this.#entry.template.content.cloneNode(true) as DocumentFragment;
        this.#contentVNode = this.#hostVNode.vApplication.createVNode({
            node: fragment,
            vApplication: this.#hostVNode.vApplication,
            parentVNode: this.#hostVNode,
            bindings: this.#scopeBindings
        });

        // Drop the fallback children (a scoped template supersedes them), then
        // swap the <slot> element for the content.
        while (slot.firstChild) {
            slot.removeChild(slot.firstChild);
        }
        slot.replaceWith(fragment);

        // Initial rendering
        this.#contentVNode.forceUpdate();
    }

    /**
     * Re-evaluates the slot props (component-side change) and pushes them into
     * the content scope.
     */
    #refresh(): void {
        if (!this.#contentVNode || !this.#scopeBindings || !this.#entry.scopeVar) {
            return;
        }
        this.#scopeBindings.setLocal(this.#entry.scopeVar, this.#buildSlotProps());
        this.#contentVNode.forceUpdate();
    }

    /**
     * Builds the slot props object from the outlet's `v-bind` attributes,
     * evaluated in the component scope.
     */
    #buildSlotProps(): Record<string, any> {
        const props: Record<string, any> = {};
        for (const prop of this.#props) {
            props[prop.name] = prop.evaluator?.evaluate();
        }
        return props;
    }

    #kebabToCamel(str: string): string {
        return str.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    }
}
