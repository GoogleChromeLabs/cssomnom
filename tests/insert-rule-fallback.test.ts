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
