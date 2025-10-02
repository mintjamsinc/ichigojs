// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing an updater for the virtual DOM.
 * An implementation of this interface is responsible for applying changes
 * from the virtual DOM to the actual DOM.
 */
export interface VDOMUpdater {
    /**
     * A list of variable and function names that this updater is concerned with.
     * Changes to these identifiers may trigger the updater to apply changes to the DOM.
     */
    get identifiers(): string[];

    /**
     * Applies the changes from the virtual DOM to the actual DOM.
     * This method is called when the identifiers change or when an update is needed.
     */
    applyToDOM(): void;
}
