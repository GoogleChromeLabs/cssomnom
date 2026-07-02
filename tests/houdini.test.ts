/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSPropertyRule } from '../src/index.ts';
import fs from 'node:fs';
import path from 'node:path';

interface PropertyTest {
  name?: string;
  input?: string;
  expected: {
    valid: boolean;
    name?: string;
    syntax?: string;
    inherits?: boolean;
    initialValue?: string | null;
    cssText?: string;
  };
}

describe('Houdini Properties and Values API (WPT)', () => {
  const fixturesPath = path.join(process.cwd(), 'tests/fixtures/properties-values-api.json');
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

  describe('@property rules', () => {
    (fixtures.atPropertyRules as PropertyTest[]).forEach((test, index) => {
      if (!test.input) return; // Skip tests without input CSS

      it(`should handle @property ${test.name || index}`, () => {
        if (!test.input) throw new Error('Test input missing');
        const tokens = tokenize(test.input);
        const parser = new Parser(tokens);
        const sheet = parser.parseStyleSheet();

        if (test.expected.valid === false) {
          assert.strictEqual(sheet.cssRules.length, 0, `Expected invalid rule for: ${test.input}`);
        } else {
          assert.strictEqual(sheet.cssRules.length, 1, `Expected one rule for: ${test.input}`);
          const rule = sheet.cssRules[0] as CSSPropertyRule;
          assert.strictEqual(rule.type, 18);
          
          if (test.expected.name) {
             assert.strictEqual(rule.name, test.expected.name);
          }
          if (test.expected.syntax !== undefined) {
             assert.strictEqual(rule.syntax, test.expected.syntax);
          }
          if (test.expected.inherits !== undefined) {
             assert.strictEqual(rule.inherits, test.expected.inherits);
          }
          if (test.expected.initialValue !== undefined) {
             assert.strictEqual(rule.initialValue, test.expected.initialValue);
          }
          
          if (test.expected.cssText) {
             // We normalize whitespace for comparison if needed, but let's try direct comparison first
             assert.strictEqual(rule.cssText.replace(/\s+/g, ' '), test.expected.cssText.replace(/\s+/g, ' '));
          }
        }
      });
    });
  });
});
