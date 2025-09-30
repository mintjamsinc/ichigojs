// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VConditionalDirective } from "./VConditionalDirective";

/**
 * Directive for conditional rendering in the virtual DOM.
 * This directive conditionally renders elements based on a boolean expression.
 * For example:
 *     <div v-if="isVisible">This div is conditionally rendered.</div>
 * The element and its children are included in the DOM only if the expression evaluates to true.
 * If the expression is false, the element and its children are not rendered.
 */
export class VIfDirective extends VConditionalDirective {
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
        return StandardDirectiveName.V_IF;
    }
}
