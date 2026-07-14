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
import { CSSStyleSheet, CSSFontFaceRule, CSSPageRule, CSSMarginRule, CSSFontFaceDescriptors, CSSPageDescriptors, CSSMarginDescriptors } from '../src/index.ts';

test('CSSFontFaceRule.style returns CSSFontFaceDescriptors', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@font-face { font-family: "Test"; }');
  const rule = sheet.cssRules[0] as CSSFontFaceRule;
  assert.ok(rule.style instanceof CSSFontFaceDescriptors);
});

test('CSSPageRule.style returns CSSPageDescriptors', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@page { margin: 1cm; }');
  const rule = sheet.cssRules[0] as CSSPageRule;
  assert.ok(rule.style instanceof CSSPageDescriptors);
});

test('CSSMarginRule.style returns CSSMarginDescriptors', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@page { @top-left { content: "test"; } }');
  const pageRule = sheet.cssRules[0] as CSSPageRule;
  const rule = pageRule.cssRules[0] as CSSMarginRule;
  assert.ok(rule.style instanceof CSSMarginDescriptors);
});

test('CSSFontFaceRule.style exposes descriptors as properties', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@font-face { font-family: "Test"; src: url("test.woff"); }');
  const rule = sheet.cssRules[0] as CSSFontFaceRule;
  assert.strictEqual(rule.style.fontFamily, '"Test"');
  assert.strictEqual(rule.style.src, 'url("test.woff")');
});

test('CSSPageRule.style exposes descriptors as properties', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@page { size: a4; }');
  const rule = sheet.cssRules[0] as CSSPageRule;
  assert.strictEqual(rule.style.size, 'a4');
});

test('CSSPageRule.style exposes missing descriptors as properties', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@page { page-orientation: rotate-left; page-margin-safety: clamp; }');
  const rule = sheet.cssRules[0] as CSSPageRule;
  assert.strictEqual(rule.style.pageOrientation, 'rotate-left');
  assert.strictEqual(rule.style.pageMarginSafety, 'clamp');
});

test('CSSPageRule.style supports margin descriptors and dashed aliases', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@page { margin-top: 10px; }');
  const rule = sheet.cssRules[0] as CSSPageRule;

  rule.style.margin = '20px';
  rule.style.marginTop = '10px';
  rule.style['margin-top'] = '15px';
  rule.style.pageOrientation = 'rotate-left';
  rule.style['page-orientation'] = 'rotate-right';
  rule.style.marks = 'crop';
  rule.style.bleed = '5px';

  assert.strictEqual(rule.style.margin, '15px 20px 20px');

  assert.strictEqual(rule.style.marginTop, '15px');
  assert.strictEqual(rule.style['margin-top'], '15px');
  assert.strictEqual(rule.style.pageOrientation, 'rotate-right');
  assert.strictEqual(rule.style['page-orientation'], 'rotate-right');
  assert.strictEqual(rule.style.marks, 'crop');
  assert.strictEqual(rule.style.bleed, '5px');
});
