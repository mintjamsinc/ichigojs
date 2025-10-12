// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { StandardDirectiveName } from "./StandardDirectiveName";
import { VDirective } from "./VDirective";
import { VDirectiveParseContext } from "./VDirectiveParseContext";
import { VNode } from "../VNode";
import { VBindingsPreparer } from "../VBindingsPreparer";
import { VDOMUpdater } from "../VDOMUpdater";
import { VBindDirective } from "./VBindDirective";
import { VComponentDirective } from "./VComponentDirective";

/**
 * Manages directives associated with a virtual node (VNode).
 * This class is responsible for parsing, storing, and managing the lifecycle of directives.
 * It also provides access to bindings preparers and DOM updaters from the associated directives.
 */
export class VDirectiveManager {
    /**
     * The virtual node to which this directive handler is associated.
     */
    #vNode: VNode;

    /**
     * The list of directives associated with the virtual node.
     * This may be undefined if there are no directives.
     */
    #directives?: VDirective[];

    /**
     * The anchor comment node used for certain directives (e.g., v-if, v-for).
     * This may be undefined if no directive requires an anchor.
     */
    #anchorNode?: Comment;

    /**
     * The list of bindings preparers from the associated directives.
     * This may be undefined if no directive provides a bindings preparer.
     */
    #bindingsPreparers?: VBindingsPreparer[];

    /**
     * The list of DOM updaters from the associated directives.
     * This may be undefined if no directive provides a DOM updater.
     */
    #domUpdaters?: VDOMUpdater[];

    /**
     * The directive that binds the ":key" or "v-bind:key" attribute, if any.
     * This directive is special and is used for optimizing rendering of lists.
     * If no such directive exists, this is undefined.
     */
    #keyDirective?: VBindDirective;

    /**
     * A cache of VBindDirectives for options specific to certain directives.
     * The keys are directive names (e.g., 'options', 'options.intersection').
     */
    #optionsDirectives: Record<string, VBindDirective | undefined> = {};

    /**
     * The v-component directive associated with this node, if any.
     * This may be undefined if there is no v-component directive.
     */
    #componentDirective?: VComponentDirective;

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

            // Remove the template element from DOM after anchor is created
            // This prevents the template from being displayed
            element.parentNode?.removeChild(element);
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
     * Gets the directive that binds the ":key" or "v-bind:key" attribute, if any.
     * This directive is special and is used for optimizing rendering of lists.
     * If no such directive exists, this returns undefined.
     */
    get keyDirective(): VBindDirective | undefined {
        return this.#keyDirective;
    }

    /**
     * Gets the v-component directive associated with this node, if any.
     * This may be undefined if there is no v-component directive.
     */
    get componentDirective(): VComponentDirective | undefined {
        return this.#componentDirective;
    }

    /**
     * Gets the VBindDirective for options specific to the given directive name.
     * Searches in order: `:options.{directive}` -> `:options`
     *
     * @param directive The directive name (e.g., 'intersection', 'resize')
     * @returns The VBindDirective instance or undefined
     */
    optionsDirective(directive: string): VBindDirective | undefined {
        if (!this.#directives || this.#directives.length === 0) {
            return undefined;
        }

        // Search for `:options.{directive}` or `v-bind:options.{directive}` first
        const specificAttrName = `options.${directive}`;
        if (this.#optionsDirectives[specificAttrName]) {
            return this.#optionsDirectives[specificAttrName];
        }

        // Fallback: search for `:options` or `v-bind:options`
        if (this.#optionsDirectives['options']) {
            return this.#optionsDirectives['options'];
        }

        return undefined;
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

        // Collect relevant attributes
        const attributes: Attr[] = [];
        if (element.hasAttribute(StandardDirectiveName.V_FOR)) {
            attributes.push(element.getAttributeNode(StandardDirectiveName.V_FOR)!);

            for (const attr of Array.from(element.attributes)) {
                if (['v-bind:key', ':key'].includes(attr.name)) {
                    attributes.push(attr);
                    break;
                }
            }
        } else if (element.hasAttribute(StandardDirectiveName.V_IF)) {
            attributes.push(element.getAttributeNode(StandardDirectiveName.V_IF)!);
        } else if (element.hasAttribute(StandardDirectiveName.V_ELSE_IF)) {
            attributes.push(element.getAttributeNode(StandardDirectiveName.V_ELSE_IF)!);
        } else if (element.hasAttribute(StandardDirectiveName.V_ELSE)) {
            attributes.push(element.getAttributeNode(StandardDirectiveName.V_ELSE)!);
        } else {
            attributes.push(...Array.from(element.attributes));
        }

        // Parse directives from attributes
        const directives: VDirective[] = [];
        for (const attribute of attributes) {
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

                // If this is a key binding directive, store it separately
                if (directive.name === StandardDirectiveName.V_BIND && (directive as unknown as VBindDirective).isKey) {
                    this.#keyDirective = directive as unknown as VBindDirective;
                }

                // If this is an options binding directive, cache it
                if (directive.name === StandardDirectiveName.V_BIND && (directive as unknown as VBindDirective).isOptions) {
                    const bindDirective = directive as unknown as VBindDirective;
                    const attrName = bindDirective.attributeName;
                    if (attrName) {
                        this.#optionsDirectives[attrName] = bindDirective;
                    }
                }

                // If this is a v-component directive, store it separately
                if (directive.name === StandardDirectiveName.V_COMPONENT) {
                    this.#componentDirective = directive as unknown as VComponentDirective;
                }
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
