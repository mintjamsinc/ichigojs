// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VConditionalDirective } from "./VConditionalDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";

/**
 * Directive for conditional rendering in the virtual DOM.
 * This directive renders an element if the preceding v-if or v-else-if directive evaluated to false.
 * For example:
 *     <div v-else>This div is rendered if the previous v-if or v-else-if was false.</div>
 * The element and its children are included in the DOM only if the preceding v-if or v-else-if expression evaluates to false.
 * If the preceding expression is true, this element and its children are not rendered.
 * This directive must be used immediately after a v-if or v-else-if directive.
 */
export class VElseDirective extends VConditionalDirective {
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
        return StandardDirectiveName.V_ELSE;
    }
}
