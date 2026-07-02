/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSS } from '../src/parser-api.ts';
import { CSSUnitValue } from '../src/typed-om.ts';

test('CSS factory methods exist for standard units', () => {
  assert.strictEqual(typeof CSS.px, 'function');
  const pxVal = CSS.px(10);
  assert.ok(pxVal instanceof CSSUnitValue);
  assert.strictEqual(pxVal.value, 10);
  assert.strictEqual(pxVal.unit, 'px');
});

test('CSS factory methods exist for auto-generated units', () => {
  // 'cap' is in UNITS but not hardcoded in parser-api.ts currently
  assert.strictEqual(typeof CSS.cap, 'function');
  const capVal = CSS.cap(5);
  assert.ok(capVal instanceof CSSUnitValue);
  assert.strictEqual(capVal.value, 5);
  assert.strictEqual(capVal.unit, 'cap');
});
