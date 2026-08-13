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
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CSSStyleSheet } from '../src/index.ts';

describe('Legacy CSSStyleSheet members', () => {
  test('sheet.rules is an alias for sheet.cssRules', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('div { color: red; }');
    assert.strictEqual(sheet.rules, sheet.cssRules);
    assert.strictEqual(sheet.rules.length, 1);
    assert.strictEqual(sheet.rules[0].cssText, 'div { color: red; }');
  });

  test('sheet.addRule() adds a rule', () => {
    const sheet = new CSSStyleSheet();
    const result = sheet.addRule('div', 'color: red');
    assert.strictEqual(result, -1);
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'div { color: red; }');
  });

  test('sheet.addRule() with omitted style defaults to empty', () => {
    const sheet = new CSSStyleSheet();
    sheet.addRule('div');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'div { }');
  });

  test('sheet.addRule() with omitted style uses "undefined" string internally', () => {
    const sheet = new CSSStyleSheet();
    let passedRule = '';
    sheet.insertRule = (rule: string) => {
      passedRule = rule;
      return 0;
    };
    sheet.addRule('div');
    assert.strictEqual(passedRule, 'div { undefined }');
  });

  test('sheet.addRule() with index', () => {
    const sheet = new CSSStyleSheet();
    sheet.addRule('div', 'color: red');
    sheet.addRule('span', 'color: blue', 0);
    assert.strictEqual(sheet.cssRules.length, 2);
    assert.strictEqual(sheet.cssRules[0].cssText, 'span { color: blue; }');
    assert.strictEqual(sheet.cssRules[1].cssText, 'div { color: red; }');
  });

  test('sheet.removeRule() removes a rule', () => {
    const sheet = new CSSStyleSheet();
    sheet.addRule('div', 'color: red');
    assert.strictEqual(sheet.cssRules.length, 1);
    sheet.removeRule(0);
    assert.strictEqual(sheet.cssRules.length, 0);
  });

  test('sheet.removeRule() defaults to index 0', () => {
    const sheet = new CSSStyleSheet();
    sheet.addRule('div', 'color: red');
    sheet.addRule('span', 'color: blue');
    assert.strictEqual(sheet.cssRules.length, 2);
    sheet.removeRule();
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'span { color: blue; }');
  });
});
