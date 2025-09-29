// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Interface representing a closer for effector registration.
 */
export interface VCloser {
	/**
	 * Closes the effector registration, cleaning up any resources used.
	 */
	close(): void;
}
