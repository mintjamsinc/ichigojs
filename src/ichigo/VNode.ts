// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
import { VCloser } from "./VCloser";
import { VDirectiveManager } from "./directives/VDirectiveManager";
import { VNodeInit } from "./VNodeInit";
import { VTextEvaluator } from "./VTextEvaluator";

/**
 * Represents a virtual node in the virtual DOM.
 * A virtual node corresponds to a real DOM node and contains additional information for data binding and directives.
 * This class is responsible for managing the state and behavior of the virtual node, including its bindings, directives, and child nodes.
 */
export class VNode {
    /**
     * The application instance associated with this virtual node.
     */
    #vApplication: VApplication;

    /**
     * The DOM node represented by this virtual node.
     */
    #node: Node;

    /**
     * The type of the DOM node (e.g., element, text, comment).
     */
    #nodeType: number;

    /**
     * The name of the DOM node (e.g., tag name for elements).
     */
    #nodeName: string;

    /**
     * The parent virtual node, if any.
     * This is optional and may be undefined for the root node.
     */
    #parentVNode?: VNode;

    /**
     * The child virtual nodes, if any.
     * This is optional and may be undefined if there are no child nodes.
     */
    #childVNodes?: VNode[];

    /**
     * The data bindings associated with this virtual node, if any.
     */
    #bindings?: VBindings;

    /**
     * An evaluator for text nodes that contain expressions in {{...}}.
     * This is used to dynamically update the text content based on data bindings.
     * This is optional and may be undefined if the node is not a text node or does not contain expressions.
     */
    #textEvaluator?: VTextEvaluator;

    /**
     * The directive manager associated with this virtual node.
     * This manages any directives applied to the node.
     */
    #directiveManager?: VDirectiveManager;

    /**
     * The list of dependents for this virtual node.
     * This is optional and may be undefined if there are no dependents.
     */
    #dependents?: VNode[];

    /**
     * The list of identifiers for this virtual node.
     * This includes variable and function names used in expressions.
     * This is optional and may be undefined if there are no identifiers.
     */
    #dependentIdentifiers?: string[];

    /**
     * The list of preparable identifiers for this virtual node.
     * This includes variable and function names used in directive bindings preparers.
     * This is optional and may be undefined if there are no preparers.
     */
    #preparableIdentifiers?: string[];

    /**
     * The list of closers to unregister dependencies.
     * This is optional and may be undefined if there are no dependencies.
     */
    #closers?: VCloser[];

