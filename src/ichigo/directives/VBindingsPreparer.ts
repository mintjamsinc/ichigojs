// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VBindings } from "../VBindings";

/**
 * Interface representing a preparer for VBindings in the virtual DOM.
 */
export interface VBindingsPreparer {
    /**
     * The list of identifiers that this preparer is concerned with.
     * These identifiers are used to determine when the bindings need to be prepared.
     */
    get identifiers(): string[];

    /**
     * The list of identifiers that can be prepared by this preparer.
     * This is a subset of the identifiers property.
     */
    get preparableIdentifiers(): string[];

    /**
     * Prepares the VBindings for the virtual node.
     * This method is called before the bindings are applied to the DOM.
     * It allows for any necessary transformations or initializations of the bindings.
     * @param bindings The original VBindings to be prepared.
     * @returns The prepared VBindings.
     */
    prepareBindings(bindings: VBindings): VBindings;
}
