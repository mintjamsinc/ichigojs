// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
import { IchigoElementRegistry } from "./components/IchigoElementRegistry";
import { VDirectiveManager } from "./directives/VDirectiveManager";
import { VNodeInit } from "./VNodeInit";
import { VTextEvaluator } from "./VTextEvaluator";
import { ReactiveEffect } from "./util/ReactiveEffect";
import { VFragmentRange } from "./util/VFragmentRange";

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
     * The effects that render this node, one per binding: its text, or each of its
     * directives' bindings preparers and DOM updaters. Created when a binding first renders.
     */
    #effects?: Map<object, ReactiveEffect>;

    /**
     * The effects notified since this node last flushed.
     */
    #staleEffects?: Set<ReactiveEffect>;

    /**
     * Whether a directive of this node has an update hook.
     */
    #hasUpdateHooks: boolean = false;

    /**
     * The nearest node, this one included, whose update hooks follow what is rendered
     * inside it (see VNodeInit.updateHooksFollowContent).
     */
    #updateHookHost?: VNode;

    /**
     * Indicates whether this node has been templatized by a directive.
     * This is optional and may be undefined if the node has not been templatized.
     */
    #templatized?: boolean;

    static #lastOrder = 0;

    /**
     * The position of this node in the order nodes were created: a parent comes before its
     * children, and a v-if or v-for before the clones it creates.
     */
    readonly order: number = ++VNode.#lastOrder;

    /**
     * User data storage for lifecycle directives.
     * This provides a Proxy-free space where developers can store arbitrary data
     * associated with this VNode. The data is automatically cleaned up when the
     * VNode is destroyed.
     */
    #userData?: Map<string, any>;

    /**
     * When this VNode wraps a <template>-derived DocumentFragment that has been
     * expanded into the DOM, this range tracks the start/end boundary of the
     * expanded content. Directives such as v-for and v-if use this to move or
     * remove the entire fragment atomically.
     */
    #fragmentRange?: VFragmentRange;

    /**
     * Set by {@link destroy}. A destroyed node also leaves its parent's child
     * list, but a walk that took its copy of the list before the node was
     * destroyed may still reach it, and must skip it.
     */
    #destroyed: boolean = false;

    /**
     * Custom element tags already reported by
     * {@link VNode.#warnIfUnknownCustomElement}.
     */
    static #warnedUnknownTags: Set<string> = new Set();

    /**
     * Warns about a hyphenated tag that no one has registered — a forgotten
     * import, a missing defineComponent() call, or a typo in the tag name.
     * Such an element is compiled as an ordinary element and renders its own
     * children, which looks enough like a working page to cost an afternoon.
     * Reported once per tag; third-party custom elements are recognised
     * through the registry the browser keeps.
     */
    static #warnIfUnknownCustomElement(nodeName: string): void {
        const tag = nodeName.toLowerCase();
        if (!tag.includes('-') || VNode.#warnedUnknownTags.has(tag)) {
            return;
        }
        if (typeof customElements !== 'undefined' && customElements.get(tag)) {
            return;
        }
        VNode.#warnedUnknownTags.add(tag);
        console.warn(`[ichigo] <${tag}>: unknown custom element — nothing has registered this tag.`
            + ' Did you forget to import its module or call defineComponent(), or is the tag misspelled?');
    }

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
        this.#updateHookHost = args.parentVNode ? args.parentVNode.#updateHookHost : undefined;

        // A node compiled while a directive renders (a v-if or v-for clone) is not part of
        // what that directive depends on
        ReactiveEffect.untracked(() => this.#compile(args.updateHooksFollowContent ?? false));
    }

    /**
     * Compiles the node and its children.
     * @param updateHooksFollowContent See VNodeInit.updateHooksFollowContent.
     */
    #compile(updateHooksFollowContent: boolean): void {
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

            // If the element is a component defined via defineComponent(), install
            // the host context so component-boundary features (e.g. scoped slot
            // outlets) can reach back into this application's scope.
            const isComponent = IchigoElementRegistry.has(this.#nodeName);
            if (isComponent) {
                (element as any)._ichigoHost = { vNode: this };
            } else {
                VNode.#warnIfUnknownCustomElement(this.#nodeName);
            }

            // Initialize child virtual nodes
            this.#childVNodes = [];

            // Initialize directive manager
            this.#directiveManager = new VDirectiveManager(this);

            // Determine if any directive requires template preservation
            this.#templatized = this.#directiveManager.directives?.some(d => d.templatize) ?? false;

            // Determine if a directive has an update hook
            this.#hasUpdateHooks = !this.#templatized && (this.#directiveManager.directives?.some(d => d.onUpdate || d.onUpdated) ?? false);
            if (updateHooksFollowContent && this.#hasUpdateHooks) {
                this.#updateHookHost = this;
            }

            // If no directive requires template preservation, call onMount for directives that do not templatize
            if (!this.#templatized) {
                this.#directiveManager.directives?.forEach(d => {
                    d.onMount?.();
                });
            }

            // A component whose template is already expanded compiles its own
            // internals with its own VApplication — this (parent) application must
            // not adopt them (that would strip the component's directives and
            // evaluate its expressions in the wrong scope). An unexpanded component
            // element only contains authored slot content, which does belong to
            // this application's scope and is compiled normally.
            const isExpandedComponent = isComponent && (element as any)._ichigoExpanded === true;
            if (isExpandedComponent) {
                this.#vApplication.logManager.getLogger(this.constructor.name)
                    .debug(`Skipped compiling internals of expanded component <${this.#nodeName.toLowerCase()}>`);
            }

            // Create child virtual nodes if template preservation is not required
            if (!this.#templatized && !isExpandedComponent) {
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
        } else if (this.#nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            // If the node is a DocumentFragment, create child VNodes for its children
            // DocumentFragment is not an Element so it has no directives itself.
            this.#childVNodes = [];
            for (const childNode of Array.from(this.#node.childNodes)) {
                new VNode({
                    node: childNode,
                    vApplication: this.#vApplication,
                    parentVNode: this
                });
            }
        }
    }

    /**
     * Expands the component elements this application compiled in this subtree
     * but has not expanded yet, parents before their children.
     *
     * This is the ONLY thing that expands a component. It is deliberately a
     * separate step from compilation rather than a call at the end of the
     * constructor: a v-if / v-for clone is compiled while it is still detached
     * (so that its directives run before anything can observe a half-built
     * subtree), and expanding a detached element would mount a component
     * application outside the document. The callers therefore compile, insert,
     * and then call this — see VApplication.mount, VConditionalDirective,
     * VForDirective and VSlotOutletDirective.
     *
     * Walking only {@link childVNodes} keeps the traversal inside this
     * application: the internals of an expanded component were never compiled
     * here, so they are not reachable and are left to their own application.
     * The one exception is content a directive rendered outside its own
     * children — scoped slot content — reached through
     * {@link VDirective.expandComponents}.
     *
     * Only connected elements are expanded. v-if / v-for call this right after
     * inserting a clone, but when that clone sits inside another clone that is
     * still detached (nested directives, or slot content rendered by an outlet
     * inside a component's v-if), the insertion is not into the document yet;
     * the outer inserter's walk reaches the same nodes once it is. A
     * templatized node (a v-if / v-for source) is not expanded itself, but its
     * rendered clones are its children and are walked.
     */
    expandComponents(): void {
        // A component mounting while a directive renders is not part of what it depends on
        ReactiveEffect.untracked(() => this.#expandComponents());
    }

    #expandComponents(): void {
        if (this.#destroyed) {
            return;
        }

        // Expand only a connected element. A subtree compiled and inserted
        // into a still-detached clone (a v-if / v-for nested in another
        // clone, or in scoped slot content rendered inside one) is reached
        // again by the walk of whoever inserts that clone into the document —
        // and by then its elements are upgraded and ready to expand.
        // A templatized node is a template source: never expanded itself,
        // but its rendered clones are its child VNodes and are walked below.
        if (!this.#templatized && this.#nodeType === Node.ELEMENT_NODE && IchigoElementRegistry.has(this.#nodeName)) {
            const element = this.#node as HTMLElement & {
                _ichigoExpanded?: boolean;
                _ichigoExpand?: () => void;
            };
            if (element._ichigoExpanded !== true && element.isConnected) {
                element._ichigoExpand?.();
            }
        }

        // Subtrees a directive rendered outside this VNode's children (the
        // scoped slot content of a <slot> outlet) are expanded here too: this
        // walk runs once the subtree is in the document, which the outlet
        // cannot know when it renders inside a detached v-if / v-for clone.
        this.#directiveManager?.directives?.forEach(d => d.expandComponents?.());

        // A copy: expanding can render and destroy clones under this node.
        this.#childVNodes?.slice().forEach(child => child.#expandComponents());
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
     * The DOM range that bounds this VNode's expanded fragment content, if any.
     * Set by directives that expand a <template> into a DocumentFragment
     * (currently v-for and v-if).
     */
    get fragmentRange(): VFragmentRange | undefined {
        return this.#fragmentRange;
    }

    set fragmentRange(range: VFragmentRange | undefined) {
        this.#fragmentRange = range;
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
     * Renders the bindings of this node that were notified since the last flush. The
     * application calls this in creation order, so a parent's v-if or v-for has run, and
     * destroyed whatever it removes, before the nodes under it.
     */
    flush(): void {
        const stale = this.#staleEffects;
        this.#staleEffects = undefined;
        if (this.#destroyed) {
            return;
        }

        // Call onUpdate before anything of this node renders, and onUpdated when the whole
        // pass has: a node's content renders after it, as a node of its own.
        if (this.#hasUpdateHooks) {
            ReactiveEffect.untracked(() => this.#directiveManager?.directives?.forEach(d => {
                d.onUpdate?.();
            }));
            this.#vApplication.afterFlush(() => {
                if (!this.#destroyed) {
                    ReactiveEffect.untracked(() => this.#directiveManager?.directives?.forEach(d => {
                        d.onUpdated?.();
                    }));
                }
            });
        }

        // In creation order: a bindings preparer runs before the DOM updaters that use it
        this.#effects?.forEach(effect => {
            if (stale?.has(effect)) {
                effect.run();
            }
        });
    }

    /**
     * Schedules this node's update hooks without any of its bindings being stale: a v-for
     * row rebound from the list counts as updated even when its item is the same.
     */
    requestUpdate(): void {
        if (this.#hasUpdateHooks) {
            this.#vApplication.enqueue(this);
        }
    }

    /**
     * Forces an update of the virtual node and its children, whether or not anything changed.
     * This method evaluates any expressions in text nodes and applies effectors from directives.
     * It also recursively updates child virtual nodes.
     * This is how a node first renders, which is what records what its bindings depend on.
     */
    forceUpdate(): void {
        // One pass per outermost call; a call made while a pass runs (a directive rendering
        // a fresh clone, a component mounting) joins it. The node is stamped with the pass,
        // so that the recursion over the children below skips a child a directive has
        // already rendered in this pass (see #forceChildren).
        const outermost = VNode.#forcePass === 0;
        if (outermost) {
            VNode.#forcePass = ++VNode.#forcePassCounter;
        }
        this.#forcedInPass = VNode.#forcePass;
        try {
            this.#forceUpdate();
        } finally {
            if (outermost) {
                VNode.#forcePass = 0;
            }
        }
    }

    /**
     * The pass counter behind {@link forceUpdate}: the last pass number handed out.
     */
    static #forcePassCounter = 0;

    /**
     * The pass that is running, or 0 between passes.
     */
    static #forcePass = 0;

    /**
     * The pass this node was last forced in, or 0 if never.
     */
    #forcedInPass = 0;

    /**
     * Forces the children that have not been forced in the running pass. A v-if / v-for /
     * slot clone is a child of its host, and the host's directive renders it with its own
     * forceUpdate() call as soon as it is created, so recursing into it here would render it a
     * second time. A clone that already existed has not been forced in this pass and is
     * still forced here.
     */
    #forceChildren(): void {
        // A copy: an update can destroy a v-if / v-for clone, which removes it from this list.
        this.#childVNodes?.slice().forEach(childVNode => {
            if (childVNode.#forcedInPass !== VNode.#forcePass) {
                childVNode.forceUpdate();
            }
        });
    }

    /**
     * The body of {@link forceUpdate}, run within a pass.
     */
    #forceUpdate(): void {
        if (this.#nodeType === Node.TEXT_NODE && this.#textEvaluator) {
            // If this is a text node with a text evaluator, update its content if needed
            this.#renderText();
        } else if (this.#nodeType === Node.ELEMENT_NODE) {
            // If this is an element node, update directives and child nodes

            // If no directive requires template preservation, call onUpdate for directives that do not templatize
            if (!this.#templatized) {
                ReactiveEffect.untracked(() => this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdate?.();
                }));
            }

            // Prepare new bindings using directive bindings preparers, if any
            if (this.#directiveManager?.bindingsPreparers) {
                // Ensure local bindings are initialized
                if (!this.#bindings) {
                    this.#bindings = new VBindings({ parent: this.bindings });
                }

                // Prepare bindings for each preparer
                for (const preparer of this.#directiveManager.bindingsPreparers) {
                    this.#runEffect(preparer, () => preparer.prepareBindings());
                }
            }

            // Apply DOM updaters from directives, if any
            if (this.#directiveManager?.domUpdaters) {
                for (const updater of this.#directiveManager.domUpdaters) {
                    this.#runEffect(updater, () => updater.applyToDOM());
                }
            }

            // Recursively update child virtual nodes
            this.#forceChildren();

            // If no directive requires template preservation, call onUpdated for directives that do not templatize
            if (!this.#templatized) {
                ReactiveEffect.untracked(() => this.#directiveManager?.directives?.forEach(d => {
                    d.onUpdated?.();
                }));
            }
        } else if (this.#nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            // For document fragments, recursively force update child VNodes
            this.#forceChildren();
        }
    }

    /**
     * Evaluates this text node's expressions into its content.
     */
    #renderText(): void {
        const text = this.#node as Text;
        this.#runEffect(this.#textEvaluator!, () => {
            text.data = this.#textEvaluator!.evaluate(this.bindings);
        });
    }

    /**
     * Runs one binding's render step as an effect, so that what it reads decides when it
     * renders again.
     * @param unit What the step belongs to: the text evaluator, a preparer or an updater.
     * @param render The render step.
     */
    #runEffect(unit: object, render: () => void): void {
        this.#effects ??= new Map();
        let effect = this.#effects.get(unit);
        if (!effect) {
            effect = new ReactiveEffect(() => this.#renderSafely(render), (stale) => {
                (this.#staleEffects ??= new Set()).add(stale);
                this.#vApplication.enqueue(this);
                if (this.#updateHookHost) {
                    this.#vApplication.enqueue(this.#updateHookHost);
                }
            });
            this.#effects.set(unit, effect);
        }
        effect.run();
    }

    /**
     * Runs one binding's render step. A binding whose expression throws (for example one that
     * reads a member of a value that is still undefined) is logged and left as it was, so that
     * it does not stop the rest of the tree from rendering.
     * @param render The render step.
     */
    #renderSafely(render: () => void): void {
        try {
            render();
        } catch (error) {
            this.#vApplication.logManager.getLogger(this.constructor.name).error(`Error rendering ${this.#describe()}: ${error}`);
        }
    }

    /**
     * Describes this node for a log message: a text node by its text, an element by its tag.
     */
    #describe(): string {
        if (this.#nodeType === Node.TEXT_NODE) {
            return `text "${(this.#node.textContent ?? '').trim()}"`;
        }
        return `<${this.#nodeName.toLowerCase()}>`;
    }

    /**
     * Adds a child virtual node to this virtual node.
     * @param child The child virtual node to add.
     */
    addChild(child: VNode): void {
        this.#childVNodes?.push(child);
    }

    /**
     * Cleans up any resources used by this virtual node.
     * This method is called when the virtual node is no longer needed.
     *
     * Cleanup order:
     * 1. Call onUnmount lifecycle hooks
     * 2. Auto-cleanup userData (close() on Closeable objects)
     * 3. Recursively destroy child nodes
     * 4. Stop this node's effects
     * 5. Clean up directive manager
     * 6. Call onUnmounted lifecycle hooks
     * 7. Leave the parent's child list
     */
    destroy(): void {
        this.#destroyed = true;

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

        // Recursively destroy child nodes (a copy: each one leaves this list)
        if (this.#childVNodes) {
            for (const childVNode of this.#childVNodes.slice()) {
                try {
                    childVNode.destroy();
                } catch (error) {
                    this.#vApplication.logManager.getLogger(this.constructor.name).error(`Error destroying child VNode: ${error}`);
                }
            }
        }

        // Stop rendering: nothing this node read may reach it any more
        this.#effects?.forEach(effect => effect.stop());
        this.#effects = undefined;

        // Clean up directive handler
        this.#directiveManager?.destroy();

        // If no directive requires template preservation, call onUnmounted for directives that do not templatize
        if (!this.#templatized) {
            this.#directiveManager?.directives?.forEach(d => {
                d.onUnmounted?.();
            });
        }

        // Leave the parent's child list. v-if and v-for render every new clone
        // under the same parent VNode, so a destroyed clone left in the list
        // would keep its whole subtree — VNodes, DOM nodes, bindings — alive
        // for as long as the parent, growing with each toggle or row change.
        const siblings = this.#parentVNode ? this.#parentVNode.#childVNodes : undefined;
        const index = siblings ? siblings.indexOf(this) : -1;
        if (index !== -1) {
            siblings!.splice(index, 1);
        }
    }
}
