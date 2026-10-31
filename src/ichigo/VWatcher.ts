// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveEffect } from "./util/ReactiveEffect";
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

    /**
     * The value read by the last run of the effect.
     */
    value: any;

    /**
     * The value to keep as the next old value: a deep clone for a deep watcher.
     */
    clone?: any;

    /**
     * Reads the watched value, which is what the watcher depends on.
     */
    effect: ReactiveEffect;
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
     * The watchers notified and not yet processed.
     */
    #pending: Set<WatcherEntry> = new Set();

    /**
     * Called when a watcher has been notified.
     */
    #schedule: () => void;

    /**
     * The logger instance.
     */
    #logger?: VLogger;

    /**
     * Creates a new VWatcher instance.
     * @param schedule Called when a watcher has been notified.
     * @param logger Optional logger instance for debugging.
     */
    constructor(schedule: () => void, logger?: VLogger) {
        this.#schedule = schedule;
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
        const deep = options.deep || false;

        const entry: WatcherEntry = {
            path,
            handler: options.handler,
            deep,
            oldValue: undefined,
            value: undefined,
            effect: new ReactiveEffect(() => {
                entry.value = getCurrentValue(path);
                // A deep clone reads every member, so that all of them are dependencies
                entry.clone = deep ? this.#deepClone(entry.value) : entry.value;
            }, () => {
                this.#pending.add(entry);
                this.#schedule();
            })
        };

        entry.effect.run();
        const currentValue = entry.value;
        entry.oldValue = entry.clone;

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
     * Whether a watcher has been notified and not processed yet.
     */
    get hasPending(): boolean {
        return this.#pending.size > 0;
    }

    /**
     * The paths of the watchers notified and not processed yet.
     */
    get pendingPaths(): string[] {
        return [...this.#pending].map(entry => entry.path);
    }

    /**
     * Drops the watchers notified and not processed yet.
     */
    dropPending(): void {
        this.#pending.clear();
    }

    /**
     * Calls the handlers of the watchers notified whose value has changed.
     * @param context The context object to use as 'this' when calling handlers.
     */
    notify(context: any): void {
        const pending = [...this.#pending];
        this.#pending.clear();

        for (const entry of pending) {
            entry.effect.run();
            const newValue = entry.value;
            const oldValue = entry.oldValue;

            // Check if value actually changed
            if (!this.#hasChanged(newValue, oldValue, entry.deep)) {
                continue;
            }

            this.#logger?.debug(`Watcher triggered for path: ${entry.path}`);

            // Update cached old value before calling handler
            entry.oldValue = entry.clone;

            // Call the handler
            try {
                entry.handler.call(context, newValue, oldValue);
            } catch (error) {
                this.#logger?.error(`Error in watcher for '${entry.path}': ${error}`);
            }
        }
    }

    /**
     * Clears all registered watchers.
     */
    clear(): void {
        for (const entry of this.#watchers) {
            entry.effect.stop();
        }
        this.#watchers = [];
        this.#pending.clear();
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
