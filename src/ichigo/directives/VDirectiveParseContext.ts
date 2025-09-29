// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "../VApplication";
import { VNode } from "../VNode";

/**
 * The context for parsing a directive.
 * This interface provides the necessary information required during the parsing of a directive from an HTML attribute.
 * It includes references to the application instance, the virtual node being processed, the HTML element containing the directive, and the specific attribute representing the directive.
 * Implementations of directive parsers can utilize this context to access relevant data and perform parsing operations effectively.
 */
export interface VDirectiveParseContext {
    /**
     * The virtual node being processed.
     * This property represents the specific virtual node that is associated with the directive being parsed.
     */
    vNode: VNode;

    /**
     * The attribute representing the directive.
     * This property contains the actual HTML attribute that holds the directive information, allowing parsers to extract its name and value.
     */
    attribute: Attr;
}
