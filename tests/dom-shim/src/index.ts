/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { patchDomPrototypes, patchWindowInstance } from './dom-stubs.ts';
import type { WindowType } from './testharness-bridge.ts';

export * from './wpt-assertions.ts';
export * from './dom-stubs.ts';
export * from './testharness-bridge.ts';
export * from './iframe-runner.ts';

/**
 * Outline Orchestrator for augmenting a LinkeDOM window with CSSOM / Typed OM capabilities.
 */
export function patchWindowForTypedOM(window: WindowType): void {
  patchWindowInstance(window, patchWindowForTypedOM);
  patchDomPrototypes(window, patchWindowForTypedOM);
}
