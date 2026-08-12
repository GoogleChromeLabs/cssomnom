/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { CSSTranslate, CSSScale, CSSRotate, CSSUnitValue, CSSUnparsedValue, CSSTransformValue, CSSStyleValue, CSSKeywordValue } from '../src/typed-om.ts';

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
      this.m11 = this.a; this.m12 = this.b; this.m21 = this.c; this.m22 = this.d; this.m41 = this.e; this.m42 = this.f;
      this.m13 = 0; this.m14 = 0; this.m23 = 0; this.m24 = 0; this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0; this.m43 = 0; this.m44 = 1;
    } else {
      this.is2D = false;
      [this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44] = elements;
      this.a = this.m11; this.b = this.m12; this.c = this.m21; this.d = this.m22; this.e = this.m41; this.f = this.m42;
    }
  }

  multiply(other: DOMMatrixReadOnly): DOMMatrixReadOnly {
    const b = other;
    const getA = (c: number, r: number) => {
      if (c === 1) return r === 1 ? this.m11 : r === 2 ? this.m12 : r === 3 ? this.m13 : this.m14;
      if (c === 2) return r === 1 ? this.m21 : r === 2 ? this.m22 : r === 3 ? this.m23 : this.m24;
      if (c === 3) return r === 1 ? this.m31 : r === 2 ? this.m32 : r === 3 ? this.m33 : this.m34;
      return r === 1 ? this.m41 : r === 2 ? this.m42 : r === 3 ? this.m43 : this.m44;
    };
    const getB = (c: number, r: number) => {
      if (c === 1) return r === 1 ? b.m11 : r === 2 ? b.m12 : r === 3 ? b.m13 : b.m14;
      if (c === 2) return r === 1 ? b.m21 : r === 2 ? b.m22 : r === 3 ? b.m23 : b.m24;
      if (c === 3) return r === 1 ? b.m31 : r === 2 ? b.m32 : r === 3 ? b.m33 : b.m34;
      return r === 1 ? b.m41 : r === 2 ? b.m42 : r === 3 ? b.m43 : b.m44;
    };
    
    const out: number[] = [];
    for (let c = 1; c <= 4; c++) {
      for (let r = 1; r <= 4; r++) {
        let sum = 0;
        for (let k = 1; k <= 4; k++) {
          sum += getA(k, r) * getB(c, k);
        }
        out.push(sum);
      }
    }
    
    const is2D = this.is2D && b.is2D;
    if (is2D) {
      return new DOMMatrixReadOnly([out[0], out[1], out[4], out[5], out[12], out[13]]);
    } else {
      return new DOMMatrixReadOnly(out);
    }
  }
}
(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;


test('CSSScale constructor aligns input types to CSSNumericValue', () => {
  // Support number inputs
  const scale = new CSSScale(1.5, 2.5, 3.5);
  assert.ok(scale.x instanceof CSSUnitValue);
  assert.strictEqual(scale.x.value, 1.5);
  assert.strictEqual(scale.x.unit, 'number');
  assert.ok(scale.y instanceof CSSUnitValue);
  assert.strictEqual(scale.y.value, 2.5);
  assert.strictEqual(scale.y.unit, 'number');
  assert.ok(scale.z instanceof CSSUnitValue);
  assert.strictEqual(scale.z.value, 3.5);
  assert.strictEqual(scale.z.unit, 'number');
  assert.strictEqual(scale.is2D, false);

  const scale2D = new CSSScale(2, 3);
  assert.strictEqual(scale2D.is2D, true);
  assert.strictEqual((scale2D.z as CSSUnitValue).value, 1);
});

test('CSSTranslate validates coordinate types', () => {
  // x and y must be length or percentage
  assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'deg'), new CSSUnitValue(20, 'px')), TypeError);
  assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'number')), TypeError);
  
  // z must be length only (no percentage)
  assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(50, 'percent')), TypeError);
  assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(50, 'deg')), TypeError);

  // is2D setter
  const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(30, 'px'));
  assert.strictEqual(translate.is2D, false);
  translate.is2D = true;
  assert.strictEqual(translate.is2D, true);
  assert.strictEqual((translate.z as CSSUnitValue).value, 0);
  assert.strictEqual((translate.z as CSSUnitValue).unit, 'px');
});

