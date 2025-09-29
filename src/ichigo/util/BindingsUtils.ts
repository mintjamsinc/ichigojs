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
        for (const key of newBindings.keys()) {
            if (!oldBindings.has(key) || oldBindings.get(key) !== newBindings.get(key)) {
                changed.push(key);
            }
        }
        for (const key of oldBindings.keys()) {
            if (!newBindings.has(key)) {
                changed.push(key);
            }
        }
        return Array.from(new Set(changed));
    }
}
