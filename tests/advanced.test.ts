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
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSMediaRule, CSSStyleRule, CSSKeyframesRule, CSSKeyframeRule } from '../src/index.ts';

test('parse @media rule', () => {
  const input = '@media screen { div { color: red; } }';
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  assert.strictEqual(stylesheet.cssRules.length, 1);
  
  const rule = stylesheet.cssRules[0] as CSSMediaRule;
  assert.strictEqual(rule.type, 4);
  // Prelude is 'screen' (trimmed by MediaList)
  assert.strictEqual(rule.media.mediaText, 'screen');
  
  assert.strictEqual(rule.cssRules.length, 1);
  const childRule = rule.cssRules[0] as CSSStyleRule;
  assert.strictEqual(childRule.type, 1);
  assert.strictEqual(childRule.selectorText, 'div');
  assert.strictEqual(childRule.style.getPropertyValue('color'), 'red');
});

test('parse @keyframes rule', () => {
  const input = '@keyframes mymove { from { top: 0px; } to { top: 200px; } }';
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  assert.strictEqual(stylesheet.cssRules.length, 1);
  
  const rule = stylesheet.cssRules[0] as CSSKeyframesRule;
  assert.strictEqual(rule.type, 7);
  // Name is trimmed in parser.ts
  assert.strictEqual(rule.name, 'mymove');
  
  assert.strictEqual(rule.cssRules.length, 2);
  
  const frame1 = rule.cssRules[0] as CSSKeyframeRule;
  assert.strictEqual(frame1.type, 8);
  assert.strictEqual(frame1.keyText, 'from');
  assert.strictEqual(frame1.style.getPropertyValue('top'), '0px');
  
  const frame2 = rule.cssRules[1] as CSSKeyframeRule;
  assert.strictEqual(frame2.type, 8);
  assert.strictEqual(frame2.keyText, 'to');
  assert.strictEqual(frame2.style.getPropertyValue('top'), '200px');
});

test('CSSKeyframesRule.cssText serializes name correctly', () => {
  const rule = new CSSKeyframesRule('123move', []);
  assert.strictEqual(rule.cssText, '@keyframes \\31 23move { }');
});

