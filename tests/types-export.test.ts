/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
