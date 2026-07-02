/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type {
  CSSImportRule,
  CSSNamespaceRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSFontFaceRule,
  CSSPageRule,
  CSSMarginRule,
  CSSNestedDeclarations
} from '../src/types.ts';

// This is just to use the types so they are not unused
const _importRule: CSSImportRule | null = null;
const _namespaceRule: CSSNamespaceRule | null = null;
const _keyframesRule: CSSKeyframesRule | null = null;
const _keyframeRule: CSSKeyframeRule | null = null;
const _fontFaceRule: CSSFontFaceRule | null = null;
const _pageRule: CSSPageRule | null = null;
const _marginRule: CSSMarginRule | null = null;
const _nestedDeclarations: CSSNestedDeclarations | null = null;

console.log('Types imported successfully', {
  _importRule,
  _namespaceRule,
  _keyframesRule,
  _keyframeRule,
  _fontFaceRule,
  _pageRule,
  _marginRule,
  _nestedDeclarations
});
