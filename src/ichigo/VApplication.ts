// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import type { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { VComponentRegistry } from "./components/VComponentRegistry";
import { ReactiveProxy } from "./util/ReactiveProxy";

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
     * The set of identifiers that have changed since the last update.
     * This is used to track which data properties have been modified.
     */
    #changedIdentifiers: Set<string> = new Set();

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

        // Clean the element by removing unnecessary whitespace text nodes
        this.#cleanElement(element as HTMLElement);

        // Inject utility methods into bindings
        this.#bindings.$nextTick = (callback: () => void) => this.#nextTick(callback);

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
    #initializeBindings(): VBindings {
        const bindings: VBindings = {};

        // 1. Add data properties with reactive proxy for each property
        if (this.#options.data) {
            const data = this.#options.data();
            if (data && typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    if (typeof value === 'object' && value !== null) {
                        // Wrap objects/arrays with reactive proxy, tracking the root key
                        bindings[key] = ReactiveProxy.create(value, () => {
                            this.#changedIdentifiers.add(key);
                            this.#scheduleUpdate();
                        });
                    } else {
                        // Primitive values are added as-is
                        bindings[key] = value;
                    }
                }
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

        // 4. Wrap the entire bindings object with a proxy for primitive value changes
        return new Proxy(bindings, {
            set: (obj, key, value) => {
                const oldValue = Reflect.get(obj, key);
                const result = Reflect.set(obj, key, value);

                // Track changes to primitive values
                if (oldValue !== value) {
                    this.#changedIdentifiers.add(key as string);
                    this.#scheduleUpdate();
                }

                return result;
            }
        });
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
        if (!this.#vNode) {
            return;
        }

        // Get the changed data properties
        const dataChanges = Array.from(this.#changedIdentifiers);
        this.#changedIdentifiers.clear();

        // Re-evaluate all computed properties
        const computedChanges: string[] = [];
        if (this.#options.computed) {
            for (const [key, computedFn] of Object.entries(this.#options.computed)) {
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

        // Combine all changes
        const allChanges = [...dataChanges, ...computedChanges];

        // Update the DOM
        this.#vNode.update({
            bindings: this.#bindings,
            changedIdentifiers: allChanges,
            isInitial: false
        });
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
