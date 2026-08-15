// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Registry of custom element tag names defined via defineComponent().
 *
 * VNode consults this registry during compilation to recognize component
 * boundaries: the children of an already-expanded ichigo component belong to
 * the component's own VApplication and must not be compiled by the parent
 * application (doing so would strip the component's directives and evaluate
 * its template expressions in the wrong scope).
 */
export class IchigoElementRegistry {
    /**
     * Registered tag names, stored uppercased to match Node.nodeName.
     */
    static #tags: Set<string> = new Set();

    /**
     * Registers a component tag name. Called by defineComponent().
     * @param tagName The custom element tag name (case-insensitive).
     */
    static add(tagName: string): void {
        this.#tags.add(tagName.toUpperCase());
    }

    /**
     * Checks whether a tag name belongs to a component defined via defineComponent().
     * @param tagName The tag name to check (case-insensitive; nodeName is accepted as-is).
     */
    static has(tagName: string): boolean {
        return this.#tags.has(tagName.toUpperCase());
    }
}
