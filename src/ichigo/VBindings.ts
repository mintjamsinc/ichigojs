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
	 * Cache for array lengths to detect length changes when the same object reference is used.
	 */
	#lengthCache: Map<string, number> = new Map();

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

		this.#local = new Proxy({}, {
			get: (obj, key) => {
				if (Reflect.has(obj, key)) {
					return Reflect.get(obj, key);
				}
				return this.#parent?.raw[key as string];
			},
			set: (obj, key, value) => {
				let target = obj;
				if (!Reflect.has(target, key)) {
					for (let parent = this.#parent; parent; parent = parent.#parent) {
						if (Reflect.has(parent.#local, key)) {
							target = parent.#local;
							break;
						}
					}
				}

				let newValue = value;
				if (typeof value === 'object' && value !== null) {
					// Wrap objects/arrays with reactive proxy, tracking the root key
					newValue = ReactiveProxy.create(value, (changedPath) => {
						let path = '';
						for (const part of changedPath?.split('.') || []) {
							path = path ? `${path}.${part}` : part;
							this.#logger?.debug(`Binding changed: ${path}`);
							this.#changes.add(path);
						}
						this.#onChange?.(changedPath as string);
					}, key as string);
				}

				const oldValue = Reflect.get(target, key);
				const result = Reflect.set(target, key, newValue);

				// Detect changes
				let hasChanged = oldValue !== newValue;

				// Special handling for arrays: check length changes even if same object reference
				if (!hasChanged && Array.isArray(newValue)) {
					const cachedLength = this.#lengthCache.get(key as string);
					const currentLength = newValue.length;
					if (cachedLength !== undefined && cachedLength !== currentLength) {
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
					this.#changes.add(key as string);
					this.#onChange?.(key as string);
				}
				return result;
			},
			deleteProperty: (obj, key) => {
				const result = Reflect.deleteProperty(obj, key);
				this.#logger?.debug(`Binding deleted: ${key as string}`);
				this.#changes.add(key as string);
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
}
