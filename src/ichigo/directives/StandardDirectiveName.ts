// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Standard directive names used in the framework.
 */
export enum StandardDirectiveName {
    /** Conditional rendering directives (if). */
    V_IF = "v-if",
    /** Conditional rendering directives (else if). */
    V_ELSE_IF = "v-else-if",
    /** Conditional rendering directives (else). */
    V_ELSE = "v-else",
    /** Conditional rendering directives (show). */
    V_SHOW = "v-show",
    /** List rendering directives. */
    V_FOR = "v-for",
    /** Event handling directives. */
    V_ON = "v-on",
    /** Attribute binding directives. */
    V_BIND = "v-bind",
    /** Two-way data binding directives. */
    V_MODEL = "v-model",
    /** Resize observer directives. */
    V_RESIZE = "v-resize",
    /** Intersection observer directives. */
    V_INTERSECTION = "v-intersection",
    /** Performance observer directives. */
    V_PERFORMANCE = "v-performance",
    /** Component directive. */
    V_COMPONENT = "v-component"
}
