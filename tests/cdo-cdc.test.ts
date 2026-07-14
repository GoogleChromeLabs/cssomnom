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
import * as assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/index.ts';

test('Parser: consumeListOfRules with topLevel=false treats CDO/CDC as part of qualified rule (making it invalid)', () => {
  const tokens = tokenize('<!-- .foo { color: red; } -->');
  const parser = new Parser(tokens);
  
  // If topLevel is false, it should NOT discard them.
  // It should try to parse a qualified rule starting with '<!--'.
  // Since '<!-- .foo' is not a valid selector, it should fail and return no rules.
  const rules = parser.consumeListOfRules(false);
  
  assert.strictEqual(rules.length, 0);
});

test('Parser: consumeListOfRules with topLevel=true discards CDO/CDC', () => {
  const tokens = tokenize('<!-- .foo { color: red; } -->');
  const parser = new Parser(tokens);
  
  // If topLevel is true, it should discard them.
  const rules = parser.consumeListOfRules(true);
  
  assert.strictEqual(rules.length, 1);
  const rule = rules[0];
  assert.ok(rule instanceof CSSStyleRule);
  assert.strictEqual(rule.selectorText.trim(), '.foo');
});
