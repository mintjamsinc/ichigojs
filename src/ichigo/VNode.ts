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
     * The initial set of identifiers that this node depends on.
     * This is optional and may be undefined if there are no dependent identifiers.
     */
    #initDependentIdentifiers?: string[];

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
     * Indicates whether this node has been templatized by a directive.
     * This is optional and may be undefined if the node has not been templatized.
     */
    #templatized?: boolean;

    /**
     * User data storage for lifecycle directives.
     * This provides a Proxy-free space where developers can store arbitrary data
     * associated with this VNode. The data is automatically cleaned up when the
     * VNode is destroyed.
     */
    #userData?: Map<string, any>;

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
        this.#initDependentIdentifiers = args.dependentIdentifiers;

        this.#parentVNode?.addChild(this);

        if (this.#nodeType === Node.TEXT_NODE) {
            // If the node is a text node, check for expressions and create a text evaluator

            const text = this.#node as Text;

            // Create a text evaluator if the text contains expressions
            if (VTextEvaluator.containsExpression(text.data)) {
                this.#textEvaluator = new VTextEvaluator(text.data, this.#vApplication.functionDependencies);
            }
        } else if (this.#nodeType === Node.ELEMENT_NODE) {
            // If the node is an element, initialize directives and child nodes

            const element = this.#node as HTMLElement;

            // Initialize child virtual nodes
            this.#childVNodes = [];

            // Initialize directive manager
            this.#directiveManager = new VDirectiveManager(this);

            // Determine if any directive requires template preservation
            this.#templatized = this.#directiveManager.directives?.some(d => d.templatize) ?? false;

            // If no directive requires template preservation, call onMount for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager.directives?.forEach(d => {
                    d.onMount?.();
                });
            }

            // Create child virtual nodes if template preservation is not required
            if (!this.#templatized) {
                for (const childNode of Array.from(this.#node.childNodes)) {
                    new VNode({
                        node: childNode,
                        vApplication: this.#vApplication,
                        parentVNode: this
                    });
                }
            }

            // After creating child nodes, call onMounted for directives that do not templatize
            if (!this.#templatized) {
                // animation frame to ensure DOM is updated
                requestAnimationFrame(() => {
                    this.#directiveManager?.directives?.forEach(d => {
                        d.onMounted?.();
                    });
                });
            }
        }

        // Register this node as a dependent of the parent node, if any
        this.#closers = this.#parentVNode?.addDependent(this);
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

        // Include initial dependent identifiers, if any
        ids.push(...this.#initDependentIdentifiers ?? []);

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
     * Gets the user data storage for this virtual node.
     * This is lazily initialized and provides a Proxy-free space for storing
     * arbitrary data associated with lifecycle directives.
     * @returns A Map for storing user data.
     */
    get userData(): Map<string, any> {
        if (!this.#userData) {
            this.#userData = new Map();
        }
        return this.#userData;
    }

    /**
     * The DOM path of this virtual node.
     * This is a string representation of the path from the root to this node,
     * using the node names and their indices among siblings with the same name.
     * For example: "DIV[0]/SPAN[1]/#text[0]"
     * @return The DOM path as a string.
     */
    get domPath(): string {
        const path: string[] = [];
        let node: VNode | undefined = this;
        while (node) {
            if (node.parentVNode && node.parentVNode.childVNodes) {
                const siblings = node.parentVNode.childVNodes.filter(
                    v => v.nodeName === node?.nodeName
                );
                const index = siblings.indexOf(node);
                path.unshift(`${node.nodeName}[${index}]`);
            } else {
                path.unshift(node.nodeName);
            }
            node = node.parentVNode;
        }
        return path.join('/');
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

        if (this.#nodeType === Node.TEXT_NODE && this.#textEvaluator) {
            // If this is a text node with a text evaluator, update its content if needed

            // Check if any of the identifiers are in the changed identifiers
            const changed = this.#textEvaluator.identifiers.some(id => changes.includes(id));

            // If the text node has changed, update its content
            if (changed) {
                const text = this.#node as Text;
                text.data = this.#textEvaluator.evaluate(this.bindings);
            }
        } else if (this.#nodeType === Node.ELEMENT_NODE) {
            // If this is an element node, update directives and child nodes

            // If no directive requires template preservation, call onUpdate for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdate?.();
                });
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

            // If no directive requires template preservation, call onUpdated for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdated?.();
                });
            }
        }
    }

    /**
     * Forces an update of the virtual node and its children, regardless of changed identifiers.
     * This method evaluates any expressions in text nodes and applies effectors from directives.
     * It also recursively updates child virtual nodes.
     * This is useful when an immediate update is needed, bypassing the usual change detection.
     */
    forceUpdate(): void {
        if (this.#nodeType === Node.TEXT_NODE && this.#textEvaluator) {
            // If this is a text node with a text evaluator, update its content if needed

            const text = this.#node as Text;
            text.data = this.#textEvaluator.evaluate(this.bindings);
        } else if (this.#nodeType === Node.ELEMENT_NODE) {
            // If this is an element node, update directives and child nodes

            // If no directive requires template preservation, call onUpdate for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdate?.();
                });
            }

            // Prepare new bindings using directive bindings preparers, if any
            if (this.#directiveManager?.bindingsPreparers) {
                // Ensure local bindings are initialized
                if (!this.#bindings) {
                    this.#bindings = new VBindings({ parent: this.bindings });
                }

                // Prepare bindings for each preparer if relevant identifiers have changed
                for (const preparer of this.#directiveManager.bindingsPreparers) {
                    preparer.prepareBindings();
                }
            }

            // Apply DOM updaters from directives, if any
            if (this.#directiveManager?.domUpdaters) {
                for (const updater of this.#directiveManager.domUpdaters) {
                    updater.applyToDOM();
                }
            }

            // Recursively update child virtual nodes
            this.#childVNodes?.forEach(childVNode => {
                childVNode.forceUpdate();
            });

            // If no directive requires template preservation, call onUpdated for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdated?.();
                });
            }
        }
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
     * @param dependentIdentifiers The identifiers that the dependent node relies on.
     * If not provided, the dependent node's own identifiers will be used.
     * @returns A list of closers to unregister the dependency, or undefined if no dependency was added.
     */
    addDependent(dependent: VNode, dependentIdentifiers: string[] | undefined = undefined): VCloser[] | undefined {
        // List of closers to unregister the dependency
        const closers: VCloser[] = [];

        // If dependent identifiers are not provided, use the dependent node's own identifiers
        if (!dependentIdentifiers) {
            dependentIdentifiers = [...dependent.dependentIdentifiers];
        }

        // Prepare alternative identifiers by stripping array indices (e.g., "items[0]" -> "items")
        const allDeps = new Set<string>();
        dependentIdentifiers.forEach(id => {
            allDeps.add(id);

            const idx = id.indexOf('[');
            if (idx !== -1) {
                allDeps.add(id.substring(0, idx));
            }
        });

        // Get this node's identifiers
        const thisIds = [...this.preparableIdentifiers];
        if (this.#bindings) {
            thisIds.push(...this.#bindings?.raw ? Object.keys(this.#bindings.raw) : []);
        }

        // If the dependent node has an identifier in this node's identifiers, add it as a dependency
        if ([...allDeps].some(id => thisIds.includes(id))) {
            // If the dependencies list is not initialized, create it
            if (!this.#dependents) {
                this.#dependents = [];
            }

            // Add the dependent node to the list
            this.#dependents.push(dependent);

            // Remove the matched identifiers from the dependent node's identifiers to avoid duplicate dependencies
            thisIds.forEach(id => {
                const idx = dependentIdentifiers.indexOf(id);
                if (idx !== -1) {
                    dependentIdentifiers.splice(idx, 1);
                }
            });

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
        this.#parentVNode?.addDependent(dependent, dependentIdentifiers)?.forEach(closer => closers.push(closer));

        // Return a closer to unregister the dependency
        return closers.length > 0 ? closers : undefined;
    }

    /**
     * Cleans up any resources used by this virtual node.
     * This method is called when the virtual node is no longer needed.
     *
     * Cleanup order:
     * 1. Call onUnmount lifecycle hooks
     * 2. Auto-cleanup userData (close() on Closeable objects)
     * 3. Recursively destroy child nodes
     * 4. Unregister dependencies
     * 5. Clean up directive manager
     * 6. Call onUnmounted lifecycle hooks
     */
    destroy(): void {
        // If no directive requires template preservation, call onUnmount for directives that do not templatize
        if (!this.#templatized) {
            this.#directiveManager?.directives?.forEach(d => {
                d.onUnmount?.();
            });
        }

        // Clean up user data, calling close() on any Closeable objects
        // This happens after onUnmount but before other cleanup, allowing users to
        // perform custom cleanup in onUnmount while having automatic cleanup of userData
        if (this.#userData) {
            for (const [key, value] of this.#userData.entries()) {
                try {
                    // If the value has a close() method (Closeable pattern), call it
                    if (value && typeof value === 'object' && typeof value.close === 'function') {
                        value.close();
                    }
                } catch (error) {
                    this.#vApplication.logManager.getLogger(this.constructor.name).error(`Error closing user data '${key}': ${error}`);
                }
            }
            this.#userData.clear();
        }

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

        // If no directive requires template preservation, call onUnmounted for directives that do not templatize
        if (!this.#templatized) {
            this.#directiveManager?.directives?.forEach(d => {
                d.onUnmounted?.();
            });
        }
    }
}
