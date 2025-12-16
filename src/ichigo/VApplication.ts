// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { VComponentRegistry } from "./components/VComponentRegistry";
import { ReactiveProxy } from "./util/ReactiveProxy";
import { VApplicationInit } from "./VApplicationInit";
import { VWatcher } from "./VWatcher";

/**
 * Represents a virtual application instance.
 */
export class VApplication {
    /**
     * The application options.
     */
    #options: VApplicationOptions;

    /**
     * The parent application, if any.
     */
    #parentApplication?: VApplication;

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
     * A map tracking source paths for computed property values.
     * Maps source path (e.g., "model.elements[0]") to computed property name (e.g., "selectedElement").
     * This allows changes to source paths to be mapped to computed property changes.
     */
    #computedSourcePaths: Map<string, string> = new Map();

    /**
     * The watcher manager for this application.
     */
    #watcher: VWatcher;

    /**
     * Flag to indicate if an update is already scheduled.
     */
    #updateScheduled: boolean = false;

    /**
     * Creates an instance of the virtual application.
     * @param args The initialization arguments for the application.
     */
    constructor(args: VApplicationInit) {
        const { options, parentApplication: parentApplication, directiveParserRegistry, componentRegistry } = args;

        this.#options = options;
        this.#parentApplication = parentApplication;
        this.#directiveParserRegistry = directiveParserRegistry;
        this.#componentRegistry = componentRegistry;

        // Initialize log manager and logger
        this.#logManager = new VLogManager(options.logLevel);
        this.#logger = this.#logManager.getLogger('VApplication');

        // Analyze function dependencies
        this.#functionDependencies = ExpressionUtils.analyzeFunctionDependencies(options.methods || {});

        // Analyze computed dependencies
        this.#computedDependencies = ExpressionUtils.analyzeFunctionDependencies(options.computed || {});

        // Initialize watcher manager
        this.#watcher = new VWatcher(this.#logger);

        // Initialize bindings from data, computed, and methods
        this.#initializeBindings();

        // Initialize watchers
        this.#initializeWatchers();
    }

    /**
     * Gets the parent application, if any.
     */
    get parentApplication(): VApplication | undefined {
        return this.#parentApplication;
    }

    /**
     * Indicates whether this application is the root application.
     */
    get isRoot(): boolean {
        return !this.#parentApplication;
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
     * @param target The CSS selector string or HTMLElement to mount the application to.
     */
    mount(target: string | HTMLElement): void {
        let element: Element | null;

        if (typeof target === 'string') {
            element = document.querySelector(target);
            if (!element) {
                throw new Error(`Element not found for selector: ${target}`);
            }
        } else {
            element = target;
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

        // Remove v-cloak attributes after mounting
        // v-cloak is used to hide un-compiled template until the app is ready
        // Usage: Add CSS rule "[v-cloak] { display: none; }" to hide elements with v-cloak
        (element as HTMLElement).querySelectorAll('[v-cloak]').forEach(el => {
            el.removeAttribute('v-cloak');
        });
        (element as HTMLElement).removeAttribute('v-cloak');

        this.#logger.info('Application mounted.');
    }

    /**
     * Unmounts the application and cleans up resources.
     */
    unmount(): void {
        if (this.#vNode) {
            this.#vNode.destroy();
            this.#vNode = undefined;
        }
        this.#logger.info('Application unmounted.');
    }

    /**
     * Creates a child application instance with the same registries.
     * @param options The application options for the child.
     * @returns The created child application instance.
     */
    createChildApp(options: VApplicationOptions): VApplication {
        return new VApplication({
            options,
            parentApplication: this,
            directiveParserRegistry: this.#directiveParserRegistry,
            componentRegistry: this.#componentRegistry
        });
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
     * Computes dependent identifiers for a given computed property and value.
     * This is used to track dependencies in directives like v-for.
     * @param computedName The name of the computed property.
     * @param value The value to check for dependencies.
     * @returns An array of dependent identifiers.
     */
    resolveDependentIdentifiers(computedName: string, value: any): string[] {
        const identifiers: string[] = [];
        for (const dep of this.#computedDependencies[computedName] || []) {
            const depValue = this.#bindings?.get(dep);
            if (Array.isArray(depValue)) {
                const idx = depValue.indexOf(value);
                if (idx !== -1) {
                    identifiers.push(`${dep}[${idx}]`);
                }
            }
        }
        return identifiers;
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
        this.#bindings.set('$markRaw', <T extends object>(obj: T) => ReactiveProxy.markRaw(obj));

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
            // Create a $ctx context object with utility functions for data()
            // This provides the same $markRaw access as in lifecycle hooks (@mount, etc.)
            const $ctx = {
                $markRaw: <T extends object>(obj: T) => ReactiveProxy.markRaw(obj)
            };

            // Call data() with $ctx as 'this'
            const data = this.#options.data.call($ctx);
            if (data && typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    this.#bindings.set(key, value);
                }
            }
        }

        // Add computed properties (initialization mode)
        this.#recomputeProperties(true);
    }

    /**
     * Initializes watchers from the watch option.
     */
    #initializeWatchers(): void {
        if (!this.#options.watch || !this.#bindings) {
            return;
        }

        for (const [path, definition] of Object.entries(this.#options.watch)) {
            this.#watcher.register(
                path,
                definition,
                (p) => this.#getValueByPath(p)
            );
        }
    }

