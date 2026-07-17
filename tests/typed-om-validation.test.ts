/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { CSSStyleValue, StylePropertyMap, CSSUnitValue, CSSKeywordValue } from '../src/typed-om.ts';

// Mock simple element style representation for StylePropertyMap
class MockStyle {
  properties: Record<string, string> = {};
  setProperty(prop: string, val: string) {
    this.properties[prop] = val;
  }
  getPropertyValue(prop: string): string {
    return this.properties[prop] || '';
  }
  removeProperty(prop: string) {
    delete this.properties[prop];
  }
}

test('CSSStyleValue.parse validation with syntax rules', () => {
  // Valid width
  const w1 = CSSStyleValue.parse('width', '10px');
  assert.ok(w1 instanceof CSSUnitValue);
  assert.strictEqual(w1.toString(), '10px');

  // Invalid width unit (angle instead of length-percentage)
  assert.throws(() => CSSStyleValue.parse('width', '10deg'), TypeError);

  // Valid color
  const c1 = CSSStyleValue.parse('color', 'red');
  assert.ok(c1 instanceof CSSKeywordValue);

  // Invalid color
  assert.throws(() => CSSStyleValue.parse('color', '10px'), TypeError);

  // CSS-wide keyword bypasses validation
  const kw = CSSStyleValue.parse('width', 'inherit');
  assert.strictEqual(kw.toString(), 'inherit');

  // var() bypasses validation
  const variable = CSSStyleValue.parse('width', 'var(--custom-width)');
  assert.strictEqual(variable.toString(), 'var(--custom-width)');

  // New properties validation
  assert.ok(CSSStyleValue.parse('writing-mode', 'vertical-rl') instanceof CSSKeywordValue);
  assert.throws(() => CSSStyleValue.parse('writing-mode', '10px'), TypeError);
  assert.throws(() => CSSStyleValue.parse('writing-mode', 'invalid'), TypeError);

  assert.ok(CSSStyleValue.parse('direction', 'ltr') instanceof CSSKeywordValue);
  assert.throws(() => CSSStyleValue.parse('direction', '10px'), TypeError);

  assert.ok(CSSStyleValue.parse('position', 'absolute') instanceof CSSKeywordValue);
  assert.throws(() => CSSStyleValue.parse('position', '10px'), TypeError);

  assert.ok(CSSStyleValue.parse('pointer-events', 'none') instanceof CSSKeywordValue);
  assert.throws(() => CSSStyleValue.parse('pointer-events', '10px'), TypeError);

  // <length-percentage> validation (e.g. bottom)
  assert.ok(CSSStyleValue.parse('bottom', '10px') instanceof CSSUnitValue);
  assert.ok(CSSStyleValue.parse('bottom', '20%') instanceof CSSUnitValue);
  assert.ok(CSSStyleValue.parse('bottom', 'auto') instanceof CSSKeywordValue);
  assert.throws(() => CSSStyleValue.parse('bottom', '10deg'), TypeError);

  // <length>-only validation (e.g. outline-offset)
  assert.ok(CSSStyleValue.parse('outline-offset', '5px') instanceof CSSUnitValue);
  assert.throws(() => CSSStyleValue.parse('outline-offset', '10%'), TypeError);
  assert.throws(() => CSSStyleValue.parse('outline-offset', 'auto'), TypeError);
});

test('StylePropertyMap set validation', () => {
  const style = new MockStyle();
  const map = new (StylePropertyMap as unknown as new (s: unknown) => StylePropertyMap)(style);

  // Valid width
  map.set('width', new CSSUnitValue(10, 'px'));
  assert.strictEqual(style.getPropertyValue('width'), '10px');

  // Invalid width (e.g. degrees)
  assert.throws(() => {
    map.set('width', new CSSUnitValue(10, 'deg'));
  }, TypeError);
});
