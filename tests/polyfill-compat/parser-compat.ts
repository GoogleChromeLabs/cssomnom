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

import { CSSStyleValue, CSSColorValue, tokenize } from '../../src/index.ts';

export function parseCSSValue(property: string, value: string) {
  return CSSStyleValue.parse(property, value);
}

export function parseAllCSSValues(property: string, value: string) {
  return CSSStyleValue.parseAll(property, value);
}

export function parseColor(color: string) {
  return CSSColorValue.parse(color);
}

export function tokenizeString(str: string) {
  return tokenize(str).filter(t => t.type !== 'EOF');
}
