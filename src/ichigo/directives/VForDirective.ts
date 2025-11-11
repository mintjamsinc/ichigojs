// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VNode } from "../VNode";
import { VBindings } from "../VBindings";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "../VDOMUpdater";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { ExpressionEvaluator } from "../ExpressionEvaluator";

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
     * The expression evaluator for the source data (e.g., "items" in "item in items").
     */
    #sourceEvaluator?: ExpressionEvaluator;

    /**
     * A function that evaluates the :key expression for an item.
     * This is created later when the key directive is available.
     */
    #evaluateKey?: (itemBindings: VBindings) => any;

    /**
     * Parsed v-for expression parts
     */
    #itemName?: string;
    #indexName?: string;
    #thirdName?: string;  // For (value, key, index) triplets
    #sourceName?: string;
    #useOfSyntax: boolean = false;  // Track if 'of' syntax was used

    /**
     * Map to track rendered items by their keys
     */
    #renderedItems = new Map<any, VNode>();

    /**
     * Previous iterations to detect changes
     */
    #previousIterations: Array<{ key: any; item: any; index: number; objectKey?: string }> = [];

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
            this.#thirdName = parsed.thirdName;
            this.#sourceName = parsed.sourceName;
            this.#useOfSyntax = parsed.useOfSyntax;

            // Create evaluator for the source expression
            if (context.vNode.bindings) {
                this.#sourceEvaluator = ExpressionEvaluator.create(
                    parsed.sourceName,
                    context.vNode.bindings,
                    context.vNode.vApplication.functionDependencies
                );
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
        const identifiers = this.#sourceEvaluator?.dependentIdentifiers ?? [];

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
        return this.#sourceEvaluator?.dependentIdentifiers ?? [];
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
        if (!this.#sourceEvaluator) {
            return;
        }

        // Evaluate the source expression to get the data
        const sourceData = this.#sourceEvaluator.evaluate();

        // Get iterations from the source data
        let iterations = this.#getIterations(sourceData);

        // If we don't have a key evaluator yet, try to create it
        const keyExpression = this.#vNode.directiveManager?.keyDirective?.expression;
        if (!this.#evaluateKey && keyExpression !== undefined) {
            this.#evaluateKey = this.#createKeyEvaluator(keyExpression);
        }

        // If we have a custom key evaluator, update the keys
        if (this.#evaluateKey && this.#itemName) {
            iterations = iterations.map((iter): { key: any; item: any; index: number; objectKey?: string } => {
                // Create bindings for this iteration
                const itemBindings = new VBindings({
                    parent: this.#vNode.bindings
                });
                itemBindings.set(this.#itemName!, iter.item);
                if (this.#indexName) {
                    // For objects, use objectKey if available; otherwise use numeric index
                    itemBindings.set(this.#indexName, iter.objectKey ?? iter.index);
                }
                if (this.#thirdName) {
                    // Third argument is always the numeric index
                    itemBindings.set(this.#thirdName, iter.index);
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
    #updateList(newIterations: Array<{ key: any; item: any; index: number; objectKey?: string }>): void {
        const parent = this.#vNode.anchorNode?.parentNode;
        const anchor = this.#vNode.anchorNode;

        if (!parent || !anchor) {
            throw new Error('v-for element must have a parent and anchor');
        }

        const newRenderedItems = new Map<any, VNode>();

        // Track which keys are still needed and detect duplicates
        const neededKeys = new Set<any>();
        const seenKeys = new Set<any>();
        for (const ctx of newIterations) {
            if (seenKeys.has(ctx.key)) {
                console.warn(`[ichigo.js] Duplicate key detected in v-for: "${ctx.key}". This may cause unexpected behavior. Keys should be unique.`);
            }
            seenKeys.add(ctx.key);
            neededKeys.add(ctx.key);
        }

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
                    // For objects, use objectKey if available; otherwise use numeric index
                    bindings.set(this.#indexName, context.objectKey ?? context.index);
                }
                if (this.#thirdName) {
                    // Third argument is always the numeric index
                    bindings.set(this.#thirdName, context.index);
                }

                // Create a new VNode for the cloned element
                vNode = new VNode({
                    node: clone,
                    vApplication: this.#vNode.vApplication,
                    parentVNode: this.#vNode.parentVNode,
                    bindings,
                    dependentIdentifiers: [
                        `${this.#sourceName}[${context.index}]`,
                        ...this.#vNode.vApplication.resolveDependentIdentifiers(this.#sourceName!, context.item)],
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
     * Supports:
     * - item in items
     * - item of items
     * - (item, index) in items
     * - (value, key) in object
     * - (value, key, index) in object
     */
    #parseForExpression(expression: string): {
        itemName: string;
        indexName?: string;
        thirdName?: string;
        sourceName: string;
        useOfSyntax: boolean;
    } {
        // Remove extra spaces
        const normalized = expression.replace(/\s+/g, ' ').trim();

        // Try to split by ' of ' first, then by ' in '
        let parts: string[];
        let useOfSyntax = false;

        if (normalized.includes(' of ')) {
            parts = normalized.split(' of ');
            useOfSyntax = true;
        } else if (normalized.includes(' in ')) {
            parts = normalized.split(' in ');
        } else {
            throw new Error(`Invalid v-for expression: ${expression}. Must use 'in' or 'of'.`);
        }

        if (parts.length !== 2) {
            throw new Error(`Invalid v-for expression: ${expression}`);
        }

        const [left, sourceName] = parts;

        // Check if destructuring: (item, index), (value, key), or (value, key, index)
        if (left.startsWith('(') && left.endsWith(')')) {
            const destructured = left.slice(1, -1).split(',').map(s => s.trim());

            if (destructured.length === 2) {
                // (item, index) or (value, key)
                return {
                    itemName: destructured[0],
                    indexName: destructured[1],
                    sourceName: sourceName.trim(),
                    useOfSyntax
                };
            } else if (destructured.length === 3) {
                // (value, key, index)
                return {
                    itemName: destructured[0],
                    indexName: destructured[1],
                    thirdName: destructured[2],
                    sourceName: sourceName.trim(),
                    useOfSyntax
                };
            } else {
                throw new Error(`Invalid v-for destructuring: ${expression}. Expected 2 or 3 arguments.`);
            }
        }

        // Simple form: item in items
        return {
            itemName: left.trim(),
            sourceName: sourceName.trim(),
            useOfSyntax
        };
    }

    /**
     * Creates a function to evaluate the :key expression for each item.
     * This uses a manual approach because it needs to evaluate with item-specific bindings.
     */
    #createKeyEvaluator(expression: string): (itemBindings: VBindings) => any {
        // Create a temporary evaluator just to extract identifiers and compile the expression
        // We can't use ExpressionEvaluator directly here because we need to evaluate
        // with different bindings (itemBindings) for each iteration
        if (!this.#vNode.bindings) {
            throw new Error('VForDirective requires bindings');
        }

        const tempEvaluator = ExpressionEvaluator.create(
            expression,
            this.#vNode.bindings,
            this.#vNode.vApplication.functionDependencies
        );
        const identifiers = tempEvaluator.dependentIdentifiers;
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
    #updateItemBindings(vNode: VNode, context: { key: any; item: any; index: number; objectKey?: string }): void {
        // Trigger reactivity update by calling update with the new bindings
        if (this.#itemName) {
            vNode.bindings?.set(this.#itemName, context.item);
        }
        if (this.#indexName) {
            // For objects, use objectKey if available; otherwise use numeric index
            vNode.bindings?.set(this.#indexName, context.objectKey ?? context.index);
        }
        if (this.#thirdName) {
            // Third argument is always the numeric index
            vNode.bindings?.set(this.#thirdName, context.index);
        }

        vNode.update();
    }

    /**
     * Get iterations from various data types
     * Supports: Arrays, Objects, Sets, Maps, Iterables, Numbers, Strings
     */
    #getIterations(data: any): Array<{ key: any; item: any; index: number; objectKey?: string }> {
        if (!data) return [];

        // Array
        if (Array.isArray(data)) {
            return data.map((item, index) => ({
                item,
                index,
                key: index
            }));
        }

        // Set
        if (data instanceof Set) {
            return Array.from(data).map((item, index) => ({
                item,
                index,
                key: index
            }));
        }

        // Map
        if (data instanceof Map) {
            return Array.from(data.entries()).map(([key, value], index) => ({
                item: value,
                index,
                key,
                objectKey: String(key)  // Map keys can be any type, convert to string for binding
            }));
        }

        // Check if it's an iterable (but not string, which is also iterable)
        if (typeof data === 'object' && typeof data[Symbol.iterator] === 'function') {
            // It's an iterable (Generator, custom iterator, etc.)
            return Array.from(data).map((item, index) => ({
                item,
                index,
                key: index
            }));
        }

        // Plain Object
        if (typeof data === 'object' && data.constructor === Object) {
            return Object.entries(data).map(([key, value], index) => ({
                item: value,
                index,
                key,
                objectKey: key  // Add objectKey to expose the actual property name
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
