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

test('consumeAtRule does not report error on EOF', () => {
  const tokens = tokenize('@media screen');
  const parser = new Parser(tokens);
  parser.consumeRule();
  
  assert.strictEqual(parser.errors.length, 0, 'Should not have reported errors');
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


