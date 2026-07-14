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

test('SelectorParser: Reject consecutive combinators', () => {
  const invalidSelectors = [
    '.a + + .b',
    '.a + > .b',
    '.a > > .b',
    '.a ~ + .b',
    '.a || + .b',
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.strictEqual(ast, null, `Should fail to parse consecutive combinators: ${sel}`);
  }
});

test('SelectorParser: Reject trailing combinators', () => {
  const invalidSelectors = [
    '.a +',
    '.a >',
    '.a ~',
    '.a ||',
    '.a + ',
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.strictEqual(ast, null, `Should fail to parse trailing combinator: ${sel}`);
  }
});

test('SelectorParser: Allow valid combinators', () => {
  const validSelectors = [
    '.a + .b',
    '.a > .b',
    '.a ~ .b',
    '.a .b',
    '.a || .b',
  ];

  for (const sel of validSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.ok(ast, `Should parse valid selector: ${sel}`);
  }
});

test('SelectorParser: Column combinator vs Namespace ambiguity', () => {
  const validSelectors = [
    'a || b',
    '* || b',
    'ns|a || b',
    'a||b',
  ];

  for (const sel of validSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.ok(ast, `Should parse valid selector: ${sel}`);
  }
});
