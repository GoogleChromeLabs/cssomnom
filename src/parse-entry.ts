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

// Policy for the `cssomnom/parse` subpath entrypoint:
// Export ONLY what a DOM implementation (e.g. LinkeDOM) needs to parse `<style>` tags and
// `style=""` attributes and expose `document.styleSheets`, `cssRules`, and `element.style`.
//
// Explicitly EXCLUDE from this entrypoint (and its transitive import graph):
// 1. Houdini Typed OM, Geometry & `CSS` namespace (`src/typed-om.ts`, `DOMMatrix`, `StylePropertyMap`) —
//    `src/typed-om/index.ts` registers `ParseHooks.createStylePropertyMap` and prototype descriptors via
//    top-level side effects, so bundlers cannot tree-shake Typed OM out of `CSSStyleRule` in the root entry.
// 2. Cascade & Computed Style engine (`src/cascade.ts`, `getCascadedStyle`, `resolveVariables`, UA stylesheet).
// 3. Static analysis & selector query tools (`src/tools.ts`, `src/walk.ts`, `src/matcher.ts`).
export { parse } from './parser.ts';
export type { ParserOptions, SelectorASTOptions } from './parser.ts';
export * from './CSSOM.ts';
export { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
