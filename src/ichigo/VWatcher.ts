// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VLogger } from "./util/VLogger";
import { WatchCallback, WatcherDefinition, WatcherOptions } from "./VWatcherOptions";

/**
 * Represents a single watcher registration.
 */
interface WatcherEntry {
    /**
     * The property path being watched (e.g., "count", "user.name").
     */
    path: string;

    /**
     * The callback function to execute on change.
     */
    handler: WatchCallback;

    /**
     * Whether to deeply observe nested changes.
     */
    deep: boolean;

    /**
     * The cached previous value for comparison.
     */
    oldValue: any;
}

/**
 * Manages watchers for reactive property observation.
 * Provides Vue.js-like watch functionality for tracking property changes.
 */
export class VWatcher {
    /**
     * The list of registered watchers.
     */
    #watchers: WatcherEntry[] = [];

    /**
     * The logger instance.
     */
    #logger?: VLogger;

    /**
     * Creates a new VWatcher instance.
     * @param logger Optional logger instance for debugging.
     */
    constructor(logger?: VLogger) {
        this.#logger = logger;
    }

    /**
     * Registers a watcher for a property path.
     * @param path The property path to watch (e.g., "count", "user.name").
     * @param definition The watcher definition (callback function or options object).
     * @param getCurrentValue A function that returns the current value of the property.
     */
    register(
        path: string,
        definition: WatcherDefinition,
        getCurrentValue: (path: string) => any
    ): void {
        const options = this.#normalizeDefinition(definition);
        const currentValue = getCurrentValue(path);

        const entry: WatcherEntry = {
            path,
            handler: options.handler,
            deep: options.deep || false,
            oldValue: options.deep ? this.#deepClone(currentValue) : currentValue
        };

        this.#watchers.push(entry);
        this.#logger?.debug(`Watcher registered for path: ${path}, deep: ${entry.deep}`);

        // If immediate is true, call the handler immediately with the current value
        if (options.immediate) {
            this.#logger?.debug(`Immediate watcher triggered for path: ${path}`);
            try {
                options.handler.call(null, currentValue, undefined);
            } catch (error) {
                this.#logger?.error(`Error in immediate watcher for '${path}': ${error}`);
            }
        }
    }

    /**
     * Checks all watchers against the current changes and triggers callbacks as needed.
     * @param changes The list of changed property paths.
     * @param getValue A function that returns the current value of a property.
     * @param context The context object to use as 'this' when calling handlers.
     */
    notify(
        changes: string[],
        getValue: (path: string) => any,
        context: any
    ): void {
        for (const entry of this.#watchers) {
            if (this.#shouldTrigger(entry, changes)) {
                const newValue = getValue(entry.path);
                const oldValue = entry.oldValue;

                // Check if value actually changed
                if (!this.#hasChanged(newValue, oldValue, entry.deep)) {
                    continue;
                }

                this.#logger?.debug(`Watcher triggered for path: ${entry.path}`);

                // Update cached old value before calling handler
                entry.oldValue = entry.deep ? this.#deepClone(newValue) : newValue;

                // Call the handler
                try {
                    entry.handler.call(context, newValue, oldValue);
                } catch (error) {
                    this.#logger?.error(`Error in watcher for '${entry.path}': ${error}`);
                }
            }
        }
    }

    /**
     * Updates the cached old values for all watchers.
     * This should be called after processing to ensure old values are current.
     * @param getValue A function that returns the current value of a property.
     */
    updateCachedValues(getValue: (path: string) => any): void {
        for (const entry of this.#watchers) {
            const currentValue = getValue(entry.path);
            entry.oldValue = entry.deep ? this.#deepClone(currentValue) : currentValue;
        }
    }

    /**
     * Clears all registered watchers.
     */
    clear(): void {
        this.#watchers = [];
        this.#logger?.debug('All watchers cleared');
    }

    /**
     * Gets the number of registered watchers.
     */
    get count(): number {
        return this.#watchers.length;
    }

    /**
     * Normalizes a watcher definition to an options object.
     * @param definition The watcher definition to normalize.
     * @returns The normalized options object.
     */
    #normalizeDefinition(definition: WatcherDefinition): WatcherOptions {
        if (typeof definition === 'function') {
            return {
                handler: definition,
                immediate: false,
                deep: false
            };
        }
        return definition;
    }

    /**
     * Determines if a watcher should be triggered based on the changed paths.
     * @param entry The watcher entry to check.
     * @param changes The list of changed property paths.
     * @returns True if the watcher should be triggered.
     */
    #shouldTrigger(entry: WatcherEntry, changes: string[]): boolean {
        for (const changedPath of changes) {
            // Exact match
            if (changedPath === entry.path) {
                return true;
            }

            // Deep watcher: trigger if a nested property changed
            if (entry.deep && changedPath.startsWith(entry.path + '.')) {
                return true;
            }
            if (entry.deep && changedPath.startsWith(entry.path + '[')) {
                return true;
            }

            // Watch path is nested in the changed path (parent changed)
            if (entry.path.startsWith(changedPath + '.')) {
                return true;
            }
            if (entry.path.startsWith(changedPath + '[')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a value has changed.
     * @param newValue The new value.
     * @param oldValue The old value.
     * @param deep Whether to perform deep comparison.
     * @returns True if the value has changed.
     */
    #hasChanged(newValue: any, oldValue: any, deep: boolean): boolean {
        // Simple reference/value comparison
        if (newValue !== oldValue) {
            return true;
        }

        // For deep watchers with objects, compare stringified versions
        if (deep && typeof newValue === 'object' && newValue !== null) {
            try {
                return JSON.stringify(newValue) !== JSON.stringify(oldValue);
            } catch {
                // If stringify fails, assume changed
                return true;
            }
        }

        return false;
    }

    /**
     * Creates a deep clone of a value for caching.
     * @param value The value to clone.
     * @returns A deep clone of the value.
     */
    #deepClone(value: any): any {
        if (value === null || value === undefined) {
            return value;
        }
        if (typeof value !== 'object') {
            return value;
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            // If cloning fails, return the original reference
            return value;
        }
    }
}
