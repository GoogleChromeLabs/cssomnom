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
import test from 'node:test';
import assert from 'node:assert';
import { CSSTranslate, CSSScale, CSSRotate, CSSSkew, CSSSkewX, CSSSkewY, CSSPerspective, CSSUnitValue, CSSKeywordValue, CSSMatrixComponent, CSSNumericValue, DOMMatrixReadOnly } from '../src/typed-om.ts';



test('CSSTranslate defaults z to 0px when omitted', () => {
  const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
  assert.strictEqual(translate.is2D, true);
  assert.ok(translate.z instanceof CSSUnitValue);
  assert.strictEqual(translate.z.value, 0);
  assert.strictEqual(translate.z.unit, 'px');
});

test('CSSTranslate.z is non-optional in types', () => {
  const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
  const z: CSSNumericValue = translate.z;
  assert.ok(z);
});

test('CSSScale defaults z to 1 when omitted', () => {
  const scale = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'));
  assert.strictEqual(scale.is2D, true);
  assert.ok(scale.z instanceof CSSUnitValue);
  assert.strictEqual(scale.z.value, 1);
  assert.strictEqual(scale.z.unit, 'number');
});

test('CSSScale.z is non-optional in types', () => {
  const scale = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'));
  const z: CSSNumericValue = scale.z;
  assert.ok(z);
});

test('CSSRotate defaults x, y to 0 and z to 1 when omitted', () => {
  const rotate = new CSSRotate(new CSSUnitValue(45, 'deg'));
  assert.strictEqual(rotate.is2D, true);
  assert.ok(rotate.x instanceof CSSUnitValue);
  assert.strictEqual(rotate.x.value, 0);
  assert.strictEqual(rotate.x.unit, 'number');
  assert.ok(rotate.y instanceof CSSUnitValue);
  assert.strictEqual(rotate.y.value, 0);
  assert.strictEqual(rotate.y.unit, 'number');
  assert.ok(rotate.z instanceof CSSUnitValue);
  assert.strictEqual(rotate.z.value, 1);
  assert.strictEqual(rotate.z.unit, 'number');
});

test('CSSRotate properties are non-optional in types', () => {
  const rotate = new CSSRotate(new CSSUnitValue(45, 'deg'));
  const x: CSSNumericValue = rotate.x;
  const y: CSSNumericValue = rotate.y;
  const z: CSSNumericValue = rotate.z;
  assert.ok(x);
  assert.ok(y);
  assert.ok(z);
});

test('CSSTranslate.toMatrix() returns correct matrix', () => {
  const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
  const matrix = translate.toMatrix();
  assert.strictEqual(matrix.is2D, true);
  assert.strictEqual(matrix.e, 10);
  assert.strictEqual(matrix.f, 20);
});

test('CSSMatrixComponent.toMatrix() returns copy of wrapped matrix', () => {
  const mockMatrix = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
  const matrixComp = new CSSMatrixComponent(mockMatrix);
  const matrix = matrixComp.toMatrix();
  assert.notStrictEqual(matrix, mockMatrix);
  assert.strictEqual(matrix.is2D, true);
  assert.strictEqual(matrix.a, 1);
  assert.strictEqual(matrix.b, 2);
  assert.strictEqual(matrix.c, 3);
  assert.strictEqual(matrix.d, 4);
  assert.strictEqual(matrix.e, 5);
  assert.strictEqual(matrix.f, 6);
});

test('CSSMatrixComponent constructor accepts options', () => {
  const mockMatrix = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
  const matrixComp = new CSSMatrixComponent(mockMatrix, { is2D: false });
  assert.strictEqual(matrixComp.is2D, false);
});

test('Transform Components Setters & Types validations', () => {
  const scale = new CSSScale(1, 2);
  assert.throws(() => { scale.x = new CSSUnitValue(10, 'px'); }, TypeError);
  assert.throws(() => { scale.y = new CSSUnitValue(10, 'px'); }, TypeError);
  assert.throws(() => { scale.z = new CSSUnitValue(10, 'px'); }, TypeError);

  const skew = new CSSSkew(new CSSUnitValue(10, 'deg'), new CSSUnitValue(20, 'deg'));
  assert.throws(() => { skew.ax = new CSSUnitValue(10, 'px'); }, TypeError);
  assert.throws(() => { skew.ay = new CSSUnitValue(10, 'px'); }, TypeError);

  const skewX = new CSSSkewX(new CSSUnitValue(10, 'deg'));
  assert.throws(() => { skewX.ax = new CSSUnitValue(10, 'px'); }, TypeError);

  const skewY = new CSSSkewY(new CSSUnitValue(10, 'deg'));
  assert.throws(() => { skewY.ay = new CSSUnitValue(10, 'px'); }, TypeError);

  const perspective = new CSSPerspective(new CSSUnitValue(10, 'px'));
  assert.throws(() => { perspective.length = new CSSUnitValue(10, 'deg'); }, TypeError);
  assert.throws(() => { perspective.length = new CSSKeywordValue('invalid'); }, TypeError);
});

