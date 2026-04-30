// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { LogLevel } from "./util/LogLevel";
import { WatcherDictionary } from "./VWatcherOptions";

/**
 * Definition of a computed property. Either a getter function, or an object exposing both
 * a getter and a setter (writable computed).
 */
export type VComputedDefinition =
    | (() => unknown)
    | {
        get: () => unknown;
        set: (value: any) => void;
    };

export interface VApplicationOptions {
    /**
     * A function that returns the initial data for the application.
     * @returns The initial data for the application.
     */
    data: () => unknown;

    /**
     * A dictionary of computed properties for the application.
     * Each key is the name of the computed property, and the value is either:
     *  - a getter function that computes its value (read-only computed), or
     *  - an object `{ get, set }` that exposes both a getter and a setter (writable computed).
     *
     * Writable computed properties allow expressions like `v-model="myComputed"` to assign through
     * the `set` function, while reads still go through `get`.
     */
    computed?: {
        [key: string]: VComputedDefinition;
    };

    /**
     * A dictionary of methods for the application.
     * Each key is the name of the method, and the value is a function that implements the method.
     */
    methods?: {
        [key: string]: (...args: unknown[]) => unknown;
    };

    /**
     * A dictionary of watchers for the application.
     * Each key is a property path to watch (e.g., "count", "user.name"),
     * and the value is either a callback function or an options object with handler, deep, and immediate properties.
     */
    watch?: WatcherDictionary;

    /**
     * The log level for the application.
     * This property determines the verbosity of logging output.
     * If not specified, the default log level will be used.
     */
    logLevel?: LogLevel;
}
