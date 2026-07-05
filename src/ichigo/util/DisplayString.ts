// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * The default Object.prototype.toString, used to detect plain objects that
 * have not overridden their string representation.
 */
const objectToString = Object.prototype.toString;

/**
 * Checks if the value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

/**
 * Checks if the value is a plain object (i.e. `[object Object]`).
 */
function isPlainObject(value: unknown): boolean {
    return objectToString.call(value) === '[object Object]';
}

/**
 * Converts a symbol to a readable string, leaving other values untouched.
 * Used when rendering Map keys and Set entries.
 */
function stringifySymbol(value: unknown, index: number | string = ''): unknown {
    return typeof value === 'symbol' ? `Symbol(${value.description ?? index})` : value;
}

/**
 * JSON.stringify replacer that renders values JSON cannot represent natively
 * (Map, Set, Symbol, and non-plain objects) in a readable form.
 */
function replacer(_key: string, value: unknown): unknown {
    if (value instanceof Map) {
        return {
            [`Map(${value.size})`]: [...value.entries()].reduce(
                (entries, [key, val], i) => {
                    entries[`${stringifySymbol(key, i)} =>`] = val;
                    return entries;
                },
                {} as Record<string, unknown>
            ),
        };
    }
    if (value instanceof Set) {
        return {
            [`Set(${value.size})`]: [...value.values()].map(v => stringifySymbol(v)),
        };
    }
    if (typeof value === 'symbol') {
        return stringifySymbol(value);
    }
    if (isObject(value) && !Array.isArray(value) && !isPlainObject(value)) {
        // Non-plain objects (Date, RegExp, DOM nodes, ...) render via their own toString
        return String(value);
    }
    return value;
}

/**
 * Converts a value to a string suitable for display in rendered output,
 * following Vue's `toDisplayString` semantics:
 * - strings are returned as-is
 * - null and undefined become an empty string
 * - arrays and plain objects (without a custom toString) are rendered as
 *   pretty-printed JSON, with Map/Set/Symbol entries made readable
 * - everything else is converted with String()
 * @param value The value to convert.
 * @returns The display string for the value.
 */
export function toDisplayString(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return '';
    }
    if (
        Array.isArray(value) ||
        (isObject(value) && (value.toString === objectToString || typeof value.toString !== 'function'))
    ) {
        return JSON.stringify(value, replacer, 2);
    }
    return String(value);
}
