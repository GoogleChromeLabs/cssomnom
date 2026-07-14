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
import { CSSStyleRule } from '../src/index.ts';

test('Shorthand priority requires all longhands to be important (partially set)', () => {
  const css = `.foo { margin-top: 10px !important; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.strictEqual(style.getPropertyPriority('margin'), '');
});

test('Shorthand priority returns important when all longhands are important', () => {
  const css = `.foo { margin-top: 10px !important; margin-right: 10px !important; margin-bottom: 10px !important; margin-left: 10px !important; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.strictEqual(style.getPropertyPriority('margin'), 'important');
});

test('Shorthand priority requires all longhands to be important (all present, some important)', () => {
  const css = `.foo { margin-top: 10px !important; margin-right: 10px; margin-bottom: 10px; margin-left: 10px; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.strictEqual(style.getPropertyPriority('margin'), '');
});

test('Shorthand priority returns important when all logical longhands are important', () => {
  const css = `.foo { margin-block-start: 10px !important; margin-inline-start: 10px !important; margin-block-end: 10px !important; margin-inline-end: 10px !important; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.strictEqual(style.getPropertyPriority('margin'), 'important');
});
