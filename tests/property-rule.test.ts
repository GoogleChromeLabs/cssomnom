/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSPropertyRule } from '../src/index.ts';

describe('CSSPropertyRule', () => {
  it('should parse @property rule', () => {
    const css = `
      @property --my-color {
        syntax: "<color>";
        inherits: false;
        initial-value: red;
      }
    `;
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const sheet = parser.parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 1);
    const rule = sheet.cssRules[0] as CSSPropertyRule;
    assert.strictEqual(rule.type, 18); // CSSRule.PROPERTY_RULE
    assert.strictEqual(rule.name, '--my-color');
    assert.strictEqual(rule.syntax, '<color>');
    assert.strictEqual(rule.inherits, false);
    assert.strictEqual(rule.initialValue, 'red');
  });

  it('should be invalid if syntax is missing', () => {
    const css = `
      @property --my-color {
        inherits: false;
        initial-value: red;
      }
    `;
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const sheet = parser.parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 0);
  });

  it('should reject @property rule with extraneous tokens in prelude', () => {
    const css = `
      @property --my-color extraneous {
        syntax: "<color>";
        inherits: false;
        initial-value: red;
      }
    `;
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const sheet = parser.parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 0);
  });

  it('should be invalid if syntax is not a string token', () => {
    const css = `
      @property --my-color {
        syntax: <color>;
        inherits: false;
        initial-value: red;
      }
    `;
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const sheet = parser.parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 0);
  });
});
