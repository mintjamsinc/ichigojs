// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveProxy } from "./util/ReactiveProxy";
import { VLogger } from "./util/VLogger";
import { VBindingsInit } from "./VBindingsInit";

/**
 * A dictionary representing bindings for a virtual node.
 * The key is the binding name, and the value is the binding value.
 * Supports hierarchical lookup through parent bindings.
 */
export class VBindings {
	/**
	 * The parent bindings, if any.
	 */
	#parent?: VBindings;

	/**
	 * The key is the binding name, and the value is the binding value.
	 */
	#local: Record<string, any>;

	/**
	 * The change tracker, if any.
	 */
	#onChange?: (identifier: string) => void;

	/**
	 * The logger instance.
	 */
	#logger?: VLogger;

	/**
	 * The set of changed identifiers.
	 */
	#changes: Set<string> = new Set();

	/**
	 * On the root bindings: every descendant scope (a v-for row, a component) that
	 * recorded a change since the last clearChanges(). The root clears their change
	 * sets together with its own at the end of the update cycle, so a loop variable
	 * set when a row was created does not count as changed in every later cycle.
	 */
	#dirtyScopes?: Set<VBindings>;

	/**
	 * Cache for array lengths to detect length changes when the same object reference is used.
	 */
	#lengthCache: Map<string, number> = new Map();

	/**
	 * Flag to suppress onChange callbacks temporarily.
	 */
	#suppressOnChange: boolean = false;

	/**
	 * Flag forcing the next write through the `set` trap to stay in THIS scope's own
	 * local store instead of walking up to an inherited binding of the same name.
	 * Set only by {@link setLocal} for scope-local variables (e.g. v-for loop items),
	 * which must shadow — never overwrite — a parent binding with the same key.
	 */
	#localWrite: boolean = false;

	/**
	 * Per-instance path aliases. Maps local variable names to their reactive source paths.
	 * Scoped here instead of the global ReactiveProxy map so that v-for items each maintain
	 * their own alias (e.g. "file" -> "files[0]") without overwriting each other.
	 */
	#localAliases: Map<string, string> = new Map();

	/**
	 * Setters for writable computed properties. When a key registered here is assigned
	 * through the bindings proxy (e.g. via v-model or `bindings.set`), the setter is invoked
	 * instead of writing directly to the local store. The cached value of the computed property
	 * is updated by the recompute cycle through `setSilent`, which bypasses this routing.
	 */
	#writableComputeds: Map<string, (value: any) => void> = new Map();

	/**
	 * Unsubscribe handles for external reactive proxies received as binding values
	 * (typically component props). Each entry keeps the child bindings notified when
	 * nested properties of a shared object change even though the prop reference itself
	 * stays the same. The previous subscription is released whenever the binding value
	 * is replaced, the binding is set to null/undefined, or the bindings are destroyed.
	 */
	#externalSubscriptions: Map<string, () => void> = new Map();

	/**
	 * Recompute callbacks for computed properties registered on these bindings.
	 * Maps a computed property name to a function that recomputes and caches its value.
	 * Only the bindings instance that owns the computed (typically the root) holds an entry;
	 * child bindings resolve computed reads by delegating to their parent through the proxy.
	 */
	#computedRecomputers: Map<string, () => void> = new Map();

	/**
	 * The set of computed properties whose cached value is stale and must be recomputed on next
	 * access (pull-based evaluation). Populated by markComputedDirty when a dependency changes,
	 * and cleared as each computed is resolved.
	 */
	#dirtyComputeds: Set<string> = new Set();

	/**
	 * Guard set used to detect re-entrant (circular) computed resolution. While a computed is
	 * being recomputed its name is held here; a nested read of the same computed returns the
	 * currently cached (stale) value instead of recursing infinitely.
	 */
	#resolvingComputeds: Set<string> = new Set();

	/**
	 * The plain backing object behind the #local proxy. Kept as a direct reference so the cached
	 * value of a computed property can be read without triggering pull-based re-evaluation
	 * (see peekComputed).
	 */
	#store: Record<string, any> = {};

