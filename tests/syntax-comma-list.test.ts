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
import type { Token } from '../src/types.ts';

test('Parser: parseCommaSeparatedListOfComponentValues', () => {
  const css = 'a, b , c ';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const list = parser.parseCommaSeparatedListOfComponentValues();

  assert.strictEqual(list.length, 3);
  // list[0] should be 'a'
  assert.strictEqual(list[0].length, 1);
  assert.strictEqual(list[0][0].type, 'ident');
  assert.strictEqual((list[0][0] as Token).value, 'a');

  // list[1] should be ' b ' (not trimmed)
  assert.strictEqual(list[1].length, 3);
  assert.strictEqual(list[1][0].type, 'whitespace');
  assert.strictEqual(list[1][1].type, 'ident');
  assert.strictEqual((list[1][1] as Token).value, 'b');
  assert.strictEqual(list[1][2].type, 'whitespace');

  // list[2] should be ' c ' (not trimmed)
  assert.strictEqual(list[2].length, 3);
  assert.strictEqual(list[2][0].type, 'whitespace');
  assert.strictEqual(list[2][1].type, 'ident');
  assert.strictEqual((list[2][1] as Token).value, 'c');
  assert.strictEqual(list[2][2].type, 'whitespace');
});

test('Parser: parseCommaSeparatedListOfComponentValues with empty items', () => {
  const css = 'a, , c';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const list = parser.parseCommaSeparatedListOfComponentValues();

  assert.strictEqual(list.length, 3);
  assert.strictEqual(list[0].length, 1);
  // list[1] should be ' ' (whitespace), not empty because we don't trim
  assert.strictEqual(list[1].length, 1);
  assert.strictEqual(list[1][0].type, 'whitespace');
  assert.strictEqual(list[2].length, 2);
  assert.strictEqual(list[2][0].type, 'whitespace');
  assert.strictEqual(list[2][1].type, 'ident');
  assert.strictEqual((list[2][1] as Token).value, 'c');
});
