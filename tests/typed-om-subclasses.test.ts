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
import { CSSStyleValue, CSSImageValue, CSSColorValue, CSSRGB, CSSUnitValue, CSSKeywordValue, CSSHWB, CSSLab, CSSLCH, CSSOKLab, CSSOKLCH, CSSColor, CSSPositionValue } from '../src/typed-om.ts';

test('CSSImageValue and CSSColorValue', () => {
  // CSSImageValue via parse
  const img = CSSStyleValue.parse('background-image', 'url("test.png")');
  assert.ok(img instanceof CSSImageValue);
  assert.strictEqual(img.toString(), 'url("test.png")');

  // CSSRGB
  const color = new CSSRGB(
    new CSSUnitValue(255, 'number'),
    new CSSUnitValue(0, 'number'),
    new CSSUnitValue(0, 'number'),
    0.5
  );
  assert.strictEqual(color.toString(), 'rgba(255, 0, 0, 0.5)');
  
  // Mix with keyword
  const mixed = new CSSRGB(
    new CSSKeywordValue('none'),
    new CSSUnitValue(0, 'number'),
    new CSSUnitValue(0, 'number')
  );
  assert.strictEqual(mixed.toString(), 'rgb(none, 0, 0)');

  // CSSHWB
  const hwb = new CSSHWB(
    new CSSUnitValue(120, 'deg'),
    new CSSUnitValue(20, 'percent'),
    new CSSUnitValue(30, 'percent'),
    0.8
  );
  assert.strictEqual(hwb.toString(), 'hwb(120deg 20% 30% / 80%)');

  // CSSLab
  const lab = new CSSLab(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(10, 'number'),
    new CSSUnitValue(20, 'number')
  );
  assert.strictEqual(lab.toString(), 'lab(50% 10 20)');

  // CSSLCH
  const lch = new CSSLCH(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(30, 'percent'),
    new CSSUnitValue(120, 'deg')
  );
  assert.strictEqual(lch.toString(), 'lch(50% 30% 120deg)');

  // CSSOKLab
  const oklab = new CSSOKLab(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(0.1, 'number'),
    new CSSUnitValue(0.2, 'number')
  );
  assert.strictEqual(oklab.toString(), 'oklab(50% 0.1 0.2)');

  // CSSOKLCH
  const oklch = new CSSOKLCH(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(30, 'percent'),
    new CSSUnitValue(120, 'deg')
  );
  assert.strictEqual(oklch.toString(), 'oklch(50% 30% 120deg)');

  // CSSColor
  const displayP3 = new CSSColor(
    new CSSKeywordValue('display-p3'),
    [1, 0, 0],
    0.5
  );
  assert.strictEqual(displayP3.toString(), 'color(display-p3 1 0 0 / 0.5)');
});

test('CSSColorValue.parse()', () => {
  const rgb = CSSColorValue.parse('rgb(255 0 0)');
  assert.ok(rgb instanceof CSSRGB);
  assert.strictEqual(rgb.toString(), 'rgb(255, 0, 0)');
  
  assert.throws(() => {
    CSSColorValue.parse('invalid');
  }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');

  assert.throws(() => {
    CSSColorValue.parse('rgb(255)');
  }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
});

test('CSSColorValue constructors ergonomics', () => {
  const rgb = new CSSRGB(255, 0, 0, 0.5);
  assert.ok(rgb.r instanceof CSSUnitValue);
  assert.strictEqual(rgb.toString(), 'rgba(25500%, 0%, 0%, 0.5)');

  const rgbStr = new CSSRGB('100%', '0%', '0%', '50%');
  assert.ok(rgbStr.r instanceof CSSUnitValue);
  assert.strictEqual((rgbStr.r as CSSUnitValue).unit, 'percent');
  assert.strictEqual(rgbStr.toString(), 'rgba(100%, 0%, 0%, 0.5)');
});

test('CSSPositionValue constructors, getters, setters, and serialization', () => {
  const x = new CSSUnitValue(10, 'px');
  const y = new CSSUnitValue(20, 'percent');
  const pos = new CSSPositionValue(x, y);

  assert.ok(pos instanceof CSSPositionValue);
  assert.ok(pos instanceof CSSStyleValue);
  assert.strictEqual(pos.x, x);
  assert.strictEqual(pos.y, y);
  assert.strictEqual(pos.toString(), '10px 20%');

  const x2 = new CSSUnitValue(5, 'px');
  const y2 = new CSSUnitValue(15, 'percent');
  pos.x = x2;
  pos.y = y2;
  assert.strictEqual(pos.x, x2);
  assert.strictEqual(pos.y, y2);
  assert.strictEqual(pos.toString(), '5px 15%');
});

