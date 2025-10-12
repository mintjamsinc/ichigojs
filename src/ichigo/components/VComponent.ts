// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Represents a reusable component definition.
 */
export class VComponent {
    /**
     * The unique identifier for the component.
     */
    readonly id: string;

    /**
     * The function that creates a new instance of the component.
     */
    readonly createInstance: (props?: any) => any;

    /**
     * The optional template ID for the component.
     * If not specified, defaults to the component ID.
     */
    readonly templateID?: string;

    /**
     * Creates a new component definition.
     * @param id The unique identifier for the component.
     * @param createInstance The function that creates a new instance of the component.
     * @param templateID The optional template ID for the component.
     */
    constructor(id: string, createInstance: (props?: any) => any, templateID?: string) {
        if (!id || typeof id !== 'string') {
            throw new Error('Component ID must be a non-empty string.');
        }
        if (typeof createInstance !== 'function') {
            throw new Error('createInstance must be a function.');
        }

        this.id = id.trim();
        this.createInstance = createInstance;
        this.templateID = templateID?.trim() || this.id;
    }
}
