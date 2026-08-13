/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { CSSStyleValue, CSSColorValue, CSSRGB, CSSHSL, CSSHWB, CSSLCH, CSSOKLab, CSSOKLCH, CSSLab, CSSColor, CSSUnitValue, CSSKeywordValue } from '../src/typed-om.ts';

test('Hex color parsing', () => {
  const c1 = CSSColorValue.parse('#fff') as CSSRGB;
  assert.ok(c1 instanceof CSSRGB);
  assert.strictEqual((c1.r as CSSUnitValue).value, 255);
  assert.strictEqual((c1.g as CSSUnitValue).value, 255);
  assert.strictEqual((c1.b as CSSUnitValue).value, 255);
  assert.strictEqual((c1.alpha as CSSUnitValue).value, 100);
  assert.strictEqual((c1.alpha as CSSUnitValue).unit, 'percent');

  const c2 = CSSColorValue.parse('#ff000080') as CSSRGB;
  assert.ok(c2 instanceof CSSRGB);
  assert.strictEqual((c2.r as CSSUnitValue).value, 255);
  assert.strictEqual((c2.g as CSSUnitValue).value, 0);
  assert.strictEqual((c2.b as CSSUnitValue).value, 0);
  assert.ok(Math.abs((c2.alpha as CSSUnitValue).value - (128 / 255) * 100) < 1e-5);
  assert.strictEqual((c2.alpha as CSSUnitValue).unit, 'percent');
  
  // Invalid hex length
  assert.throws(() => CSSColorValue.parse('#ff'), (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
  assert.throws(() => CSSColorValue.parse('#fffff'), (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
});

test('Named color parsing', () => {
  const c1 = CSSColorValue.parse('red') as CSSRGB;
  assert.ok(c1 instanceof CSSRGB);
  assert.strictEqual((c1.r as CSSUnitValue).value, 255);
  assert.strictEqual((c1.g as CSSUnitValue).value, 0);
  assert.strictEqual((c1.b as CSSUnitValue).value, 0);
  assert.strictEqual((c1.alpha as CSSUnitValue).value, 100);
  assert.strictEqual((c1.alpha as CSSUnitValue).unit, 'percent');

  const c2 = CSSColorValue.parse('transparent') as CSSRGB;
  assert.ok(c2 instanceof CSSRGB);
  assert.strictEqual((c2.r as CSSUnitValue).value, 0);
  assert.strictEqual((c2.g as CSSUnitValue).value, 0);
  assert.strictEqual((c2.b as CSSUnitValue).value, 0);
  assert.strictEqual((c2.alpha as CSSUnitValue).value, 0);
  assert.strictEqual((c2.alpha as CSSUnitValue).unit, 'percent');
  
  // Invalid named color
  assert.throws(() => CSSColorValue.parse('notacolor'), (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
});

test('Color functions parsing', () => {
  // rgb with slash alpha
  const rgb = CSSColorValue.parse('rgb(255 0 0 / 0.5)') as CSSRGB;
  assert.ok(rgb instanceof CSSRGB);
  assert.strictEqual((rgb.r as CSSUnitValue).value, 255);
  assert.strictEqual((rgb.alpha as CSSUnitValue).value, 50);
  assert.strictEqual((rgb.alpha as CSSUnitValue).unit, 'percent');

  // HSL
  const hsl = CSSColorValue.parse('hsl(120, 100%, 50%)') as CSSHSL;
  assert.ok(hsl instanceof CSSHSL);
  assert.strictEqual((hsl.h as CSSUnitValue).value, 120);
  assert.strictEqual((hsl.h as CSSUnitValue).unit, 'deg');
  assert.strictEqual((hsl.s as CSSUnitValue).value, 100);
  assert.strictEqual((hsl.s as CSSUnitValue).unit, 'percent');
  assert.strictEqual((hsl.l as CSSUnitValue).value, 50);
  assert.strictEqual((hsl.l as CSSUnitValue).unit, 'percent');

  // HWB
  const hwb = CSSColorValue.parse('hwb(180 10% 20% / 0.8)') as CSSHWB;
  assert.ok(hwb instanceof CSSHWB);
  assert.strictEqual((hwb.h as CSSUnitValue).value, 180);
  assert.strictEqual((hwb.w as CSSUnitValue).value, 10);
  assert.strictEqual((hwb.b as CSSUnitValue).value, 20);
  assert.strictEqual((hwb.alpha as CSSUnitValue).value, 80);
  assert.strictEqual((hwb.alpha as CSSUnitValue).unit, 'percent');

  // Lab, Lch, Oklab, Oklch
  const oklch = CSSColorValue.parse('oklch(60% 0.15 120)') as CSSOKLCH;
  assert.ok(oklch instanceof CSSOKLCH);
  assert.strictEqual((oklch.l as CSSUnitValue).value, 60);
  assert.strictEqual((oklch.c as CSSUnitValue).value, 37.5);
  assert.strictEqual((oklch.c as CSSUnitValue).unit, 'percent');
  assert.strictEqual((oklch.h as CSSUnitValue).value, 120);
});

test('Color property routing logic in parseAll', () => {
  // color
  const color = CSSStyleValue.parseAll('color', '#00ff00');
  assert.strictEqual(color.length, 1);
  assert.ok(color[0] instanceof CSSRGB);
  assert.strictEqual(color[0].toString(), 'rgb(0, 255, 0)');

  // fill
  const fill = CSSStyleValue.parseAll('fill', 'blue');
  assert.strictEqual(fill.length, 1);
  assert.ok(fill[0] instanceof CSSKeywordValue);
  assert.strictEqual(fill[0].toString(), 'blue');

  // invalid color property value throws TypeError
  assert.throws(() => CSSStyleValue.parseAll('color', 'invalidcolor'), TypeError);

  // inherit should be parsed as keyword
  const inherit = CSSStyleValue.parseAll('color', 'inherit');
  assert.strictEqual(inherit.length, 1);
  assert.ok(inherit[0] instanceof CSSKeywordValue);
  assert.strictEqual(inherit[0].toString(), 'inherit');
});

test('CSS Color compliance tasks (Phase 68 Task 10)', () => {
  // WebIDL Class Casing Verification
  assert.ok(CSSLCH.name === 'CSSLCH');
  assert.ok(CSSOKLab.name === 'CSSOKLab');
  assert.ok(CSSOKLCH.name === 'CSSOKLCH');

  // Backing properties & Validation
  const rgb = new CSSRGB(1, 0, 0, 1);
  assert.throws(() => { rgb.r = 'invalid'; }, { name: 'SyntaxError' });
  assert.throws(() => { rgb.alpha = 'invalid'; }, { name: 'SyntaxError' });
  assert.throws(() => { rgb.alpha = new CSSUnitValue(2, 'px'); }, { name: 'SyntaxError' });

  // Default alpha defaults to primitive double 1 (rectifies to 100%)
  const rgbOmittedAlpha = new CSSRGB(1, 0, 0);
  assert.ok(rgbOmittedAlpha.alpha instanceof CSSUnitValue);
  assert.strictEqual((rgbOmittedAlpha.alpha as CSSUnitValue).value, 100);
  assert.strictEqual((rgbOmittedAlpha.alpha as CSSUnitValue).unit, 'percent');

  // CSSHWB.h type checks
  const hwbOk = new CSSHWB(new CSSUnitValue(120, 'deg'), 10, 20);
  // @ts-expect-error - testing invalid parameter types
  assert.throws(() => { new CSSHWB(new CSSKeywordValue('none'), 10, 20); }, TypeError);
  // @ts-expect-error - testing invalid parameter types
  assert.throws(() => { hwbOk.h = new CSSKeywordValue('none'); }, TypeError);

  // Lab/Oklab percentage conversion in reification
  const parsedLab = CSSColorValue.parse('lab(50% 10% 20% / 0.5)') as CSSLab;
  assert.ok(parsedLab instanceof CSSLab);
  assert.strictEqual((parsedLab.a as CSSUnitValue).value, 12.5); // 10% -> 10 * 1.25 = 12.5
  assert.strictEqual((parsedLab.a as CSSUnitValue).unit, 'number');
  assert.strictEqual((parsedLab.b as CSSUnitValue).value, 25); // 20% -> 20 * 1.25 = 25
  assert.strictEqual((parsedLab.b as CSSUnitValue).unit, 'number');

  const parsedOKLab = CSSColorValue.parse('oklab(0.5 10% 20% / 0.5)') as CSSOKLab;
  assert.ok(parsedOKLab instanceof CSSOKLab);
  assert.strictEqual((parsedOKLab.a as CSSUnitValue).value, 0.04); // 10% -> 10 * 0.004 = 0.04
  assert.strictEqual((parsedOKLab.a as CSSUnitValue).unit, 'number');
  assert.strictEqual((parsedOKLab.b as CSSUnitValue).value, 0.08); // 20% -> 20 * 0.004 = 0.08
  assert.strictEqual((parsedOKLab.b as CSSUnitValue).unit, 'number');

  // System colors and currentcolor resolution to CSSKeywordValue
  const systemParsed = CSSColorValue.parse('currentcolor');
  assert.ok(systemParsed instanceof CSSKeywordValue);
  assert.strictEqual(systemParsed.value, 'currentcolor');

  const canvasParsed = CSSColorValue.parse('canvas');
  assert.ok(canvasParsed instanceof CSSKeywordValue);
  assert.strictEqual(canvasParsed.value, 'canvas');
});

test('rectifyColorAngle throws SyntaxError DOMException on invalid angles', () => {
  const hsl = new CSSHSL(120, 50, 50);
  assert.throws(() => {
    hsl.h = 'invalid-angle';
  }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
  assert.throws(() => {
    hsl.h = new CSSUnitValue(10, 'px');
  }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
});

test('color() function reification to CSSColor', () => {
  const c = CSSColorValue.parse('color(display-p3 1 0.5 0 / 0.8)') as CSSColor;
  assert.ok(c instanceof CSSColor);
  assert.strictEqual(c.colorSpace.toString(), 'display-p3');
  assert.strictEqual(c.channels.length, 3);
  assert.strictEqual(c.channels[0].toString(), '1');
  assert.strictEqual(c.channels[1].toString(), '0.5');
  assert.strictEqual(c.channels[2].toString(), '0');
  assert.strictEqual(c.alpha.toString(), '0.8');
  assert.strictEqual(c.toString(), 'color(display-p3 1 0.5 0 / 0.8)');

  // test with percentage channels and no alpha
  const c2 = CSSColorValue.parse('color(srgb 10% 20% 30%)') as CSSColor;
  assert.ok(c2 instanceof CSSColor);
  assert.strictEqual(c2.colorSpace.toString(), 'srgb');
  assert.strictEqual(c2.channels[0].toString(), '10%');
  assert.strictEqual(c2.alpha.toString(), '1');
  assert.strictEqual(c2.toString(), 'color(srgb 10% 20% 30%)');
});

test('CSSColor channels property has public setter', () => {
  const c = new CSSColor('srgb', [0.1, 0.2, 0.3]);
  c.channels = [1, 1, 1];
  assert.deepEqual(c.channels.map(x => x.toString()), ['1', '1', '1']);
});

test('Alpha is omitted when unity in modern colors serialization', () => {
  const hsl1 = new CSSHSL(120, 1, 0.5, 1);
  assert.strictEqual(hsl1.toString(), 'hsl(120deg 100% 50%)');
  const hsl2 = new CSSHSL(120, 1, 0.5, 0.5);
  assert.strictEqual(hsl2.toString(), 'hsl(120deg 100% 50% / 50%)');

  const hwb1 = new CSSHWB(new CSSUnitValue(120, 'deg'), 0.1, 0.2, 1);
  assert.strictEqual(hwb1.toString(), 'hwb(120deg 10% 20%)');
  const hwb2 = new CSSHWB(new CSSUnitValue(120, 'deg'), 0.1, 0.2, 0.8);
  assert.strictEqual(hwb2.toString(), 'hwb(120deg 10% 20% / 80%)');

  const lab1 = new CSSLab(0.5, 10, 20, 1);
  assert.strictEqual(lab1.toString(), 'lab(50% 10 20)');

  const oklch1 = new CSSOKLCH(0.6, 0.15, 120, 1);
  assert.strictEqual(oklch1.toString(), 'oklch(60% 15% 120deg)');

  const c1 = new CSSColor('srgb', [0.1, 0.2, 0.3], 1);
  assert.strictEqual(c1.toString(), 'color(srgb 0.1 0.2 0.3)');
});
