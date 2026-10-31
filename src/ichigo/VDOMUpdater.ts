// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing an updater for the virtual DOM.
 * An implementation of this interface is responsible for applying changes
 * from the virtual DOM to the actual DOM.
 */
export interface VDOMUpdater {
    /**
     * Applies the changes from the virtual DOM to the actual DOM.
     * This method runs as an effect: it is called again when something it read changes.
     */
    applyToDOM(): void;
}
