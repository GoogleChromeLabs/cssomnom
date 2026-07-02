/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSMathSum, CSSUnitValue, CSSNumericArray } from '../src/typed-om.ts';

test('CSSNumericArray in math functions', () => {
  const sum = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
  
  assert.ok(sum.values instanceof CSSNumericArray, 'values should be a CSSNumericArray');
  assert.strictEqual(sum.values.length, 2);
  assert.strictEqual(sum.values.item(0)!.toString(), '10px');
  
  const values = [...sum.values];
  assert.strictEqual(values.length, 2);
  assert.strictEqual(values[1].toString(), '20px');
});

test('CSSNumericArray is immutable', () => {
  const val1 = new CSSUnitValue(10, 'px');
  const val2 = new CSSUnitValue(20, 'px');
  const arr = new CSSNumericArray([val1, val2]);
  
  // @ts-expect-error - push should not exist
  assert.strictEqual(arr.push, undefined);
  
  const input = [val1, val2];
  const arr2 = new CSSNumericArray(input);
  input.push(new CSSUnitValue(30, 'px'));
  assert.strictEqual(arr2.length, 2, 'Should clone the input array');
});

