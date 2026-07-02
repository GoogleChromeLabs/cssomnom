/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSPageRule } from '../src/index.ts';

test('@page with :recto and :verso', () => {
  const css = '@page :recto { margin: 1in; } @page :verso { margin: 2in; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  const rule1 = stylesheet.cssRules[0] as CSSPageRule;
  assert.strictEqual(rule1.selectorText, ':recto');
  
  const rule2 = stylesheet.cssRules[1] as CSSPageRule;
  assert.strictEqual(rule2.selectorText, ':verso');
});

test('page-break-after with recto/verso', () => {
  const css = '.test { page-break-after: recto; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;
  
  assert.strictEqual(rule.style.getPropertyValue('page-break-after').trim(), 'recto');
});