	/**
	 * Creates a new instance of VBindings.
	 * @param parent The parent bindings, if any.
	 */
	constructor(args: VBindingsInit = {}) {
		this.#parent = args.parent;
		this.#onChange = args.onChange;
		this.#logger = args.vApplication?.logManager.getLogger('VBindings');
		if (this.#logger?.isDebugEnabled) {
			this.#logger.debug(`VBindings created. Parent: ${this.#parent ? 'yes' : 'no'}`);
		}

		this.#local = new Proxy(this.#store, {
			get: (obj, key) => {
				// Pull-based evaluation: if this key is a dirty computed property, recompute it now
				// so the read returns a fresh value (synchronously, even before the update microtask).
				if (typeof key === 'string') {
					this.#resolveComputedIfDirty(key);
				}
				if (Reflect.has(obj, key)) {
					const value = Reflect.get(obj, key);
					// Record the read for a computed property or expression being tracked
					// (see ReactiveProxy.track). Methods are behaviour, not data; a binding of a
					// parent scope is recorded by the parent's own trap.
					if (typeof key === 'string' && typeof value !== 'function') {
						ReactiveProxy.recordRead(key);
					}
					return value;
				}
				return this.#parent?.raw[key as string];
			},
			set: (obj, key, value) => {
				// If this key is a writable computed, route the assignment through its setter.
				// `setSilent` (used to update the cached value during recompute) sets `suppressOnChange`,
				// which bypasses this routing so the cached value can be written directly.
				if (!this.#suppressOnChange && this.#writableComputeds.has(key as string)) {
					const setter = this.#writableComputeds.get(key as string)!;
					setter(value);
					return true;
				}

				// For a key that is not local to this scope, an assignment normally
				// retargets to the nearest parent that owns it, so reassignments
				// (e.g. `count = count + 1` in a handler) mutate the original binding.
				// A scope-local write (setLocal — used for v-for loop variables) skips
				// this walk so the variable shadows, never clobbers, an inherited key.
				let target = obj;
				if (!this.#localWrite && !Reflect.has(target, key)) {
					for (let parent = this.#parent; parent; parent = parent.#parent) {
						if (Reflect.has(parent.#local, key)) {
							target = parent.#local;
							break;
						}
					}
				}

				let newValue = value;
				let receivedExternalProxy = false;
				if (typeof value === 'object' && value !== null) {
					// Check if the value already has a path (it's an existing reactive proxy reference)
					const existingPath = ReactiveProxy.getPath(value);
					if (existingPath) {
						// Register a path alias so changes to the source path will match this identifier
						this.#localAliases.set(key as string, existingPath);
						this.#logger?.debug(`Path alias registered: ${key as string} -> ${existingPath}`);
						// Keep the existing proxy as-is to preserve reactivity chain
						newValue = value;
						receivedExternalProxy = true;
					} else {
						// Before wrapping, check if any properties are existing ReactiveProxies
						// and register path aliases for them
						if (!Array.isArray(value)) {
							for (const propKey of Object.keys(value)) {
								const propValue = value[propKey];
								if (typeof propValue === 'object' && propValue !== null) {
									const propPath = ReactiveProxy.getPath(propValue);
									if (propPath) {
										// Register alias: key.propKey -> propPath
										this.#localAliases.set(`${key as string}.${propKey}`, propPath);
										this.#logger?.debug(`Property path alias registered: ${key as string}.${propKey} -> ${propPath}`);
									}
								}
							}
						}

						// Wrap objects/arrays with reactive proxy, tracking the root key
						newValue = ReactiveProxy.create(value, (changedPath) => {
							let path = '';
							for (const part of changedPath?.split('.') || []) {
								path = path ? `${path}.${part}` : part;
								this.#logger?.debug(`Binding changed: ${path}`);
								this.#addChange(path);
							}
							if (!this.#suppressOnChange) {
								this.#onChange?.(changedPath as string);
							}
						}, key as string);
					}
				} else if (value === null || value === undefined) {
					// When setting to null/undefined, remove local aliases for this key and nested paths
					for (const aliasKey of [...this.#localAliases.keys()]) {
						if (aliasKey === (key as string) ||
							aliasKey.startsWith((key as string) + ".") ||
							aliasKey.startsWith((key as string) + "[")) {
							this.#localAliases.delete(aliasKey);
						}
					}
				}

				const oldValue = Reflect.get(target, key);
				const result = Reflect.set(target, key, newValue);

				// Manage external subscription to a reactive proxy received as the value.
				// When the reference changes, drop the previous subscription. When a new
				// reactive proxy is installed, subscribe so nested changes propagate to
				// this bindings instance even though the proxy reference itself is stable.
				if (oldValue !== newValue) {
					const prevUnsubscribe = this.#externalSubscriptions.get(key as string);
					if (prevUnsubscribe) {
						prevUnsubscribe();
						this.#externalSubscriptions.delete(key as string);
					}
				}
				if (receivedExternalProxy && !this.#externalSubscriptions.has(key as string)) {
					const unsubscribe = ReactiveProxy.subscribe(newValue, (changedPath?: string) => {
						if (!changedPath) {
							return;
						}
						let path = '';
						for (const part of changedPath.split('.')) {
							path = path ? `${path}.${part}` : part;
							this.#logger?.debug(`Binding changed (external): ${path}`);
							this.#addChange(path);
						}
						if (!this.#suppressOnChange) {
							this.#onChange?.(changedPath);
						}
					});
					this.#externalSubscriptions.set(key as string, unsubscribe);
				}

				// Detect changes
				let hasChanged = oldValue !== newValue;

				// Special handling for arrays: check length changes even if same object reference
				if (Array.isArray(newValue)) {
					const cachedLength = this.#lengthCache.get(key as string);
					const currentLength = newValue.length;
					if (!hasChanged && cachedLength !== undefined && cachedLength !== currentLength) {
						hasChanged = true;
					}
					this.#lengthCache.set(key as string, currentLength);
				}

				if (hasChanged) {
					if (this.#logger?.isDebugEnabled) {
						const oldValueString = typeof oldValue === 'string' ? `"${oldValue}"` : JSON.stringify(oldValue) || 'undefined';
						const newValueString = typeof newValue === 'string' ? `"${newValue}"` : JSON.stringify(newValue) || 'undefined';
						const oldValuePreview = oldValueString.length > 100 ? `${oldValueString.substring(0, 100)}...` : oldValueString;
						const newValuePreview = newValueString.length > 100 ? `${newValueString.substring(0, 100)}...` : newValueString;
						this.#logger.debug(`Binding set on ${target === obj ? 'local' : 'parent'}: ${key as string}: ${oldValuePreview} -> ${newValuePreview}`);
					}
					this.#addChange(key as string);
					if (!this.#suppressOnChange) {
						this.#onChange?.(key as string);
					}
				}
				return result;
			},
			deleteProperty: (obj, key) => {
				const result = Reflect.deleteProperty(obj, key);
				const prevUnsubscribe = this.#externalSubscriptions.get(key as string);
				if (prevUnsubscribe) {
					prevUnsubscribe();
					this.#externalSubscriptions.delete(key as string);
				}
				this.#logger?.debug(`Binding deleted: ${key as string}`);
				this.#addChange(key as string);
				this.#onChange?.(key as string);
				return result;
			}
		});
	}

