/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { CSSTranslate, CSSScale, CSSRotate, CSSUnitValue, CSSMatrixComponent, CSSNumericValue } from '../src/typed-om.ts';

// Mock DOMMatrixReadOnly for tests
class DOMMatrixReadOnly {
  is2D: boolean;
  a: number = 0; b: number = 0; c: number = 0; d: number = 0; e: number = 0; f: number = 0;
  m11: number = 0; m12: number = 0; m13: number = 0; m14: number = 0;
  m21: number = 0; m22: number = 0; m23: number = 0; m24: number = 0;
  m31: number = 0; m32: number = 0; m33: number = 0; m34: number = 0;
  m41: number = 0; m42: number = 0; m43: number = 0; m44: number = 0;

  constructor(elements: number[]) {
    if (elements.length === 6) {
      this.is2D = true;
      [this.a, this.b, this.c, this.d, this.e, this.f] = elements;
    } else {
      this.is2D = false;
      [this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44] = elements;
    }
  }
}

if (!(globalThis as unknown as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly) {
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;
}

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

test('CSSMatrixComponent.toMatrix() returns wrapped matrix', () => {
  const mockMatrix = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
  const matrixComp = new CSSMatrixComponent(mockMatrix);
  const matrix = matrixComp.toMatrix();
  assert.strictEqual(matrix, mockMatrix);
});

test('CSSMatrixComponent constructor accepts options', () => {
  const mockMatrix = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
  const matrixComp = new CSSMatrixComponent(mockMatrix, { is2D: false });
  assert.strictEqual(matrixComp.is2D, false);
});

