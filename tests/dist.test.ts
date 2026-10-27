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
import fs from 'node:fs';
import path from 'node:path';

test('Validate built file works', async (t) => {
  const distPath = path.resolve(import.meta.dirname, '../dist/index.js');
  const parserApiPath = path.resolve(import.meta.dirname, '../dist/parser-api.js');
  const parsePath = path.resolve(import.meta.dirname, '../dist/parse.js');
  
  if (!fs.existsSync(distPath) || !fs.existsSync(parserApiPath) || !fs.existsSync(parsePath)) {
    console.warn('\n⚠️  [Warning] Built dist files not found. Skipping test.');
    t.skip('dist files not found');
    return;
  }

  // Dynamic import to avoid failure if file doesn't exist at parse time
  const { parse, tokenize, CSS, resolveVariables } = await import(distPath);
  const { parseStylesheet, CSSParserQualifiedRule } = await import(parserApiPath);
  const ParseEntry = await import(parsePath);
  
  assert.ok(parse, 'parse should be exported from dist');
  assert.ok(tokenize, 'tokenize should be exported from dist');
  assert.ok(CSS, 'CSS should be exported from dist');
  assert.ok(resolveVariables, 'resolveVariables should be exported from dist');
  
  // Test 1: Basic parse and tokenize
  const css = '.foo { color: red; }';
  const sheet = parse(css);
  
  assert.ok(sheet, 'Should be able to parse style sheet');
  assert.strictEqual(sheet.cssRules.length, 1, 'Should have 1 rule');
  assert.strictEqual(sheet.cssRules[0].selectorText.trim(), '.foo', 'Selector should be .foo');

  // Test 2: parseStylesheet from parser-api
  const rules = await parseStylesheet(css);
  assert.strictEqual(rules.length, 1, 'parseStylesheet should return 1 rule');
  assert.ok(rules[0] instanceof CSSParserQualifiedRule, 'Rule should be CSSParserQualifiedRule');

  // Test 3: resolveVariables from index.js
  const varCss = `
    .vars {
      --color: blue;
      color: var(--color);
    }
  `;
  const varSheet = parse(varCss);
  const varRule = varSheet.cssRules[0];
  const style = varRule.style;
  
  assert.strictEqual(resolveVariables(style, 'color').trim(), 'blue', 'resolveVariables should resolve var(--color) to blue');

  // Test 4: ParseEntry exports
  assert.ok(ParseEntry.parse, 'parse should be exported from ./parse');
  assert.strictEqual(typeof ParseEntry.calculateSpecificity, 'function', 'calculateSpecificity in ./parse');
});
