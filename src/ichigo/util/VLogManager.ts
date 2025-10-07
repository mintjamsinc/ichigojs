// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VLogger } from "./VLogger";
import { LogLevel } from "./LogLevel";

/**
 * Manages loggers and their log levels.
 */
export class VLogManager {
    /** The current log level. */
    #logLevel: LogLevel;
    /** A map of logger instances by name. */
    #loggers: Map<string, VLogger> = new Map<string, VLogger>();

    constructor(logLevel: LogLevel = LogLevel.INFO) {
        this.#logLevel = logLevel;
    }

    /**
     * Sets the log level for all loggers.
     * @param level The log level to set.
     */
    set logLevel(level: LogLevel) {
        this.#logLevel = level;
    }

    /**
     * Gets the current log level.
     */
    get logLevel(): LogLevel {
        return this.#logLevel;
    }

    /**
     * Gets a logger by name, creating it if it doesn't exist.
     * @param name The name of the logger.
     * @returns The logger instance.
     */
    getLogger(name: string): VLogger {
        if (this.#loggers.has(name)) {
            return this.#loggers.get(name)!;
        }

        const logger = new VLogger(name, this);
        this.#loggers.set(name, logger);
        return logger;
    }
}
