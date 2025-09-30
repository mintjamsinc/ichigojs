// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VConditionalDirective } from "./VConditionalDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";

/**
 * Directive for conditional rendering in the virtual DOM.
 * This directive renders an element based on a boolean expression, but only if preceding v-if or v-else-if directives were false.
 * For example:
 *     <div v-else-if="isAlternativeVisible">This div is conditionally rendered.</div>
 * The element and its children are included in the DOM only if the expression evaluates to true AND no preceding condition was met.
 * This directive must be used after a v-if or another v-else-if directive.
 */
export class VElseIfDirective extends VConditionalDirective {
    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        super(context);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_ELSE_IF;
    }
}
