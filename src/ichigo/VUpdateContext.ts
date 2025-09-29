// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VBindings } from "./VBindings";

/**
 * Context provided during the update of the virtual DOM.
 * This context includes the current bindings and a list of identifiers that have changed.
 */
export interface VUpdateContext {
	/**
	 * The current bindings.
	 */
	bindings: VBindings;

	/**
	 * A list of variable and function names whose values have changed.
	 */
	changedIdentifiers: string[];
}
