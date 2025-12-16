// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Callback function type for watchers.
 * @param newValue The new value of the watched property.
 * @param oldValue The previous value of the watched property.
 */
export type WatchCallback<T = any> = (newValue: T, oldValue: T | undefined) => void;

/**
 * Options for configuring a watcher.
 */
export interface WatcherOptions<T = any> {
    /**
     * The callback function to execute when the watched property changes.
     */
    handler: WatchCallback<T>;

    /**
     * If true, the callback will be called immediately with the current value.
     * Default is false.
     */
    immediate?: boolean;

    /**
     * If true, the watcher will deeply observe nested object changes.
     * Default is false.
     */
    deep?: boolean;
}

/**
 * A watcher definition can be either a callback function or an options object.
 */
export type WatcherDefinition<T = any> = WatchCallback<T> | WatcherOptions<T>;

/**
 * A dictionary of watcher definitions.
 * Keys are property paths (e.g., "count", "user.name").
 */
export interface WatcherDictionary {
    [key: string]: WatcherDefinition;
}
