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

