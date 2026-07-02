/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
