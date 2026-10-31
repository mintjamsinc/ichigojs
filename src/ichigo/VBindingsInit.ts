// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";

/**
 * Initialization arguments for bindings.
 */
export interface VBindingsInit {
	/**
	 * The parent bindings, if any.
	 */
	parent?: VBindings;

	/**
	 * The virtual application instance, if any.
	 */
	vApplication?: VApplication;
}
