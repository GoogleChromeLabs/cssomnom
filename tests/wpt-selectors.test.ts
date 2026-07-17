/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSNamespaceRule } from '../src/CSSOM.ts';
import { serializeSelectorList } from '../src/serializer.ts';

const fixturesPath = new URL('./fixtures/selectors.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

function unescapeWptString(s: string): string {
  return s.replace(/\\{2}/g, '\\');
}

describe('WPT Selectors parsing and serialization', () => {
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const source = unescapeWptString(fixture.source);
    const expected = fixture.expected === 'parse error' ? 'parse error' : unescapeWptString(fixture.expected);

    test(`Selector ${i}: "${source}"`, () => {
      let sheet;
      let threw = false;
      try {
        const cssText = source + "{ font-size: 1em; }";
        const tokens = tokenize(cssText);
        sheet = new Parser(tokens).parseStyleSheet();
      } catch (e) {
        threw = true;
        if (expected !== 'parse error') {
          throw e;
        }
      }

      if (expected === 'parse error') {
        if (!threw) {
          const lastRule = sheet ? sheet.cssRules[sheet.cssRules.length - 1] : null;
          if (lastRule && lastRule.type === 1) { // STYLE_RULE
            assert.fail(`Expected parsing to fail, but it succeeded`);
          }
        }
      } else {
        assert.ok(!threw, 'Expected parsing to succeed, but it threw');
        assert.ok(sheet, 'Expected a parsed sheet');
        const lastRule = sheet.cssRules[sheet.cssRules.length - 1];
        assert.ok(lastRule, 'Expected a rule to be parsed');
        assert.strictEqual(lastRule.type, 1); // STYLE_RULE
        
        let hasDefaultNamespace = false;
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSNamespaceRule && !rule.prefix) {
            hasDefaultNamespace = true;
            break;
          }
        }

        const styleRule = lastRule as CSSStyleRule;
        assert.ok(styleRule.selectorAST, 'Expected AST to be present');
        const actual = serializeSelectorList(styleRule.selectorAST, hasDefaultNamespace);
        assert.strictEqual(actual, expected);
      }
    });
  }
});
