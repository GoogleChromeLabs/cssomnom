/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
