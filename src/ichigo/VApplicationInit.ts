// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

import { VComponentRegistry } from "./components/VComponentRegistry";
import { VDirectiveParserRegistry } from "./directives/VDirectiveParserRegistry";
import { VApplication } from "./VApplication";
import { VApplicationOptions } from "./VApplicationOptions";

/**
 * The interface for initializing a VApplication instance.
 */
export interface VApplicationInit {
	/**
	 * The options for initializing the application.
	 */
	options: VApplicationOptions;

	/**
	 * The parent application, if any.
	 */
	parentApplication?: VApplication;

	/**
	 * The global directive parser registry.
	 */
	directiveParserRegistry: VDirectiveParserRegistry;

	/**
	 * The global component registry.
	 */
	componentRegistry: VComponentRegistry;
}
