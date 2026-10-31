// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveEffect } from "./ReactiveEffect";

/**
 * A listener notified when something changes inside a reactive subtree.
 */
type ReactiveListener = () => void;

/**
 * Utility class for creating reactive proxies. A proxy records the reads made through it
 * against the running effect and notifies the effects that read a member when it is
 * written (see ReactiveEffect). An object has one proxy, however many places hold it.
 */
export class ReactiveProxy {
    /**
     * A WeakMap to store the proxy of each target object.
     */
    private static proxies = new WeakMap<object, object>();

    /**
     * A WeakMap to track which objects are proxies, mapping proxy -> original target.
     * This prevents double-wrapping of already proxied objects.
     */
    private static proxyToTarget = new WeakMap<object, object>();

    /**
     * A WeakSet to track objects marked as "raw" (non-reactive).
     * These objects will not be wrapped with Proxy.
     */
    private static rawObjects = new WeakSet<object>();

    /**
     * The listeners of each target: the groups passed to create(), which a nested object
     * joins when it is reached through an object in the group.
     */
    private static listeners = new WeakMap<object, Set<Set<ReactiveListener>>>();

    private static readonly ARRAY_MUTATORS: ReadonlySet<string> = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']);
    private static readonly MAP_MUTATORS: ReadonlySet<string> = new Set(['set', 'delete', 'clear']);
    private static readonly SET_MUTATORS: ReadonlySet<string> = new Set(['add', 'delete', 'clear']);

    /**
     * Whether a property key is spelled as an array index ("0", "12") rather than a
     * property name.
     *
     * @param key The property key as a string.
     * @returns True if the key is a canonical non-negative integer.
     */
    static isIndexKey(key: string): boolean {
        return /^(?:0|[1-9]\d*)$/.test(key);
    }

    /**
     * The `Object.prototype.toString` tags of the *only* value types we deeply
     * proxy. Everything else is returned untouched (raw).
     *
     * Rationale: a Proxy can only safely intercept plain data containers. Built-in
     * and host objects — `Date`, `RegExp`, `File`, `Blob`, `FileList`, `Promise`,
     * `WeakMap`/`WeakSet`, typed arrays, DOM nodes, etc. — carry private internal
     * slots, and invoking their native methods with a Proxy as the `this`/receiver
     * throws "Illegal invocation". They must therefore never be wrapped. This is an
     * allow-list rather than a deny-list so that *every* such exotic type is
     * excluded by default, not just the handful we happened to enumerate.
     *
     * Plain user-defined class instances report `[object Object]` (unless they set
     * `Symbol.toStringTag`) and so remain reactive, preserving prior behaviour.
     * `Map`/`Set` stay reactive because the proxy specially wraps their mutation
     * methods (see the `get` trap); `WeakMap`/`WeakSet` are intentionally excluded
     * since they cannot be wrapped that way and would break the same as `File`.
     *
     * Callers that want a plain object kept non-reactive can still opt out
     * explicitly via {@link markRaw}.
     */
    private static readonly REACTIVE_TYPE_TAGS: ReadonlySet<string> = new Set([
        '[object Object]',
        '[object Array]',
        '[object Arguments]',
        '[object Map]',
        '[object Set]',
    ]);

    /**
     * Whether the given non-null object value is one we deeply proxy.
     * See {@link REACTIVE_TYPE_TAGS} for the reasoning.
     */
    private static isReactivable(value: object): boolean {
        return this.REACTIVE_TYPE_TAGS.has(Object.prototype.toString.call(value));
    }

    /**
     * The traps shared by every proxy.
     */
    private static readonly handler: ProxyHandler<any> = {
        get(obj, key, receiver) {
            const value = Reflect.get(obj, key);

            // A read of data is a dependency. Function-valued members (push, Map#get, …) are
            // accesses to behaviour, not data, so they are left out.
            if (typeof key !== 'symbol' && typeof value !== 'function') {
                ReactiveEffect.track(obj, key);
            }

            // If the value is an object or array, make it reactive too
            if (typeof value === 'object' && value !== null) {
                ReactiveProxy.inheritListeners(obj, value);
                return ReactiveProxy.create(value);
            }

            // If the value is a function, we need to wrap it to ensure that any mutations it performs are seen
            if (typeof value === 'function') {
                // For arrays, we only want to wrap mutation methods, not read methods like 'slice', 'concat', etc.
                if (Array.isArray(obj)) {
                    if (!ReactiveProxy.ARRAY_MUTATORS.has(key as string)) {
                        return value;
                    }

                    return function (this: any, ...args: any[]) {
                        const result = (value as Function).apply(this === receiver ? obj : this, args);
                        ReactiveEffect.triggerAll(obj);
                        ReactiveProxy.notify(obj);
                        return result;
                    };
                }

                // For Map and Set, a mutation method changes the collection and any other
                // method reads it
                const mutators = ReactiveProxy.mutatorsOf(obj);
                if (mutators) {
                    return function (this: any, ...args: any[]) {
                        const result = (value as Function).apply(this === receiver ? obj : this, args);
                        if (mutators.has(key as string)) {
                            ReactiveEffect.triggerAll(obj);
                            ReactiveProxy.notify(obj);
                        } else {
                            ReactiveEffect.track(obj, ReactiveEffect.ITERATE);
                        }
                        return result;
                    };
                }
            }

            return value;
        },

        set(obj, key, value) {
            const stored = ReactiveProxy.unwrap(value);
            const oldValue = Reflect.get(obj, key);
            const hadKey = Reflect.has(obj, key);
            const oldLength = Array.isArray(obj) ? obj.length : 0;
            const result = Reflect.set(obj, key, stored);

            // Only notify if the value actually changed
            if (oldValue !== stored) {
                if (key === 'length' && Array.isArray(obj)) {
                    // Truncating removes elements no write names
                    ReactiveEffect.triggerAll(obj);
                } else {
                    ReactiveEffect.trigger(obj, key);
                    if (!hadKey) {
                        ReactiveEffect.trigger(obj, ReactiveEffect.ITERATE);
                    }
                    if (Array.isArray(obj) && obj.length !== oldLength) {
                        ReactiveEffect.trigger(obj, 'length');
                    }
                }
                ReactiveProxy.notify(obj);
            }

            return result;
        },

        deleteProperty(obj, key) {
            const result = Reflect.deleteProperty(obj, key);
            ReactiveEffect.trigger(obj, key);
            ReactiveEffect.trigger(obj, ReactiveEffect.ITERATE);
            ReactiveProxy.notify(obj);
            return result;
        },

        has(obj, key) {
            if (typeof key !== 'symbol') {
                ReactiveEffect.track(obj, key);
            }
            return Reflect.has(obj, key);
        },

        ownKeys(obj) {
            ReactiveEffect.track(obj, ReactiveEffect.ITERATE);
            return Reflect.ownKeys(obj);
        }
    };

