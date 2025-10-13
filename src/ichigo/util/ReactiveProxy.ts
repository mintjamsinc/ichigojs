// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Utility class for creating reactive proxies that automatically track changes.
 */
export class ReactiveProxy {
    /**
     * A WeakMap to store the proxy for each target object and path combination.
     * This prevents creating multiple proxies for the same object accessed from different paths.
     */
    private static proxyCache = new WeakMap<object, Map<string, any>>();

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
     * Creates a reactive proxy for the given object.
     * The proxy will call the onChange callback whenever a property is modified.
     *
     * @param target The object to make reactive.
     * @param onChange Callback function to call when the object changes. Receives the full path of the changed property.
     * @param path The current path in the object tree (used internally for nested objects).
     * @returns A reactive proxy of the target object.
     */
    static create<T extends object>(target: T, onChange: (changedPath?: string) => void, path: string = ''): T {
        // If the target is not an object or is null, return it as-is
        if (typeof target !== 'object' || target === null) {
            return target;
        }

        // Don't wrap objects marked as raw (non-reactive)
        if (this.rawObjects.has(target)) {
            return target;
        }

        // Don't wrap built-in objects that have internal slots
        // These objects require their methods to be called with the correct 'this' context
        // Use Object.prototype.toString for more reliable type checking
        const typeTag = Object.prototype.toString.call(target);
        if (typeTag === '[object Date]' || typeTag === '[object RegExp]' || typeTag === '[object Error]') {
            return target;
        }

        // Check if the target is already a proxy - if so, return it as-is to prevent double-wrapping
        if (this.proxyToTarget.has(target)) {
            return target;
        }

        // Check if we already have a proxy for this target with this path
        let pathMap = this.proxyCache.get(target);
        if (pathMap) {
            const existingProxy = pathMap.get(path);
            if (existingProxy) {
                return existingProxy;
            }
        } else {
            pathMap = new Map();
            this.proxyCache.set(target, pathMap);
        }

        // Create the proxy with path captured in closure
        const proxy = new Proxy(target, {
            get(obj, key) {
                const value = Reflect.get(obj, key);

                // If the value is an object or array, make it reactive too
                if (typeof value === 'object' && value !== null) {
                    // Don't wrap objects marked as raw (non-reactive)
                    if (ReactiveProxy.rawObjects.has(value)) {
                        return value;
                    }

                    // Don't wrap built-in objects that have internal slots
                    // Use Object.prototype.toString for more reliable type checking
                    const valueTypeTag = Object.prototype.toString.call(value);
                    if (valueTypeTag === '[object Date]' || valueTypeTag === '[object RegExp]' || valueTypeTag === '[object Error]') {
                        return value;
                    }

                    // Build the nested path
                    const keyStr = String(key);
                    const nestedPath = path ? (Array.isArray(obj) ? `${path}[${keyStr}]` : `${path}.${keyStr}`) : keyStr;
                    return ReactiveProxy.create(value, onChange, nestedPath);
                }

                // For arrays, intercept mutation methods
                if (Array.isArray(obj) && typeof value === 'function') {
                    const arrayMutationMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

                    if (arrayMutationMethods.includes(key as string)) {
                        return function (this: any, ...args: any[]) {
                            const result = (value as Function).apply(obj, args);
                            onChange(path || undefined);
                            return result;
                        };
                    }
                }

                return value;
            },

            set(obj, key, value) {
                const oldValue = Reflect.get(obj, key);
                const result = Reflect.set(obj, key, value);

                // Only trigger onChange if the value actually changed
                if (oldValue !== value) {
                    const keyStr = String(key);
                    const fullPath = path ? (Array.isArray(obj) ? `${path}[${keyStr}]` : `${path}.${keyStr}`) : keyStr;
                    onChange(fullPath);
                }

                return result;
            },

            deleteProperty(obj, key) {
                const result = Reflect.deleteProperty(obj, key);
                const keyStr = String(key);
                const fullPath = path ? (Array.isArray(obj) ? `${path}[${keyStr}]` : `${path}.${keyStr}`) : keyStr;
                onChange(fullPath);
                return result;
            }
        });

        // Cache the proxy for this path
        pathMap.set(path, proxy);

        // Track that this proxy wraps the target to prevent double-wrapping
        this.proxyToTarget.set(proxy, target);

        return proxy;
    }

    /**
     * Checks if the given object is a reactive proxy.
     *
     * @param obj The object to check.
     * @returns True if the object is a reactive proxy, false otherwise.
     */
    static isReactive(obj: any): boolean {
        return this.proxyCache.has(obj);
    }

    /**
     * Unwraps a reactive proxy to get the original object.
     * If the object is not a proxy, returns it as-is.
     *
     * @param obj The object to unwrap.
     * @returns The original object.
     */
    static unwrap<T>(obj: T): T {
        // This is a simplified implementation
        // In a full implementation, we'd need to store a reverse mapping
        return obj;
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
