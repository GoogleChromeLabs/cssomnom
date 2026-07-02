/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Validate built file works', async (t) => {
  const distPath = path.resolve(import.meta.dirname, '../dist/index.js');
  
  if (!fs.existsSync(distPath)) {
    console.warn('\n⚠️  [Warning] dist/index.js not found. Skipping test.');
    t.skip('dist/index.js not found');
    return;
  }

  // Dynamic import to avoid failure if file doesn't exist at parse time
  const { Parser, tokenize, CSS, CSSParserQualifiedRule } = await import(distPath);
  
  assert.ok(Parser, 'Parser should be exported from dist');
  assert.ok(tokenize, 'tokenize should be exported from dist');
  assert.ok(CSS, 'CSS should be exported from dist');
  
  // Test 1: Basic Parser and tokenize
  const css = '.foo { color: red; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  assert.ok(sheet, 'Should be able to parse style sheet');
  assert.strictEqual(sheet.cssRules.length, 1, 'Should have 1 rule');
  assert.strictEqual(sheet.cssRules[0].selectorText.trim(), '.foo', 'Selector should be .foo');

  // Test 2: CSS.parseStylesheetSync
  const rulesSync = CSS.parseStylesheetSync(css);
  assert.strictEqual(rulesSync.length, 1, 'CSS.parseStylesheetSync should return 1 rule');
  assert.ok(rulesSync[0] instanceof CSSParserQualifiedRule, 'Rule should be CSSParserQualifiedRule');

  // Test 3: CSS.parseStylesheet (Async)
  const rulesAsync = await CSS.parseStylesheet(css);
  assert.strictEqual(rulesAsync.length, 1, 'CSS.parseStylesheet should return 1 rule');
  assert.ok(rulesAsync[0] instanceof CSSParserQualifiedRule, 'Rule should be CSSParserQualifiedRule');

  // Test 4: Parser.resolveVariables
  const varCss = `
    .vars {
      --color: blue;
      color: var(--color);
    }
  `;
  const varSheet = new Parser(tokenize(varCss)).parseStyleSheet();
  const varRule = varSheet.cssRules[0];
  const style = varRule.style;
  
  assert.strictEqual(Parser.resolveVariables(style, 'color').trim(), 'blue', 'resolveVariables should resolve var(--color) to blue');
});
