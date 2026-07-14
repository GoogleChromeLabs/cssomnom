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
import { CSSKeyframesRule, CSSKeyframeRule } from '../src/index.ts';

// Spec citation: https://drafts.csswg.org/css-animations-1/#keyframes
// A keyframe selector is a list of keyframe selectors, which are either the keywords 'from' or 'to', or a percentage.

test('Percentage keyframes are preserved and not dropped', () => {
  const css = `@keyframes test {
    0% { opacity: 0; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  assert.strictEqual(sheet.cssRules.length, 1, 'Should have 1 rule');
  const keyframesRule = sheet.cssRules[0] as CSSKeyframesRule;
  assert.ok(keyframesRule instanceof CSSKeyframesRule, 'Should be CSSKeyframesRule');
  
  // If percentage keyframes are dropped, this will fail.
  assert.strictEqual(keyframesRule.cssRules.length, 3, 'Should have 3 keyframes');
  
  const rule1 = keyframesRule.cssRules[0] as CSSKeyframeRule;
  assert.strictEqual(rule1.keyText, '0%', 'First keyframe should be 0%');
  
  const rule2 = keyframesRule.cssRules[1] as CSSKeyframeRule;
  assert.strictEqual(rule2.keyText, '50%', 'Second keyframe should be 50%');
  
  const rule3 = keyframesRule.cssRules[2] as CSSKeyframeRule;
  assert.strictEqual(rule3.keyText, '100%', 'Third keyframe should be 100%');
});

test('CSSKeyframesRule.length returns correct number of keyframes', () => {
  const css = `@keyframes test {
    from { opacity: 0; }
    to { opacity: 1; }
  }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  const keyframesRule = sheet.cssRules[0] as CSSKeyframesRule;
  assert.strictEqual(keyframesRule.length, 2, 'Should have 2 keyframes');
});

test('CSSKeyframeRule.style setter [PutForwards=cssText] works', () => {
  const rule = new CSSKeyframeRule('from', []);
  rule.style = 'opacity: 1; color: red;';
  assert.strictEqual(rule.style.getPropertyValue('opacity'), '1');
  assert.strictEqual(rule.style.getPropertyValue('color'), 'red');
});

