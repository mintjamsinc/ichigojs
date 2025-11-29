// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindDirective } from "./VBindDirective";
import { VComponentDirective } from "./VComponentDirective";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDirectiveParser } from "./VDirectiveParser";
import { VElseDirective } from "./VElseDirective";
import { VElseIfDirective } from "./VElseIfDirective";
import { VForDirective } from "./VForDirective";
import { VHtmlDirective } from "./VHtmlDirective";
import { VIfDirective } from "./VIfDirective";
import { VIntersectionDirective } from "./VIntersectionDirective";
import { VModelDirective } from "./VModelDirective";
import { VOnDirective } from "./VOnDirective";
import { VPerformanceDirective } from "./VPerformanceDirective";
import { VResizeDirective } from "./VResizeDirective";
import { VShowDirective } from "./VShowDirective";
import { VTextDirective } from "./VTextDirective";

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
            context.attribute.name === StandardDirectiveName.V_RESIZE ||
            // v-intersection
            context.attribute.name === StandardDirectiveName.V_INTERSECTION ||
            // v-performance
            context.attribute.name === StandardDirectiveName.V_PERFORMANCE ||
            // v-component, v-component.<modifier>
            context.attribute.name === StandardDirectiveName.V_COMPONENT ||
            context.attribute.name.startsWith(StandardDirectiveName.V_COMPONENT + ".") ||
            // v-html
            context.attribute.name === StandardDirectiveName.V_HTML ||
            // v-text
            context.attribute.name === StandardDirectiveName.V_TEXT) {
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

        // v-intersection
        if (context.attribute.name === StandardDirectiveName.V_INTERSECTION) {
            return new VIntersectionDirective(context);
        }

        // v-performance
        if (context.attribute.name === StandardDirectiveName.V_PERFORMANCE) {
            return new VPerformanceDirective(context);
        }

        // v-component, v-component.<modifier>
        if (context.attribute.name === StandardDirectiveName.V_COMPONENT ||
            context.attribute.name.startsWith(StandardDirectiveName.V_COMPONENT + ".")) {
            return new VComponentDirective(context);
        }

        // v-html
        if (context.attribute.name === StandardDirectiveName.V_HTML) {
            return new VHtmlDirective(context);
        }

        // v-text
        if (context.attribute.name === StandardDirectiveName.V_TEXT) {
            return new VTextDirective(context);
        }

        throw new Error(`The attribute "${context.attribute.name}" cannot be parsed by ${this.name}.`);
    }
}
