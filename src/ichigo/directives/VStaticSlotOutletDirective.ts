// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import type { VNode } from "../VNode";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDOMUpdater } from "../VDOMUpdater";
import type { IchigoElement } from "../components/IchigoElement";

/**
 * Renders a static slot outlet: a `<slot>` element inside a component template
 * whose host element received plain slot content from the parent — child
 * nodes for the default slot, or elements carrying `slot="name"`:
 *
 * ```html
 * <!-- component template -->
 * <div v-if="open" class="body"><slot></slot></div>
 *
 * <!-- usage -->
 * <my-dialog :open="show">
 *   <my-field :label="title"></my-field>
 * </my-dialog>
 * ```
 *
 * The slot content is the parent application's own nodes, compiled in the
 * parent scope; it keeps its bindings, listeners and component props only as
 * long as those very nodes are displayed. So the outlet MOVES them into place
 * and never clones them. That is what lets a `<slot>` sit behind a v-if or
 * v-for in the component template: the directive clones its template source,
 * the clone carries a fresh `<slot>`, and the outlet created for that clone
 * moves the live nodes in.
 *
 * Nodes can only be in one place, so when the same slot is rendered more than
 * once (e.g. a `<slot>` inside a v-for), the outlet rendered last receives the
 * content and the earlier ones are left empty. When the outlet holding the
 * content goes away while others remain (its row is removed), the content
 * moves to the last remaining one. For content per row, use a scoped slot
 * (`<template v-slot:name="scope">`), which renders a copy per outlet
 * (VSlotOutletDirective).
 *
 * The component application never compiles the moved nodes: they are placed
 * in onMount, after the parent VNode has taken its snapshot of the children
 * to compile. Components inside them belong to the parent application, which
 * expands them through {@link expandComponents} once they are in the document.
 * When the last outlet goes away (its v-if turns false) the nodes leave with
 * the removed clone and wait there until the next outlet moves them again;
 * they are not destroyed, because they are not this application's to destroy.
 *
 * Created only when the host captured content for the slot's name and no
 * scoped template claims it; otherwise the `<slot>` element renders its
 * fallback children in the component scope.
 */
export class VStaticSlotOutletDirective implements VDirective {
    /**
     * The live outlets of each slot, in the order they were rendered, keyed by
     * the slot's node array (one per host element and slot name). The last
     * one holds the content.
     */
    static #outlets: WeakMap<Node[], VStaticSlotOutletDirective[]> = new WeakMap();

    /**
     * Marks where the `<slot>` element was, so the content can be moved back
     * here when a later outlet of the same slot goes away.
     */
    #anchor?: Comment;

    /**
     * Guards against double destruction.
     */
    #destroyed: boolean = false;

    /**
     * The virtual node of the `<slot>` element (in the component application).
     */
    #vNode: VNode;

    /**
     * The slot content: the parent application's nodes, shared with the host
     * element's slot cache.
     */
    #nodes: Node[];

    /**
     * The host element's VNode in the parent application, whose children are
     * the VNodes of the slot content. Undefined when the host was not compiled
     * by an application (then there is nothing to expand).
     */
    #hostVNode?: VNode;

    /**
     * Creates a static slot outlet for the given `<slot>` VNode when the host
     * element captured content for its slot name. Returns undefined when there
     * is none, so the `<slot>` element keeps rendering its fallback content.
     */
    static tryCreate(vNode: VNode): VStaticSlotOutletDirective | undefined {
        const host = vNode.vApplication.hostElement as IchigoElement | undefined;
        if (!host || typeof host._ichigoSlotNodes !== 'function') {
            return undefined;
        }

        const element = vNode.node as HTMLElement;
        const nodes = host._ichigoSlotNodes(element.getAttribute('name') || 'default');
        if (!nodes) {
            return undefined;
        }

        return new VStaticSlotOutletDirective(vNode, nodes, host._ichigoHost?.vNode);
    }

    private constructor(vNode: VNode, nodes: Node[], hostVNode: VNode | undefined) {
        this.#vNode = vNode;
        this.#nodes = nodes;
        this.#hostVNode = hostVNode;

        // Slot props (v-bind / :) only mean something to a scoped template.
        // Consume them so the generic attribute parsing does not evaluate them
        // on an element that is about to leave the document.
        const element = vNode.node as HTMLElement;
        for (const attr of Array.from(element.attributes)) {
            if (attr.name.startsWith('v-bind:') || attr.name.startsWith(':')) {
                element.removeAttribute(attr.name);
            }
        }
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return 'static-slot-outlet';
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
        return undefined;
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
     *
     * Moves the slot content in place of the `<slot>` element — synchronously
     * during VNode construction, before the component application would
     * compile the slot's fallback children (which the content replaces).
     */
    get onMount(): (() => void) | undefined {
        return () => {
            const slot = this.#vNode.node as HTMLElement;
            while (slot.firstChild) {
                slot.removeChild(slot.firstChild);
            }
            this.#anchor = document.createComment('slot');
            slot.replaceWith(this.#anchor);

            let outlets = VStaticSlotOutletDirective.#outlets.get(this.#nodes);
            if (!outlets) {
                outlets = [];
                VStaticSlotOutletDirective.#outlets.set(this.#nodes, outlets);
            }
            outlets.push(this);
            this.#place();
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
     *
     * Expands the components in the slot content through the parent
     * application's VNodes. Called by the walk of whoever inserted this
     * outlet into the document (VApplication.mount, v-if, v-for), so the
     * content is connected by now — unless a later outlet took it, in which
     * case that outlet's walk expands it.
     */
    expandComponents(): void {
        const children = this.#hostVNode?.childVNodes;
        if (!children) {
            return;
        }
        for (const child of children) {
            if (this.#nodes.includes(child.node)) {
                child.expandComponents();
            }
        }
    }

    /**
     * @inheritdoc
     *
     * The slot content is the parent application's; nothing to release here.
     */
    destroy(): void {
        if (this.#destroyed) {
            return;
        }
        this.#destroyed = true;

        const outlets = VStaticSlotOutletDirective.#outlets.get(this.#nodes);
        if (!outlets) {
            return;
        }
        const index = outlets.indexOf(this);
        if (index === -1) {
            return;
        }
        const wasHolder = index === outlets.length - 1;
        outlets.splice(index, 1);

        // Hand the content to the last remaining outlet before this one's DOM
        // is removed (v-if / v-for destroy the VNode first, then remove it),
        // so removing the row that shows it does not take it out of view.
        const next = outlets[outlets.length - 1];
        if (wasHolder && next) {
            next.#place();
            next.expandComponents();
        }
    }

    /**
     * Moves the slot content right after this outlet's anchor. Moving, not
     * cloning: nodes shown by another outlet of the same slot leave it.
     */
    #place(): void {
        this.#anchor?.after(...this.#nodes);
    }
}
