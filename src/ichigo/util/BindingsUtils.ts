// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VBindings } from "../VBindings";

export class BindingsUtils {
    /**
     * Gets the identifiers that have changed between two sets of bindings.
     * @param oldBindings The old set of bindings.
     * @param newBindings The new set of bindings.
     * @returns An array of identifiers that have changed.
     */
    static getChangedIdentifiers(oldBindings: VBindings, newBindings: VBindings): string[] {
        const changed: string[] = [];
        for (const key of Object.keys(newBindings)) {
            if (!Object.hasOwn(oldBindings, key) || oldBindings[key] !== newBindings[key]) {
                changed.push(key);
            }
        }
        for (const key of Object.keys(oldBindings)) {
            if (!Object.hasOwn(newBindings, key)) {
                changed.push(key);
            }
        }
        return Array.from(new Set(changed));
    }
}
