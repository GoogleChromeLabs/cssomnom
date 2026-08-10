/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/CSSOM.ts';

const fixturesPath = new URL('./fixtures/wpt/wpt-nesting.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

describe('WPT Nesting Selector Parsing', () => {
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    test(`Nesting Selector ${i}: "${fixture.input}"`, () => {
      const ruleText = `.foo { ${fixture.input} { color: green; } }`;
      const tokens = tokenize(ruleText);
      const sheet = new Parser(tokens).parseStyleSheet();
      
      assert.strictEqual(sheet.cssRules.length, 1, "Outer rule should exist.");
      const outerRule = sheet.cssRules[0] as CSSStyleRule;
      assert.strictEqual(outerRule.cssRules.length, 1, "Inner rule should exist.");
      const innerRule = outerRule.cssRules[0] as CSSStyleRule;
      assert.strictEqual(innerRule.selectorText, fixture.expected);
    });
  }
});
