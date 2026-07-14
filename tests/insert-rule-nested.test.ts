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
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleSheet, CSSStyleRule } from '../src/index.ts';

test('CSSStyleRule: insertRule with nested selector', () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('.foo { color: red; }');
  const styleRule = sheet.cssRules[0] as CSSStyleRule;
  
  // Insert a rule that starts with a combinator, valid in nesting
  styleRule.insertRule('> span { color: blue; }', 0);
  
  assert.strictEqual(styleRule.cssRules.length, 1);
  assert.strictEqual(styleRule.cssRules[0].cssText, '& > span { color: blue; }');
});
