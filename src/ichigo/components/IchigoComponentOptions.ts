// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplicationOptions } from '../VApplicationOptions';

/**
 * Options for defining a Web Component backed by ichigo.js reactivity.
 * Extends VApplicationOptions with component-specific settings.
 */
export interface IchigoComponentOptions extends VApplicationOptions {
    /**
     * List of property names to receive from the parent via attribute/property binding.
     * Each name in this list will be exposed as a property setter on the custom element.
     * When the parent updates a bound value (e.g., :items="items"), the component's
     * reactive bindings are updated automatically.
     */
    props?: string[];

    /**
     * CSS selector for the <template> element that defines this component's markup.
     * Example: '#my-card' targets <template id="my-card">.
     */
    template: string;
}
