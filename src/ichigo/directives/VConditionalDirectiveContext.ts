// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VConditionalDirective } from "./VConditionalDirective";

/**
 * Context for managing related conditional directives (v-if, v-else-if, v-else).
 */
export class VConditionalDirectiveContext {
    /**
     * A list of directives (v-if, v-else-if, v-else) in the order they appear in the template.
     */
    #directives: VConditionalDirective[] = [];

    /**
     * A cached list of all variable and function names used in the expressions of the associated directives.
     */
    #allDependentIdentifiers: string[] = [];
 
    /**
     * Gets a list of all variable and function names used in the expressions of the associated directives.
     * This is useful for determining dependencies for re-evaluation when data changes.
     */
    get allDependentIdentifiers(): string[] {
        return this.#allDependentIdentifiers;
    }

    /**
     * The paths the conditions of the chain read during their last evaluation, united
     * across directives, or undefined when no condition has a run-time index.
     */
    get trackedPaths(): ReadonlySet<string> | undefined {
        let paths: Set<string> | undefined;
        for (const directive of this.#directives) {
            const tracked = directive.trackedPaths;
            if (tracked) {
                paths ??= new Set<string>();
                tracked.forEach(path => paths!.add(path));
            }
        }
        return paths;
    }

    /**
     * Adds a directive (v-else-if or v-else) to the conditional context.
     * @param directive The directive to add.
     */
    addDirective(directive: VConditionalDirective): void {
        this.#directives.push(directive);

        // Update the cached list of all dependent identifiers
        if (directive.dependentIdentifiers) {
            for (const id of directive.dependentIdentifiers) {
                if (!this.#allDependentIdentifiers.includes(id)) {
                    this.#allDependentIdentifiers.push(id);
                }
            }
        }
    }

    /**
     * Checks if any preceding directive's condition is met.
     * This is used to determine if a v-else-if or v-else directive should be rendered.
     * @param directive The directive to check against.
     * @returns True if any preceding directive's condition is met, otherwise false.
     */
    isPrecedingConditionMet(directive: VConditionalDirective): boolean {
        const index = this.#directives.indexOf(directive);
        if (index === -1) {
            throw new Error("Directive not found in context.");
        }
        // Check if all previous directives are met
        for (let i = 0; i < index; i++) {
            const d = this.#directives[i];
            if (d.conditionIsMet === true) {
                return true;
            }
        }
        return false;
    }
}