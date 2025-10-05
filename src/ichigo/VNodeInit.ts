// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
import { VBindingsPreparer } from "./VBindingsPreparer";
import { VNode } from "./VNode";

/**
 * Initialization arguments for a virtual node.
 */
export interface VNodeInit {
	/**
	 * The DOM node associated with this virtual node.
	 */
	node: Node;

	/**
	 * The virtual application instance this node belongs to.
	 */
	vApplication: VApplication;

	/**
	 * The parent virtual node, if any.
	 */
	parentVNode?: VNode;

	/**
	 * The bindings associated with this virtual node.
	 * This is optional and may be undefined if there are no bindings.
	 */
	bindings?: VBindings;
}
