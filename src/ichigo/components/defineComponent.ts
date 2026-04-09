// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ReactiveProxy } from '../util/ReactiveProxy';
import { VApplicationOptions } from '../VApplicationOptions';
import { IchigoComponentOptions } from './IchigoComponentOptions';
import { IchigoElement } from './IchigoElement';

/**
 * Defines and registers a custom element backed by ichigo.js reactivity.
 *
 * Usage:
 * ```html
 * <template id="my-list">
 *   <div>
 *     <ul v-if="items.length > 0">
 *       <li v-for="item of items">{{item.name}}</li>
 *     </ul>
 *     <slot></slot>
 *   </div>
 * </template>
 * ```
 * ```typescript
 * defineComponent('my-list', {
 *   template: '#my-list',
 *   props: ['items'],
 *   data() {
 *     return { items: this.items ?? [] };
 *   },
 * });
 * ```
 * ```html
 * <my-list :items="searchResults">
 *   <span slot="empty">No results.</span>
 * </my-list>
 * ```
 *
 * @param tagName  Custom element tag name (must contain a hyphen, e.g. 'my-card').
 * @param options  Component options including template selector and optional props.
 */
export function defineComponent(tagName: string, options: IchigoComponentOptions): void {
    const { props = [], template, data, computed, methods, watch, logLevel } = options;

    // Build a subclass of IchigoElement specific to this component
    class ComponentElement extends IchigoElement {
        static override _template = template;
        static override _props = props;

        static override _buildOptions(propValues: Record<string, any>): VApplicationOptions {
            return {
                data() {
                    // 'this' is the $ctx object provided by VApplication ({ $markRaw }).
                    // We extend it with prop values so the user's data() can reference them
                    // via 'this.propName' and supply defaults (e.g. `this.items ?? []`).
                    const ctx = { $markRaw: ReactiveProxy.markRaw.bind(ReactiveProxy), ...propValues };

                    const userData = data
                        ? (data.call(ctx) as Record<string, any>)
                        : {};

                    // Props are always included in data so they are reactive from the start.
                    // User-returned values take precedence (allow transforming/defaulting props).
                    return { ...propValues, ...userData };
                },
                computed,
                methods,
                watch,
                logLevel,
            };
        }
    }

    // Generate a property getter/setter for each declared prop.
    // This enables the parent VApplication to push updates via `element.propName = value`.
    for (const prop of props) {
        Object.defineProperty(ComponentElement.prototype, prop, {
            get(this: IchigoElement): any {
                return this._getProp(prop);
            },
            set(this: IchigoElement, value: any): void {
                this._setProp(prop, value);
            },
            configurable: true,
            enumerable: true,
        });
    }

    customElements.define(tagName, ComponentElement);
}