    /**
     * Creates an instance of the virtual node.
     * @param args The initialization arguments for the virtual node.
     */
    constructor(args: VNodeInit) {
        this.#vApplication = args.vApplication;
        this.#node = args.node;
        this.#nodeType = args.node.nodeType;
        this.#nodeName = args.node.nodeName;
        this.#parentVNode = args.parentVNode;
        this.#bindings = args.bindings;

        this.#parentVNode?.addChild(this);

        // If the node is a text node, check for expressions and create a text evaluator
        if (this.#nodeType === Node.TEXT_NODE) {
            const text = this.#node as Text;

            // Create a text evaluator if the text contains expressions
            if (VTextEvaluator.containsExpression(text.data)) {
                this.#textEvaluator = new VTextEvaluator(text.data, this.#vApplication.functionDependencies);
            }
        }

        // If the node is an element, initialize directives and child nodes
        if (this.#nodeType === Node.ELEMENT_NODE && this.#node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
            const element = this.#node as HTMLElement;

            // Initialize directive manager
            this.#directiveManager = new VDirectiveManager(this);

            // Initialize child virtual nodes
            this.#childVNodes = [];

            // Recursively create VNode instances for child nodes
            for (const childNode of Array.from(this.#node.childNodes)) {
                new VNode({
                    node: childNode,
                    vApplication: this.#vApplication,
                    parentVNode: this
                });
            }
        }

        // If there is a parent virtual node, add this node as a dependency
        if (this.#parentVNode) {
            this.#closers = this.#parentVNode.addDependent(this);
        }
    }

    /**
     * The application instance associated with this virtual node.
     */
    get vApplication(): VApplication {
        return this.#vApplication;
    }

    /**
     * The node associated with this virtual node.
     */
    get node(): Node {
        return this.#node;
    }

    /**
     * The type of the node associated with this virtual node.
     */
    get nodeType(): number {
        return this.#nodeType;
    }

    /**
     * The name of the node associated with this virtual node.
     */
    get nodeName(): string {
        return this.#nodeName;
    }

    /**
     * The parent virtual node, if any.
     * This is optional and may be undefined for the root node.
     */
    get parentVNode(): VNode | undefined {
        return this.#parentVNode;
    }

    /**
     * The child virtual nodes, if any.
     * This is optional and may be undefined if there are no child nodes.
     */
    get childVNodes(): VNode[] | undefined {
        return this.#childVNodes;
    }

    /**
     * The previous sibling virtual node, if any.
     * This is optional and may be undefined if there is no previous sibling.
     */
    get previousSibling(): VNode | undefined {
        if (!this.#parentVNode || !this.#parentVNode.childVNodes) {
            return undefined;
        }

        const siblings = this.#parentVNode.childVNodes;
        const index = siblings.indexOf(this);
        if (index > 0) {
            return siblings[index - 1];
        }

        return undefined;
    }

    /**
     * The next sibling virtual node, if any.
     * This is optional and may be undefined if there is no next sibling.
     */
    get nextSibling(): VNode | undefined {
        if (!this.#parentVNode || !this.#parentVNode.childVNodes) {
            return undefined;
        }

        const siblings = this.#parentVNode.childVNodes;
        const index = siblings.indexOf(this);
        if (index !== -1 && index < siblings.length - 1) {
            return siblings[index + 1];
        }

        return undefined;
    }

    /**
     * The data bindings associated with this virtual node, if any.
     */
    get bindings(): VBindings {
        if (this.#bindings) {
            return this.#bindings;
        }
        return this.#parentVNode?.bindings!;
    }

    /**
     * The directive manager associated with this virtual node.
     * This manages any directives applied to the node.
     */
    get directiveManager(): VDirectiveManager | undefined {
        return this.#directiveManager;
    }

    /**
     * The anchor comment node used to mark the position of the element in the DOM.
     * This is used for directives that may remove the element from the DOM,
     * allowing it to be re-inserted at the correct position later.
     * This is optional and may be undefined if not applicable.
     */
    get anchorNode(): Comment | undefined {
        return this.#directiveManager?.anchorNode;
    }

    /**
     * Indicates whether the node is currently in the DOM.
     * This checks if the node has a parent that is not a document fragment.
     * @return True if the node is in the DOM, otherwise false.
     */
    get isInDOM(): boolean {
        return this.#node.parentNode !== null && this.#node.parentNode.nodeType !== Node.DOCUMENT_FRAGMENT_NODE;
    }

    /**
     * Indicates whether this virtual node is the root node (i.e., has no parent).
     * @return True if this is the root node, otherwise false.
     */
    get isRoot(): boolean {
        return this.#parentVNode === undefined;
    }

    /**
     * The list of identifiers for this virtual node.
     * This includes variable and function names used in expressions.
     */
    get dependentIdentifiers(): string[] {
        // If already computed, return the cached dependent identifiers
        if (this.#dependentIdentifiers) {
            return this.#dependentIdentifiers;
        }

        // Collect identifiers from text evaluator and directives
        const ids: string[] = [];

        // If this is a text node with a text evaluator, include its identifiers
        if (this.#textEvaluator) {
            ids.push(...this.#textEvaluator.identifiers);
        }

        // Include identifiers from directive bindings preparers
        this.#directiveManager?.bindingsPreparers?.forEach(preparer => {
            ids.push(...preparer.dependentIdentifiers);
        });

        // Include identifiers from directive DOM updaters
        this.#directiveManager?.domUpdaters?.forEach(updater => {
            ids.push(...updater.dependentIdentifiers);
        });

        // Remove duplicates by converting to a Set and back to an array
        this.#dependentIdentifiers = [...new Set(ids)];

        return this.#dependentIdentifiers;
    }

    get preparableIdentifiers(): string[] {
        // If already computed, return the cached preparable identifiers
        if (this.#preparableIdentifiers) {
            return this.#preparableIdentifiers;
        }

        // Collect preparable identifiers from directive bindings preparers
        const preparableIdentifiers: string[] = [];

        // Include preparable identifiers from directive bindings preparers
        this.#directiveManager?.bindingsPreparers?.forEach(preparer => {
            preparableIdentifiers.push(...preparer.preparableIdentifiers);
        });

        // Remove duplicates by converting to a Set and back to an array
        this.#preparableIdentifiers = preparableIdentifiers.length === 0 ? [] : [...new Set(preparableIdentifiers)];

        return this.#preparableIdentifiers;
    }

    /**
     * Updates the virtual node and its children based on the current bindings.
     * This method evaluates any expressions in text nodes and applies effectors from directives.
     * It also recursively updates child virtual nodes.
     * @param context The context for the update operation.
     * This includes the current bindings and a list of identifiers that have changed.
     */
    update(): void {
        const changes = this.bindings?.changes || [];

        // If this is a text node with a text evaluator, update its content if needed
        if (this.#nodeType === Node.TEXT_NODE && this.#textEvaluator) {
            // Check if any of the identifiers are in the changed identifiers
            const changed = this.#textEvaluator.identifiers.some(id => changes.includes(id));

            // If the text node has changed, update its content
            if (changed) {
                const text = this.#node as Text;
                text.data = this.#textEvaluator.evaluate(this.bindings);
            }

            return;
        }

        // Prepare new bindings using directive bindings preparers, if any
        if (this.#directiveManager?.bindingsPreparers) {
            // Ensure local bindings are initialized
            if (!this.#bindings) {
                this.#bindings = new VBindings({ parent: this.bindings });
            }

            // Prepare bindings for each preparer if relevant identifiers have changed
            for (const preparer of this.#directiveManager.bindingsPreparers) {
                const changed = preparer.dependentIdentifiers.some(id => changes.includes(id));
                if (changed) {
                    preparer.prepareBindings();
                }
            }
        }

        // Apply DOM updaters from directives, if any
        if (this.#directiveManager?.domUpdaters) {
            for (const updater of this.#directiveManager.domUpdaters) {
                const changed = updater.dependentIdentifiers.some(id => changes.includes(id));
                if (changed) {
                    updater.applyToDOM();
                }
            }
        }

        // Recursively update dependent virtual nodes
        this.#dependents?.forEach(dependentNode => {
            const changed = dependentNode.dependentIdentifiers.some(id => changes.includes(id));
            if (changed) {
                dependentNode.update();
            }
        });
    }

    /**
     * Adds a child virtual node to this virtual node.
     * @param child The child virtual node to add.
     */
    addChild(child: VNode): void {
        this.#childVNodes?.push(child);
    }

    /**
     * Adds a dependent virtual node that relies on this node's bindings.
     * @param dependent The dependent virtual node to add.
     * @returns A list of closers to unregister the dependency, or undefined if no dependency was added.
     */
    addDependent(dependent: VNode): VCloser[] | undefined {
        // List of closers to unregister the dependency
        const closers: VCloser[] = [];

        // Check if any of the dependent node's identifiers are in this node's identifiers
        let hasIdentifier = dependent.dependentIdentifiers.some(id => this.preparableIdentifiers.includes(id));
        if (!hasIdentifier) {
            hasIdentifier = dependent.dependentIdentifiers.some(id => this.#bindings?.has(id, false) ?? false);
        }

        // If the dependent node has an identifier in this node's identifiers, add it as a dependency
        if (hasIdentifier) {
            // If the dependencies list is not initialized, create it
            if (!this.#dependents) {
                this.#dependents = [];
            }

            // Add the dependent node to the list
            this.#dependents.push(dependent);

            // Create a closer to unregister the dependency
            closers.push({
                close: () => {
                    // Remove the dependent node from the dependencies list
                    const index = this.#dependents?.indexOf(dependent) ?? -1;
                    if (index !== -1) {
                        this.#dependents?.splice(index, 1);
                    }
                }
            });
        }

        // Recursively add the dependency to the parent node, if any
        this.#parentVNode?.addDependent(dependent)?.forEach(closer => closers.push(closer));

        // Return a closer to unregister the dependency
        return closers.length > 0 ? closers : undefined;
    }

    /**
     * Cleans up any resources used by this virtual node.
     * This method is called when the virtual node is no longer needed.
     */
    destroy(): void {
        // Recursively destroy child nodes
        if (this.#childVNodes) {
            for (const childVNode of this.#childVNodes) {
                try {
                    childVNode.destroy();
                } catch (error) {
                    this.#vApplication.logManager.getLogger(this.constructor.name).error(`Error destroying child VNode: ${error}`);
                }
            }
        }

        // Unregister dependencies
        if (this.#closers) {
            for (const closer of this.#closers) {
                try {
                    closer.close();
                } catch (error) {
                    this.#vApplication.logManager.getLogger(this.constructor.name).error(`Error closing dependency closer: ${error}`);
                }
            }
        }

        // Clean up directive handler
        this.#directiveManager?.destroy();
    }
}
