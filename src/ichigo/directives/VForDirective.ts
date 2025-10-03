// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { VBindings } from "../VBindings";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { BindingsUtils } from "../util/BindingsUtils";

/**
 * Directive for rendering a list of items using a loop.
 * This directive iterates over a collection and renders a template for each item.
 * Example usage:
 *     <ul>
 *       <li v-for="item in items" :key="item.id">{{ item.name }}</li>
 *     </ul>
 * In this example, the v-for directive iterates over the items array, rendering an <li> element for each item.
 * The :key attribute is used to provide a unique identifier for each item, which helps with efficient updates and rendering.
 * The directive supports iterating over arrays and objects. When iterating over an object, you can access both the key and value.
 * For example:
 *     <div v-for="(value, key) in object">{{ key }}: {{ value }}</div>
 * This will render each key-value pair in the object.
 * Note that the v-for directive requires a unique key for each item to optimize rendering performance.
 */
export class VForDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #identifiers?: string[];

    /**
     * A function that evaluates the directive's expression to get the source data.
     * It returns the collection to iterate over.
     */
    #evaluateSource?: () => any;

    /**
     * A function that evaluates the :key expression for an item.
     */
    #evaluateKey?: (itemBindings: Map<string, any>) => any;

    /**
     * Parsed v-for expression parts
     */
    #itemName?: string;
    #indexName?: string;
    #sourceName?: string;

    /**
     * Map to track rendered items by their keys
     */
    #renderedItems = new Map<any, VNode>();

    /**
     * Previous iterations to detect changes
     */
    #previousIterations: Array<{ key: any; item: any; index: number }> = [];

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;
        const element = this.#vNode.node as HTMLElement;

        // Parse the v-for expression
        const expression = context.attribute.value;
        if (expression) {
            const parsed = this.#parseForExpression(expression);
            this.#itemName = parsed.itemName;
            this.#indexName = parsed.indexName;
            this.#sourceName = parsed.sourceName;

            // Extract identifiers from the source expression
            this.#identifiers = ExpressionUtils.extractIdentifiers(parsed.sourceName, context.vNode.vApplication.functionDependencies);
            this.#evaluateSource = this.#createSourceEvaluator(parsed.sourceName);
        }

        // Check for :key or v-bind:key attribute
        for (const keyAttr of [':key', 'v-bind:key']) {
            const keyValue = element.getAttribute(keyAttr);
            if (keyValue) {
                this.#evaluateKey = this.#createKeyEvaluator(keyValue);
                element.removeAttribute(keyAttr);
                break;
            }
        }
 
        // Remove the directive attribute from the element
        element.removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_FOR;
    }

    /**
     * @inheritdoc
     */
    get vNode(): VNode {
        return this.#vNode;
    }

    /**
     * @inheritdoc
     */
    get needsAnchor(): boolean {
        return true;
    }

    /**
     * @inheritdoc
     */
    get bindingsPreparer(): VBindingsPreparer | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get domUpdater(): VDOMUpdater | undefined {
        const identifiers = this.#identifiers ?? [];
        const render = () => this.#render();

        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get identifiers(): string[] {
                return identifiers;
            },
            applyToDOM(): void {
                render();
            }
        };
        return updater;
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // Clean up all rendered items
        for (const vNode of this.#renderedItems.values()) {
            if (vNode.node.parentNode) {
                vNode.node.parentNode.removeChild(vNode.node);
            }
            vNode.destroy();
        }
        this.#renderedItems.clear();
        this.#previousIterations = [];
    }

    /**
     * Renders the directive by evaluating its expression and updating the DOM accordingly.
     * This method is called whenever the directive needs to update its rendering.
     */
    #render(): void {
        // If there's no evaluator, do nothing
        if (!this.#evaluateSource) {
            return;
        }

        // Evaluate the source expression to get the data
        const sourceData = this.#evaluateSource();

        // Get iterations from the source data
        let iterations = this.#getIterations(sourceData);

        // If we have a custom key evaluator, update the keys
        if (this.#evaluateKey && this.#itemName) {
            iterations = iterations.map(iter => {
                // Create bindings for this iteration
                const itemBindings = new Map<string, any>();
                if (this.#vNode.bindings) {
                    for (const key in this.#vNode.bindings) {
                        itemBindings.set(key, this.#vNode.bindings[key]);
                    }
                }
                itemBindings.set(this.#itemName!, iter.item);
                if (this.#indexName) {
                    itemBindings.set(this.#indexName, iter.index);
                }

                // Evaluate the key with item bindings
                const customKey = this.#evaluateKey!(itemBindings);
                return { ...iter, key: customKey };
            });
        }

        // Perform key-based diffing and update DOM
        this.#updateList(iterations);

        // Store current iterations for next update
        this.#previousIterations = iterations;
    }

    /**
     * Key-based diffing for efficient DOM updates
     */
    #updateList(newIterations: Array<{ key: any; item: any; index: number }>): void {
        const parent = this.#vNode.node.parentNode;
        const anchor = this.#vNode.anchorNode;

        if (!parent || !anchor) {
            throw new Error('v-for element must have a parent and anchor');
        }

        const newRenderedItems = new Map<any, VNode>();

        // Track which keys are still needed
        const neededKeys = new Set(newIterations.map(ctx => ctx.key));

        // Remove items that are no longer needed
        for (const [key, vNode] of this.#renderedItems) {
            if (!neededKeys.has(key)) {
                if (vNode.node.parentNode) {
                    vNode.node.parentNode.removeChild(vNode.node);
                }
                vNode.destroy();
            }
        }

        // Add or reorder items
        let prevNode: Node = anchor;

        for (const context of newIterations) {
            const { key } = context;
            let vNode = this.#renderedItems.get(key);

            if (!vNode) {
                // Create new item
                vNode = this.#cloneTemplate(context);
                newRenderedItems.set(key, vNode);

                // Insert after previous node
                if (prevNode.nextSibling) {
                    parent.insertBefore(vNode.node, prevNode.nextSibling);
                } else {
                    parent.appendChild(vNode.node);
                }

                vNode.update({
                    bindings: this.#vNode.bindings || {},
                    changedIdentifiers: [],
                    isInitial: true
                });
            } else {
                // Reuse existing item
                newRenderedItems.set(key, vNode);

                // Update bindings
                this.#updateItemBindings(vNode, context);

                // Move to correct position if needed
                if (prevNode.nextSibling !== vNode.node) {
                    if (prevNode.nextSibling) {
                        parent.insertBefore(vNode.node, prevNode.nextSibling);
                    } else {
                        parent.appendChild(vNode.node);
                    }
                }
            }

            prevNode = vNode.node;
        }

        // Update rendered items map
        this.#renderedItems = newRenderedItems;
    }

    /**
     * Parses v-for expression.
     * Supports: item in items, (item, index) in items, value in object, (value, key) in object
     */
    #parseForExpression(expression: string): { itemName: string; indexName?: string; sourceName: string } {
        // Remove extra spaces and split by 'in'
        const parts = expression.replace(/\s+/g, ' ').trim().split(' in ');

        if (parts.length !== 2) {
            throw new Error(`Invalid v-for expression: ${expression}`);
        }

        const [left, sourceName] = parts;

        // Check if destructuring: (item, index) or (value, key)
        if (left.startsWith('(') && left.endsWith(')')) {
            const destructured = left.slice(1, -1).split(',').map(s => s.trim());
            return {
                itemName: destructured[0],
                indexName: destructured[1],
                sourceName: sourceName.trim()
            };
        }

        return {
            itemName: left.trim(),
            sourceName: sourceName.trim()
        };
    }

    /**
     * Creates a function to evaluate the source data expression.
     */
    #createSourceEvaluator(expression: string): () => any {
        const identifiers = this.#identifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        const func = new Function(args, funcBody) as (...args: any[]) => any;

        return () => {
            const values = identifiers.map(id => this.#vNode.bindings?.[id]);
            return func(...values);
        };
    }

    /**
     * Creates a function to evaluate the :key expression for each item.
     */
    #createKeyEvaluator(expression: string): (itemBindings: Map<string, any>) => any {
        // Remove {{ }} if present
        const cleanExpr = expression.replace(/^\{\{|\}\}$/g, '').trim();

        // Parse to find all identifiers
        const identifiers = ExpressionUtils.extractIdentifiers(cleanExpr, this.#vNode.vApplication.functionDependencies);
        const args = identifiers.join(", ");
        const funcBody = `return (${cleanExpr});`;

        const func = new Function(args, funcBody) as (...args: any[]) => any;

        return (itemBindings: Map<string, any>) => {
            const values = identifiers.map(id => itemBindings.get(id));
            return func(...values);
        };
    }

    /**
     * Clone template element for each iteration and create a new VNode
     */
    #cloneTemplate(context: { key: any; item: any; index: number }): VNode {
        const element = this.#vNode.node as HTMLElement;
        const clone = element.cloneNode(true) as HTMLElement;

        // Prepare identifiers for the item
        const itemName = this.#itemName;
        const indexName = this.#indexName;

        // Create bindings for this iteration
        const bindings: VBindings = { ...this.#vNode.bindings };
        if (this.#itemName) {
            bindings[this.#itemName] = context.item;
        }
        if (this.#indexName) {
            bindings[this.#indexName] = context.index;
        }

        const itemBindingsPreparer: VBindingsPreparer = {
            get identifiers(): string[] {
                return []; // No specific identifiers for item
            },
            get preparableIdentifiers(): string[] {
                // Return item and index names if defined
                const ids = [];
                if (itemName) ids.push(itemName);
                if (indexName) ids.push(indexName);
                return ids;
            },
            prepareBindings(bindings) {
                // Prepare bindings for the current item
                if (itemName) {
                    bindings[itemName] = context.item;
                }
                if (indexName) {
                    bindings[indexName] = context.index;
                }
            }
        };

        // Create a new VNode for the cloned element
        const vNode = new VNode({
            node: clone,
            vApplication: this.#vNode.vApplication,
            parentVNode: this.#vNode.parentVNode,
            bindings,
            bindingsPreparer: itemBindingsPreparer,
        });

        // Set data attributes for debugging
        clone.setAttribute('data-v-for-key', String(context.key));
        clone.setAttribute('data-v-for-index', String(context.index));

        return vNode;
    }

    /**
     * Update bindings for an existing item
     */
    #updateItemBindings(vNode: VNode, context: { key: any; item: any; index: number }): void {
        const bindings = vNode.bindings || {};
        const updatedBindings: VBindings = { ...bindings };

        if (this.#itemName) {
            updatedBindings[this.#itemName] = context.item;
        }
        if (this.#indexName) {
            updatedBindings[this.#indexName] = context.index;
        }

        // Update data attributes
        const element = vNode.node as HTMLElement;
        element.setAttribute('data-v-for-key', String(context.key));
        element.setAttribute('data-v-for-index', String(context.index));

        // Trigger reactivity update by calling update with the new bindings
        const changedIdentifiers: string[] = [];
        if (this.#itemName) {
            changedIdentifiers.push(this.#itemName);
        }
        if (this.#indexName) {
            changedIdentifiers.push(this.#indexName);
        }

        vNode.update({
            bindings: updatedBindings,
            changedIdentifiers
        });
    }

    /**
     * Get iterations from various data types
     */
    #getIterations(data: any): Array<{ key: any; item: any; index: number }> {
        if (!data) return [];

        // Array
        if (Array.isArray(data)) {
            return data.map((item, index) => ({
                item,
                index,
                key: index
            }));
        }

        // Object
        if (typeof data === 'object') {
            return Object.entries(data).map(([key, value], index) => ({
                item: value,
                index,
                key
            }));
        }

        // Number (iterate from 1 to n)
        if (typeof data === 'number') {
            return Array.from({ length: data }, (_, index) => ({
                item: index + 1,
                index,
                key: index + 1
            }));
        }

        // String (iterate over characters)
        if (typeof data === 'string') {
            return Array.from(data).map((char, index) => ({
                item: char,
                index,
                key: index
            }));
        }

        return [];
    }
}
