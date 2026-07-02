/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleSheet, CSSMediaRule, CSSNestedDeclarations, CSSStyleRule } from '../src/index.ts';

test('CSSGroupingRule: insertRule fallback to declaration', () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('@media (width > 0px) {}');
  const mediaRule = sheet.cssRules[0] as CSSMediaRule;
  
  // Traditional rule: works
  mediaRule.insertRule('div { color: blue; }', 0);
  assert.strictEqual(mediaRule.cssRules.length, 1);
  
  // Declaration: should work (fallback to CSSNestedDeclarations)
  mediaRule.insertRule('color: red;', 1);
  assert.strictEqual(mediaRule.cssRules.length, 2);
  assert.ok(mediaRule.cssRules[1] instanceof CSSNestedDeclarations, 'Should be instance of CSSNestedDeclarations');
  assert.strictEqual(mediaRule.cssRules[1].cssText, 'color: red;');

  // Trailing garbage: should throw
  assert.throws(() => mediaRule.insertRule('color: red; span {}', 2), /SyntaxError/);
});

test('CSSStyleRule: insertRule fallback to declaration', () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('.foo {}');
  const styleRule = sheet.cssRules[0] as CSSStyleRule;
  
  styleRule.insertRule('color: red;', 0);
  assert.strictEqual(styleRule.cssRules.length, 1);
  assert.ok(styleRule.cssRules[0] instanceof CSSNestedDeclarations, 'Should be instance of CSSNestedDeclarations');
  assert.strictEqual(styleRule.cssRules[0].cssText, 'color: red;');
});
