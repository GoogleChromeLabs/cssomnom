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
import { CSS } from '../src/typed-om.ts';

describe('CSSNumericValue Arithmetic', () => {
  test('add()', () => {
    const val = CSS.px(10).add(CSS.px(20));
    assert.strictEqual(val.toString(), '30px');
  });

  test('sub()', () => {
    const val = CSS.px(30).sub(CSS.px(10));
    assert.strictEqual(val.toString(), '20px');
  });

  test('mul()', () => {
    const val = CSS.px(10).mul(2);
    assert.strictEqual(val.toString(), '20px');
  });

  test('div()', () => {
    const val = CSS.px(20).div(2);
    assert.strictEqual(val.toString(), '10px');
  });

  test('complex math', () => {
    const val = CSS.px(10).add(CSS.px(20)).mul(2);
    assert.strictEqual(val.toString(), '60px');
  });
});
