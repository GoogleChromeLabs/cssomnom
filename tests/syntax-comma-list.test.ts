/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
