/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
