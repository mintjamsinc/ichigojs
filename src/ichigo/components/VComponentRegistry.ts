// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VComponent } from './VComponent';

/**
 * A registry for managing component definitions.
 */
export class VComponentRegistry {
    /**
     * Map of component ID to component definition.
     */
    #components: Map<string, VComponent> = new Map();

    /**
     * Registers a new component.
     * @param id The unique identifier for the component.
     * @param createInstance The function that creates a new instance of the component.
     * @param templateID The optional template ID for the component.
     * @returns True if the component was registered, false if a component with the same ID already exists.
     */
    register(id: string, createInstance: (props?: any) => any, templateID?: string): boolean {
        if (this.has(id)) {
            return false;
        }

        const component = new VComponent(id, createInstance, templateID);
        this.#components.set(id, component);
        return true;
    }

    /**
     * Checks if a component with the given ID exists.
     * @param id The component ID to check.
     * @returns True if the component exists, false otherwise.
     */
    has(id: string): boolean {
        return this.#components.has(id);
    }

    /**
     * Gets a component by its ID.
     * @param id The component ID to retrieve.
     * @returns The component definition, or undefined if not found.
     */
    get(id: string): VComponent | undefined {
        return this.#components.get(id);
    }

    /**
     * Removes a component from the registry.
     * @param id The component ID to remove.
     * @returns True if the component was removed, false if it didn't exist.
     */
    unregister(id: string): boolean {
        return this.#components.delete(id);
    }

    /**
     * Clears all registered components.
     */
    clear(): void {
        this.#components.clear();
    }
}
