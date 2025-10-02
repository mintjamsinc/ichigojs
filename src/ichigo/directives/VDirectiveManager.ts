// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VNode } from "../VNode";
import { VBindingsPreparer } from "./VBindingsPreparer";
import { VDOMUpdater } from "./VDOMUpdater";

export class VDirectiveManager {
    /**
     * The virtual node to which this directive handler is associated.
     */
    #vNode: VNode;

    #directives?: VDirective[];

    #anchorNode?: Comment;

    #bindingsPreparers?: VBindingsPreparer[];

    #domUpdaters?: VDOMUpdater[];

    constructor(vNode: VNode) {
        // Directives can only be associated with element nodes
        if (vNode.nodeType !== Node.ELEMENT_NODE) {
            throw new Error("Directives can only be associated with element nodes.");
        }

        this.#vNode = vNode;

        // Parse directives from attributes
        this.#directives = this.#parseDirectives();

        // If any directive needs an anchor, create and insert it
        if (this.#directives?.some(d => d.needsAnchor)) {
            this.#anchorNode = document.createComment("#vnode-anchor");
            const element = this.#vNode.node as HTMLElement;
            element.parentNode?.insertBefore(this.#anchorNode, element);
        }

        // Collect bindings preparers and DOM updaters from directives
        this.#bindingsPreparers = this.#directives?.map(d => d.bindingsPreparer).filter((preparer): preparer is VBindingsPreparer => preparer !== undefined);
        this.#domUpdaters = this.#directives?.map(d => d.domUpdater).filter((updater): updater is VDOMUpdater => updater !== undefined);
    }

    /**
     * The list of directives associated with the virtual node.
     * This may be undefined if there are no directives.
     */
    get directives(): VDirective[] | undefined {
        return this.#directives;
    }

    /**
     * The anchor comment node used for certain directives.
     * This may be undefined if no directive requires an anchor.
     */
    get anchorNode(): Comment | undefined {
        return this.#anchorNode;
    }

    /**
     * The list of bindings preparers from the associated directives.
     * This may be undefined if no directive provides a bindings preparer.
     */
    get bindingsPreparers(): VBindingsPreparer[] | undefined {
        return this.#bindingsPreparers;
    }

    /**
     * The list of DOM updaters from the associated directives.
     * This may be undefined if no directive provides a DOM updater.
     */
    get domUpdaters(): VDOMUpdater[] | undefined {
        return this.#domUpdaters;
    }

    /**
     * Cleans up any resources used by the directive handler.
     */
    destroy(): void {
        // Clean up directives
        if (this.#directives) {
            for (const directive of this.#directives) {
                try {
                    directive.destroy();
                } catch (error) {
                    this.#vNode.vApplication.logManager.getLogger(this.constructor.name).error(`Error destroying '${directive.name}' directive: ${error}`);
                }
            }
        }
    }

    #parseDirectives(): VDirective[] | undefined {
        const element = this.#vNode.node as HTMLElement;

        // Parse directives from attributes
        const directives: VDirective[] = [];
        for (const attribute of Array.from(element.attributes)) {
            // Create a context for parsing the directive
            const context: VDirectiveParseContext = {
                vNode: this.#vNode,
                attribute: attribute
            };

            // Find a parser for the directive
            const parser = this.#vNode.vApplication.directiveParserRegistry.findParser(context);
            if (parser) {
                // Parse the directive and add it to the list
                const directive = parser.parse(context);
                directives.push(directive);
            }
        }

        // Sort directives by priority: v-for > v-if > v-else-if > v-else > v-show > others
        // Directives not in this list are sorted to the end in original order
        const order:string[] = [
            StandardDirectiveName.V_FOR,
            StandardDirectiveName.V_IF,
            StandardDirectiveName.V_ELSE_IF,
            StandardDirectiveName.V_ELSE,
            StandardDirectiveName.V_SHOW
        ];
        const sortedDirectives = directives.slice().sort((a, b) => {
            const aIndex = order.indexOf(a.name);
            const bIndex = order.indexOf(b.name);
            const aOrder = aIndex === -1 ? order.length : aIndex;
            const bOrder = bIndex === -1 ? order.length : bIndex;
            return aOrder - bOrder;
        });

        // Return the list of directives, or undefined if there are none
        return sortedDirectives.length > 0 ? sortedDirectives : undefined;
    }
}
