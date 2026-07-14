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
import { CSSStyleRule, StyleSheet, CSSImportRule } from '../src/index.ts';


test('parse simple stylesheet', () => {
  const input = 'div { color: red; }';
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  assert.strictEqual(stylesheet.cssRules.length, 1);
  
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.type, 1);
  assert.strictEqual(rule.selectorText, 'div');
  
  const style = rule.style;
  assert.strictEqual(style.getPropertyValue('color'), 'red');
});

test('parse stylesheet with CSS variables', () => {
  const input = ':root { --main-color: red; }';
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  assert.strictEqual(stylesheet.cssRules.length, 1);
  
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.type, 1);
  assert.strictEqual(rule.selectorText, ':root');
  
  const style = rule.style;
  assert.strictEqual(style.getPropertyValue('--main-color'), 'red');
});

test('CSSStyleSheet is an instance of StyleSheet and setting media puts forwards to mediaText', () => {
  const sheet = new Parser(tokenize('div {}')).parseStyleSheet();
  
  // 1. instanceof check
  assert.ok(sheet instanceof StyleSheet);
  
  // 2. [PutForwards=mediaText] check on CSSStyleSheet.media
  assert.strictEqual(sheet.media.mediaText, '');
  sheet.media = 'print';
  assert.strictEqual(sheet.media.mediaText, 'print');
});

test('CSSImportRule.media setting puts forwards to mediaText', () => {
  const sheet = new Parser(tokenize('@import "foo.css" screen;')).parseStyleSheet();
  const importRule = sheet.cssRules[0] as CSSImportRule;
  
  assert.strictEqual(importRule.media.mediaText, 'screen');
  importRule.media = 'print, speech';
  assert.strictEqual(importRule.media.mediaText, 'print, speech');
});

