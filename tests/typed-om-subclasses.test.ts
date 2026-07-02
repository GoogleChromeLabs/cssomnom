/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleValue, CSSImageValue, CSSColorValue, CSSRGB, CSSUnitValue, CSSKeywordValue, CSSHWB, CSSLab, CSSLch, CSSOKLab, CSSOKLCH, CSSColor, CSSPositionValue } from '../src/typed-om.ts';

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
    new CSSUnitValue(0.5, 'number')
  );
  assert.strictEqual(color.toString(), 'rgb(255 0 0 / 0.5)');
  
  // Mix with keyword
  const mixed = new CSSRGB(
    new CSSKeywordValue('none'),
    new CSSUnitValue(0, 'number'),
    new CSSUnitValue(0, 'number')
  );
  assert.strictEqual(mixed.toString(), 'rgb(none 0 0 / 1)');

  // CSSHWB
  const hwb = new CSSHWB(
    new CSSUnitValue(120, 'deg'),
    new CSSUnitValue(20, 'percent'),
    new CSSUnitValue(30, 'percent'),
    new CSSUnitValue(0.8, 'number')
  );
  assert.strictEqual(hwb.toString(), 'hwb(120deg 20% 30% / 0.8)');

  // CSSLab
  const lab = new CSSLab(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(10, 'number'),
    new CSSUnitValue(20, 'number')
  );
  assert.strictEqual(lab.toString(), 'lab(50% 10 20 / 1)');

  // CSSLch
  const lch = new CSSLch(
    new CSSUnitValue(50, 'percent'),
    new CSSUnitValue(30, 'number'),
    new CSSUnitValue(120, 'deg')
  );
  assert.strictEqual(lch.toString(), 'lch(50% 30 120deg / 1)');

  // CSSOKLab
  const oklab = new CSSOKLab(
    new CSSUnitValue(0.5, 'number'),
    new CSSUnitValue(0.1, 'number'),
    new CSSUnitValue(0.2, 'number')
  );
  assert.strictEqual(oklab.toString(), 'oklab(0.5 0.1 0.2 / 1)');

  // CSSOKLCH
  const oklch = new CSSOKLCH(
    new CSSUnitValue(0.5, 'number'),
    new CSSUnitValue(0.3, 'number'),
    new CSSUnitValue(120, 'deg')
  );
  assert.strictEqual(oklch.toString(), 'oklch(0.5 0.3 120deg / 1)');

  // CSSColor
  const displayP3 = new CSSColor(
    new CSSKeywordValue('display-p3'),
    [new CSSUnitValue(1, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number')],
    new CSSUnitValue(0.5, 'number')
  );
  assert.strictEqual(displayP3.toString(), 'color(display-p3 1 0 0 / 0.5)');
});

test('CSSColorValue.parse()', () => {
  const rgb = CSSColorValue.parse('rgb(255 0 0)');
  assert.ok(rgb instanceof CSSRGB);
  assert.strictEqual(rgb.toString(), 'rgb(255 0 0 / 1)');
  
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
  assert.strictEqual(rgb.toString(), 'rgb(255 0 0 / 0.5)');

  const rgbStr = new CSSRGB('100%', '0%', '0%', '50%');
  assert.ok(rgbStr.r instanceof CSSUnitValue);
  assert.strictEqual((rgbStr.r as CSSUnitValue).unit, 'percent');
  assert.strictEqual(rgbStr.toString(), 'rgb(100% 0% 0% / 50%)');
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

