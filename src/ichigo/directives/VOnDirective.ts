// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { ExpressionUtils } from "../util/ExpressionUtils";
import { VNode } from "../VNode";
import { StandardDirectiveName } from "./StandardDirectiveName";
import { VBindingsPreparer } from "./VBindingsPreparer";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VDOMUpdater } from "./VDOMUpdater";

/**
 * Directive for binding event listeners to DOM elements.
 * The `v-on` directive allows you to listen to DOM events and execute specified methods when those events are triggered.
 * The syntax for using the `v-on` directive is `v-on:event="methodName"`, where `event` is the name of the event to listen for (e.g., `click`, `mouseover`, etc.), and `methodName` is the name of the method to be called when the event occurs.
 * Example usage:
 *     <button v-on:click="handleClick">Click Me</button>
 * In this example, when the button is clicked, the `handleClick` method will be executed.
 * You can also use the shorthand `@event` instead of `v-on:event`. For example, `@click="handleClick"` is equivalent to `v-on:click="handleClick"`.
 * The `v-on` directive supports event modifiers such as `.stop`, `.prevent`, `.capture`, `.self`, and `.once` to modify the behavior of the event listener.
 * For example, `v-on:click.stop="handleClick"` will stop the event from propagating up the DOM tree.
 * This directive is essential for handling user interactions in your application.
 * Note that the methods referenced in the directive should be defined in the component's methods object.
 */
export class VOnDirective implements VDirective {
    /**
     * The virtual node to which this directive is applied.
     */
    #vNode: VNode;

    /**
     * A list of variable and function names used in the directive's expression.
     */
    #identifiers?: string[];

    /**
     * A function that evaluates the directive's expression.
     * It returns the evaluated value of the expression.
     */
    #evaluate?: () => any;

    /**
     * @param context The context for parsing the directive.
     */
    constructor(context: VDirectiveParseContext) {
        this.#vNode = context.vNode;

        // Parse the expression to extract identifiers and create the evaluator
        const expression = context.attribute.value;
        if (expression) {
            this.#identifiers = ExpressionUtils.extractIdentifiers(expression, context.vNode.vApplication.functionDependencies);
            this.#evaluate = this.#createEvaluator(expression);
        }

        // Remove the directive attribute from the element
        (this.#vNode.node as HTMLElement).removeAttribute(context.attribute.name);
    }

    /**
     * @inheritdoc
     */
    get name(): string {
        return StandardDirectiveName.V_ON;
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
        return false;
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
        return undefined;
    }

    /**
     * @inheritdoc
     */
    destroy(): void {
        // Do nothing. No special cleanup needed.
    }

    /**
     * Creates a function to evaluate the directive's condition.
     * @param expression The expression string to evaluate.
     * @returns A function that evaluates the directive's condition.
     */
    #createEvaluator(expression: string): () => any {
        const identifiers = this.#identifiers ?? [];
        const args = identifiers.join(", ");
        const funcBody = `return (${expression});`;

        // Create a dynamic function with the identifiers as parameters
        const func = new Function(args, funcBody) as (...args: any[]) => any;

        // Return a function that calls the dynamic function with the current values from the virtual node's bindings
        return () => {
            // Gather the current values of the identifiers from the bindings
            const values = identifiers.map(id => this.#vNode.bindings?.[id]);

            // Call the dynamic function with the gathered values
            return func(...values);
        };
    }
}
