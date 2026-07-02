/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';

test('Validate :nth-child() arguments', () => {
  // Valid arguments
  assert.ok(Parser.parseSelectorAST(':nth-child(even)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(odd)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n+1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n + 1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(+2n+1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(5)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(-n+3)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(n-3)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n + 1 of .foo)'));

  // Invalid arguments
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(abc)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n +)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n + foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(of .foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n + 1 of)'), null);
});

test('Validate :dir() arguments', () => {
  assert.ok(Parser.parseSelectorAST(':dir(ltr)'));
  assert.ok(Parser.parseSelectorAST(':dir(rtl)'));
  
  assert.strictEqual(Parser.parseSelectorAST(':dir(123)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':dir(ltr, rtl)'), null);
});

test('Validate :lang() arguments', () => {
  assert.ok(Parser.parseSelectorAST(':lang(en)'));
  assert.ok(Parser.parseSelectorAST(':lang("en")'));
  assert.ok(Parser.parseSelectorAST(':lang(en, fr)'));
  
  assert.strictEqual(Parser.parseSelectorAST(':lang(123)'), null);
});
