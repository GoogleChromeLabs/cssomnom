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
