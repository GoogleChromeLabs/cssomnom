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
import { CSSStyleSheet } from '../src/index.ts';
import { Parser } from '../src/parser.ts';

const fixturesPath = path.resolve(import.meta.dirname, 'fixtures/external/csstree_errors.json');
const tests = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// Known skips for CSSTree error fixtures with detailed rationale.
const knownSkips = new Map<string, string>([
  [
    'a { color }',
    'Spec Reality: Invalid declaration (missing colon). According to CSSOM 5.4.3 (insertRule), invalid declarations within a valid rule should be silently dropped, not causing the whole rule to fail parsing.\n' +
    'Our Status: We correctly drop it, so insertRule does not throw, failing the test expectation that it SHOULD throw.'
  ],
  [
    'a { color: #}',
    'Spec Reality: Invalid declaration (incomplete hex color). According to CSSOM 5.4.3 (insertRule), invalid declarations within a valid rule should be silently dropped.\n' +
    'Our Status: We correctly drop it, so insertRule does not throw.'
  ],
  [
    'a { color: # }',
    'Spec Reality: Invalid declaration (incomplete hex color). According to CSSOM 5.4.3 (insertRule), invalid declarations within a valid rule should be silently dropped.\n' +
    'Our Status: We correctly drop it, so insertRule does not throw.'
  ],
  [
    '.foo { var(--side): 20px }',
    'Spec Reality: Invalid property name (cannot be a function). According to CSSOM 5.4.3 (insertRule), invalid declarations within a valid rule should be silently dropped.\n' +
    'Our Status: We correctly drop it, so insertRule does not throw.'
  ]
]);

test('CSSTree Error Cases via insertRule', async (t) => {
  for (const testCase of tests) {
    const skipReason = knownSkips.get(testCase.input) || false;
      
    await t.test(`Should throw for "${testCase.input}"`, { skip: skipReason }, () => {
      const sheet = CSSStyleSheet.createInternal([], Parser.parseRuleText);
      
      try {
        sheet.insertRule(testCase.input, 0);
        throw new Error('Failed to throw SyntaxError');
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'SyntaxError') {
          // Passed! It threw SyntaxError!
        } else if (e instanceof Error && e.message === 'Failed to throw SyntaxError') {
           throw e;
        } else {
          const name = e instanceof Error ? e.name : 'UnknownError';
          throw new Error(`Threw wrong error: ${name}`);
        }
      }
    });
  }
});
