// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing an updater for the virtual DOM.
 * An implementation of this interface is responsible for applying changes
 * from the virtual DOM to the actual DOM.
 */
export interface VDOMUpdater {
    /**
     * The list of identifiers that this updater depends on.
     * Changes to these identifiers may trigger the updater to apply changes to the DOM.
     */
    get dependentIdentifiers(): string[];

    /**
     * The source paths the updater's expressions read during their last evaluation,
     * when a dependent identifier has an index known only at run time ("items[*].name").
     * A change is then matched against these concrete paths instead of every index.
     */
    readonly trackedPaths?: ReadonlySet<string>;

    /**
     * Applies the changes from the virtual DOM to the actual DOM.
     * This method is called when the identifiers change or when an update is needed.
     */
    applyToDOM(): void;
}
