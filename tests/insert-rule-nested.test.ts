/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
