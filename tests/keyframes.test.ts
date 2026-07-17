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
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSKeyframesRule, CSSKeyframeRule } from '../src/index.ts';

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

test('CSS Animations Level 1 Spec Compliance (Phase 68 Task 7)', () => {
  // @keyframes name validation (disallowed custom-idents)
  const parseSheet = (css: string) => {
    const parser = new Parser(tokenize(css));
    return parser.parseStyleSheet();
  };

  assert.strictEqual(parseSheet('@keyframes none {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes initial {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes inherit {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes unset {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes revert {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes default {}').cssRules.length, 0);
  assert.strictEqual(parseSheet('@keyframes "" {}').cssRules.length, 0);

  // Percentage range checks: keyframe selectors must be in [0, 100]
  assert.strictEqual(parseSheet('@keyframes test { -10% { opacity: 0; } }').cssRules.length, 1);
  // wait! In the rule, does it drop the invalid keyframe, or keep the valid ones?
  // "If a keyframe selector is invalid, the entire keyframe block must be ignored."
  // Wait, let's see. If the keyframe selector -10% is invalid, does the keyframe rule get dropped, or does the parent at-rule get dropped?
  // "If a keyframe selector is invalid, the entire keyframe block must be ignored."
  // "keyframe block" means the individual keyframe rule block, i.e., `-10% { opacity: 0; }`.
  // So the parent `@keyframes test` rule is still parsed, but the invalid keyframe is ignored.
  const rangeCheckSheet = parseSheet('@keyframes test { -10% { opacity: 0; } 50% { opacity: 0.5; } 110% { opacity: 1; } }');
  const testRule = rangeCheckSheet.cssRules[0] as CSSKeyframesRule;
  assert.strictEqual(testRule.cssRules.length, 1); // Only 50% is valid, other two are dropped!
  assert.strictEqual((testRule.cssRules[0] as CSSKeyframeRule).keyText, '50%');

  // Selector keyword normalization
  const normSheet = parseSheet('@keyframes test { from { opacity: 0; } to { opacity: 1; } }');
  const normRule = normSheet.cssRules[0] as CSSKeyframesRule;
  assert.strictEqual((normRule.cssRules[0] as CSSKeyframeRule).keyText, '0%');
  assert.strictEqual((normRule.cssRules[1] as CSSKeyframeRule).keyText, '100%');

  // keyText setter
  const kfRule = new CSSKeyframeRule('from', []);
  assert.strictEqual(kfRule.keyText, '0%'); // constructor also normalizes
  kfRule.keyText = '50%';
  assert.strictEqual(kfRule.keyText, '50%');
  kfRule.keyText = ' to ';
  assert.strictEqual(kfRule.keyText, '100%');
  assert.throws(() => { kfRule.keyText = 'invalid'; }, { name: 'SyntaxError' });
  assert.throws(() => { kfRule.keyText = '-10%'; }, { name: 'SyntaxError' });
  assert.throws(() => { kfRule.keyText = '110%'; }, { name: 'SyntaxError' });
  assert.strictEqual(kfRule.keyText, '100%'); // unchanged on failure

  // CSSKeyframesRule index accessors & Proxy
  const indexRule = parseSheet('@keyframes test { 0% { opacity: 0; } 100% { opacity: 1; } }').cssRules[0] as CSSKeyframesRule;
  assert.ok(indexRule[0] instanceof CSSKeyframeRule);
  assert.strictEqual(indexRule[0].keyText, '0%');
  assert.ok(indexRule[1] instanceof CSSKeyframeRule);
  assert.strictEqual(indexRule[1].keyText, '100%');
  assert.strictEqual(indexRule[2], undefined);

  // Disallowed keyword name serialization
  const disallowedRule = new CSSKeyframesRule('none', []);
  assert.strictEqual(disallowedRule.cssText, '@keyframes "none" { }');

  // findRule/appendRule/deleteRule
  const rule = parseSheet('@keyframes test { 0% { opacity: 0; } }').cssRules[0] as CSSKeyframesRule;
  assert.strictEqual(rule.findRule('0%'), rule.cssRules[0]);
  assert.strictEqual(rule.findRule('from'), rule.cssRules[0]);
  assert.strictEqual(rule.findRule('100%'), null);

  rule.appendRule('50% { opacity: 0.5; }');
  assert.strictEqual(rule.length, 2);
  assert.strictEqual((rule.cssRules[1] as CSSKeyframeRule).keyText, '50%');

  rule.deleteRule('0%');
  assert.strictEqual(rule.length, 1);
  assert.strictEqual((rule.cssRules[0] as CSSKeyframeRule).keyText, '50%');
});
