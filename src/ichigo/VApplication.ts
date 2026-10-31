// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "./util/ExpressionUtils";
import { VLogger } from "./util/VLogger";
import { VLogManager } from "./util/VLogManager";
import { VApplicationOptions, VComputedDefinition } from "./VApplicationOptions";
import { VEmitOptions } from "./VEmitOptions";
import { VBindings } from "./VBindings";
import { VNode } from "./VNode";
import { VNodeInit } from "./VNodeInit";
import { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { IchigoElementRegistry } from "./components/IchigoElementRegistry";
import { VComponentRegistry } from "./components/VComponentRegistry";
import { ReactiveEffect } from "./util/ReactiveEffect";
import { ReactiveProxy } from "./util/ReactiveProxy";
import { VApplicationInit } from "./VApplicationInit";
import { VWatcher } from "./VWatcher";

/**
 * Represents a virtual application instance.
 */
export class VApplication {
    /**
     * The application options.
     */
    #options: VApplicationOptions;

    /**
     * The parent application, if any.
     */
    #parentApplication?: VApplication;

    /**
     * The global directive parser registry.
     */
    #directiveParserRegistry: VDirectiveParserRegistry;

    /**
     * The global component registry.
     */
    #componentRegistry: VComponentRegistry;

    /**
     * The root virtual node.
     */
    #vNode?: VNode;

    /**
     * The data bindings for the virtual application.
     */
    #bindings?: VBindings;

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
     * The effect of each computed property. What the getter reads the last time it runs is
     * what makes the property stale.
     */
    #computedEffects: Map<string, ReactiveEffect> = new Map();

    /**
     * The value of the computed property whose effect ran last.
     */
    #computedResult: unknown;

    /**
     * The watcher manager for this application.
     */
    #watcher: VWatcher;

    /**
     * Template references registered by the `ref` directive, exposed to data(), methods, and
     * expressions as `$refs` (Vue's `$refs`). Each entry is either a single Element or, for a
     * `ref` used inside `v-for`, an array of Elements.
     *
     * This object is intentionally marked raw (non-reactive): mutating it when an element mounts or
     * unmounts must never schedule a render, and it must not be used to drive reactive template
     * output — matching Vue's semantics for `$refs`. It is held as a direct field (in addition to
     * being injected as the `$refs` binding) so registration is a plain property write.
     */
    #refs: Record<string, Element | Element[]> = {};

    /**
     * Flag to indicate if an update is already scheduled.
     */
    #updateScheduled: boolean = false;

    /**
     * The nodes with something to render in the next update.
     */
    #staleNodes: Set<VNode> = new Set();

    /**
     * Whether an update is running: a node notified meanwhile joins its flush.
     */
    #updating: boolean = false;

    /**
     * What runs when the pass of the flush in progress has rendered every node in it.
     */
    #afterFlush: Array<() => void> = [];

    /**
     * How many update cycles in a row ended with changes made during the cycle (by a watcher
     * or a lifecycle hook), each of which runs another cycle. Reset when a cycle ends clean;
     * past MAX_CASCADED_UPDATES the late changes are dropped, so a watcher that writes on every
     * cycle cannot keep the application updating forever.
     */
    #cascadedUpdates: number = 0;

    static readonly #MAX_CASCADED_UPDATES = 100;

    /**
     * The custom element hosting this application when it powers a component
     * defined via defineComponent(). Set by IchigoElement before mounting.
     * Used by component-boundary features (e.g. scoped slot outlets) to reach
     * the host's captured slot templates and parent application scope.
     * Undefined for regular (non-component) applications.
     */
    #hostElement?: HTMLElement;

    /**
     * Creates an instance of the virtual application.
     * @param args The initialization arguments for the application.
     */
    constructor(args: VApplicationInit) {
        const { options, parentApplication: parentApplication, directiveParserRegistry, componentRegistry } = args;

        this.#options = options;
        this.#parentApplication = parentApplication;
        this.#directiveParserRegistry = directiveParserRegistry;
        this.#componentRegistry = componentRegistry;

        // Initialize log manager and logger
        this.#logManager = new VLogManager(options.logLevel);
        this.#logger = this.#logManager.getLogger('VApplication');

        // Analyze function dependencies
        const methods: Record<string, Function> = (options.methods || {}) as Record<string, Function>;
        this.#functionDependencies = ExpressionUtils.analyzeFunctionDependencies(methods);

        // Initialize watcher manager
        this.#watcher = new VWatcher(() => this.#scheduleUpdate(), this.#logger);

        // Initialize bindings from data, computed, and methods
        this.#initializeBindings();

        // Initialize watchers
        this.#initializeWatchers();
    }

    /**
     * Gets the parent application, if any.
     */
    get parentApplication(): VApplication | undefined {
        return this.#parentApplication;
    }

    /**
     * Indicates whether this application is the root application.
     */
    get isRoot(): boolean {
        return !this.#parentApplication;
    }

    /**
     * Gets the global directive parser registry.
     */
    get directiveParserRegistry(): VDirectiveParserRegistry {
        return this.#directiveParserRegistry;
    }

    /**
     * Gets the global component registry.
     */
    get componentRegistry(): VComponentRegistry {
        return this.#componentRegistry;
    }

    /**
     * Gets the root virtual node.
     */
    get rootVNode(): VNode | undefined {
        return this.#vNode;
    }

    /**
     * Gets the bindings for the virtual application.
     */
    get bindings(): VBindings | undefined {
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
     * Gets the template references registered via the `ref` directive (Vue's `$refs`). The same
     * object is exposed to data(), methods, and expressions as `$refs`. Non-reactive by design.
     */
    get refs(): Record<string, Element | Element[]> {
        return this.#refs;
    }

    /**
     * The custom element hosting this application when it powers a component
     * (see the #hostElement field). Undefined for regular applications.
     */
    get hostElement(): HTMLElement | undefined {
        return this.#hostElement;
    }

    set hostElement(element: HTMLElement | undefined) {
        this.#hostElement = element;
    }

    /**
     * Creates a VNode. Directives that need to build VNode trees at runtime
     * (e.g. the scoped slot outlet) call this instead of constructing VNode
     * directly, so they can keep their VNode import type-only and avoid a
     * VNode -> VDirectiveManager -> directive -> VNode module cycle.
     * @param init The initialization arguments for the virtual node.
     * @returns The created VNode.
     */
    createVNode(init: VNodeInit): VNode {
        return new VNode(init);
    }

    /**
     * Mounts the application.
     * @param target The CSS selector string or HTMLElement to mount the application to.
     * @returns This application instance, so `VDOM.createApp(...).mount('#app')`
     * can be assigned for later access (e.g. `app.bindings`, `app.unmount()`).
     */
    mount(target: string | HTMLElement): this {
        let element: Element | null;

        if (typeof target === 'string') {
            element = document.querySelector(target);
            if (!element) {
                throw new Error(`Element not found for selector: ${target}`);
            }
        } else {
            element = target;
        }

        // Clean the element by removing unnecessary whitespace text nodes
        this.#cleanElement(element as HTMLElement);

        // Create the root virtual node
        this.#vNode = new VNode({
            node: element,
            vApplication: this,
            bindings: this.#bindings
        });

        // Initial rendering. Every binding is applied, and what each one reads becomes what it
        // depends on.
        this.#vNode.forceUpdate();

        // Expand the components in the tree. Last, so every component element
        // has been compiled and has had its prop values delivered before its
        // template is cloned in. See VNode.expandComponents.
        this.#vNode.expandComponents();

        // Remove v-cloak attributes after mounting
        // v-cloak is used to hide un-compiled template until the app is ready
        // Usage: Add CSS rule "[v-cloak] { display: none; }" to hide elements with v-cloak
        (element as HTMLElement).querySelectorAll('[v-cloak]').forEach(el => {
            el.removeAttribute('v-cloak');
        });
        (element as HTMLElement).removeAttribute('v-cloak');

        this.#logger.info('Application mounted.');

        return this;
    }

    /**
     * Unmounts the application and cleans up resources.
     */
    unmount(): void {
        if (this.#vNode) {
            this.#vNode.destroy();
            this.#vNode = undefined;
        }
        this.#staleNodes.clear();
        this.#computedEffects.forEach(effect => effect.stop());
        this.#computedEffects.clear();
        this.#watcher.clear();
        this.#logger.info('Application unmounted.');
    }

    /**
     * Creates a child application instance with the same registries.
     * @param options The application options for the child.
     * @returns The created child application instance.
     */
    createChildApp(options: VApplicationOptions): VApplication {
        return new VApplication({
            options,
            parentApplication: this,
            directiveParserRegistry: this.#directiveParserRegistry,
            componentRegistry: this.#componentRegistry
        });
    }

    /**
     * Cleans the element by removing unnecessary whitespace text nodes.
     * @param element The element to clean.
     */
    #cleanElement(element: HTMLElement): void {
        let buffer: Text | null = null;

        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node as Text;
                if (/^[\s\n\r\t]*$/.test(text.nodeValue || '')) {
                    element.removeChild(text);
                } else {
                    if (buffer) {
                        buffer.nodeValue += text.nodeValue || '';
                        element.removeChild(text);
                    } else {
                        buffer = text;
                    }
                }
            } else {
                buffer = null;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const child = node as HTMLElement;
                    // Do not clean inside an expanded component: its DOM belongs
                    // to the component's own application, and removing rendered
                    // (possibly empty) text nodes would detach them from that
                    // application's virtual nodes, freezing its output.
                    if (IchigoElementRegistry.has(child.tagName) && (child as any)._ichigoExpanded === true) {
                        continue;
                    }
                    this.#cleanElement(child);
                }
            }
        }
    }

    /**
     * Extracts the getter function from a computed property definition.
     * Supports both bare function form and { get, set } object form.
     */
    static #getComputedGetter(def: VComputedDefinition): () => unknown {
        if (typeof def === 'function') {
            return def;
        }
        return def.get;
    }

    /**
     * Extracts the setter function from a computed property definition, if any.
     * Returns undefined for read-only (function-form) computed properties.
     */
    static #getComputedSetter(def: VComputedDefinition): ((value: any) => void) | undefined {
        if (typeof def === 'function') {
            return undefined;
        }
        return def.set;
    }

    /**
     * Registers a template reference under the given name. Called by the `ref` directive during the
     * mount phase. When {@param asArray} is true (the element lives inside a `v-for`), references
     * accumulate into an array in registration order; otherwise the name holds a single element.
     *
     * Mutates the raw (non-reactive) `$refs` object directly, so this never schedules a render.
     *
     * @param name The ref name.
     * @param element The element (or component host element) to register.
     * @param asArray Whether to collect into an array (refs used inside a v-for).
     */
    registerRef(name: string, element: Element, asArray: boolean): void {
        if (asArray) {
            const current = this.#refs[name];
            if (Array.isArray(current)) {
                if (!current.includes(element)) {
                    current.push(element);
                }
            } else {
                this.#refs[name] = [element];
            }
            return;
        }

        this.#refs[name] = element;
    }

    /**
     * Removes a template reference registered under the given name. Called by the `ref` directive
     * during the unmount phase. The removal is identity-safe: an entry is only cleared when it still
     * points at {@param element}, so a newly mounted element that reused the name is never clobbered
     * by the teardown of the element it replaced.
     *
     * @param name The ref name.
     * @param element The element whose registration should be removed.
     */
    unregisterRef(name: string, element: Element): void {
        const current = this.#refs[name];
        if (Array.isArray(current)) {
            const index = current.indexOf(element);
            if (index !== -1) {
                current.splice(index, 1);
            }
            if (current.length === 0) {
                delete this.#refs[name];
            }
        } else if (current === element) {
            delete this.#refs[name];
        }
    }

    /**
     * Initializes bindings from data, computed properties, and methods.
     * @returns The initialized bindings object.
     */
    #initializeBindings(): void {
        // Create bindings with change tracking
        this.#bindings = new VBindings({
            vApplication: this
        });

        // Inject utility methods into bindings
        this.#bindings.set('$nextTick', (callback: () => void) => this.#nextTick(callback));
        this.#bindings.set('$markRaw', <T extends object>(obj: T) => ReactiveProxy.markRaw(obj));
        this.#bindings.set('$emit', (name: string, detail?: any, options?: VEmitOptions) => this.#emit(name, detail, options));

        // Inject the (non-reactive) $refs container. Marking it raw prevents VBindings from wrapping
        // it in a reactive proxy, so populating it from the ref directive never schedules a render.
        ReactiveProxy.markRaw(this.#refs);
        this.#bindings.set('$refs', this.#refs);

        // Add methods
        if (this.#options.methods) {
            for (const [key, method] of Object.entries(this.#options.methods)) {
                if (typeof method !== 'function') {
                    this.#logger.warn(`Method '${key}' is not a function and will be ignored.`);
                    continue;
                }

                // Bind the method to the raw bindings object to ensure 'this' refers to bindings
                // This allows methods to access and modify bindings properties via 'this'
                this.#bindings.set(key, method.bind(this.#bindings.raw));
            }
        }

        // Add data properties
        if (this.#options.data) {
            // Create a $ctx context object with utility functions for data()
            // This provides the same $markRaw access as in lifecycle hooks (@mount, etc.)
            const $ctx = {
                $markRaw: <T extends object>(obj: T) => ReactiveProxy.markRaw(obj)
            };

            // Call data() with $ctx as 'this'
            const data = this.#options.data.call($ctx);
            if (data && typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    this.#bindings.set(key, value);
                }
            }
        }

        // Register setters for writable computed properties so that assignments to them
        // (e.g. via v-model or direct mutation through bindings.raw) route through the user-provided
        // setter, which typically writes back to underlying reactive properties.
        if (this.#options.computed) {
            for (const [key, def] of Object.entries(this.#options.computed)) {
                const setter = VApplication.#getComputedSetter(def);
                if (setter) {
                    const bindings = this.#bindings;
                    this.#bindings.registerWritableComputed(key, (value: any) => {
                        setter.call(bindings.raw, value);
                    });
                }
            }
        }

        // Register computed properties for pull-based (lazy) evaluation. Each computed is
        // recomputed on first access after being marked dirty, rather than eagerly in the update
        // microtask. We mark them all dirty and resolve once here so that initial values are
        // cached and recorded as changes for the first render.
        if (this.#options.computed) {
            for (const key of Object.keys(this.#options.computed)) {
                this.#bindings.registerComputed(key, () => this.#recomputeOne(key));
                this.#bindings.markComputedDirty(key);
            }
        }
        this.#flushDirtyComputeds();
    }

    /**
     * Initializes watchers from the watch option.
     */
    #initializeWatchers(): void {
        if (!this.#options.watch || !this.#bindings) {
            return;
        }

        for (const [path, definition] of Object.entries(this.#options.watch)) {
            this.#watcher.register(
                path,
                definition,
                (p) => this.#getValueByPath(p)
            );
        }
    }

    /**
     * Gets a value from bindings by a dot-notation path.
     * @param path The property path (e.g., "user.name", "items[0]").
     * @returns The value at the path, or undefined if not found.
     */
    #getValueByPath(path: string): any {
        if (!this.#bindings) {
            return undefined;
        }

        // Split path into segments, handling both dot notation and bracket notation
        const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let value: any = this.#bindings.raw;

        for (const segment of segments) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[segment];
        }

        return value;
    }

    /**
     * Schedules a DOM update in the next microtask.
     * Multiple calls within the same event loop will be batched into a single update.
     */
    #scheduleUpdate(): void {
        if (this.#updateScheduled) {
            return;
        }

        this.#updateScheduled = true;
        queueMicrotask(() => {
            // Cleared before the update runs, not after: a change made during the update (by a
            // watcher or a lifecycle hook) then schedules the next cycle instead of being dropped.
            this.#updateScheduled = false;
            this.#update();
        });
    }

    /**
     * Adds a node to the next update.
     * @param vNode The node with something to render.
     */
    enqueue(vNode: VNode): void {
        this.#staleNodes.add(vNode);
        if (!this.#updating) {
            this.#scheduleUpdate();
        }
    }

    /**
     * Runs a function when the current pass of the flush has rendered every node in it.
     * @param callback The function to run.
     */
    afterFlush(callback: () => void): void {
        this.#afterFlush.push(callback);
    }

    /**
     * Executes an immediate DOM update.
     */
    #update(): void {
        this.#updating = true;
        try {
            // Resolve any computed properties still marked dirty (those not already pulled by a
            // synchronous read) so that what they notify is complete before watchers run.
            this.#flushDirtyComputeds();

            if (this.#bindings) {
                this.#watcher.notify(this.#bindings.raw);

                // A watcher may have written data. Resolve the computed properties that depend
                // on it now, so this render already shows what the watcher did.
                this.#flushDirtyComputeds();
            }

            // Update the DOM
            this.#flushStaleNodes();
        } finally {
            this.#updating = false;
        }

        // A watcher or a lifecycle hook that wrote during the cycle has scheduled the next
        // one. Past the limit the late work is dropped, so a watcher that writes on every
        // cycle cannot keep the application updating forever.
        if (!this.#updateScheduled) {
            this.#cascadedUpdates = 0;
            return;
        }
        this.#cascadedUpdates++;
        if (this.#cascadedUpdates > VApplication.#MAX_CASCADED_UPDATES) {
            this.#logger.warn(`Update cycle did not settle after ${VApplication.#MAX_CASCADED_UPDATES} cascaded updates; dropping changes: ${this.#watcher.pendingPaths.join(', ')}`);
            this.#watcher.dropPending();
            this.#staleNodes.clear();
            this.#cascadedUpdates = 0;
        }
    }

    /**
     * Renders the stale nodes in creation order, parents before what they contain. Rendering
     * can make more nodes stale (a v-for rebinding a row): they are rendered in the same
     * update, up to a limit against bindings that keep writing what each other reads.
     */
    #flushStaleNodes(): void {
        for (let pass = 0; this.#staleNodes.size > 0; pass++) {
            if (pass === VApplication.#MAX_CASCADED_UPDATES) {
                this.#logger.warn(`Rendering did not settle after ${pass} passes.`);
                this.#staleNodes.clear();
                break;
            }
            const nodes = [...this.#staleNodes].sort((a, b) => a.order - b.order);
            this.#staleNodes.clear();
            for (const vNode of nodes) {
                vNode.flush();
            }
            const callbacks = this.#afterFlush;
            this.#afterFlush = [];
            for (const callback of callbacks) {
                callback();
            }
        }
    }

    /**
     * Forces resolution of all computed properties currently marked dirty, so that the ones whose
     * value changed have notified what reads them before watchers run and the DOM renders. Computeds that
     * were already pulled by a synchronous read earlier in the cycle are no longer dirty and are
     * skipped, so each computed is recomputed at most once per update cycle.
     */
    #flushDirtyComputeds(): void {
        this.#bindings?.flushDirtyComputeds();
    }

    /**
     * Recomputes a single computed property and updates its cached value. Registered with the
     * bindings as the pull-based recompute callback, so it runs lazily the first time the property
     * is read after being marked dirty (or during the pre-render flush). Computed→computed chains
     * resolve naturally and order-independently: reading a dependent computed inside the getter
     * triggers its own lazy resolution through the bindings proxy.
     *
     * When the value actually changes, the computed name is recorded as a change so that
     * dependency-precise DOM updates and watcher notifications still fire, and the source-path
     * mapping is refreshed so nested changes to the underlying object map back to the computed.
     * @param key The computed property name.
     */
    #recomputeOne(key: string): void {
        if (!this.#options.computed || !this.#bindings) {
            return;
        }

        const def = this.#options.computed[key];
        if (!def) {
            return;
        }

        const computedFn = VApplication.#getComputedGetter(def);
        const bindings = this.#bindings;
        try {
            // Read the previous value without triggering re-resolution, for change detection.
            const oldValue = bindings.peekComputed(key);

            // What the getter reads replaces what it read before: the reads can differ from
            // run to run (a branch, a dynamic key). A getter that throws keeps what it read
            // before failing, so a change to that retries it.
            let effect = this.#computedEffects.get(key);
            if (!effect) {
                effect = new ReactiveEffect(() => {
                    this.#computedResult = computedFn.call(bindings.raw);
                }, () => this.#invalidateComputed(key), true);
                this.#computedEffects.set(key, effect);
            }
            effect.run();
            const newValue = this.#computedResult;

            // Cache the value silently so the read returns it without re-triggering reactivity.
            bindings.setSilent(key, newValue);

            // Only a value that changed reaches what renders the property. Compared as cached,
            // where an object is its reactive proxy.
            if (bindings.peekComputed(key) !== oldValue) {
                bindings.markChanged(key);
            }
        } catch (error) {
            this.#logger.error(`Error evaluating computed property '${key}': ${error}`);
        }
    }

    /**
     * Marks a computed property stale when something its getter read has changed. The actual
     * recomputation is deferred until the value is read, or to the next update.
     * @param key The computed property name.
     */
    #invalidateComputed(key: string): void {
        if (!this.#bindings || this.#bindings.isComputedDirty(key)) {
            return;
        }
        this.#bindings.markComputedDirty(key);
        this.#scheduleUpdate();
    }

    /**
     * Dispatches a CustomEvent, providing the framework-level `$emit` available in expressions
     * and methods. By default the event is dispatched on the application root element with
     * `bubbles: true`, so a parent component can listen for it via `v-on` / `@` on the component
     * tag (the root is rendered inside the host custom element, so the event bubbles out of it).
     *
     * The dispatch target can be overridden via `options.target` (e.g. `document` / `window`) to
     * use a global event bus, interoperating with native `addEventListener` listeners.
     *
     * @param name The event name (e.g. "selected"). Listened to as `@selected` on the parent side.
     * @param detail The payload exposed as `event.detail`.
     * @param options Dispatch options (bubbles, cancelable, composed, target).
     * @returns The result of dispatchEvent: false if a listener called preventDefault(), otherwise true.
     */
    #emit(name: string, detail?: any, options?: VEmitOptions): boolean {
        // Documentation/validation only: warn when emitting an event not declared in `emits`.
        // `update:*` events are the component v-model convention and are always allowed.
        if (this.#options.emits && !name.startsWith('update:') && !this.#options.emits.includes(name)) {
            this.#logger.warn(`Event '${name}' is emitted but not declared in the 'emits' option.`);
        }

        const target: EventTarget | undefined = options?.target ?? (this.#vNode?.node as EventTarget | undefined);
        if (!target) {
            this.#logger.warn(`$emit('${name}') was called before the application was mounted; the event was not dispatched.`);
            return false;
        }

        const event = new CustomEvent(name, {
            detail,
            bubbles: options?.bubbles ?? true,
            cancelable: options?.cancelable ?? true,
            composed: options?.composed ?? false,
        });
        return target.dispatchEvent(event);
    }

    /**
     * Executes a callback after the next DOM update.
     * @param callback The callback to execute.
     */
    #nextTick(callback: () => void): void {
        if (this.#updateScheduled) {
            queueMicrotask(() => {
                queueMicrotask(callback);
            });
        } else {
            queueMicrotask(callback);
        }
    }
}
