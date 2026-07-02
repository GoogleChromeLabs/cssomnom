/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser, tokenize, CSSStyleDeclaration, CSSStyleRule } from '../src/index.ts';
import type { CSSStyleProperties } from '../src/index.ts';

test('CSSStyleDeclaration should extend CSSStyleProperties', () => {
  const decl = new CSSStyleDeclaration();
  const props: CSSStyleProperties = decl;
  assert.ok(props);
});

test('CSSStyleProperties should have properties from GeneratedProperties', () => {
  const decl = {
    color: 'red',
  } as unknown as CSSStyleProperties;
  
  const color: string = decl.color;
  assert.strictEqual(color, 'red');
});

test('style on a parsed CSSStyleRule is an instance of CSSStyleDeclaration', () => {
  const css = 'div { color: red; }';
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  assert.ok(rule.style instanceof CSSStyleDeclaration);
});
