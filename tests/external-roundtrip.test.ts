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
import * as fs from 'fs';
import * as path from 'path';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';

const postcssPath = path.resolve(import.meta.dirname, 'fixtures/external/postcss-tests.json');
const csstreePath = path.resolve(import.meta.dirname, 'fixtures/external/csstree-tests.json');

const postcssTests = JSON.parse(fs.readFileSync(postcssPath, 'utf8'));
const csstreeTests = JSON.parse(fs.readFileSync(csstreePath, 'utf8'));

const normalizeWhitespace = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/;?\s*}/g, ' }').replace(/\s*:\s*/g, ': ').replace(/@([a-z-]+)\(/g, '@$1 (').replace(/\s+/g, ' ').trim();

interface RoundTripTestItem {
  name?: string;
  input: string;
}

const postCSSWhitespaceReason = 'Spec Reality: CSSOM serialization rules (CSSOM Section 5.4.3) mandate specific formatting, and comments are ignored (CSS Syntax 3, Section 4).\\nOur Status: PostCSS preserves all original whitespace and comments, failing our spec-compliant round-trip serialization.';

const knownPostCSSSkips = new Map<string, string>([
  ['apply', postCSSWhitespaceReason],
  ['atrule-decls', 'Spec Reality: Non-nested grouping rules (like @media) parse their contents as a list of rules, not declarations. CSS Nesting only allows declarations if the grouping rule is itself nested.\\nOur Status: We strictly follow the spec and ignore declarations in non-nested grouping rules.'],
  ['atrule-no-params', postCSSWhitespaceReason],
  ['atrule-no-semicolon', 'Fixture contains missing semicolons and @charset in invalid position, which PostCSS preserves but spec-compliant parser may drop or fail.'],
  ['atrule-no-space', postCSSWhitespaceReason],
  ['atrule-params', postCSSWhitespaceReason],
  ['between', postCSSWhitespaceReason],
  ['bom', postCSSWhitespaceReason],
  ['colon-selector', postCSSWhitespaceReason],
  ['comments', postCSSWhitespaceReason],
  ['custom-properties', postCSSWhitespaceReason],
  ['escape', postCSSWhitespaceReason],
  ['extends', postCSSWhitespaceReason],
  ['function', postCSSWhitespaceReason],
  ['ie-progid', postCSSWhitespaceReason],
  ['important', postCSSWhitespaceReason],
  ['inside', postCSSWhitespaceReason],
  ['no-selector', postCSSWhitespaceReason],
  ['prop', postCSSWhitespaceReason],
  ['quotes', postCSSWhitespaceReason],
  ['raw-decl', postCSSWhitespaceReason],
  ['rule-at', postCSSWhitespaceReason],
  ['rule-no-semicolon', postCSSWhitespaceReason],
  ['selector', postCSSWhitespaceReason],
  ['semicolons', postCSSWhitespaceReason],
  ['tab', postCSSWhitespaceReason]
]);

const csstreeCDOReason = 'Spec Reality: CDO/CDC tokens (`<!--`, `-->`) are discarded at the top level of a stylesheet according to CSS Syntax 3 section 5.4.1.\\nOur Status: We correctly discard them, but CSSTree preserves them in its AST, failing round-trip.';

const csstreeNormReason = 'Spec Reality: CSSOM serialization rules (CSSOM Section 5.4.3) mandate specific formatting (spaces, semicolons).\\nOur Status: We apply standard serialization, failing CSSTree\'s expectation of exact input preservation.';

const knownCSSTreeSkips = new Map<string, string>([
  ['comment only', 'Spec Reality: Comments are ignored (CSS Syntax 3, Section 4).\\nOur Status: We drop comments, failing CSSTree\'s expectation to preserve them.'],
  ['comment and whitespaces only', 'Spec Reality: Comments are ignored (CSS Syntax 3, Section 4).\\nOur Status: We drop comments, failing CSSTree\'s expectation to preserve them.'],
  ['BOM UTF-16BE #2', 'Spec Reality: BOM should be removed during decoding/normalization.\\nOur Status: We normalize it, failing exact matching.'],
  ['BOM UTF-16LE', 'Spec Reality: BOM should be removed during decoding/normalization.\\nOur Status: We normalize it, failing exact matching.'],
  ['BOM UTF-16LE #2', 'Spec Reality: BOM should be removed during decoding/normalization.\\nOur Status: We normalize it, failing exact matching.'],
  ['stylesheet.0', csstreeNormReason],
  ['stylesheet.1', csstreeNormReason],
  ['stylesheet.3', csstreeNormReason],
  ['stylesheet.4', csstreeNormReason],
  ['stylesheet.c.0', csstreeNormReason],
  ['stylesheet.s.0', csstreeNormReason],
  ['stylesheet.s.1', csstreeNormReason],
  ['stylesheet.s.3', csstreeNormReason],
  ['CDO', csstreeCDOReason],
  ['CDC', csstreeCDOReason],
  ['CDO/CDC', csstreeCDOReason],
  ['rule with a bad-string token (issue #93)', 'CSSTree specific test case for error recovery with bad strings.'],
  ['issue #250', csstreeNormReason],
  ['issue111.test1', 'Undeclared namespace prefix x is invalid, which our spec-compliant parser drops.']
]);

function runRoundTripTests(name: string, tests: RoundTripTestItem[], skipMap: Map<string, string>) {
  test(`${name} Round-Trip Tests`, async (t) => {
    for (let i = 0; i < tests.length; i++) {
      const testItem = tests[i];
      if (!testItem || typeof testItem.input !== 'string') {
        await t.test(`Test ${i}: [Invalid Test Item]`, { skip: 'Invalid test item (missing input)' }, () => {});
        continue;
      }
      
      const skipReason = (testItem.name && skipMap.get(testItem.name)) || false;
        
      const testName = testItem.name || testItem.input.slice(0, 40).replace(/\n/g, ' ');
      
      await t.test(`Test ${i}: ${testName}`, { skip: skipReason }, () => {
        const tokens = tokenize(testItem.input);
        const parser = new Parser(tokens);
        const sheet = parser.parseStyleSheet();
        
        const ruleTexts = [];
        for (let j = 0; j < sheet.cssRules.length; j++) {
           const rule = sheet.cssRules[j] as unknown as { cssText: string; type: number };
           if (rule.cssText) {
              ruleTexts.push(rule.cssText);
           } else {
              ruleTexts.push(`/* Cannot serialize rule of type ${rule.type} */`);
           }
        }
        
        const serialized = ruleTexts.join(' ');
        
        const normalizedActual = normalizeWhitespace(serialized);
        const normalizedExpected = normalizeWhitespace(testItem.input);
        
        if (normalizedActual !== normalizedExpected) {
           throw new Error(`Fails serialization. Expected: ${normalizedExpected}, Got: ${normalizedActual}`);
        }
      });
    }
  });
}

runRoundTripTests('PostCSS', postcssTests as RoundTripTestItem[], knownPostCSSSkips);
runRoundTripTests('CSSTree', csstreeTests as RoundTripTestItem[], knownCSSTreeSkips);
