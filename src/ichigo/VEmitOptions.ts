// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Options for `$emit`, controlling how the underlying CustomEvent is dispatched.
 */
export interface VEmitOptions {
    /**
     * Whether the event bubbles up through the DOM. Default is true.
     * Bubbling lets a parent component listen with `v-on` / `@` on the component tag,
     * because the application root is dispatched from inside the host custom element.
     */
    bubbles?: boolean;

    /**
     * Whether the event is cancelable (i.e. `preventDefault()` has an effect).
     * Default is true. `$emit` returns false when a listener called `preventDefault()`.
     */
    cancelable?: boolean;

    /**
     * Whether the event propagates across shadow DOM boundaries. Default is false.
     * ichigo.js components use Light DOM, so this is rarely needed.
     */
    composed?: boolean;

    /**
     * The target the event is dispatched on. Defaults to the application root element.
     * Set this to `document` or `window` to use a global event bus, or to a specific
     * element for element-scoped dispatch.
     */
    target?: EventTarget;
}
