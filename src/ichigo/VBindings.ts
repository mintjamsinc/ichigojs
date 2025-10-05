// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveProxy } from "./util/ReactiveProxy";
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
	#onChange: ((identifier: string) => void) | undefined;

	/**
	 * The set of changed identifiers.
	 */
	#changes: Set<string> = new Set();

	/**
	 * Creates a new instance of VBindings.
	 * @param parent The parent bindings, if any.
	 */
	constructor(args: VBindingsInit = {}) {
		this.#parent = args.parent;
		this.#onChange = args.onChange;

		this.#local = new Proxy({}, {
			get: (obj, key) => {
				if (Reflect.has(obj, key)) {
                    return Reflect.get(obj, key);
                }
                return this.#parent?.get(key as string);
			},
			set: (obj, key, value) => {
				const oldValue = Reflect.get(obj, key);
				const result = Reflect.set(obj, key, value);
				if (oldValue !== value) {
					this.#changes.add(key as string);
					this.#onChange?.(key as string);
				}
				return result;
			},
            deleteProperty: (obj, key) => {
                const result = Reflect.deleteProperty(obj, key);
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
	 * Clears the set of changed identifiers.
	 */
	clearChanges(): void {
		this.#changes.clear();
	}

	/**
	 * Sets a local binding.
	 * @param key The binding name.
	 * @param value The binding value.
	 */
	set(key: string, value: any): void {
		if (typeof value === 'object' && value !== null) {
			// Wrap objects/arrays with reactive proxy, tracking the root key
			this.#local[key] = ReactiveProxy.create(value, () => {
				this.#changes.add(key);
				this.#onChange?.(key);
			});
			return;
		}

		this.#local[key] = value;
	}

	/**
	 * Gets a binding value, searching parent bindings if not found locally.
	 * @param key The binding name.
	 * @returns The binding value, or undefined if not found.
	 */
	get(key: string): any {
		if (key in this.#local) {
			return this.#local[key];
		}

		return this.#parent?.get(key);
	}

	/**
	 * Checks if a binding exists, searching parent bindings if specified.
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