test('CSSRotate validates coordinates and angle', () => {
  // angle must be angle compatible
  assert.throws(() => new CSSRotate(new CSSUnitValue(45, 'px')), TypeError);
  assert.throws(() => new CSSRotate(1, 0, 0, new CSSUnitValue(45, 'percent')), TypeError);

  // coordinates should support number or CSSNumericValue
  const rotate = new CSSRotate(1, 0, 0, new CSSUnitValue(45, 'deg'));
  assert.strictEqual((rotate.x as CSSUnitValue).value, 1);
  assert.strictEqual((rotate.y as CSSUnitValue).value, 0);
  assert.strictEqual((rotate.z as CSSUnitValue).value, 0);
  assert.strictEqual((rotate.angle as CSSUnitValue).unit, 'deg');
});

test('toMatrix() implementations', () => {
  // 1. CSSScale.toMatrix()
  const scale2D = new CSSScale(2, 3);
  const mScale2D = scale2D.toMatrix();
  assert.strictEqual(mScale2D.is2D, true);
  assert.strictEqual(mScale2D.a, 2);
  assert.strictEqual(mScale2D.d, 3);

  const scale3D = new CSSScale(2, 3, 4);
  const mScale3D = scale3D.toMatrix();
  assert.strictEqual(mScale3D.is2D, false);
  assert.strictEqual(mScale3D.m11, 2);
  assert.strictEqual(mScale3D.m22, 3);
  assert.strictEqual(mScale3D.m33, 4);

  // 2. CSSRotate.toMatrix()
  // 2D Rotation (default axis is 0, 0, 1)
  const rotate2D = new CSSRotate(new CSSUnitValue(90, 'deg'));
  const mRotate2D = rotate2D.toMatrix();
  assert.strictEqual(mRotate2D.is2D, true);
  // cos(90deg) = 0, sin(90deg) = 1
  assert.ok(Math.abs(mRotate2D.a) < 1e-7);
  assert.ok(Math.abs(mRotate2D.b - 1) < 1e-7);
  assert.ok(Math.abs(mRotate2D.c + 1) < 1e-7);
  assert.ok(Math.abs(mRotate2D.d) < 1e-7);

  // 3D Rotation around X axis
  const rotateX = new CSSRotate(1, 0, 0, new CSSUnitValue(90, 'deg'));
  const mRotateX = rotateX.toMatrix();
  assert.strictEqual(mRotateX.is2D, false);
  // m11 = 1, m22 = cos(90) = 0, m23 = sin(90) = 1, m32 = -sin(90) = -1, m33 = cos(90) = 0
  assert.ok(Math.abs(mRotateX.m11 - 1) < 1e-7);
  assert.ok(Math.abs(mRotateX.m22) < 1e-7);
  assert.ok(Math.abs(mRotateX.m23 - 1) < 1e-7);
  assert.ok(Math.abs(mRotateX.m32 + 1) < 1e-7);
  assert.ok(Math.abs(mRotateX.m33) < 1e-7);
});

