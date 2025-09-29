// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { LogLevel } from "./LogLevel";
import { VLogManager } from "./VLogManager";

export class VLogger {
    #name: string;
    #logManager: VLogManager;

    constructor(name: string, logManager: VLogManager) {
        this.#name = name;
        this.#logManager = logManager;
    }

    debug(message: string): void {
		if (![LogLevel.DEBUG].includes(this.#logManager.logLevel)) {
			return;
		}

        console.debug(`[${this.#name}] ${LogLevel.DEBUG}: ${message}`);
    }

    info(message: string): void {
        if (![LogLevel.DEBUG, LogLevel.INFO].includes(this.#logManager.logLevel)) {
            return;
        }

        console.info(`[${this.#name}] ${LogLevel.INFO}: ${message}`);
    }

    warn(message: string): void {
        if (![LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN].includes(this.#logManager.logLevel)) {
            return;
        }

        console.warn(`[${this.#name}] ${LogLevel.WARN}: ${message}`);
    }

    error(message: string): void {
        console.error(`[${this.#name}] ${LogLevel.ERROR}: ${message}`);
    }
}