	/**
	 * Gets the raw bindings.
	 * If a key is not found locally, it searches parent bindings recursively.
	 */
	get raw(): Record<string, any> {
		return this.#local;
	}

	/**
	 * Indicates whether there are any changed identifiers.
	 */
	get hasChanges(): boolean {
		if (this.#parent?.hasChanges) {
			return true;
		}
		return this.#changes.size > 0;
	}

	/**
	 * Gets the list of changed identifiers.
	 */
	get changes(): string[] {
		const changes = new Set(this.#parent?.changes || []);
		this.#changes.forEach(id => changes.add(id));
		return Array.from(changes);
	}

	/**
	 * Indicates whether this is the root bindings (i.e., has no parent).
	 */
	get isRoot(): boolean {
		return !this.#parent;
	}

	/**
	 * Clears the set of changed identifiers.
	 */
	clearChanges(): void {
		this.#changes.clear();
		this.#changeLog.length = 0;
		if (this.#dirtyScopes) {
			for (const scope of this.#dirtyScopes) {
				scope.#changes.clear();
			}
			this.#dirtyScopes.clear();
		}
	}

	/**
	 * Records a changed identifier on this scope and, for a non-root scope, registers the
	 * scope with the root so that the change is cleared at the end of the update cycle.
	 */
	#addChange(key: string): void {
		this.#changes.add(key);
		let root: VBindings = this;
		while (root.#parent) {
			root = root.#parent;
		}
		root.#changeLog.push(key);
		if (root !== this) {
			(root.#dirtyScopes ??= new Set()).add(this);
		}
	}

	/**
	 * Every change recorded since the last clearChanges(), in order and with repeats, on the
	 * root; the change set itself cannot tell a write made during an update cycle from the one
	 * the cycle was scheduled for when both touch the same identifier.
	 */
	#changeLog: string[] = [];

	/**
	 * A marker for {@link changesSince}: the number of changes recorded so far.
	 */
	get changeLogLength(): number {
		return this.#root.#changeLog.length;
	}

	/**
	 * The distinct identifiers recorded after the marker was taken.
	 */
	changesSince(marker: number): string[] {
		return Array.from(new Set(this.#root.#changeLog.slice(marker)));
	}

	get #root(): VBindings {
		let root: VBindings = this;
		while (root.#parent) {
			root = root.#parent;
		}
		return root;
	}

	/**
	 * Sets a binding value.
	 * @param key The binding name.
	 * @param value The binding value.
	 */
	set(key: string, value: any): void {
		this.#local[key] = value;
	}

	/**
	 * Sets a binding value in THIS scope's own local store, without walking up to a
	 * parent scope. Used for scope-local variables (e.g. v-for loop items) that must
	 * shadow — never overwrite — an inherited binding of the same name. Contrast with
	 * {@link set}, which retargets a write of an inherited key to the owning parent so
	 * that reassignments mutate the original; a loop variable named like a root data /
	 * method / computed key (e.g. `t`) would otherwise clobber it.
	 * @param key The binding name.
	 * @param value The binding value.
	 */
	setLocal(key: string, value: any): void {
		this.#localWrite = true;
		try {
			this.#local[key] = value;
		} finally {
			this.#localWrite = false;
		}
	}

	/**
	 * Gets a binding value.
	 * @param key The binding name.
	 * @returns The binding value, or undefined if not found.
	 */
	get(key: string): any {
		return this.#local[key];
	}

	/**
	 * Checks if a binding exists.
	 * @param key The binding name.
	 * @param recursive Whether to search parent bindings. Default is true.
	 * @returns True if the binding exists, false otherwise.
	 */
	has(key: string, recursive: boolean = true): boolean {
		if (key in this.#local) {
			return true;
		}

		if (!recursive) {
			return false;
		}

		return this.#parent?.has(key) ?? false;
	}

	/**
	 * Removes a local binding.
	 * @param key The binding name.
	 */
	remove(key: string): void {
		delete this.#local[key];
	}

	/**
	 * Releases all external proxy subscriptions held by these bindings.
	 * Should be called when the owning application is unmounted so the parent
	 * application's reactive objects do not keep references to listener closures
	 * (and through them, this bindings instance) alive.
	 */
	destroy(): void {
		for (const unsubscribe of this.#externalSubscriptions.values()) {
			unsubscribe();
		}
		this.#externalSubscriptions.clear();
	}

	/**
	 * Sets a binding value without triggering onChange callback.
	 * This is useful for internal updates that shouldn't trigger reactivity.
	 * @param key The binding name.
	 * @param value The binding value.
	 */
	setSilent(key: string, value: any): void {
		this.#suppressOnChange = true;
		try {
			this.#local[key] = value;
		} finally {
			this.#suppressOnChange = false;
		}
	}

	/**
	 * Registers a setter for a writable computed property. When the given key is assigned
	 * through the bindings proxy, the setter will be invoked instead of writing directly to
	 * the local store.
	 * @param key The computed property name.
	 * @param setter The setter function to invoke on assignment.
	 */
	registerWritableComputed(key: string, setter: (value: any) => void): void {
		this.#writableComputeds.set(key, setter);
	}

	/**
	 * Registers a computed property for pull-based (lazy) evaluation. The provided recompute
	 * callback is invoked the first time the property is read after it has been marked dirty
	 * (or during the pre-render flush), and is expected to update the cached value (typically
	 * via setSilent).
	 * @param key The computed property name.
	 * @param recompute The callback that recomputes and caches the property's value.
	 */
	registerComputed(key: string, recompute: () => void): void {
		this.#computedRecomputers.set(key, recompute);
	}

	/**
	 * Marks a computed property as dirty so it will be recomputed on next access.
	 * @param key The computed property name.
	 */
	markComputedDirty(key: string): void {
		this.#dirtyComputeds.add(key);
	}

	/**
	 * Indicates whether a computed property is marked dirty and not yet recomputed.
	 * @param key The computed property name.
	 */
	isComputedDirty(key: string): boolean {
		return this.#dirtyComputeds.has(key);
	}

	/**
	 * Reads the currently cached value of a computed property without triggering pull-based
	 * re-evaluation. Used by the recompute routine to obtain the previous value for change
	 * detection. Falls back to the parent bindings when the key is not stored locally.
	 * @param key The computed property name.
	 * @returns The cached value, or undefined if not cached.
	 */
	peekComputed(key: string): any {
		if (Object.prototype.hasOwnProperty.call(this.#store, key)) {
			return this.#store[key];
		}
		return this.#parent?.peekComputed(key);
	}

	/**
	 * Forces resolution of every computed property currently marked dirty. Called before the DOM
	 * diff and watcher notification so that the set of changed identifiers is complete.
	 */
	flushDirtyComputeds(): void {
		for (const key of [...this.#dirtyComputeds]) {
			this.#resolveComputedIfDirty(key);
		}
	}

	/**
	 * Resolves a computed property if its cached value is dirty (pull-based evaluation), by
	 * invoking its registered recompute callback. Computed→computed chains resolve naturally:
	 * reading another computed inside the getter re-enters this method for that key. Re-entrant
	 * resolution of the same key (a circular dependency) is detected and short-circuited, leaving
	 * the previously cached value in place.
	 * @param key The property name to resolve.
	 */
	#resolveComputedIfDirty(key: string): void {
		const recompute = this.#computedRecomputers.get(key);
		if (!recompute) {
			// Not a computed owned by these bindings; a parent (if any) resolves it when the value
			// is read through the proxy delegation in the get trap.
			return;
		}
		if (!this.#dirtyComputeds.has(key)) {
			return;
		}
		if (this.#resolvingComputeds.has(key)) {
			this.#logger?.warn(`Circular dependency detected while resolving computed property '${key}'.`);
			return;
		}
		this.#resolvingComputeds.add(key);
		try {
			// Clear the dirty flag before recomputing so reads of this same key during recomputation
			// (other than a true cycle) do not attempt to resolve it again.
			this.#dirtyComputeds.delete(key);
			recompute();
		} finally {
			this.#resolvingComputeds.delete(key);
		}
	}

	/**
	 * Manually adds an identifier to the set of changed identifiers.
	 * This is useful for computed properties that need to mark themselves as changed
	 * without triggering a new update cycle.
	 * @param key The identifier to mark as changed.
	 */
	markChanged(key: string): void {
		this.#addChange(key);
	}

	/**
	 * Resolves a local path alias for the given identifier by walking up the bindings chain.
	 * Returns the resolved source path, or undefined if no alias is found.
	 */
	resolveAlias(identifier: string): string | undefined {
		// Direct match in local aliases
		if (this.#localAliases.has(identifier)) {
			return this.#localAliases.get(identifier);
		}
		// Check if this is a nested path of a locally aliased variable (e.g. "file.isModified")
		for (const [alias, source] of this.#localAliases.entries()) {
			if (identifier.startsWith(alias + '.') || identifier.startsWith(alias + '[')) {
				return source + identifier.substring(alias.length);
			}
		}
		// Walk up the parent chain
		return this.#parent?.resolveAlias(identifier);
	}

	/**
	 * Checks whether a reactive change path matches a given identifier, taking local path
	 * aliases into account. Falls back to ReactiveProxy.doesChangeMatchIdentifier for
	 * global aliases (computed properties etc.).
	 */
	doesChangeMatchIdentifier(changePath: string, identifier: string): boolean {
		// Direct match (an index "[*]" in the identifier matches any index)
		if (ReactiveProxy.pathMatches(changePath, identifier)) {
			return true;
		}
		// Resolve via local (scoped) alias chain
		const resolved = this.resolveAlias(identifier);
		if (resolved) {
			// changePath is resolved itself or a descendant of it (e.g. "files[0].isModified" for resolved "files[0]")
			if (ReactiveProxy.pathMatches(changePath, resolved, true)) {
				return true;
			}
			// changePath is an ancestor of resolved (e.g. "files" for resolved "files[0].isModified")
			// This handles raw objects: when the parent collection is replaced/spliced, all item
			// properties are considered changed.
			if (resolved.startsWith(changePath + '.') || resolved.startsWith(changePath + '[')) {
				return true;
			}
		}
		// Fall back to global alias resolution (computed properties, etc.)
		return ReactiveProxy.doesChangeMatchIdentifier(changePath, identifier);
	}

	/**
	 * Checks whether any of the changes affects an expression with the given identifiers.
	 *
	 * An identifier with a run-time index ("frames[*].url" for frames[i].url) normally
	 * matches a change at any index. When trackedPaths holds the paths the expression read
	 * during its last evaluation, the identifier is narrowed to the concrete paths among
	 * them ("frames[0].url"), so a write to another element is ignored. When no recorded
	 * path fits the identifier (not evaluated yet, a raw object, a short-circuited read),
	 * the identifier keeps matching every index.
	 *
	 * The recorded paths also count as dependencies of their own: they include what a
	 * method called by the expression read, such as `this[key]`, which the identifiers
	 * found in the source cannot name.
	 *
	 * @param changes The change paths of the current update cycle.
	 * @param identifiers The identifiers the expression depends on.
	 * @param trackedPaths The paths read during the expression's last evaluation, if recorded.
	 * @returns True if some change matches some identifier or recorded path.
	 */
	isAffected(changes: string[], identifiers: string[], trackedPaths?: ReadonlySet<string>): boolean {
		if (changes.length === 0) {
			return false;
		}
		for (const identifier of identifiers) {
			const candidates = this.#concretePaths(identifier, trackedPaths) ?? [identifier];
			for (const candidate of candidates) {
				if (changes.some(change => this.doesChangeMatchIdentifier(change, candidate))) {
					return true;
				}
			}
		}
		if (trackedPaths && trackedPaths.size > 0) {
			return changes.some(change => ReactiveProxy.changeAffectsRead(change, trackedPaths));
		}
		return false;
	}

	/**
	 * Returns the recorded paths that an identifier with a run-time index stood for during
	 * the last evaluation, or undefined when the identifier has no such index or nothing
	 * recorded fits it. The identifier is tried both as spelled and resolved through path
	 * aliases, since recorded paths are source paths.
	 */
	#concretePaths(identifier: string, trackedPaths?: ReadonlySet<string>): string[] | undefined {
		if (!trackedPaths || trackedPaths.size === 0 || !identifier.includes('[*]')) {
			return undefined;
		}
		const resolved = this.resolveAlias(identifier);
		const paths: string[] = [];
		for (const path of trackedPaths) {
			if (ReactiveProxy.pathMatches(path, identifier) || (resolved !== undefined && ReactiveProxy.pathMatches(path, resolved))) {
				paths.push(path);
			}
		}
		return paths.length > 0 ? paths : undefined;
	}
}
