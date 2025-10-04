// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import type { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { VComponentRegistry } from "./components/VComponentRegistry";
import { BindingsUtils } from "./util/BindingsUtils";

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
     * 暫定処理: The previous state of bindings for change detection.
     */
    #oldBindings: VBindings = {};

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
     * A dictionary mapping computed property names to their dependencies.
     */
    #computedDependencies: Record<string, string[]>;

    /**
     * Gets the list of identifiers that can trigger updates.
     */
    #preparableIdentifiers: string[];

    /**
     * Flag to indicate if an update is already scheduled.
     */
    #updateScheduled: boolean = false;

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

        // Analyze computed dependencies
        this.#computedDependencies = ExpressionUtils.analyzeFunctionDependencies(options.computed || {});

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
                    // Evaluate computed property with bindings as 'this' context
                    bindings[key] = computedFn.call(bindings);
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

        // Inject utility methods into bindings
        this.#bindings.$nextTick = (callback: () => void) => this.nextTick(callback);

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

    /**
     * Schedules a DOM update in the next microtask.
     * Multiple calls within the same event loop will be batched into a single update.
     */
    scheduleUpdate(): void {
        if (this.#updateScheduled) {
            return;
        }

        this.#updateScheduled = true;
        queueMicrotask(() => {
            this.#updateScheduled = false;
            this.update();
        });
    }

    /**
     * Executes an immediate DOM update.
     */
    update(): void {
        if (!this.#vNode) {
            return;
        }

        // 暫定処理: Detect changes in data properties
        const dataChanges = BindingsUtils.getChangedIdentifiers(this.#oldBindings, this.#bindings);

        // Re-evaluate computed properties that depend on changed data
        const computedChanges: string[] = [];
        if (this.#options.computed) {
            for (const [key, computedFn] of Object.entries(this.#options.computed)) {
                const dependencies = this.#computedDependencies[key] || [];

                // Check if any dependency changed
                const shouldUpdate = dataChanges.length === 0 || dependencies.some(dep => dataChanges.includes(dep));

                if (shouldUpdate) {
                    try {
                        const oldValue = this.#bindings[key];
                        const newValue = computedFn.call(this.#bindings);
                        this.#bindings[key] = newValue;

                        // Track if the computed value actually changed
                        if (oldValue !== newValue) {
                            computedChanges.push(key);
                            this.#logger.debug(`Computed property '${key}' changed: ${oldValue} -> ${newValue}`);
                        }
                    } catch (error) {
                        this.#logger.error(`Error evaluating computed property '${key}': ${error}`);
                    }
                }
            }
        }

        // Combine all changes
        const allChanges = [...dataChanges, ...computedChanges];

        if (allChanges.length === 0) {
            return; // No changes detected
        }

        // Update the DOM
        this.#vNode.update({
            bindings: this.#bindings,
            changedIdentifiers: allChanges, // 暫定処理
            isInitial: false
        });

        // 暫定処理: Store old bindings for change detection
        this.#oldBindings = JSON.parse(JSON.stringify(this.#bindings));
    }

    /**
     * Executes a callback after the next DOM update.
     * @param callback The callback to execute.
     */
    nextTick(callback: () => void): void {
        if (this.#updateScheduled) {
            queueMicrotask(() => {
                queueMicrotask(callback);
            });
        } else {
            queueMicrotask(callback);
        }
    }
}