    /**
     * Gets a value from bindings by a dot-notation path.
     * @param path The property path (e.g., "user.name", "items[0]").
     * @returns The value at the path, or undefined if not found.
     */
    #getValueByPath(path: string): any {
        if (!this.#bindings) {
            return undefined;
        }

        // Split path into segments, handling both dot notation and bracket notation
        const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let value: any = this.#bindings.raw;

        for (const segment of segments) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[segment];
        }

        return value;
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

        // Apply computed source path mappings to changes
        // This converts paths like "model.elements[0].executionListeners"
        // to "selectedElement.executionListeners" when selectedElement points to model.elements[0]
        this.#applyComputedPathMappings();

        // Notify watchers before DOM update
        if (this.#bindings) {
            this.#watcher.notify(
                this.#bindings.changes,
                (p) => this.#getValueByPath(p),
                this.#bindings.raw
            );
        }

        // Update the DOM
        this.#vNode?.update();

        // Clear the set of changed identifiers after the update
        this.#bindings?.clearChanges();
    }

    /**
     * Applies computed source path mappings to the current changes.
     * For each changed path, if it starts with a source path that maps to a computed property,
     * adds the corresponding computed property path to the changes.
     */
    #applyComputedPathMappings(): void {
        if (this.#computedSourcePaths.size === 0 || !this.#bindings) {
            return;
        }

        const changes = this.#bindings.changes;
        const mappedPaths: string[] = [];

        for (const changedPath of changes) {
            for (const [sourcePath, computedName] of this.#computedSourcePaths) {
                // Check if the changed path starts with or equals the source path
                if (changedPath === sourcePath) {
                    // Exact match: mark the computed property itself as changed
                    mappedPaths.push(computedName);
                } else if (changedPath.startsWith(sourcePath + '.') || changedPath.startsWith(sourcePath + '[')) {
                    // Subpath match: convert "model.elements[0].x" to "selectedElement.x"
                    const suffix = changedPath.slice(sourcePath.length);
                    mappedPaths.push(computedName + suffix);
                }
            }
        }

        // Add all mapped paths to the changes
        for (const path of mappedPaths) {
            this.#bindings.markChanged(path);
        }
    }

    /**
     * Recursively recomputes computed properties based on changed identifiers.
     * @param isInitialization - If true, computes all computed properties regardless of dependencies
     */
    #recomputeProperties(isInitialization: boolean = false): void {
        if (!this.#options.computed) {
            return;
        }

        const computed = new Set<string>();
        const processing = new Set<string>();

        // Gather all changed identifiers, including all parent paths
        // e.g., for "model.elements[0].messageRef", also add:
        // "model.elements[0]", "model.elements", "model"
        const allChanges = new Set<string>();
        this.#bindings?.changes.forEach(id => {
            allChanges.add(id);

            // Add all parent paths by progressively stripping from the end
            let path = id;
            while (path.length > 0) {
                // Find last separator (either '[' or '.')
                const bracketIdx = path.lastIndexOf('[');
                const dotIdx = path.lastIndexOf('.');
                const lastSep = Math.max(bracketIdx, dotIdx);

                if (lastSep === -1) {
                    break;
                }

                path = path.substring(0, lastSep);
                if (path.length > 0) {
                    allChanges.add(path);
                }
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

            // If none of the dependencies have changed, skip recomputation (unless it's initialization)
            if (!isInitialization && !deps.some(dep => allChanges.has(dep))) {
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

                // Check if the value actually changed
                let hasChanged = oldValue !== newValue;

                // For arrays, always update (VBindings will detect length changes via its length cache)
                if (!hasChanged && Array.isArray(newValue)) {
                    hasChanged = true;
                }

                if (hasChanged) {
                    // Use setSilent to avoid triggering onChange during computed property updates
                    // Then mark the computed property as changed so UI depending on it will update
                    this.#bindings?.setSilent(key, newValue);
                    this.#bindings?.markChanged(key);
                    allChanges.add(key);

                    // Track source path mapping for computed property values
                    // This allows changes like "model.elements[0].x" to be mapped to "selectedElement.x"
                    if (typeof newValue === 'object' && newValue !== null) {
                        const sourcePath = ReactiveProxy.getPath(newValue);
                        if (sourcePath) {
                            // Remove old mapping for this computed property
                            for (const [path, name] of this.#computedSourcePaths) {
                                if (name === key) {
                                    this.#computedSourcePaths.delete(path);
                                    break;
                                }
                            }
                            // Add new mapping
                            this.#computedSourcePaths.set(sourcePath, key);
                        }
                    }
                }
            } catch (error) {
                this.#logger.error(`Error evaluating computed property '${key}': ${error}`);
            }

            computed.add(key);
            processing.delete(key);
        };

        // Find all computed properties that need to be recomputed
        for (const [key, deps] of Object.entries(this.#computedDependencies)) {
            // During initialization, compute all properties
            // Otherwise, check if any dependency has changed
            if (isInitialization || deps.some(dep => allChanges.has(dep))) {
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
