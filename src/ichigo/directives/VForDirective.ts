// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { VBindings } from "../VBindings";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { VBindingsPreparer } from "../VBindingsPreparer";

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
    #dependentIdentifiers?: string[];

    /**
     * A function that evaluates the directive's expression to get the source data.
     * It returns the collection to iterate over.
     */
    #evaluateSource?: () => any;

    /**
     * A function that evaluates the :key expression for an item.
     */
    #evaluateKey?: (itemBindings: VBindings) => any;

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
            this.#dependentIdentifiers = ExpressionUtils.extractIdentifiers(parsed.sourceName, context.vNode.vApplication.functionDependencies);
            this.#evaluateSource = this.#createSourceEvaluator(parsed.sourceName);
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
        const identifiers = this.#dependentIdentifiers ?? [];

        // Create and return the DOM updater
        const updater: VDOMUpdater = {
            get dependentIdentifiers(): string[] {
                return identifiers;
            },
            applyToDOM: () => {
                this.#render();
            }
        };
        return updater;
    }

    /**
     * @inheritdoc
     */
    get templatize(): boolean {
        return true;
    }

    /**
     * @inheritdoc
     */
    get dependentIdentifiers(): string[] {
        return this.#dependentIdentifiers ?? [];
    }

    /**
     * @inheritdoc
     */
    get onMount(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onMounted(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUpdate(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUpdated(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUnmount(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    get onUnmounted(): (() => void) | undefined {
        return undefined;
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // Clean up all rendered items
        // First destroy all VNodes (calls @unmount hooks), then remove from DOM
        for (const vNode of this.#renderedItems.values()) {
            vNode.destroy();
        }

        // Then remove DOM nodes
        for (const vNode of this.#renderedItems.values()) {
            if (vNode.node.parentNode) {
                vNode.node.parentNode.removeChild(vNode.node);
            }
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

        // If we don't have a key evaluator yet, try to create it
        const keyExpression = this.#vNode.directiveManager?.keyDirective?.expression;
        if (!this.#evaluateKey && keyExpression !== undefined) {
            this.#evaluateKey = this.#createKeyEvaluator(keyExpression);
        }

        // If we have a custom key evaluator, update the keys
        if (this.#evaluateKey && this.#itemName) {
            iterations = iterations.map(iter => {
                // Create bindings for this iteration
                const itemBindings = new VBindings({
                    parent: this.#vNode.bindings
                });
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
        const parent = this.#vNode.anchorNode?.parentNode;
        const anchor = this.#vNode.anchorNode;

        if (!parent || !anchor) {
            throw new Error('v-for element must have a parent and anchor');
        }

        const newRenderedItems = new Map<any, VNode>();

        // Track which keys are still needed
        const neededKeys = new Set(newIterations.map(ctx => ctx.key));

        // Remove items that are no longer needed
        // First destroy VNodes (calls @unmount hooks while DOM is still accessible)
        const nodesToRemove: VNode[] = [];
        for (const [key, vNode] of this.#renderedItems) {
            if (!neededKeys.has(key)) {
                nodesToRemove.push(vNode);
                vNode.destroy();
            }
        }

        // Then remove from DOM
        for (const vNode of nodesToRemove) {
            if (vNode.node.parentNode) {
                vNode.node.parentNode.removeChild(vNode.node);
            }
        }

        // Add or reorder items
        let prevNode: Node = anchor;

        for (const context of newIterations) {
            const { key } = context;
            let vNode = this.#renderedItems.get(key);

            if (!vNode) {
                // Create new item
                const clone = this.#cloneNode();

                // Insert after previous node
                if (prevNode.nextSibling) {
                    parent.insertBefore(clone, prevNode.nextSibling);
                } else {
                    parent.appendChild(clone);
                }

                // Prepare identifiers for the item
                const itemName = this.#itemName;
                const indexName = this.#indexName;

                // Create bindings for this iteration
                const bindings = new VBindings({
                    parent: this.#vNode.bindings
                });
                if (this.#itemName) {
                    bindings.set(this.#itemName, context.item);
                }
                if (this.#indexName) {
                    bindings.set(this.#indexName, context.index);
                }

                // Create a new VNode for the cloned element
                vNode = new VNode({
                    node: clone,
                    vApplication: this.#vNode.vApplication,
                    parentVNode: this.#vNode.parentVNode,
                    bindings,
                    dependentIdentifiers: [`${this.#sourceName}[${context.index}]`]
                });
                newRenderedItems.set(key, vNode);
                vNode.forceUpdate();
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
        const identifiers = this.#dependentIdentifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        const func = new Function(args, funcBody) as (...args: any[]) => any;

        return () => {
            const values = identifiers.map(id => this.#vNode.bindings?.get(id));
            return func(...values);
        };
    }

    /**
     * Creates a function to evaluate the :key expression for each item.
     */
    #createKeyEvaluator(expression: string): (itemBindings: VBindings) => any {
        // Parse to find all identifiers
        const identifiers = ExpressionUtils.extractIdentifiers(expression, this.#vNode.vApplication.functionDependencies);
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        const func = new Function(args, funcBody) as (...args: any[]) => any;

        return (itemBindings: VBindings) => {
            const values = identifiers.map(id => itemBindings.get(id));
            return func(...values);
        };
    }

    /**
     * Clones the original node of the directive's virtual node.
     * This is used to create a new instance of the node for rendering.
     * @returns The cloned HTMLElement.
     */
    #cloneNode(): HTMLElement {
        // Clone the original element
        const element = this.#vNode.node as HTMLElement;
        return element.cloneNode(true) as HTMLElement;
    }

    /**
     * Update bindings for an existing item
     */
    #updateItemBindings(vNode: VNode, context: { key: any; item: any; index: number }): void {
        // Trigger reactivity update by calling update with the new bindings
        const changedIdentifiers: string[] = [];
        if (this.#itemName) {
            vNode.bindings?.set(this.#itemName, context.item);
        }
        if (this.#indexName) {
            vNode.bindings?.set(this.#indexName, context.index);
        }

        vNode.update();
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
