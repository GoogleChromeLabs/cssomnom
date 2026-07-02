/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MATH_FUNCTIONS } from '../src/data/math-functions.ts';

describe('MATH_FUNCTIONS list', () => {
  test('should strictly include only standard math functions', () => {
    const expected = [
      'abs', 'acos', 'asin', 'atan', 'atan2', 'cos', 'exp', 'hypot', 'log', 'mod', 'pow', 'rem', 'sign', 'sin', 'sqrt', 'tan'
    ].sort();
    
    assert.deepStrictEqual([...MATH_FUNCTIONS].sort(), expected);
  });
});
