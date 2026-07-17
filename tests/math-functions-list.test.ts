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
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MATH_FUNCTIONS } from '../src/data/gen/math-functions.ts';

describe('MATH_FUNCTIONS list', () => {
  test('should strictly include only standard math functions', () => {
    const expected = [
      'abs', 'acos', 'asin', 'atan', 'atan2', 'cos', 'exp', 'hypot', 'log', 'mod', 'pow', 'rem', 'sign', 'sin', 'sqrt', 'tan'
    ].sort();
    
    assert.deepStrictEqual([...MATH_FUNCTIONS].sort(), expected);
  });
});
