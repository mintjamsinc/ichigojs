// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { LogLevel } from "./LogLevel";
import { VLogManager } from "./VLogManager";

/**
 * A simple logger class for virtual applications.
 */
export class VLogger {
    /** The name of the logger. */
    #name: string;
    /** The log manager instance. */
    #logManager: VLogManager;

    constructor(name: string, logManager: VLogManager) {
        this.#name = name;
        this.#logManager = logManager;
    }

    /**
     * Indicates whether the debug level is enabled.
     */
    get isDebugEnabled(): boolean {
        return [LogLevel.DEBUG].includes(this.#logManager.logLevel);
    }

    /**
     * Indicates whether the info level is enabled.
     */
    get isInfoEnabled(): boolean {
        return [LogLevel.DEBUG, LogLevel.INFO].includes(this.#logManager.logLevel);
    }

    /**
     * Indicates whether the warn level is enabled.
     */
    get isWarnEnabled(): boolean {
        return [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN].includes(this.#logManager.logLevel);
    }

    /**
     * Logs a debug message.
     * @param message The message to log.
     */
    debug(message: string): void {
		if (!this.isDebugEnabled) {
			return;
		}

        console.debug(`[${this.#name}] ${LogLevel.DEBUG}: ${message}`);
    }

    /**
     * Logs an info message.
     * @param message The message to log.
     */
    info(message: string): void {
        if (!this.isInfoEnabled) {
            return;
        }

        console.info(`[${this.#name}] ${LogLevel.INFO}: ${message}`);
    }

    /**
     * Logs a warn message.
     * @param message The message to log.
     */
    warn(message: string): void {
        if (!this.isWarnEnabled) {
            return;
        }

        console.warn(`[${this.#name}] ${LogLevel.WARN}: ${message}`);
    }

    /**
     * Logs an error message.
     * @param message The message to log.
     */
    error(message: string): void {
        console.error(`[${this.#name}] ${LogLevel.ERROR}: ${message}`);
    }
}
