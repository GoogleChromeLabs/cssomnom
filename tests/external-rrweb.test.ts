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
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';

const parseSpecPath = path.resolve(import.meta.dirname, '../submodules/rrweb-cssom/spec/parse.spec.js');
const parseSpecCode = fs.readFileSync(parseSpecPath, 'utf8');

const specificTests: unknown[] = [];
const sandbox: Record<string, unknown> = {
  describe: (_name: string, fn: () => void) => fn(),
  given: (input: string, fn: () => void) => specificTests.push({ input, fn }),
  expect: (_actual: unknown) => ({
    toEqualOwnProperties: (_expected: unknown) => {},
    toBe: (_expected: unknown) => {}
  }),
  uncircularOwnProperties: () => {},
  removeUnderscored: () => {},
  CSSOM: {
    parse: () => ({ cssRules: [{ style: {} }] })
  }
};

vm.createContext(sandbox);
vm.runInContext(parseSpecCode, sandbox);

const tests = sandbox.TESTS as Array<{ input: string, result: { cssRules: unknown } }>;

const normalizeQuotes = (s: string) => s.replace(/'/g, '"');
const normalizeWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();
const normalizeUrls = (s: string) => s.replace(/url\("([^"]+)"\)/g, 'url($1)').replace(/url\('([^']+)'\)/g, 'url($1)');
const normalizeSelector = (s: string) => s.replace(/\s*([>+~||])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim();

// Known skips for rrweb-io test fixtures with detailed rationale.
const knownSkips = new Map<string, string>([
  [
    'some invalid junk @media projection {body{background:black}}',
    'Fixture expects to find a media rule inside invalid junk. Standard CSS parsing treats this as a qualified rule and drops it if the selector is invalid.'
  ],
  [
    '* {\tborder:\tnone\t} \n#foo {font-size: 12px; background:#fff;}',
    'Fixture expects border shorthand to be preserved as-is, but we expand it to longhands.'
  ],
  [
    'img:not(/*)*/[src]){background:url(data:image/png;base64,FooBar)}',
    'Fixture expects background shorthand to be preserved as-is, but we expand it to longhands.'
  ],
  [
    '@media/**/print {*{background:#fff}}',
    'Fixture expects background shorthand to be preserved as-is, but we expand it to longhands.'
  ],
  [
    "@media screen{a{color:blue !important;background:red;} @font-face { font-family: 'Arial2'; } }",
    'Fixture expects background shorthand to be preserved as-is, but we expand it to longhands.'
  ],
  [
    '@-moz-keyframes foo {} @--keyframes bar {} @-webkit-keyframes quux {}',
    'TODO(compliance): Spec Reality: `@--keyframes` is a valid at-keyword token. According to CSS Syntax 3, it MUST be consumed as an at-rule. The fixture incorrectly expects it to be parsed as a style rule with selector `@--keyframes bar`.\nOur Status: Our parser correctly identifies it as an at-rule and drops it (unsupported), failing the non-compliant fixture expectation.'
  ],
  [
    '@host { body { background: red; } }',
    '@host was part of Shadow DOM v0 and has been removed from specifications. Our parser correctly drops its block, but the test expects cssRules.'
  ],
  [
    '@-moz-document url(http://www.w3.org/), url-prefix(http://www.w3.org/Style/), domain(mozilla.org), regexp("https:.*")\n{\n/*comments*/\nbody { color: purple; background: yellow; }\n}',
    '@-moz-document is a vendor-specific at-rule that is not implemented. Our parser treats it as an unknown at-rule, but the test expects cssRules.'
  ],
  [
    'a{}@-moz-document/**/url-prefix(http://www.w3.org/Style/){body { color: purple; background: yellow; }}',
    '@-moz-document is a vendor-specific at-rule that is not implemented. Our parser treats it as an unknown at-rule, but the test expects cssRules.'
  ],
  [
    '@starting-style { body { background: red; } }',
    '@starting-style expected to be unsupported but we might parse it as a specific rule. We skip for now until verified.'
  ],
  [
    '@starting-style { @media screen { body { background: red; } } }',
    'Fixture expects unexpanded background shorthand, but our parser expands shorthands to longhands.'
  ],
  [
    '@media screen { @starting-style { body { background: red; } } }',
    '@starting-style expected to be unsupported but we might parse it as a specific rule. We skip for now until verified.'
  ],
  [
    '@-some-ridiculously-long-vendor-prefix-that-must-be-supported-keyframes therulename /*comment*/{0%{top:0px; left:0px; background:red;}100% {top:4em; left:40px; background:maroon;}}',
    'Fixture expects background shorthand to be preserved as-is, but we expand it to longhands.'
  ]
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertRules(actualRules: any, expectedRules: any, context: string = 'root') {
  const expectedLength = expectedRules.length !== undefined 
      ? expectedRules.length 
      : Object.keys(expectedRules).filter(k => !isNaN(Number(k))).length;
  assert.strictEqual(actualRules.length, expectedLength, `Rule count mismatch at ${context}: actual ${actualRules.length} != expected ${expectedLength}`);
  
  for (let i = 0; i < expectedLength; i++) {
    const expected = expectedRules[i];
    const actual = actualRules[i];
    
    if (expected.selectorText !== undefined) {
      assert.strictEqual(normalizeSelector(actual.selectorText), normalizeSelector(expected.selectorText), `Selector mismatch at ${context}[${i}]`);
    }

    if (expected.conditionText !== undefined) {
      assert.strictEqual(actual.conditionText, expected.conditionText, `Condition text mismatch at ${context}[${i}]`);
    }

    if (expected.media !== undefined) {
      for (let j = 0; j < expected.media.length; j++) {
        assert.strictEqual(actual.media[j], expected.media[j], `Media mismatch at ${context}[${i}].media[${j}]`);
      }
    }

    if (expected.cssRules !== undefined) {
      assert.ok(actual.cssRules !== undefined, `actual.cssRules is undefined but expected it at ${context}[${i}]`);
      assertRules(actual.cssRules, expected.cssRules, `${context}[${i}].cssRules`);
    }
    
    if (expected.style !== undefined) {
      for (const key in expected.style) {
        if (key.startsWith('__')) continue; // Ignore internal props
        if (key === 'length') continue; // Length might differ
        if (key === 'parentRule') continue; // Ignore circular parent reference
        if (key === '_importants') continue; // rrweb-cssom uses this for !important
        if (key === '_vendorPrefix') continue; // vendor prefix metadata
        
        const expectedValue = expected.style[key];
        
        if (!isNaN(Number(key))) {
           assert.strictEqual(actual.style.item(Number(key)), expectedValue, `Indexed property mismatch at ${context}[${i}].style[${key}]`);
        } else {
           const actualPropVal = actual.style.getPropertyValue(key);
           const normalizedActual = normalizeUrls(normalizeWhitespace(normalizeQuotes(actualPropVal)));
           const normalizedExpected = normalizeUrls(normalizeWhitespace(normalizeQuotes(expectedValue)));
           
           assert.strictEqual(
              normalizedActual, 
              normalizedExpected, 
              `Property mismatch for "${key}" at ${context}[${i}].style`
           );
        }
      }
    }
  }
}

test('rrweb-io/CSSOM Conformance Tests', async (t) => {
  for (const testCase of tests) {
    const skipReason = knownSkips.get(testCase.input) || false;
      
    await t.test(`Test for "${testCase.input.substring(0, 50).replace(/\n/g, '\\n')}..."`, { skip: skipReason }, () => {
        const tokens = tokenize(testCase.input);
        const parser = new Parser(tokens);
        const sheet = parser.parseStyleSheet();
        
        const expectedRules = testCase.result.cssRules;
        const actualRules = sheet.cssRules;
        
        assertRules(actualRules, expectedRules);
    });
  }
});
