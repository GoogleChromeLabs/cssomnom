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
import assert from 'node:assert/strict';
import { CSSStyleValue, StylePropertyMapReadOnly, StylePropertyMap } from '../src/typed-om.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './wpt-shim.ts';

test('CSSStyleValue.parse parses shorthand properties correctly', () => {
  const bg = CSSStyleValue.parse('background', 'blue');
  assert.ok(bg instanceof CSSStyleValue);
  assert.strictEqual(bg.toString(), 'blue');

  const margin = CSSStyleValue.parse('margin', '10px 20px');
  assert.ok(margin instanceof CSSStyleValue);
  assert.strictEqual(margin.toString(), '10px 20px');

  const padding = CSSStyleValue.parse('padding', '5px');
  assert.ok(padding instanceof CSSStyleValue);
  assert.strictEqual(padding.toString(), '5px');

  const border = CSSStyleValue.parse('border', '1px solid black');
  assert.ok(border instanceof CSSStyleValue);
  assert.strictEqual(border.toString(), '1px solid black');

  const font = CSSStyleValue.parse('font', '12px sans-serif');
  assert.ok(font instanceof CSSStyleValue);
  assert.strictEqual(font.toString(), '12px sans-serif');
});

test('CSSStyleValue.parse throws TypeError for invalid shorthand values', () => {
  assert.throws(() => {
    CSSStyleValue.parse('margin', '10px 20px 30px 40px 50px');
  }, TypeError);

  assert.throws(() => {
    CSSStyleValue.parse('background', '??? invalid');
  }, TypeError);
});

test('StylePropertyMap on inline declarations gets shorthand correctly', () => {
  const decl = new CSSStyleDeclaration();
  decl.cssText = 'background: blue; margin: 10px;';
  const map = new StylePropertyMap(decl);

  const bgVal = map.get('background');
  assert.ok(bgVal);
  assert.strictEqual(bgVal.toString(), 'blue');

  const marginVal = map.get('margin');
  assert.ok(marginVal);
  assert.strictEqual(marginVal.toString(), '10px');
});

test('computedStyleMap get shorthand returns reconstructed computed serialization', () => {
  const html = '<div id="box" style="background: blue; margin: 10px;"></div>';
  const dom = parseHTML(html);
  patchWindowForTypedOM(dom.window);
  const { document } = dom.window;

  const box = document.getElementById('box') as unknown as Element & { computedStyleMap(): StylePropertyMapReadOnly };
  const map = box.computedStyleMap();

  const bgVal = map.get('background');
  assert.ok(bgVal);
  assert.strictEqual(bgVal.toString(), 'rgb(0, 0, 255) none repeat scroll 0% 0% / auto padding-box border-box');

  const marginVal = map.get('margin');
  assert.ok(marginVal);
  assert.strictEqual(marginVal.toString(), '10px');
});
