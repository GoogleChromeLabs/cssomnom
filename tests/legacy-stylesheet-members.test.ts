/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
    assert.strictEqual(sheet.cssRules[0].cssText, 'div {}');
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
