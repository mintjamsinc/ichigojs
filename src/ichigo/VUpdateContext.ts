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

	/**
	 * Indicates if this is the initial update.
	 * This flag is true when the update is being performed for the first time after the VNode's creation.
	 * It can be used to optimize rendering or initialization logic that should only run once.
	 */
	isInitial?: boolean;
}
