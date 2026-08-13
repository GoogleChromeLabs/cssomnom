/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { patchDomPrototypes, patchWindowInstance } from './shims/dom-stubs.ts';
import type { WindowType } from './shims/testharness-bridge.ts';

export type { WindowType, DocumentType, WptSandboxTest } from './shims/testharness-bridge.ts';
export { createWptContext, TYPED_OM_EXPORTS } from './shims/testharness-bridge.ts';

export {
  HarnessError,
  AssertionErrorProxy,
  OptionalFeatureUnsupportedError,
  messageOf,
  WPT_ASSERTIONS,
  sanitize_unpaired_surrogates,
  get_test_name,
  code_unit_str
} from './shims/wpt-assertions.ts';

export {
  ComputedStylePropertyMap,
  FallbackRange,
  FallbackMutationObserver,
  StyleSheetListImpl,
  createPreference,
  createNavigatorPreferences,
  getMediaEnvForWindow,
  patchDomPrototypes,
  patchWindowInstance
} from './shims/dom-stubs.ts';

export {
  WPT_ROOT,
  extractScripts,
  runIframeDocumentWrite,
  setupIframePrototype,
  type IframeSandboxContext
} from './shims/iframe-runner.ts';

export { DOMMatrixReadOnly, DOMMatrix, DOMPointReadOnly, DOMPoint } from '../src/DOMMatrix.ts';

/**
 * Outline Orchestrator for augmenting a LinkeDOM window with CSSOM / Typed OM capabilities.
 */
export function patchWindowForTypedOM(window: WindowType): void {
  patchWindowInstance(window, patchWindowForTypedOM);
  patchDomPrototypes(window, patchWindowForTypedOM);
}