test('CSSUnparsedValue and CSSTransformValue Proxy indexes', () => {
  const unparsed = new CSSUnparsedValue(['foo', 'bar']);
  assert.strictEqual(unparsed[0], 'foo');
  assert.strictEqual(unparsed[1], 'bar');
  assert.strictEqual(unparsed.length, 2);

  // Set existing element
  unparsed[0] = 'baz';
  assert.strictEqual(unparsed[0], 'baz');

  // Setting index === length appends element per CSS Typed OM 1 § 3.4
  unparsed[2] = 'qux';
  assert.strictEqual(unparsed[2], 'qux');
  assert.strictEqual(unparsed.length, 3);

  // Setting index > length throws RangeError
  assert.throws(() => { unparsed[4] = 'err'; }, RangeError);

  const translate = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
  const transform = new CSSTransformValue([translate]);
  assert.strictEqual(transform[0], translate);
  assert.strictEqual(transform.length, 1);

  // Setting index === length appends component per CSS Typed OM 1 § 7
  const rotate = new CSSRotate(new CSSUnitValue(45, 'deg'));
  transform[1] = rotate;
  assert.strictEqual(transform[1], rotate);
  assert.strictEqual(transform.length, 2);

  // Setting index > length throws RangeError
  assert.throws(() => { transform[3] = translate; }, RangeError);
});

test('CSSTransformValue.parse strict token and function validation', () => {
  // Comma at top-level
  assert.throws(() => CSSTransformValue.parse('rotate(45deg), scale(2)'), TypeError);
  // Non-function token
  assert.throws(() => CSSTransformValue.parse('rotate(45deg) 10px'), TypeError);
  // Unknown transform function
  assert.throws(() => CSSTransformValue.parse('foo(45deg)'), TypeError);
});

test('Argument count validation for component parsers', () => {
  // translate
  assert.throws(() => CSSTransformValue.parse('translateX()'), TypeError);
  assert.throws(() => CSSTransformValue.parse('translateX(1px, 2px)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('translate3d(1px, 2px)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('translate(1px, 2px, 3px, 4px)'), TypeError);

  // scale
  assert.throws(() => CSSTransformValue.parse('scaleX()'), TypeError);
  assert.throws(() => CSSTransformValue.parse('scaleX(1, 2)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('scale3d(1, 2)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('scale(1, 2, 3, 4)'), TypeError);

  // rotate
  assert.throws(() => CSSTransformValue.parse('rotateX()'), TypeError);
  assert.throws(() => CSSTransformValue.parse('rotateX(1deg, 2deg)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('rotate3d(1, 2, 3)'), TypeError);
  assert.throws(() => CSSTransformValue.parse('rotate(1, 2)'), TypeError);
});

test('CSSStyleValue.parseAll routing logic', () => {
  // transform property
  const transform = CSSStyleValue.parseAll('transform', 'rotate(45deg) scale(2)');
  assert.strictEqual(transform.length, 1);
  assert.ok(transform[0] instanceof CSSTransformValue);
  assert.strictEqual(transform[0].toString(), 'rotate(45deg) scale(2)');

  // translate property
  const translate = CSSStyleValue.parseAll('translate', '10px 20px');
  assert.strictEqual(translate.length, 1);
  assert.ok(translate[0] instanceof CSSTranslate);
  assert.strictEqual(translate[0].toString(), 'translate(10px, 20px)');
  
  // translate property with invalid args count
  assert.throws(() => CSSStyleValue.parseAll('translate', '10px 20px 30px 40px'), TypeError);

  // rotate property
  const rotate = CSSStyleValue.parseAll('rotate', '45deg');
  assert.strictEqual(rotate.length, 1);
  assert.ok(rotate[0] instanceof CSSRotate);
  assert.strictEqual(rotate[0].toString(), 'rotate(45deg)');

  // scale property
  const scale = CSSStyleValue.parseAll('scale', '2 3');
  assert.strictEqual(scale.length, 1);
  assert.ok(scale[0] instanceof CSSScale);
  assert.strictEqual(scale[0].toString(), 'scale(2, 3)');

  // keywords
  const keyword = CSSStyleValue.parseAll('transform', 'none');
  assert.strictEqual(keyword.length, 1);
  assert.ok(keyword[0] instanceof CSSKeywordValue);
  assert.strictEqual(keyword[0].toString(), 'none');

  // var()
  const variable = CSSStyleValue.parseAll('transform', 'var(--my-transform)');
  assert.strictEqual(variable.length, 1);
  assert.ok(variable[0] instanceof CSSUnparsedValue);
});

