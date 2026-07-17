/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { formatNumber } from '../src/utils/format.ts';
import { CSSUnitValue, CSSStyleValue } from '../src/typed-om.ts';

test('formatNumber utility', () => {
  assert.strictEqual(formatNumber(0), '0');
  assert.strictEqual(formatNumber(-0), '0');
  assert.strictEqual(formatNumber(1.23), '1.23');
  assert.strictEqual(formatNumber(1.2345678), '1.234568');
  assert.strictEqual(formatNumber(1.2345672), '1.234567');
  assert.strictEqual(formatNumber(10000000000000000000000000), '10000000000000000000000000');
  assert.strictEqual(formatNumber(1e-7), '0');
  assert.strictEqual(formatNumber(-1e-7), '0');
  assert.strictEqual(formatNumber(Infinity), 'infinity');
  assert.strictEqual(formatNumber(-Infinity), '-infinity');
  assert.strictEqual(formatNumber(NaN), 'nan');
});

test('formatNumber in serialization and CSSUnitValue', () => {
  const val1 = new CSSUnitValue(1.2345678, 'px');
  assert.strictEqual(val1.toString(), '1.234568px');

  const val2 = new CSSUnitValue(1e-7, 'percent');
  assert.strictEqual(val2.toString(), '0%');

  const styleVal = CSSStyleValue.parse('width', '1.23456789px');
  assert.strictEqual(styleVal.toString(), '1.234568px');
});
