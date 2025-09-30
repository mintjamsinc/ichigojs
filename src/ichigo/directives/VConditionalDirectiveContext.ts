// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VConditionalDirective } from "./VConditionalDirective";

/**
 * Context for managing related conditional directives (v-if, v-else-if, v-else).
 */
export class VConditionalDirectiveContext {
    #directives: VConditionalDirective[] = [];

    /**
     * Adds a directive (v-else-if or v-else) to the conditional context.
     * @param directive The directive to add.
     */
    addDirective(directive: VConditionalDirective): void {
        this.#directives.push(directive);
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