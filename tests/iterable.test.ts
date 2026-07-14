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
import {
  CSSStyleSheet,
  MediaList,
  StyleSheetList,
  CSSRule,
  CSSStyleRule
} from '../src/index.ts';

test('CSSRuleList is iterable', () => {
  const css = `.a {} .b {} .c {}`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const ruleList = sheet.cssRules;

  assert.strictEqual(ruleList.length, 3);
  
  const rules = [];
  for (const rule of ruleList) {
    rules.push(rule);
  }
  
  assert.strictEqual(rules.length, 3);
  assert.ok(rules[0] instanceof CSSRule);
  assert.strictEqual((rules[0] as unknown as CSSStyleRule).selectorText, '.a');
});

test('StyleSheetList is iterable', () => {
  const sheet1 = new CSSStyleSheet();
  const sheet2 = new CSSStyleSheet();
  const list = new StyleSheetList([sheet1, sheet2]);

  assert.strictEqual(list.length, 2);
  
  const sheets = [];
  for (const sheet of list) {
    sheets.push(sheet);
  }
  
  assert.strictEqual(sheets.length, 2);
  assert.strictEqual(sheets[0], sheet1);
  assert.strictEqual(sheets[1], sheet2);
});

test('MediaList is iterable', () => {
  const list = new MediaList('print, screen');

  assert.strictEqual(list.length, 2);
  
  const media = [];
  for (const m of list) {
    media.push(m);
  }
  
  assert.strictEqual(media.length, 2);
  assert.strictEqual(media[0], 'print');
  assert.strictEqual(media[1], 'screen');
});

test('CSSStyleDeclaration is iterable', () => {
  const css = `.foo { color: red; margin: 10px; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
  const style = rule.style;

  assert.ok(style.length >= 2);
  
  const props = [];
  for (const prop of style) {
    props.push(prop);
  }
  
  assert.strictEqual(props.length, style.length);
  assert.ok(props.includes('color'));
});