    /**
     * The mutation methods of a Map or a Set, or undefined for any other object.
     */
    private static mutatorsOf(obj: object): ReadonlySet<string> | undefined {
        switch (obj.constructor?.name) {
            case 'Map':
                return this.MAP_MUTATORS;
            case 'Set':
                return this.SET_MUTATORS;
            default:
                return undefined;
        }
    }

    /**
     * Creates a reactive proxy for the given object, or returns the one it already has.
     *
     * @param target The object to make reactive.
     * @param onChange Called whenever something inside the object is modified.
     * @returns A reactive proxy of the target object.
     */
    static create<T extends object>(target: T, onChange?: ReactiveListener): T {
        // If the target is not an object or is null, return it as-is
        if (typeof target !== 'object' || target === null) {
            return target;
        }

        // Don't wrap objects marked as raw (non-reactive)
        if (this.rawObjects.has(target)) {
            return target;
        }

        // Only deeply proxy plain data containers; return every built-in/host
        // object (Date, File, Blob, Promise, WeakMap, DOM nodes, …) as-is, since
        // their native methods break when invoked through a Proxy receiver.
        if (!this.isReactivable(target)) {
            return target;
        }

        const raw = this.unwrap(target);
        if (onChange) {
            let groups = this.listeners.get(raw);
            if (!groups) {
                groups = new Set();
                this.listeners.set(raw, groups);
            }
            groups.add(new Set([onChange]));
        }

        // Check if the target is already a proxy - if so, return it as-is to prevent double-wrapping
        if (raw !== target) {
            return target;
        }

        const existing = this.proxies.get(target) as T | undefined;
        if (existing) {
            return existing;
        }
        const proxy = new Proxy(target, this.handler) as T;
        this.proxies.set(target, proxy);
        this.proxyToTarget.set(proxy, target);
        return proxy;
    }

    /**
     * Makes a nested object notify the listeners of the object it was reached through.
     */
    private static inheritListeners(parent: object, value: object): void {
        const groups = this.listeners.get(parent);
        if (!groups) {
            return;
        }
        const nested = this.unwrap(value);
        let nestedGroups = this.listeners.get(nested);
        if (!nestedGroups) {
            nestedGroups = new Set();
            this.listeners.set(nested, nestedGroups);
        }
        for (const group of groups) {
            nestedGroups.add(group);
        }
    }

    /**
     * Invokes the listeners of a target.
     */
    private static notify(target: object): void {
        const groups = this.listeners.get(target);
        if (groups) {
            for (const group of groups) {
                for (const listener of group) {
                    listener();
                }
            }
        }
    }

    /**
     * Checks if the given object is a reactive proxy.
     *
     * @param obj The object to check.
     * @returns True if the object is a reactive proxy, false otherwise.
     */
    static isReactive(obj: any): boolean {
        return this.proxyToTarget.has(obj);
    }

    /**
     * Unwraps a reactive proxy to get the original object.
     * If the object is not a proxy, returns it as-is.
     *
     * @param obj The object to unwrap.
     * @returns The original object.
     */
    static unwrap<T>(obj: T): T {
        return ((typeof obj === 'object' && obj !== null && this.proxyToTarget.get(obj)) || obj) as T;
    }

    /**
     * Marks an object as "raw" (non-reactive).
     * Objects marked as raw will not be wrapped with Proxy when accessed from reactive objects.
     * This is useful for objects that should not be reactive, such as:
     * - Objects with private fields (class instances with # fields)
     * - Third-party library instances
     * - Objects used only for method calls
     *
     * @param obj The object to mark as raw.
     * @returns The same object (for chaining).
     */
    static markRaw<T extends object>(obj: T): T {
        if (typeof obj === 'object' && obj !== null) {
            this.rawObjects.add(obj);
        }
        return obj;
    }

    /**
     * Checks if an object is marked as raw (non-reactive).
     *
     * @param obj The object to check.
     * @returns True if the object is marked as raw, false otherwise.
     */
    static isRaw(obj: any): boolean {
        return typeof obj === 'object' && obj !== null && this.rawObjects.has(obj);
    }
}
