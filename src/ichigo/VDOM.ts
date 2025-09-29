// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VComponentRegistry } from './components/VComponentRegistry';
import { VDirectiveParserRegistry } from './directives/VDirectiveParserRegistry';
import { VStandardDirectiveParser } from './directives/VStandardDirectiveParser';
import { VApplication } from './VApplication';

/**
 * The main entry point for the virtual DOM library.
 */
export class VDOM {
    /**
     * The registry for components.
     */
    static #componentRegistry = new VComponentRegistry();

    /**
     * The registry for directive parsers.
     */
    static #directiveParserRegistry = new VDirectiveParserRegistry();
    static {
        // Register standard directive parser
        this.#directiveParserRegistry.register(new VStandardDirectiveParser());
    }

    /**
     * Gets the component registry.
     * @return {VComponentRegistry} The component registry.
     */
    static get componentRegistry(): VComponentRegistry {
        return this.#componentRegistry;
    }

    /**
     * Gets the directive parser registry.
     * @return {VDirectiveParserRegistry} The directive parser registry.
     */
    static get directiveParserRegistry(): VDirectiveParserRegistry {
        return this.#directiveParserRegistry;
    }

    /**
     * Checks if the current environment supports the required features.
     * @return {boolean} True if supported, false otherwise.
     */
    static get isSupported(): boolean {
        try {
            // Check for native support of required APIs
            if (typeof structuredClone !== 'function') return false;

            // if (typeof crypto.randomUUID !== 'function') return false;
            // if (!Array.prototype.at) return false;

            // Check for DOM support
            return typeof document !== 'undefined' && typeof document.createElement === 'function';
        } catch {
            return false;
        }
    }

    /**
     * Creates a virtual application instance.
     * @param selectors The CSS selectors to identify the root element.
     * @param options The options for the virtual application.
     * @returns The created virtual application instance.
     */
    static createApp(selectors: string, options: any): VApplication {
        const element = document.querySelector(selectors);
        if (!element) {
            throw new Error(`Element not found for selectors: ${selectors}`);
        }
		return new VApplication(element as HTMLElement, options);
    }
}
