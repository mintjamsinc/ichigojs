// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveEffect } from "./util/ReactiveEffect";
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
	 * The logger instance.
	 */
	#logger?: VLogger;

	/**
	 * Cache for array lengths to detect length changes when the same object reference is used.
	 */
	#lengthCache: Map<string, number> = new Map();

	/**
	 * Flag marking a write that must not notify anything: the cached value of a computed
	 * property, which notifies by itself if the value changed.
	 */
	#silent: boolean = false;

	/**
	 * Flag forcing the next write through the `set` trap to stay in THIS scope's own
	 * local store instead of walking up to an inherited binding of the same name.
	 * Set only by {@link setLocal} for scope-local variables (e.g. v-for loop items),
	 * which must shadow — never overwrite — a parent binding with the same key.
	 */
	#localWrite: boolean = false;

	/**
	 * Setters for writable computed properties. When a key registered here is assigned
	 * through the bindings proxy (e.g. via v-model or `bindings.set`), the setter is invoked
	 * instead of writing directly to the local store. The cached value of the computed property
	 * is updated by the recompute cycle through `setSilent`, which bypasses this routing.
	 */
	#writableComputeds: Map<string, (value: any) => void> = new Map();

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
					// A read of data is a dependency. Methods are behaviour, not data; a binding
					// of a parent scope is recorded by the parent's own trap.
					if (typeof key === 'string' && typeof value !== 'function') {
						ReactiveEffect.track(obj, key);
					}
					return value;
				}
				if (this.#parent) {
					return this.#parent.raw[key as string];
				}
				// A read of a binding that does not exist yet depends on its being created
				if (typeof key === 'string') {
					ReactiveEffect.track(obj, key);
				}
				return undefined;
			},
			set: (obj, key, value) => {
				// If this key is a writable computed, route the assignment through its setter.
				// `setSilent` (used to update the cached value during recompute) bypasses this
				// routing so the cached value can be written directly.
				if (!this.#silent && this.#writableComputeds.has(key as string)) {
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

				// Objects and arrays are reactive; a reactive proxy received as the value stays
				// the proxy it is
				const newValue = typeof value === 'object' && value !== null ? ReactiveProxy.create(value) : value;

				const oldValue = Reflect.get(target, key);
				const result = Reflect.set(target, key, newValue);

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
					if (target === obj && !this.#silent) {
						ReactiveEffect.trigger(obj, key);
					}
				}
				return result;
			},
			deleteProperty: (obj, key) => {
				const result = Reflect.deleteProperty(obj, key);
				ReactiveEffect.trigger(obj, key);
				this.#logger?.debug(`Binding deleted: ${key as string}`);
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
	 * Indicates whether this is the root bindings (i.e., has no parent).
	 */
	get isRoot(): boolean {
		return !this.#parent;
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
	 * Sets a binding value without notifying anything.
	 * This is useful for internal updates that shouldn't trigger reactivity.
	 * @param key The binding name.
	 * @param value The binding value.
	 */
	setSilent(key: string, value: any): void {
		this.#silent = true;
		try {
			this.#local[key] = value;
		} finally {
			this.#silent = false;
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
		ReactiveEffect.invalidate(this.#store, key);
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
	 * Forces resolution of every computed property currently marked dirty. Called before watchers
	 * run and the DOM renders, so that a computed whose value changed has notified what reads it.
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
	 * Notifies what reads a binding that it has changed. This is for a computed property,
	 * whose cached value is written silently and which reports a change by itself.
	 * @param key The binding name.
	 */
	markChanged(key: string): void {
		ReactiveEffect.trigger(this.#store, key);
	}
}
