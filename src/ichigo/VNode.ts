// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { BindingsUtils } from "./util/BindingsUtils";
import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
import { VCloser } from "./VCloser";
import { VDirectiveManager } from "./directives/VDirectiveManager";
import { VNodeInit } from "./VNodeInit";
import { VTextEvaluator } from "./VTextEvaluator";
import { VUpdateContext } from "./VUpdateContext";

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
    #bindings: VBindings;

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
     * The list of dependencies for this virtual node.
     * This is optional and may be undefined if there are no dependencies.
     */
    #dependencies?: VNode[];

    /**
     * The list of identifiers for this virtual node.
     * This includes variable and function names used in expressions.
     */
    #identifiers?: string[];

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
                this.#childVNodes.push(new VNode({
                    node: childNode,
                    vApplication: this.#vApplication,
                    parentVNode: this,
                    bindings: this.#bindings
                }));
            }
        }

        // If there is a parent virtual node, add this node as a dependency
        if (this.#parentVNode) {
            this.#closers = this.#parentVNode.addDependency(this);
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
    get bindings(): VBindings | undefined {
        return this.#bindings;
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
    get identifiers(): string[] {
        // If already computed, return the cached identifiers
        if (this.#identifiers) {
            return this.#identifiers;
        }

        // Collect identifiers from text evaluator and directives
        const identifiers: string[] = [];

        // If this is a text node with a text evaluator, include its identifiers
        if (this.#textEvaluator) {
            identifiers.push(...this.#textEvaluator.identifiers);
        }

        // Include identifiers from directive bindings preparers
        this.#directiveManager?.bindingsPreparers?.forEach(preparer => {
            identifiers.push(...preparer.identifiers);
        });

        // Include identifiers from directive DOM updaters
        this.#directiveManager?.domUpdaters?.forEach(updater => {
            identifiers.push(...updater.identifiers);
        });

        // Remove duplicates by converting to a Set and back to an array
        this.#identifiers = identifiers.length === 0 ? [] : [...new Set(identifiers)];

        return this.#identifiers;
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
     */
    update(context: VUpdateContext): void {
        // Extract context properties
        const { bindings, changedIdentifiers } = context;

        // If this is a text node with a text evaluator, update its content if needed
        if (this.#nodeType === Node.TEXT_NODE && this.#textEvaluator) {
            // Check if any of the identifiers are in the changed identifiers
            const changed = this.#textEvaluator.identifiers.some(id => changedIdentifiers.includes(id));

            // If the text node has changed, update its content
            if (changed) {
                const text = this.#node as Text;
                text.data = this.#textEvaluator.evaluate(bindings);
            }

            return;
        }

        // Save the old bindings for comparison
        const oldBindings = this.#bindings;

        // Prepare new bindings using directive bindings preparers, if any
        let newBindings: VBindings = { ...bindings };
        const changes: string[] = [];
        if (this.#directiveManager?.bindingsPreparers) {
            for (const preparer of this.#directiveManager.bindingsPreparers) {
                const changed = preparer.identifiers.some(id => changedIdentifiers.includes(id));
                if (changed) {
                    newBindings = preparer.prepareBindings(newBindings);
                }
            }
            newBindings = { ...oldBindings, ...newBindings };
            changes.push(...BindingsUtils.getChangedIdentifiers(oldBindings, newBindings));
        } else {
            newBindings = bindings;
            changes.push(...changedIdentifiers);
        }

        // Update the bindings for this node
        this.#bindings = newBindings;

        // If there are no changes in bindings, skip further processing
        if (changes.length === 0) {
            return;
        }

        // Apply DOM updaters from directives, if any
        this.#vApplication.logManager.getLogger(this.constructor.name).debug(`Updating VNode: <${this.#nodeName}> with changes: ${changes.join(", ")}`);
        if (this.#directiveManager?.domUpdaters) {
            for (const updater of this.#directiveManager.domUpdaters) {
                const changed = updater.identifiers.some(id => changes.includes(id));
                if (changed) {
                    updater.applyToDOM();
                }
            }
        }

        // Recursively update dependent virtual nodes
        this.#vApplication.logManager.getLogger(this.constructor.name).debug(`Updating dependent VNodes: ${this.#dependencies?.length || 0}`);
        this.#dependencies?.forEach(dependentNode => {
            // Check if any of the dependent node's identifiers are in the changed identifiers
            if (dependentNode.identifiers.filter(id => changes.includes(id)).length === 0) {
                return;
            }

            // Update the dependent node
            this.#vApplication.logManager.getLogger(this.constructor.name).debug(`Updating dependent VNode: <${dependentNode.nodeName}> due to changes in parent: <${this.#nodeName}>`);
            dependentNode.update({
                bindings: this.#bindings,
                changedIdentifiers: changes,
            } as VUpdateContext);
        });
    }

    /**
     * Adds a dependency on the specified virtual node.
     * This means that if the specified node's bindings change, this node may need to be updated.
     * @param dependentNode The virtual node to add as a dependency.
     * @returns A list of closers to unregister the dependency, or undefined if no dependency was added.
     */
    addDependency(dependentNode: VNode): VCloser[] | undefined {
        // List of closers to unregister dependencies
        const closers: VCloser[] = [];

        // Check if any of the dependent node's identifiers are in this node's identifiers
        let hasIdentifier = dependentNode.identifiers.some(id => this.preparableIdentifiers.includes(id));
        if (!hasIdentifier) {
            if (!this.#parentVNode) {
                hasIdentifier = dependentNode.identifiers.some(id => this.#vApplication.preparableIdentifiers.includes(id));
            }
        }

        // If the dependent node has an identifier in this node's identifiers, add it as a dependency
        if (hasIdentifier) {
            // If the dependencies list is not initialized, create it
            if (!this.#dependencies) {
                this.#dependencies = [];
            }

            // Add the dependent node to the list
            this.#dependencies.push(dependentNode);

            // Create a closer to unregister the dependency
            closers.push({
                close: () => {
                    // Remove the dependent node from the dependencies list
                    const index = this.#dependencies?.indexOf(dependentNode) ?? -1;
                    if (index !== -1) {
                        this.#dependencies?.splice(index, 1);
                    }
                }
            });
        }

        // Recursively add the dependency to the parent node, if any
        this.#parentVNode?.addDependency(dependentNode)?.forEach(closer => closers.push(closer));

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
