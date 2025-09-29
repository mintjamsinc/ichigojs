// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";

/**
 * Interface for parsing directives from HTML attributes.
 * Each implementation of this interface should provide logic to determine if it can parse a given attribute and to perform the parsing.
 * Implementations should handle specific directive syntaxes and convert them into corresponding `VDirective` instances.
 * Example implementations could include parsers for `v-bind`, `v-if`, `v-for`, and other custom directives.
 * This interface helps in modularizing the directive parsing logic, making it easier to extend and maintain.
 * When implementing this interface, ensure that the `canParse` method accurately identifies attributes that the parser can handle, and the `parse` method correctly transforms those attributes into directive instances.
 * This design allows for a flexible and scalable approach to handling various directives in a templating system.
 */
export interface VDirectiveParser {
    /**
     * The name of the directive parser.
     * This property provides a human-readable identifier for the parser, which can be useful for logging, debugging, or displaying information about the parser in user interfaces.
     */
    get name(): string;

    /**
     * Determines if the parser can handle the given attribute.
     * @param context The context containing the element and attribute to parse.
     * @returns `true` if the parser can handle the attribute; otherwise, `false`.
     */
    canParse(context: VDirectiveParseContext): boolean;

    /**
     * Parses the given attribute into a directive.
     * @param context The context containing the element and attribute to parse.
     * @returns The parsed directive.
     * @throws Error if the attribute cannot be parsed by this parser.
     */
    parse(context: VDirectiveParseContext): VDirective;
}
