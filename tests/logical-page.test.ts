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
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSPageRule } from '../src/index.ts';

test('@page with :recto and :verso', () => {
  const css = '@page :recto { margin: 1in; } @page :verso { margin: 2in; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  const rule1 = stylesheet.cssRules[0] as CSSPageRule;
  assert.strictEqual(rule1.selectorText, ':recto');
  
  const rule2 = stylesheet.cssRules[1] as CSSPageRule;
  assert.strictEqual(rule2.selectorText, ':verso');
});

test('page-break-after with recto/verso', () => {
  const css = '.test { page-break-after: recto; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;
  
  assert.strictEqual(rule.style.getPropertyValue('page-break-after').trim(), 'recto');
});
