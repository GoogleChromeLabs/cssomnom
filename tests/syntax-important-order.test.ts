/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSStyleRule } from '../src/index.ts';

test('Parser: !important after {} block in declaration', () => {
  const css = `div { color: { var(--x) } !important; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('color'), '{ var(--x) }');
  assert.strictEqual(rule.style.getPropertyPriority('color'), 'important');
});
