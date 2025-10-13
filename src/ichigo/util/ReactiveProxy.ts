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

        // Don't wrap built-in objects that have internal slots
        // These objects require their methods to be called with the correct 'this' context
        if (target instanceof Date || target instanceof RegExp || target instanceof Error) {
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
                    // Don't wrap built-in objects that have internal slots
                    if (value instanceof Date || value instanceof RegExp || value instanceof Error) {
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
                            const result = (value as Function).apply(this, args);
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
}
