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
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSStyleRule } from '../src/index.ts';

test('Parser: !important after {} block in declaration', () => {
  const css = `div { color: { var(--x) } !important; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('color'), '{ var(--x) }');
  assert.strictEqual(rule.style.getPropertyPriority('color'), 'important');
});
