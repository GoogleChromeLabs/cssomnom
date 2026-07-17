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

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  CSSUnitValue,
  CSSKeywordValue,
  CSSTranslate,
  CSSRotate,
  CSSScale,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSPerspective,
  CSSMatrixComponent,
  CSSTransformValue,
  DOMMatrix
} from '../src/index.ts';

describe('CSS Typed OM Transforms toMatrix()', () => {
  describe('CSSTranslate.toMatrix()', () => {
    test('2D Translate', () => {
      const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
      assert.strictEqual(translate.is2D, true);
      const matrix = translate.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.strictEqual(matrix.b, 0);
      assert.strictEqual(matrix.c, 0);
      assert.strictEqual(matrix.d, 1);
      assert.strictEqual(matrix.e, 10);
      assert.strictEqual(matrix.f, 20);
    });

    test('3D Translate', () => {
      const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(30, 'px'));
      assert.strictEqual(translate.is2D, false);
      const matrix = translate.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, false);
      assert.strictEqual(matrix.m41, 10);
      assert.strictEqual(matrix.m42, 20);
      assert.strictEqual(matrix.m43, 30);
    });

    test('Incompatible unit throws TypeError', () => {
      const translate = new CSSTranslate(new CSSUnitValue(10, 'em'), new CSSUnitValue(20, 'px'));
      assert.throws(() => {
        translate.toMatrix();
      }, TypeError);
    });
  });

  describe('CSSScale.toMatrix()', () => {
    test('2D Scale', () => {
      const scale = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'));
      assert.strictEqual(scale.is2D, true);
      const matrix = scale.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 2);
      assert.strictEqual(matrix.d, 3);
    });

    test('3D Scale', () => {
      const scale = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'), new CSSUnitValue(4, 'number'));
      assert.strictEqual(scale.is2D, false);
      const matrix = scale.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, false);
      assert.strictEqual(matrix.m11, 2);
      assert.strictEqual(matrix.m22, 3);
      assert.strictEqual(matrix.m33, 4);
    });
  });

  describe('CSSRotate.toMatrix()', () => {
    test('2D Rotate', () => {
      const rotate = new CSSRotate(new CSSUnitValue(90, 'deg'));
      assert.strictEqual(rotate.is2D, true);
      const matrix = rotate.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.ok(Math.abs(matrix.a) < 1e-7);
      assert.ok(Math.abs(matrix.b - 1) < 1e-7);
      assert.ok(Math.abs(matrix.c + 1) < 1e-7);
      assert.ok(Math.abs(matrix.d) < 1e-7);
    });

    test('3D Rotate', () => {
      const rotate = new CSSRotate(
        new CSSUnitValue(1, 'number'),
        new CSSUnitValue(0, 'number'),
        new CSSUnitValue(0, 'number'),
        new CSSUnitValue(90, 'deg')
      );
      assert.strictEqual(rotate.is2D, false);
      const matrix = rotate.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, false);
      assert.strictEqual(matrix.m11, 1);
      assert.ok(Math.abs(matrix.m22) < 1e-7);
      assert.ok(Math.abs(matrix.m23 - 1) < 1e-7);
      assert.ok(Math.abs(matrix.m32 + 1) < 1e-7);
      assert.ok(Math.abs(matrix.m33) < 1e-7);
    });
  });

  describe('CSSSkew.toMatrix()', () => {
    test('CSSSkew', () => {
      const skew = new CSSSkew(new CSSUnitValue(45, 'deg'), new CSSUnitValue(30, 'deg'));
      assert.strictEqual(skew.is2D, true);
      const matrix = skew.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.ok(Math.abs(matrix.b - Math.tan(30 * Math.PI / 180)) < 1e-7);
      assert.ok(Math.abs(matrix.c - Math.tan(45 * Math.PI / 180)) < 1e-7);
      assert.strictEqual(matrix.d, 1);
    });
  });

  describe('CSSSkewX.toMatrix()', () => {
    test('CSSSkewX', () => {
      const skewX = new CSSSkewX(new CSSUnitValue(45, 'deg'));
      assert.strictEqual(skewX.is2D, true);
      const matrix = skewX.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.strictEqual(matrix.b, 0);
      assert.ok(Math.abs(matrix.c - 1) < 1e-7);
      assert.strictEqual(matrix.d, 1);
    });
  });

  describe('CSSSkewY.toMatrix()', () => {
    test('CSSSkewY', () => {
      const skewY = new CSSSkewY(new CSSUnitValue(45, 'deg'));
      assert.strictEqual(skewY.is2D, true);
      const matrix = skewY.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.ok(Math.abs(matrix.b - 1) < 1e-7);
      assert.strictEqual(matrix.c, 0);
      assert.strictEqual(matrix.d, 1);
    });
  });

  describe('CSSPerspective.toMatrix()', () => {
    test('CSSPerspective with length', () => {
      const perspective = new CSSPerspective(new CSSUnitValue(100, 'px'));
      assert.strictEqual(perspective.is2D, false);
      const matrix = perspective.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, false);
      assert.strictEqual(matrix.m11, 1);
      assert.strictEqual(matrix.m22, 1);
      assert.strictEqual(matrix.m33, 1);
      assert.ok(Math.abs(matrix.m34 + 0.01) < 1e-7);
      assert.strictEqual(matrix.m44, 1);
    });

    test('CSSPerspective with none keyword', () => {
      const perspective = new CSSPerspective(new CSSKeywordValue('none'));
      const matrix = perspective.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, false);
      assert.strictEqual(matrix.a, 1);
      assert.strictEqual(matrix.d, 1);
      assert.strictEqual(matrix.m34, 0);
    });

    test('CSSPerspective with zero or negative length', () => {
      const perspective0 = new CSSPerspective(new CSSUnitValue(0, 'px'));
      const matrix0 = perspective0.toMatrix();
      assert.strictEqual(matrix0.is2D, false);
      assert.strictEqual(matrix0.m34, 0);

      const perspectiveNeg = new CSSPerspective(new CSSUnitValue(-50, 'px'));
      const matrixNeg = perspectiveNeg.toMatrix();
      assert.strictEqual(matrixNeg.is2D, false);
      assert.strictEqual(matrixNeg.m34, 0);
    });
  });

  describe('CSSMatrixComponent.toMatrix()', () => {
    test('CSSMatrixComponent 2D', () => {
      const domMatrix = new DOMMatrix([1, 2, 3, 4, 5, 6]);
      const matrixComp = new CSSMatrixComponent(domMatrix);
      assert.strictEqual(matrixComp.is2D, true);
      const matrix = matrixComp.toMatrix();
      assert.notStrictEqual(matrix, domMatrix);
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.strictEqual(matrix.b, 2);
      assert.strictEqual(matrix.c, 3);
      assert.strictEqual(matrix.d, 4);
      assert.strictEqual(matrix.e, 5);
      assert.strictEqual(matrix.f, 6);
    });

    test('CSSMatrixComponent 3D flattened to 2D', () => {
      const domMatrix = new DOMMatrix([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const matrixComp = new CSSMatrixComponent(domMatrix, { is2D: true });
      assert.strictEqual(matrixComp.is2D, true);
      const matrix = matrixComp.toMatrix();
      assert.strictEqual(matrix.is2D, true);
      assert.strictEqual(matrix.a, 1);
      assert.strictEqual(matrix.b, 2);
      assert.strictEqual(matrix.c, 5);
      assert.strictEqual(matrix.d, 6);
      assert.strictEqual(matrix.e, 13);
      assert.strictEqual(matrix.f, 14);
    });
  });

  describe('CSSTransformValue.toMatrix()', () => {
    test('CSSTransformValue multiplication in list order', () => {
      const t1 = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
      const t2 = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'));
      const transformValue = new CSSTransformValue([t1, t2]);
      
      const matrix = transformValue.toMatrix();
      assert.ok(matrix instanceof DOMMatrix);
      assert.strictEqual(matrix.is2D, true);
      
      // Multiplication is: translate(10, 20) * scale(2, 3)
      assert.strictEqual(matrix.a, 2);
      assert.strictEqual(matrix.b, 0);
      assert.strictEqual(matrix.c, 0);
      assert.strictEqual(matrix.d, 3);
      assert.strictEqual(matrix.e, 20);
      assert.strictEqual(matrix.f, 60);
    });
  });

  describe('CSSTransformValue constructor arity', () => {
    test('Throws TypeError on empty list', () => {
      assert.throws(() => {
        new CSSTransformValue([]);
      }, (err: unknown) => err instanceof TypeError);
    });
  });

  describe('CSSKeywordValue validation', () => {
    test('Throws TypeError on empty string constructor', () => {
      assert.throws(() => {
        new CSSKeywordValue('');
      }, (err: unknown) => err instanceof TypeError);
    });

    test('Throws TypeError on empty string setter', () => {
      const kw = new CSSKeywordValue('auto');
      assert.throws(() => {
        kw.value = '';
      }, (err: unknown) => err instanceof TypeError);
      assert.strictEqual(kw.value, 'auto');
    });
  });

  describe('CSSMatrixComponent constructor cloning', () => {
    test('Clones input matrix to be mutable', () => {
      const original = new DOMMatrix([1, 0, 0, 1, 10, 20]);
      const component = new CSSMatrixComponent(original);
      assert.notStrictEqual(component.matrix, original);
      // Verify component.matrix is a DOMMatrix (not ReadOnly) and can be modified
      assert.ok(component.matrix instanceof DOMMatrix);
      component.matrix.e = 50;
      assert.strictEqual(component.matrix.e, 50);
      assert.strictEqual(original.e, 10);
    });
  });

  describe('CSSScale 2D serialization collapses equal axes', () => {
    test('Collapses equal x and y values in 2D scale serialization', () => {
      const s1 = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(2, 'number'));
      assert.strictEqual(s1.toString(), 'scale(2)');
      
      const s2 = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(3, 'number'));
      assert.strictEqual(s2.toString(), 'scale(2, 3)');
      
      // 3D scale shouldn't collapse even if all are equal
      const s3 = new CSSScale(new CSSUnitValue(2, 'number'), new CSSUnitValue(2, 'number'), new CSSUnitValue(2, 'number'));
      assert.strictEqual(s3.toString(), 'scale3d(2, 2, 2)');
    });
  });
});
