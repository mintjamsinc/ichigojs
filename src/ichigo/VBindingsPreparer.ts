// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing a preparer for VBindings in the virtual DOM.
 */
export interface VBindingsPreparer {
    /**
     * Prepares the given VBindings for use in the virtual DOM.
     * This method is called before the bindings are applied to the DOM.
     * It allows for any necessary transformations or initializations of the bindings.
     * This method runs as an effect: it is called again when something it read changes.
     */
    prepareBindings(): void;
}
