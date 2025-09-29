// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions } from "./VApplicationOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";

/**
 * Represents a virtual application instance.
 */
export class VApplication {
    /**
     * The root virtual node.
     */
    #vNode: VNode;

    /**
     * The application options.
     */
    #options: VApplicationOptions;

    /**
     * The data bindings for the virtual application.
     */
    #bindings: VBindings;

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
     * Creates an instance of the virtual application.
     * @param element The root HTML element for the application.
     * @param options The application options.
     */
    constructor(element: HTMLElement, options: VApplicationOptions) {
        this.#options = options;
        this.#logManager = new VLogManager(options.logLevel);
        this.#logger = this.#logManager.getLogger('VApplication');
        this.#functionDependencies = ExpressionUtils.analyzeFunctionDependencies(options.methods || {});

        // FIXME: Initialize bindings properly
        this.#bindings = {};

        // Create the root virtual node
        this.#vNode = new VNode({
            node: element,
            vApplication: this,
            bindings: this.#bindings
        });
    }

    /**
     * Gets the root virtual node.
     */
    get rootVNode(): VNode {
        return this.#vNode;
    }

    /**
     * Gets the bindings for the virtual application.
     */
    get bindings(): VBindings {
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
     */
    mount(): void {
        this.#logger.info('Application mounted.');
    }
}
