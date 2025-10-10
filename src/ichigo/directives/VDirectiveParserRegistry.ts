// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDirectiveParser } from "./VDirectiveParser";

/**
 * Registry for managing directive parsers.
 * This class allows registering, unregistering, and finding directive parsers.
 */
export class VDirectiveParserRegistry {
    /**
     * The list of registered directive parsers.
     */
    #parsers: VDirectiveParser[] = [];

    /**
     * Gets the list of registered directive parsers.
     * @returns The list of registered directive parsers.
     */
    get parsers(): VDirectiveParser[] {
        return this.#parsers.slice();
    }

    /**
     * Registers a directive parser.
     * @param parser The directive parser to register.
     */
    register(parser: VDirectiveParser): void {
        this.#parsers.push(parser);
    }

    /**
     * Unregisters a directive parser.
     * @param parser The directive parser to unregister.
     */
    unregister(parser: VDirectiveParser): void {
        const index = this.#parsers.indexOf(parser);
        if (index >= 0) {
            this.#parsers.splice(index, 1);
        }
    }

    /**
     * Finds a directive parser that can parse the given context.
     * @param context The context for parsing the directive.
     * @returns A directive parser that can parse the given context, or null if no suitable parser is found.
     */
    findParser(context: VDirectiveParseContext): VDirectiveParser | null {
        return this.#parsers.find(parser => parser.canParse(context)) || null;
    }
}
