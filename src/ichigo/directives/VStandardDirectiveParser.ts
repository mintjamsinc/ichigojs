// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindDirective } from "./VBindDirective";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDirectiveParser } from "./VDirectiveParser";
import { VElseDirective } from "./VElseDirective";
import { VElseIfDirective } from "./VElseIfDirective";
import { VForDirective } from "./VForDirective";
import { VIfDirective } from "./VIfDirective";
import { VModelDirective } from "./VModelDirective";
import { VOnDirective } from "./VOnDirective";
import { VResizeDirective } from "./VResizeDirective";
import { VShowDirective } from "./VShowDirective";

/**
 * The directive parser for standard directives.
 */
export class VStandardDirectiveParser implements VDirectiveParser {
    /**
     * @inheritdoc
     */
    get name(): string {
        return "VStandardDirectiveParser";
    }

    /**
     * @inheritdoc
     */
    canParse(context: VDirectiveParseContext): boolean {
        if (context.attribute.name === StandardDirectiveName.V_IF ||
            context.attribute.name === StandardDirectiveName.V_ELSE_IF ||
            context.attribute.name === StandardDirectiveName.V_ELSE ||
            context.attribute.name === StandardDirectiveName.V_SHOW ||
            context.attribute.name === StandardDirectiveName.V_FOR ||
            // v-on:<event>, @<event>
            context.attribute.name.startsWith(StandardDirectiveName.V_ON + ":") ||
            context.attribute.name.startsWith("@") ||
            // v-bind:<attribute>, :<attribute>
            context.attribute.name.startsWith(StandardDirectiveName.V_BIND + ":") ||
            context.attribute.name.startsWith(":") ||
            // v-model, v-model.<modifier>
            context.attribute.name === StandardDirectiveName.V_MODEL ||
            context.attribute.name.startsWith(StandardDirectiveName.V_MODEL + ".") ||
            // v-resize
            context.attribute.name === StandardDirectiveName.V_RESIZE) {
            return true;
        }

        return false;
    }

    /**
     * @inheritdoc
     */
    parse(context: VDirectiveParseContext): VDirective {
        if (context.attribute.name === StandardDirectiveName.V_IF) {
            return new VIfDirective(context);
        }

        if (context.attribute.name === StandardDirectiveName.V_ELSE_IF) {
            return new VElseIfDirective(context);
        }

        if (context.attribute.name === StandardDirectiveName.V_ELSE) {
            return new VElseDirective(context);
        }

        if (context.attribute.name === StandardDirectiveName.V_SHOW) {
            return new VShowDirective(context);
        }

        if (context.attribute.name === StandardDirectiveName.V_FOR) {
            return new VForDirective(context);
        }

        // v-on:<event>, @<event>
        if (context.attribute.name.startsWith(StandardDirectiveName.V_ON + ":") ||
            context.attribute.name.startsWith("@")) {
            return new VOnDirective(context);
        }

        // v-bind:<attribute>, :<attribute>
        if (context.attribute.name.startsWith(StandardDirectiveName.V_BIND + ":") ||
            context.attribute.name.startsWith(":")) {
            return new VBindDirective(context);
        }

        // v-model, v-model.<modifier>
        if (context.attribute.name === StandardDirectiveName.V_MODEL ||
            context.attribute.name.startsWith(StandardDirectiveName.V_MODEL + ".")) {
            return new VModelDirective(context);
        }

        // v-resize
        if (context.attribute.name === StandardDirectiveName.V_RESIZE) {
            return new VResizeDirective(context);
        }

        throw new Error(`The attribute "${context.attribute.name}" cannot be parsed by ${this.name}.`);
    }
}
