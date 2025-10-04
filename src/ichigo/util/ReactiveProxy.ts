// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Utility class for creating reactive proxies that automatically track changes.
 */
export class ReactiveProxy {
    /**
     * A WeakMap to store the original target for each proxy.
     * This allows us to avoid creating multiple proxies for the same object.
     */
    private static proxyMap = new WeakMap<object, any>();

    /**
     * Creates a reactive proxy for the given object.
     * The proxy will call the onChange callback whenever a property is modified.
     *
     * @param target The object to make reactive.
     * @param onChange Callback function to call when the object changes.
     * @returns A reactive proxy of the target object.
     */
    static create<T extends object>(target: T, onChange: () => void): T {
        // If the target is not an object or is null, return it as-is
        if (typeof target !== 'object' || target === null) {
            return target;
        }

        // If this object already has a proxy, return the existing proxy
        if (this.proxyMap.has(target)) {
            return this.proxyMap.get(target);
        }

        // Create the proxy
        const proxy = new Proxy(target, {
            get(obj, key) {
                const value = Reflect.get(obj, key);

                // If the value is an object or array, make it reactive too
                if (typeof value === 'object' && value !== null) {
                    return ReactiveProxy.create(value, onChange);
                }

                // For arrays, intercept mutation methods
                if (Array.isArray(obj) && typeof value === 'function') {
                    const arrayMutationMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

                    if (arrayMutationMethods.includes(key as string)) {
                        return function (this: any, ...args: any[]) {
                            const result = (value as Function).apply(this, args);
                            onChange();
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
                    onChange();
                }

                return result;
            },

            deleteProperty(obj, key) {
                const result = Reflect.deleteProperty(obj, key);
                onChange();
                return result;
            }
        });

        // Store the proxy so we can return it if requested again
        this.proxyMap.set(target, proxy);

        return proxy;
    }

    /**
     * Checks if the given object is a reactive proxy.
     *
     * @param obj The object to check.
     * @returns True if the object is a reactive proxy, false otherwise.
     */
    static isReactive(obj: any): boolean {
        return this.proxyMap.has(obj);
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
