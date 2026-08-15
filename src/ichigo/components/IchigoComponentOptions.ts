// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplicationOptions } from '../VApplicationOptions';

/**
 * Per-prop declaration options.
 *
 * All checks (type, required, validator) report console warnings only; values
 * are never rejected or coerced. This mirrors the philosophy of the `emits`
 * declaration: the declaration documents the contract and helps development,
 * without changing runtime behavior.
 */
export interface PropOptions {
    /**
     * Expected type(s), given as constructor functions
     * (String, Number, Boolean, Array, Object, Function, Date, or any class).
     * When omitted, any type is accepted. null/undefined values always pass
     * the type check (undefined is subject to `default`/`required` instead,
     * and null is treated as an explicit "no value").
     */
    type?: Function | Function[];

    /**
     * Default value applied when the prop is undefined at mount time, or when
     * the parent later assigns undefined.
     *
     * Object/Array defaults must be declared as a factory function
     * (e.g. `default: () => []`) so that instances are not shared across
     * component instances. A function default is treated as the value itself
     * only when `type` includes Function; otherwise it is called as a factory.
     */
    default?: any;

    /**
     * When true, a warning is logged if the prop is still undefined at mount
     * time (after `default` resolution). The mount proceeds either way.
     */
    required?: boolean;

    /**
     * Custom validator. A falsy return value logs a warning.
     * Called for every non-null/undefined value delivered to the component.
     */
    validator?: (value: any) => boolean;
}

/**
 * Props declaration: either a simple list of prop names, or a record of
 * per-prop options. Use `null` (or `{}`) as the value for a prop that needs
 * no constraints, e.g. `props: { target: null, size: { default: 'md' } }`.
 */
export type PropsDeclaration = string[] | Record<string, PropOptions | null>;

/**
 * Options for defining a Web Component backed by ichigo.js reactivity.
 * Extends VApplicationOptions with component-specific settings.
 */
export interface IchigoComponentOptions extends VApplicationOptions {
    /**
     * Properties to receive from the parent via property binding.
     * Each declared prop is exposed as a property accessor on the custom
     * element. When the parent updates a bound value (e.g., :items="items"),
     * the component's reactive bindings are updated automatically.
     */
    props?: PropsDeclaration;

    /**
     * CSS selector for the <template> element that defines this component's markup.
     * Example: '#my-card' targets <template id="my-card">.
     */
    template: string;
}
