// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import type { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";

/**
 * Represents a virtual application instance.
 */
export class VApplication {
    /**
     * The root virtual node.
     */
    #vNode?: VNode;

    /**
     * The application options.
     */
    #options: VApplicationOptions;

    /**
     * The data bindings for the virtual application.
     */
    #bindings: VBindings;

    /**
     * The log manager.
     */
    #logManager: VLogManager;

    /**
     * The logger for this application.
     */
    #logger: VLogger;

    /**
     * A dictionary mapping function names to their dependencies.
     */
    #functionDependencies: Record<string, string[]>;

    /**
     * Creates an instance of the virtual application.
     * @param options The application options.
     */
    constructor(options: VApplicationOptions) {
        this.#options = options;
        this.#logManager = new VLogManager(options.logLevel);
        this.#logger = this.#logManager.getLogger('VApplication');
        this.#functionDependencies = ExpressionUtils.analyzeFunctionDependencies(options.methods || {});

        // Initialize bindings from data, computed, and methods
        this.#bindings = this.#initializeBindings();
    }

    /**
     * Initializes bindings from data, computed properties, and methods.
     * @returns The initialized bindings object.
     */
    #initializeBindings(): VBindings {
        const bindings: VBindings = {};

        // 1. Add data properties
        if (this.#options.data) {
            const data = this.#options.data();
            if (data && typeof data === 'object') {
                Object.assign(bindings, data);
            }
        }

        // 2. Add computed properties
        if (this.#options.computed) {
            for (const [key, computedFn] of Object.entries(this.#options.computed)) {
                try {
                    // Evaluate computed property and add to bindings
                    bindings[key] = computedFn();
                } catch (error) {
                    this.#logger.error(`Error evaluating computed property '${key}': ${error}`);
                    bindings[key] = undefined;
                }
            }
        }

        // 3. Add methods
        if (this.#options.methods) {
            Object.assign(bindings, this.#options.methods);
        }

        return bindings;
    }

    /**
     * Gets the root virtual node.
     */
    get rootVNode(): VNode | undefined {
        return this.#vNode;
    }

    /**
     * Gets the bindings for the virtual application.
     */
    get bindings(): VBindings {
        return this.#bindings;
    }

    /**
     * Gets the log manager.
     */
    get logManager(): VLogManager {
        return this.#logManager;
    }

    /**
     * Gets the function dependencies for the virtual application.
     */
    get functionDependencies(): Record<string, string[]> {
        return this.#functionDependencies;
    }

    /**
     * Gets the global directive parser registry.
     * Note: This uses a getter function to access VDOM.directiveParserRegistry
     * to avoid circular dependency issues during module initialization.
     */
    get directiveParserRegistry(): VDirectiveParserRegistry {
        // Access VDOM at runtime instead of import time to break circular dependency
        return (globalThis as any).__ichigojs_VDOM?.directiveParserRegistry;
    }

    /**
     * Mounts the application.
     * @param selectors The CSS selectors to identify the root element.
     */
    mount(selectors: string): void {
        const element = document.querySelector(selectors);
        if (!element) {
            throw new Error(`Element not found for selectors: ${selectors}`);
        }

        // Create the root virtual node
        this.#vNode = new VNode({
            node: element,
            vApplication: this,
            bindings: this.#bindings
        });

        // Initial rendering
        this.#vNode.update({
            bindings: this.#bindings,
            changedIdentifiers: Object.keys(this.#bindings),
        });

        this.#logger.info('Application mounted.');
    }
}
