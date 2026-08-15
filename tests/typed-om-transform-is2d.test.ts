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
import assert from 'node:assert/strict';
import {
  CSSPerspective,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSTranslate,
  CSSRotate,
  CSSScale,
  CSSMatrixComponent,
  CSSUnitValue,
  CSSMathSum,
  CSSKeywordValue,
  DOMMatrix,
} from '../src/index.ts';

describe('CSSPerspective is2D Immutability and Validation', () => {
  test('CSSPerspective is always 3D (is2D === false)', () => {
    const p = new CSSPerspective(new CSSUnitValue(100, 'px'));
    assert.strictEqual(p.is2D, false);
  });

  test('CSSPerspective is2D setter is a silent no-op', () => {
    const p = new CSSPerspective(new CSSUnitValue(100, 'px'));
    p.is2D = true;
    assert.strictEqual(p.is2D, false);
  });

  test('CSSPerspective constructor validation', () => {
    // @ts-expect-error test 0 arguments
    assert.throws(() => new CSSPerspective(), TypeError);
    // @ts-expect-error test invalid type
    assert.throws(() => new CSSPerspective(100), TypeError);
    assert.throws(() => new CSSPerspective('auto'), TypeError);
    assert.throws(() => new CSSPerspective(new CSSKeywordValue('auto')), TypeError);
    assert.throws(() => new CSSPerspective(new CSSUnitValue(100, 'deg')), TypeError);

    // Valid keyword
    const pNone = new CSSPerspective('none');
    assert.strictEqual(pNone.is2D, false);
    assert.ok(pNone.length instanceof CSSKeywordValue);
    assert.strictEqual((pNone.length as CSSKeywordValue).value, 'none');

    // Valid CSSMathSum
    const pMath = new CSSPerspective(new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px')));
    assert.strictEqual(pMath.is2D, false);
  });
});

describe('CSSSkew, CSSSkewX, CSSSkewY is2D Immutability and Validation', () => {
  test('CSSSkew is always 2D (is2D === true)', () => {
    const ax = new CSSUnitValue(10, 'deg');
    const ay = new CSSUnitValue(20, 'deg');
    const skew = new CSSSkew(ax, ay);
    assert.strictEqual(skew.is2D, true);
    assert.strictEqual(skew.ax, ax);
    assert.strictEqual(skew.ay, ay);
  });

  test('CSSSkew is2D setter is a silent no-op', () => {
    const skew = new CSSSkew(new CSSUnitValue(10, 'deg'), new CSSUnitValue(20, 'deg'));
    skew.is2D = false;
    assert.strictEqual(skew.is2D, true);
  });

  test('CSSSkew accepts CSSMathValue and preserves reference and unit', () => {
    const mathAx = new CSSMathSum(new CSSUnitValue(10, 'deg'), new CSSUnitValue(5, 'deg'));
    const mathAy = new CSSUnitValue(1, 'rad');
    const skew = new CSSSkew(mathAx, mathAy);
    assert.strictEqual(skew.ax, mathAx);
    assert.strictEqual(skew.ay, mathAy);
    assert.strictEqual(skew.is2D, true);
  });

  test('CSSSkewX is always 2D and is2D setter is no-op', () => {
    const ax = new CSSUnitValue(15, 'deg');
    const skewX = new CSSSkewX(ax);
    assert.strictEqual(skewX.is2D, true);
    assert.strictEqual(skewX.ax, ax);

    skewX.is2D = false;
    assert.strictEqual(skewX.is2D, true);
  });

  test('CSSSkewY is always 2D and is2D setter is no-op', () => {
    const ay = new CSSUnitValue(25, 'deg');
    const skewY = new CSSSkewY(ay);
    assert.strictEqual(skewY.is2D, true);
    assert.strictEqual(skewY.ay, ay);

    skewY.is2D = false;
    assert.strictEqual(skewY.is2D, true);
  });

  test('CSSSkew, CSSSkewX, CSSSkewY constructor arguments validation', () => {
    // @ts-expect-error test insufficient arguments
    assert.throws(() => new CSSSkew(new CSSUnitValue(10, 'deg')), TypeError);
    // @ts-expect-error test insufficient arguments
    assert.throws(() => new CSSSkewX(), TypeError);
    // @ts-expect-error test insufficient arguments
    assert.throws(() => new CSSSkewY(), TypeError);

    assert.throws(() => new CSSSkew(new CSSUnitValue(10, 'px'), new CSSUnitValue(10, 'deg')), TypeError);
    assert.throws(() => new CSSSkewX(new CSSUnitValue(10, 'px')), TypeError);
    assert.throws(() => new CSSSkewY(new CSSUnitValue(10, 'px')), TypeError);
  });
});

describe('CSSTranslate, CSSRotate, CSSScale, CSSMatrixComponent Mutable is2D', () => {
  test('CSSTranslate is2D can be mutated without clearing z', () => {
    const t2 = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
    assert.strictEqual(t2.is2D, true);
    t2.is2D = false;
    assert.strictEqual(t2.is2D, false);
    assert.strictEqual(t2.toString(), 'translate3d(10px, 20px, 0px)');

    const t3 = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(30, 'px'));
    assert.strictEqual(t3.is2D, false);
    t3.is2D = true;
    assert.strictEqual(t3.is2D, true);
    assert.strictEqual(t3.toString(), 'translate(10px, 20px)');
    t3.is2D = false;
    assert.strictEqual(t3.is2D, false);
    assert.strictEqual(t3.toString(), 'translate3d(10px, 20px, 30px)');
  });

  test('CSSRotate is2D can be mutated and preserves angle reference', () => {
    const angle = new CSSUnitValue(45, 'deg');
    const r2 = new CSSRotate(angle);
    assert.strictEqual(r2.is2D, true);
    assert.strictEqual(r2.angle, angle);

    r2.is2D = false;
    assert.strictEqual(r2.is2D, false);
    assert.strictEqual(r2.toString(), 'rotate3d(0, 0, 1, 45deg)');

    const r3 = new CSSRotate(1, 0, 0, angle);
    assert.strictEqual(r3.is2D, false);
    r3.is2D = true;
    assert.strictEqual(r3.is2D, true);
    assert.strictEqual(r3.toString(), 'rotate(45deg)');
  });

  test('CSSScale is2D can be mutated', () => {
    const s2 = new CSSScale(2, 3);
    assert.strictEqual(s2.is2D, true);
    s2.is2D = false;
    assert.strictEqual(s2.is2D, false);
    assert.strictEqual(s2.toString(), 'scale3d(2, 3, 1)');

    const s3 = new CSSScale(2, 3, 4);
    assert.strictEqual(s3.is2D, false);
    s3.is2D = true;
    assert.strictEqual(s3.is2D, true);
    assert.strictEqual(s3.toString(), 'scale(2, 3)');
  });

  test('CSSMatrixComponent is2D can be mutated', () => {
    const mat = new DOMMatrix([1, 0, 0, 1, 0, 0]);
    const mComp = new CSSMatrixComponent(mat);
    assert.strictEqual(mComp.is2D, true);

    mComp.is2D = false;
    assert.strictEqual(mComp.is2D, false);
    assert.ok(mComp.toString().startsWith('matrix3d('));
  });
});
