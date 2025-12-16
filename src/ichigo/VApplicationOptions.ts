// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { LogLevel } from "./util/LogLevel";
import { WatcherDictionary } from "./VWatcherOptions";

export interface VApplicationOptions {
    /**
     * A function that returns the initial data for the application.
     * @returns The initial data for the application.
     */
    data: () => unknown;

    /**
     * A dictionary of computed properties for the application.
     * Each key is the name of the computed property, and the value is a function that computes its value.
     */
    computed?: {
        [key: string]: () => unknown;
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
