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
