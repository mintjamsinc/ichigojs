// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
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
	 * The data bindings associated with this virtual node.
	 */
	bindings: VBindings;
}
