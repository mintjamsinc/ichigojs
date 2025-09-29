// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VLogger } from "./VLogger";
import { LogLevel } from "./LogLevel";

export class VLogManager {
    #logLevel: LogLevel;
    #loggers: Map<string, VLogger> = new Map<string, VLogger>();

    constructor(logLevel: LogLevel = LogLevel.INFO) {
        this.#logLevel = logLevel;
    }

    set logLevel(level: LogLevel) {
        this.#logLevel = level;
    }

    get logLevel(): LogLevel {
        return this.#logLevel;
    }

    getLogger(name: string): VLogger {
        if (this.#loggers.has(name)) {
            return this.#loggers.get(name)!;
        }

        const logger = new VLogger(name, this);
        this.#loggers.set(name, logger);
        return logger;
    }
}
