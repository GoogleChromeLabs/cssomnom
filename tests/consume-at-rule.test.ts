/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

test('consumeAtRule reports error on EOF', () => {
  const tokens = tokenize('@media screen');
  const parser = new Parser(tokens);
  parser.consumeRule();
  
  assert.strictEqual(parser.errors.length, 1, 'Should have reported 1 error');
  assert.strictEqual(parser.errors[0].message, 'Unexpected EOF in at-rule');
});

test('consumeAtRule does not crash on @font-face without block', () => {
  const tokens = tokenize('@font-face;');
  const parser = new Parser(tokens);
  const rule = parser.consumeRule();
  
  assert.strictEqual(rule, null, 'Should return null for invalid @font-face');
});

test('consumeAtRule does not crash on @page without block', () => {
  const tokens = tokenize('@page;');
  const parser = new Parser(tokens);
  const rule = parser.consumeRule();
  
  assert.strictEqual(rule, null, 'Should return null for invalid @page');
});

test('consumeAtRule does not crash on @property without block', () => {
  const tokens = tokenize('@property --foo;');
  const parser = new Parser(tokens);
  const rule = parser.consumeRule();
  
  assert.strictEqual(rule, null, 'Should return null for invalid @property');
});

test('consumeAtRule does not crash on @keyframes without block', () => {
  const tokens = tokenize('@keyframes name;');
  const parser = new Parser(tokens);
  const rule = parser.consumeRule();
  
  assert.strictEqual(rule, null, 'Should return null for invalid @keyframes');
});

test('consumeAtRule does not crash on margin rule without block', () => {
  const tokens = tokenize('@top-left;');
  const parser = new Parser(tokens);
  const rule = parser.consumeRule();
  
  assert.strictEqual(rule, null, 'Should return null for invalid margin rule');
});

test('consumeAtRuleFromStream returns at-rule on EOF', () => {
  const tokens = tokenize('@unknown');
  const parser = new Parser(tokens);
  const rules = parser.parseBlockContents();
  
  assert.strictEqual(rules.length, 1, 'Should have returned 1 rule');
  // @ts-expect-error - type is Rule, but we know it's CSSAtRule
  assert.strictEqual(rules[0].name, 'unknown');
});

test('consumeAtRuleFromStream returns at-rule on }', () => {
  const tokens = tokenize('@unknown }');
  const parser = new Parser(tokens);
  const rules = parser.parseBlockContents();
  
  assert.strictEqual(rules.length, 1, 'Should have returned 1 rule');
  // @ts-expect-error - type is Rule, but we know it's CSSAtRule
  assert.strictEqual(rules[0].name, 'unknown');
});


