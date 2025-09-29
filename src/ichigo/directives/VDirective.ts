// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { VBindingsPreparer } from "./VBindingsPreparer";
import { VDOMUpdater } from "./VDOMUpdater";

/**
 * Interface representing a directive in the virtual DOM.
 */
export interface VDirective {
    /**
     * The name of the directive (e.g., "v-if", "v-for").
     */
    get name(): string;

    /**
     * The virtual node to which this directive is applied.
     */
    get vNode(): VNode;

    /**
     * Indicates whether this directive requires an anchor comment node for insertion/removal.
     * This is typically true for directives that may remove the element from the DOM,
     * such as v-if and v-for.
     * If true, the VNode will create an anchor comment node to mark the position of the element in the DOM.
     * This allows the element to be re-inserted at the correct position later.
     * If false, no anchor node is created and the element remains in the DOM at all times.
     * Directives that do not remove the element from the DOM should return false.
     * This property is used by the VNode to determine whether to create an anchor node.
     * It is also used by the VDOM to manage insertion and removal of nodes.
     * Note: This property should be implemented as a getter to allow dynamic evaluation based on directive state.
     */
    get needsAnchor(): boolean;

    /**
     * Gets the preparer for the VBindings associated with this directive.
     * This preparer is responsible for preparing the bindings before they are applied to the DOM.
     * For example, a directive may need to transform or filter the bindings based on its logic.
     * If the directive does not need to prepare bindings, this may return undefined.
     */
    get bindingsPreparer(): VBindingsPreparer | undefined;

    /**
     * Gets the updater for applying changes from the virtual DOM to the actual DOM.
     * This updater is responsible for applying any changes made by the directive to the DOM.
     * For example, a directive may need to show/hide elements, update attributes, etc.
     * If the directive does not need to update the DOM, this may return undefined.
     */
    get domUpdater(): VDOMUpdater | undefined;

    /**
     * Cleans up any resources used by the directive.
     * This method is called when the directive is no longer needed.
     */
    destroy(): void;
}
