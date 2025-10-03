// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import type { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { VComponentRegistry } from "./components/VComponentRegistry";

/**
 * Represents a virtual application instance.
 */
export class VApplication {
    /**
     * The application options.
     */
    #options: VApplicationOptions;

    /**
     * The global directive parser registry.
     */
    #directiveParserRegistry: VDirectiveParserRegistry;

    /**
     * The global component registry.
     */
    #componentRegistry: VComponentRegistry;

    /**
     * The root virtual node.
     */
    #vNode?: VNode;

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
     * Gets the list of identifiers that can trigger updates.
     */
    #preparableIdentifiers: string[];

    /**
     * Creates an instance of the virtual application.
     * @param options The application options.
     * @param directiveParserRegistry The global directive parser registry.
     * @param componentRegistry The global component registry.
     */
    constructor(options: VApplicationOptions, directiveParserRegistry: VDirectiveParserRegistry, componentRegistry: VComponentRegistry) {
        this.#options = options;
        this.#directiveParserRegistry = directiveParserRegistry;
        this.#componentRegistry = componentRegistry;

        // Initialize log manager and logger
        this.#logManager = new VLogManager(options.logLevel);
        this.#logger = this.#logManager.getLogger('VApplication');

        // Analyze function dependencies
        this.#functionDependencies = ExpressionUtils.analyzeFunctionDependencies(options.methods || {});

        // Initialize bindings from data, computed, and methods
        this.#bindings = this.#initializeBindings();

        // Prepare the list of identifiers that can trigger updates
        this.#preparableIdentifiers = [...Object.keys(this.#bindings)];
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
     * Gets the global directive parser registry.
     */
    get directiveParserRegistry(): VDirectiveParserRegistry {
        return this.#directiveParserRegistry;
    }

    /**
     * Gets the global component registry.
     */
    get componentRegistry(): VComponentRegistry {
        return this.#componentRegistry;
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
     * Gets the list of identifiers that can trigger updates.
     */
    get preparableIdentifiers(): string[] {
        return this.#preparableIdentifiers;
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
            changedIdentifiers: [],
            isInitial: true
        });

        this.#logger.info('Application mounted.');
    }
}
