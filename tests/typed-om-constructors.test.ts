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
import {
  CSSRGB,
  CSSHSL,
  CSSHWB,
  CSSLab,
  CSSLCH,
  CSSOKLab,
  CSSOKLCH,
  CSSColor,
  CSSUnitValue,
  CSSKeywordValue,
  CSSMathClamp,
  CSSMathNegate,
  CSSMathInvert,
  CSS,
  CSSTranslate,
  CSSScale,
  CSSRotate,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSPerspective,
  CSSMatrixComponent,
  CSSStyleValue,
  StylePropertyMap
} from '../src/typed-om.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { DOMMatrix } from '../src/DOMMatrix.ts';

describe('Phase 107: Color Subclasses Strict WebIDL Validation & MathClamp Arity Checks', () => {
  describe('Color Constructors Strict WebIDL Validation', () => {
    test('CSSRGB argument counts and types', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSRGB(CSS.number(1), CSS.number(2)), TypeError);
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSRGB(1, 2), TypeError);

      // Raw numbers convert to percentage per Typed OM rectification algorithm
      const rgbCoerced = new CSSRGB(1, 0.5, 0.2, 0.8);
      assert.ok(rgbCoerced instanceof CSSRGB);
      assert.strictEqual(rgbCoerced.toString(), 'rgba(100%, 50%, 20%, 0.8)');

      // Valid CSSNumericValue instances
      const rgbNumbers = new CSSRGB(CSS.number(255), CSS.number(0), CSS.number(0));
      assert.ok(rgbNumbers instanceof CSSRGB);
      assert.strictEqual(rgbNumbers.toString(), 'rgb(255, 0, 0)');

      const rgbPercents = new CSSRGB(CSS.percent(100), CSS.percent(50), CSS.percent(20), CSS.percent(80));
      assert.ok(rgbPercents instanceof CSSRGB);
      assert.strictEqual(rgbPercents.toString(), 'rgba(100%, 50%, 20%, 0.8)');

      // Incompatible dimension (e.g. px for channel, or number for alpha) throws SyntaxError DOMException
      assert.throws(() => new CSSRGB(CSS.px(10), CSS.number(0), CSS.number(0)), (e: unknown) => {
        return e instanceof DOMException && e.name === 'SyntaxError';
      });
      assert.throws(() => new CSSRGB(CSS.number(0), CSS.number(0), CSS.number(0), CSS.number(1)), (e: unknown) => {
        return e instanceof DOMException && e.name === 'SyntaxError';
      });

      // Setters enforce types
      const rgb = new CSSRGB(CSS.percent(100), CSS.percent(0), CSS.percent(0));
      rgb.r = 0.5;
      assert.strictEqual((rgb.r as CSSUnitValue).value, 50);
      assert.strictEqual((rgb.r as CSSUnitValue).unit, 'percent');
      assert.throws(() => { rgb.r = 'invalid-kw'; }, (e: unknown) => e instanceof DOMException && e.name === 'SyntaxError');
    });

    test('CSSHSL argument counts and strict types', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSHSL(CSS.deg(120), CSS.percent(100)), TypeError);
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSHSL(120, 100), TypeError);

      // Raw numbers convert per Typed OM rectification algorithm
      const hslFromNumbers = new CSSHSL(120, 1, 0.5);
      assert.ok(hslFromNumbers instanceof CSSHSL);
      assert.strictEqual(hslFromNumbers.toString(), 'hsl(120deg 100% 50%)');

      // Valid CSSNumericValue instances
      const hsl = new CSSHSL(CSS.deg(0), CSS.percent(100), CSS.percent(50));
      assert.ok(hsl instanceof CSSHSL);
      assert.strictEqual(hsl.toString(), 'hsl(0deg 100% 50%)');

      // Incompatible dimension (e.g. px for angle hue) throws SyntaxError DOMException
      assert.throws(() => new CSSHSL(CSS.px(10), CSS.percent(100), CSS.percent(50)), (e: unknown) => {
        return e instanceof DOMException && e.name === 'SyntaxError';
      });
      // Incompatible dimension (e.g. number for percentage channel) throws SyntaxError DOMException
      assert.throws(() => new CSSHSL(CSS.deg(0), CSS.number(1), CSS.percent(50)), (e: unknown) => {
        return e instanceof DOMException && e.name === 'SyntaxError';
      });
    });

    test('CSSHWB strict argument validation (CSSNumericValue for hue)', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSHWB(CSS.deg(180), CSS.percent(0)), TypeError);
      // Raw number for hue must throw TypeError per Typed OM 2 WebIDL
      // @ts-expect-error test raw number
      assert.throws(() => new CSSHWB(180, 0, 0), TypeError);
      // Undefined for hue must throw TypeError
      // @ts-expect-error test undefined
      assert.throws(() => new CSSHWB(undefined, 0, 0), TypeError);
      // Non-angle CSSNumericValue must throw DOMException SyntaxError
      assert.throws(() => new CSSHWB(CSS.px(180), CSS.percent(0), CSS.percent(0)), (e: unknown) => {
        return e instanceof DOMException && e.name === 'SyntaxError';
      });
      // Valid angle CSSNumericValue
      const hwb = new CSSHWB(CSS.deg(180), CSS.percent(20), CSS.percent(30));
      assert.ok(hwb instanceof CSSHWB);
      assert.strictEqual(hwb.toString(), 'hwb(180deg 20% 30%)');
    });

    test('CSSLab / CSSLCH / CSSOKLab / CSSOKLCH validation', () => {
      // Fewer args
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSLab(CSS.percent(50), CSS.number(20)), TypeError);
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSLCH(CSS.percent(50), CSS.percent(20)), TypeError);
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSOKLab(CSS.percent(50), CSS.number(0.1)), TypeError);
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSOKLCH(CSS.percent(50), CSS.percent(10)), TypeError);

      // Valid numbers convert per rectification
      const labNum = new CSSLab(0.5, 20, 30);
      assert.ok(labNum instanceof CSSLab);
      assert.strictEqual(labNum.toString(), 'lab(50% 20 30)');

      // Valid CSSNumericValue instances
      const lab = new CSSLab(CSS.percent(50), CSS.number(20), CSS.number(30));
      assert.ok(lab instanceof CSSLab);

      const lch = new CSSLCH(CSS.percent(50), CSS.percent(20), CSS.deg(180));
      assert.ok(lch instanceof CSSLCH);

      const oklab = new CSSOKLab(CSS.percent(50), CSS.number(0.1), CSS.number(0.2));
      assert.ok(oklab instanceof CSSOKLab);

      const oklch = new CSSOKLCH(CSS.percent(50), CSS.percent(10), CSS.deg(180));
      assert.ok(oklch instanceof CSSOKLCH);
    });

    test('CSSColor argument validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSColor('srgb'), TypeError);
      // @ts-expect-error test non-string color space
      assert.throws(() => new CSSColor(123, [CSS.number(1), CSS.number(0), CSS.number(0)]), TypeError);
      // @ts-expect-error test non-array channels
      assert.throws(() => new CSSColor('srgb', '1 0 0'), TypeError);

      const c = new CSSColor('srgb', [CSS.number(1), CSS.number(0), CSS.number(0)]);
      assert.ok(c instanceof CSSColor);
      assert.strictEqual(c.toString(), 'color(srgb 1 0 0)');

      const cNums = new CSSColor('srgb', [1, 0, 0]);
      assert.ok(cNums instanceof CSSColor);
      assert.strictEqual(cNums.toString(), 'color(srgb 1 0 0)');
    });
  });

  describe('CSSMath Operations Validation', () => {
    test('CSSMathClamp arity and type compatibility validation', () => {
      // Fewer than 3 arguments throws TypeError
      // @ts-expect-error test 0 args
      assert.throws(() => new CSSMathClamp(), TypeError);
      // @ts-expect-error test 1 arg
      assert.throws(() => new CSSMathClamp(CSS.px(1)), TypeError);
      // @ts-expect-error test 2 args
      assert.throws(() => new CSSMathClamp(CSS.px(1), CSS.px(2)), TypeError);

      // Valid 3 arguments
      const clamp = new CSSMathClamp(CSS.px(10), CSS.px(50), CSS.px(100));
      assert.ok(clamp instanceof CSSMathClamp);
      assert.strictEqual(clamp.toString(), 'clamp(10px, 50px, 100px)');

      // Incompatible unit types throws TypeError
      assert.throws(() => new CSSMathClamp(CSS.px(1), CSS.deg(2), CSS.px(3)), TypeError);
      assert.throws(() => new CSSMathClamp(CSS.px(1), CSS.px(2), CSS.deg(3)), TypeError);
      assert.throws(() => new CSSMathClamp(CSS.deg(1), CSS.px(2), CSS.px(3)), TypeError);
    });

    test('CSSMathNegate and CSSMathInvert arity validation', () => {
      // @ts-expect-error test 0 args
      assert.throws(() => new CSSMathNegate(), TypeError);
      // @ts-expect-error test 0 args
      assert.throws(() => new CSSMathInvert(), TypeError);

      const neg = new CSSMathNegate(CSS.px(10));
      assert.strictEqual(neg.toString(), 'calc(-10px)');

      const inv = new CSSMathInvert(CSS.px(10));
      assert.strictEqual(inv.toString(), 'calc(1 / 10px)');
    });
  });

  describe('Transform Component Constructors', () => {
    test('CSSTranslate strict validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'px')), TypeError);
      // @ts-expect-error test raw numbers
      assert.throws(() => new CSSTranslate(10, 20), TypeError);
      // Non-length z throws TypeError
      assert.throws(() => new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(30, 'deg')), TypeError);

      const t2d = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'));
      assert.strictEqual(t2d.is2D, true);
      assert.strictEqual(t2d.toString(), 'translate(10px, 20px)');

      const t3d = new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px'), new CSSUnitValue(30, 'px'));
      assert.strictEqual(t3d.is2D, false);
      assert.strictEqual(t3d.toString(), 'translate3d(10px, 20px, 30px)');
    });

    test('CSSScale strict validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSScale(1), TypeError);
      // Non-number length unit throws TypeError
      assert.throws(() => new CSSScale(new CSSUnitValue(10, 'px'), 2), TypeError);

      const s = new CSSScale(2, 3);
      assert.strictEqual(s.is2D, true);
      assert.strictEqual(s.toString(), 'scale(2, 3)');
    });

    test('CSSRotate strict validation', () => {
      // @ts-expect-error test no args
      assert.throws(() => new CSSRotate(), TypeError);
      // @ts-expect-error test raw number for angle
      assert.throws(() => new CSSRotate(45), TypeError);
      // Non-angle for single arg throws TypeError
      assert.throws(() => new CSSRotate(new CSSUnitValue(45, 'px')), TypeError);
      // @ts-expect-error test 2 args
      assert.throws(() => new CSSRotate(1, new CSSUnitValue(45, 'deg')), TypeError);
      // @ts-expect-error test 3 args
      assert.throws(() => new CSSRotate(1, 0, new CSSUnitValue(45, 'deg')), TypeError);

      const r2d = new CSSRotate(new CSSUnitValue(45, 'deg'));
      assert.strictEqual(r2d.is2D, true);
      assert.strictEqual(r2d.toString(), 'rotate(45deg)');

      const r3d = new CSSRotate(1, 0, 0, new CSSUnitValue(45, 'deg'));
      assert.strictEqual(r3d.is2D, false);
      assert.strictEqual(r3d.toString(), 'rotate3d(1, 0, 0, 45deg)');
    });

    test('CSSSkew, CSSSkewX, CSSSkewY strict validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSSkew(new CSSUnitValue(10, 'deg')), TypeError);
      // @ts-expect-error test raw numbers
      assert.throws(() => new CSSSkew(10, 20), TypeError);
      // Non-angle throws TypeError
      assert.throws(() => new CSSSkew(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'deg')), TypeError);

      const skew = new CSSSkew(new CSSUnitValue(10, 'deg'), new CSSUnitValue(20, 'deg'));
      assert.strictEqual(skew.toString(), 'skew(10deg, 20deg)');

      // @ts-expect-error test fewer args
      assert.throws(() => new CSSSkewX(), TypeError);
      // @ts-expect-error test raw number
      assert.throws(() => new CSSSkewX(10), TypeError);
      const skewX = new CSSSkewX(new CSSUnitValue(10, 'deg'));
      assert.strictEqual(skewX.toString(), 'skewX(10deg)');

      // @ts-expect-error test fewer args
      assert.throws(() => new CSSSkewY(), TypeError);
      // @ts-expect-error test raw number
      assert.throws(() => new CSSSkewY(10), TypeError);
      const skewY = new CSSSkewY(new CSSUnitValue(20, 'deg'));
      assert.strictEqual(skewY.toString(), 'skewY(20deg)');
    });

    test('CSSPerspective strict validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSPerspective(), TypeError);
      // @ts-expect-error test raw number
      assert.throws(() => new CSSPerspective(10), TypeError);
      // Arbitrary non-none string throws TypeError
      assert.throws(() => new CSSPerspective('10px'), TypeError);
      // Non-none keyword throws TypeError
      assert.throws(() => new CSSPerspective(new CSSKeywordValue('auto')), TypeError);

      const pNone = new CSSPerspective('none');
      assert.strictEqual(pNone.toString(), 'perspective(none)');

      const pLength = new CSSPerspective(new CSSUnitValue(100, 'px'));
      assert.strictEqual(pLength.toString(), 'perspective(100px)');
    });

    test('CSSMatrixComponent validation', () => {
      // @ts-expect-error test fewer args
      assert.throws(() => new CSSMatrixComponent(), TypeError);
      // @ts-expect-error test non-matrix
      assert.throws(() => new CSSMatrixComponent({}), TypeError);

      const mat = new DOMMatrix();
      const mc = new CSSMatrixComponent(mat);
      assert.ok(mc instanceof CSSMatrixComponent);
    });
  });

  describe('CSSStyleValue.parseAll & StylePropertyMap Fallbacks', () => {
    test('CSSStyleValue.parseAll throws on empty strings and invalid syntax', () => {
      assert.throws(() => CSSStyleValue.parseAll('width', ''), TypeError);
      assert.throws(() => CSSStyleValue.parseAll('--foo', ''), TypeError);
      assert.throws(() => CSSStyleValue.parseAll('--foo', '   '), TypeError);
      assert.throws(() => CSSStyleValue.parseAll('--foo', 'calc(1 +)'), TypeError);
      assert.throws(() => CSSStyleValue.parseAll('--', 'auto'), TypeError);
      assert.throws(() => CSSStyleValue.parseAll('', 'auto'), TypeError);
    });

    test('CSSStyleValue.parseAll parses valid custom property', () => {
      const res = CSSStyleValue.parseAll('--foo', 'auto');
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].toString(), 'auto');
    });

    test('StylePropertyMap unsupported property fallbacks', () => {
      const decl = new CSSStyleDeclaration();
      decl.setProperty('will-change', 'opacity');
      const map = new StylePropertyMap(decl);
      const val = map.get('will-change');
      assert.ok(val);
      assert.strictEqual(val.constructor, CSSStyleValue);
      assert.strictEqual(val.toString(), 'opacity');

      // Roundtrip unsupported CSSStyleValue
      const decl2 = new CSSStyleDeclaration();
      const map2 = new StylePropertyMap(decl2);
      map2.set('will-change', val);
      assert.strictEqual(decl2.getPropertyValue('will-change'), 'opacity');
    });
  });
});
