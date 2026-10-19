// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing a preparer for VBindings in the virtual DOM.
 */
export interface VBindingsPreparer {
    /**
     * The list of identifiers that this preparer depends on.
     * Changes to these identifiers may trigger the need to prepare bindings again.
     */
    get dependentIdentifiers(): string[];

    /**
     * The source paths the preparer's expressions read during their last evaluation,
     * when a dependent identifier has an index known only at run time ("items[*].name").
     * A change is then matched against these concrete paths instead of every index.
     */
    readonly trackedPaths?: ReadonlySet<string>;

    /**
     * The list of identifiers that can be prepared by this preparer.
     * This is a subset of the identifiers property.
     */
    get preparableIdentifiers(): string[];

    /**
     * Prepares the given VBindings for use in the virtual DOM.
     * This method is called before the bindings are applied to the DOM.
     * It allows for any necessary transformations or initializations of the bindings.
     */
    prepareBindings(): void;
}
