// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VApplication } from "./VApplication";
import { VBindings } from "./VBindings";
import { VBindingsPreparer } from "./VBindingsPreparer";
import { VNode } from "./VNode";

/**
 * Initialization arguments for bindings.
 */
export interface VBindingsInit {
	/**
	 * The parent bindings, if any.
	 */
	parent?: VBindings;

	/**
	 * The change tracker, if any.
	 * @param identifier The identifier that changed.
	 */
	onChange?: (identifier: string) => void;
}
