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
    #bindings?: VBindings;

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
        this.#initializeBindings();
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
    get bindings(): VBindings | undefined {
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
     * Mounts the application.
     * @param selectors The CSS selectors to identify the root element.
     */
    mount(selectors: string): void {
        const element = document.querySelector(selectors);
        if (!element) {
            throw new Error(`Element not found for selectors: ${selectors}`);
        }

        // Clean the element by removing unnecessary whitespace text nodes
        this.#cleanElement(element as HTMLElement);

        // Create the root virtual node
        this.#vNode = new VNode({
            node: element,
            vApplication: this,
            bindings: this.#bindings
        });

        // Initial rendering
        this.#vNode.update();

        this.#logger.info('Application mounted.');
    }

    /**
     * Cleans the element by removing unnecessary whitespace text nodes.
     * @param element The element to clean.
     */
    #cleanElement(element: HTMLElement): void {
        let buffer: Text | null = null;

        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node as Text;
                if (/^[\s\n\r\t]*$/.test(text.nodeValue || '')) {
                    element.removeChild(text);
                } else {
                    if (buffer) {
                        buffer.nodeValue += text.nodeValue || '';
                        element.removeChild(text);
                    } else {
                        buffer = text;
                    }
                }
            } else {
                buffer = null;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    this.#cleanElement(node as HTMLElement);
                }
            }
        }
    }

    /**
     * Initializes bindings from data, computed properties, and methods.
     * @returns The initialized bindings object.
     */
    #initializeBindings(): void {
        // Create bindings with change tracking
        this.#bindings = new VBindings({
            onChange: (identifier) => {
                this.#scheduleUpdate();
            },
            vApplication: this
        });

        // Inject utility methods into bindings
        this.#bindings.set('$nextTick', (callback: () => void) => this.#nextTick(callback));

        // Add methods
        if (this.#options.methods) {
            for (const [key, method] of Object.entries(this.#options.methods)) {
                if (typeof method !== 'function') {
                    this.#logger.warn(`Method '${key}' is not a function and will be ignored.`);
                    continue;
                }

                // Bind the method to the raw bindings object to ensure 'this' refers to bindings
                // This allows methods to access and modify bindings properties via 'this'
                this.#bindings.set(key, method.bind(this.#bindings.raw));
            }
        }

        // Add data properties
        if (this.#options.data) {
            const data = this.#options.data();
            if (data && typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    this.#bindings.set(key, value);
                }
            }
        }

        // Add computed properties
        this.#recomputeProperties();
    }

    /**
     * Schedules a DOM update in the next microtask.
     * Multiple calls within the same event loop will be batched into a single update.
     */
    #scheduleUpdate(): void {
        if (this.#updateScheduled) {
            return;
        }

        this.#updateScheduled = true;
        queueMicrotask(() => {
            this.#update();
            this.#updateScheduled = false;
        });
    }

    /**
     * Executes an immediate DOM update.
     */
    #update(): void {
        // Re-evaluate computed properties that depend on changed values
        this.#recomputeProperties();

        // Update the DOM
        this.#vNode?.update();

        // Clear the set of changed identifiers after the update
        this.#bindings?.clearChanges();
    }

    /**
     * Recursively recomputes computed properties based on changed identifiers.
     */
    #recomputeProperties(): void {
        if (!this.#options.computed) {
            return;
        }

        const computed = new Set<string>();
        const processing = new Set<string>();

        // Gather all changed identifiers, including parent properties for array items
        const allChanges = new Set<string>();
        this.#bindings?.changes.forEach(id => {
            allChanges.add(id);

            const idx = id.indexOf('[');
            if (idx !== -1) {
                allChanges.add(id.substring(0, idx));
            }
        });

        // Helper function to recursively compute a property
        const compute = (key: string): void => {
            // Skip if already computed in this update cycle
            if (computed.has(key)) {
                return;
            }

            // Detect circular dependency
            if (processing.has(key)) {
                this.#logger.error(`Circular dependency detected for computed property '${key}'`);
                return;
            }

            processing.add(key);

            // Get the dependencies for this computed property
            const deps = this.#computedDependencies[key] || [];

            // If none of the dependencies have changed, skip recomputation
            if (!deps.some(dep => allChanges.has(dep))) {
                computed.add(key);
                return;
            }

            // First, recursively compute any dependent computed properties
            for (const dep of deps) {
                if (this.#options.computed![dep]) {
                    compute(dep);
                }
            }

            // Now compute this property
            const computedFn = this.#options.computed![key];
            try {
                const oldValue = this.#bindings?.get(key);
                const newValue = computedFn.call(this.#bindings?.raw);

                // Track if the computed value actually changed
                if (oldValue !== newValue) {
                    this.#bindings?.set(key, newValue);
                    allChanges.add(key);
                }
            } catch (error) {
                this.#logger.error(`Error evaluating computed property '${key}': ${error}`);
            }

            computed.add(key);
            processing.delete(key);
        };

        // Find all computed properties that need to be recomputed
        for (const [key, deps] of Object.entries(this.#computedDependencies)) {
            // Check if any dependency has changed
            if (deps.some(dep => allChanges.has(dep))) {
                compute(key);
            }
        }
    }

    /**
     * Executes a callback after the next DOM update.
     * @param callback The callback to execute.
     */
    #nextTick(callback: () => void): void {
        if (this.#updateScheduled) {
            queueMicrotask(() => {
                queueMicrotask(callback);
            });
        } else {
            queueMicrotask(callback);
        }
    }
}
