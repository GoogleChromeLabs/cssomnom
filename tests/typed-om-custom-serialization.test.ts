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

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as TypedOM from '../src/typed-om.ts';

const {
  CSSKeywordValue,
  CSSUnitValue,
  CSSMathMax,
  CSSMathMin,
  CSSMathClamp,
  CSSMathSum,
  CSSMathProduct,
  CSSMathNegate,
  CSSMathInvert,
  CSSTranslate,
  CSSScale,
  CSSRotate,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSPerspective,
  CSSTransformValue,
  CSSMatrixComponent,
  CSSUnparsedValue,
  CSSVariableReferenceValue,
  CSSStyleValue,
  CSS,
  DOMMatrixReadOnly
} = TypedOM;




describe('Typed OM Custom Serialization & Parsing', () => {
  describe('Serialization', () => {
  it('CSSMathMax with one argument', () => {
    const result = new CSSMathMax(1);
    assert.strictEqual(String(result), 'max(1)');
  });

  it('CSSMathMax with more than one argument', () => {
    const result = new CSSMathMax(1, 2, 3);
    assert.strictEqual(String(result), 'max(1, 2, 3)');
  });

  it('CSSMathMax with pixel arguments', () => {
    const result = new CSSMathMin(CSS.px(100), CSS.px(110));
    assert.strictEqual(String(result), 'min(100px, 110px)');
  });

  it('CSSMathMax containing nested CSSMathValues', () => {
    const result = new CSSMathMax(new CSSMathSum(1, 2), 3);
    assert.strictEqual(String(result), 'max(1 + 2, 3)');
  });

  it('CSSMathMin with one argument', () => {
    const result = new CSSMathMin(1);
    assert.strictEqual(String(result), 'min(1)');
  });

  it('CSSMathMin with more than one argument', () => {
    const result = new CSSMathMin(1, 2, 3);
    assert.strictEqual(String(result), 'min(1, 2, 3)');
  });

  it('CSSMathMin with pixel arguments', () => {
    const result = new CSSMathMin(CSS.px(90), CSS.px(100));
    assert.strictEqual(String(result), 'min(90px, 100px)');
  });

  it('CSSMathMin containing nested CSSMathValues', () => {
    const result = new CSSMathMin(new CSSMathSum(1, 2), 3);
    assert.strictEqual(String(result), 'min(1 + 2, 3)');
  });

  it('CSSMathClamp with lower, value and upper arguments', () => {
    const result = new CSSMathClamp(1, 2, 3);
    assert.strictEqual(String(result), 'clamp(1, 2, 3)');
  });

  it('CSSMathClamp with pixel arguments', () => {
    const result = new CSSMathClamp(CSS.px(90), CSS.px(100), CSS.px(110));
    assert.strictEqual(String(result), 'clamp(90px, 100px, 110px)');
  });

  it('CSSMathClamp containing nested CSSMathValues', () => {
    const result = new CSSMathClamp(new CSSMathSum(1, 2), 3, 4);
    assert.strictEqual(String(result), 'clamp(1 + 2, 3, 4)');
  });

  it('CSSMathSum with one argument', () => {
    const result = new CSSMathSum(1);
    assert.strictEqual(String(result), 'calc(1)');
  });

  it('CSSMathSum with more than one argument', () => {
    const result = new CSSMathSum(1, 2, 3);
    assert.strictEqual(String(result), 'calc(1 + 2 + 3)');
  });

  it('CSSMathSum with a CSSMathNegate as first value', () => {
    const result = new CSSMathSum(new CSSMathNegate(1), 2, 3);
    assert.strictEqual(String(result), 'calc((-1) + 2 + 3)');
  });

  it('CSSMathSum containing a CSSMathNegate after first value', () => {
    const result = new CSSMathSum(1, new CSSMathNegate(2), 3);
    assert.strictEqual(String(result), 'calc(1 - 2 + 3)');
  });

  it('CSSMathSum nested inside a CSSMathValue', () => {
    const result = new CSSMathSum(new CSSMathSum(1, 2), 3);
    assert.strictEqual(String(result), 'calc((1 + 2) + 3)');
  });

  it('CSSMathNegate', () => {
    const result = new CSSMathNegate(1);
    assert.strictEqual(String(result), 'calc(-1)');
  });

  it('CSSMathNegate nested inside a CSSMathValue', () => {
    const result = new CSSMathProduct(new CSSMathNegate(1));
    assert.strictEqual(String(result), 'calc((-1))');
  });

  it('CSSMathProduct with one argument', () => {
    const result = new CSSMathProduct(1);
    assert.strictEqual(String(result), 'calc(1)');
  });

  it('CSSMathProduct with more than one argument', () => {
    const result = new CSSMathProduct(1, 2, 3);
    assert.strictEqual(String(result), 'calc(1 * 2 * 3)');
  });

  it('CSSMathProduct with a CSSMathInvert as first value', () => {
    const result = new CSSMathProduct(new CSSMathInvert(1), 2, 3);
    assert.strictEqual(String(result), 'calc((1 / 1) * 2 * 3)');
  });

  it('CSSMathProduct containing a CSSMathInvert after first value', () => {
    const result = new CSSMathProduct(1, new CSSMathInvert(2), 3);
    assert.strictEqual(String(result), 'calc(1 / 2 * 3)');
  });

  it('CSSMathProduct nested inside a CSSMathValue', () => {
    const result = new CSSMathProduct(new CSSMathProduct(1, 2), 3);
    assert.strictEqual(String(result), 'calc((1 * 2) * 3)');
  });

  it('CSSMathInvert', () => {
    const result = new CSSMathInvert(1);
    assert.strictEqual(String(result), 'calc(1 / 1)');
  });

  it('CSSMathInvert nested inside a CSSMathValue', () => {
    const result = new CSSMathSum(new CSSMathInvert(1));
    assert.strictEqual(String(result), 'calc((1 / 1))');
  });

  it('CSSTranslate with 2 arguments', () => {
    const result = new CSSTranslate(CSS.percent(1), CSS.px(1));
    assert.strictEqual(String(result), 'translate(1%, 1px)');
  });

  it('CSSTranslate with 3 arguments', () => {
    const result = new CSSTranslate(CSS.px(1), CSS.percent(2), CSS.px(3));
    assert.strictEqual(String(result), 'translate3d(1px, 2%, 3px)');
  });

  it('CSSScale with 2 arguments', () => {
    const result = new CSSScale(CSS.number(2), CSS.number(3));
    assert.strictEqual(String(result), 'scale(2, 3)');
  });

  it('CSSScale with 3 arguments', () => {
    const result = new CSSScale(CSS.number(1), CSS.number(2), CSS.number(3));
    assert.strictEqual(String(result), 'scale3d(1, 2, 3)');
  });

  it('CSSRotate with 1 argument', () => {
    const result = new CSSRotate(CSS.deg(90));
    assert.strictEqual(String(result), 'rotate(90deg)');
  });

  it('CSSRotate with 4 arguments', () => {
    const result = new CSSRotate(CSS.number(1), CSS.number(2), CSS.number(3), CSS.deg(90));
    assert.strictEqual(String(result), 'rotate3d(1, 2, 3, 90deg)');
  });

  it('CSSSkew', () => {
    const result = new CSSSkew(CSS.deg(90), CSS.deg(45));
    assert.strictEqual(String(result), 'skew(90deg, 45deg)');
  });

  it('CSSSkew with Y which is 0 value', () => {
    const result = new CSSSkew(CSS.deg(90), CSS.turn(0));
    assert.strictEqual(String(result), 'skew(90deg)');
  });

  it('CSSSkewX', () => {
    const result = new CSSSkewX(CSS.deg(90));
    assert.strictEqual(String(result), 'skewX(90deg)');
  });

  it('CSSSkewY', () => {
    const result = new CSSSkewY(CSS.deg(90));
    assert.strictEqual(String(result), 'skewY(90deg)');
  });

  it('CSSPerspective', () => {
    const result = new CSSPerspective(CSS.px(1));
    assert.strictEqual(String(result), 'perspective(1px)');
  });

  it('CSSPerspective with negative length', () => {
    const result = new CSSPerspective(CSS.px(-1));
    assert.strictEqual(String(result), 'perspective(calc(-1px))');
  });

  it('CSSPerspective with none as string', () => {
    const result = new CSSPerspective("none");
    assert.strictEqual(String(result), 'perspective(none)');
  });

  it('CSSPerspective with none as CSSKeyword', () => {
    const result = new CSSPerspective(new CSSKeywordValue("none"));
    assert.strictEqual(String(result), 'perspective(none)');
  });

  it('CSSTransformValue with a single transform', () => {
    const result = new CSSTransformValue([new CSSPerspective(CSS.px(1))]);
    assert.strictEqual(String(result), 'perspective(1px)');
  });

  it('CSSTransformValue with multiple transforms', () => {
    const result = new CSSTransformValue([
      new CSSTranslate(CSS.px(1), CSS.px(0)),
      new CSSRotate(CSS.deg(90)),
      new CSSPerspective(CSS.px(1)),
      new CSSSkew(CSS.deg(90), CSS.deg(45)),
      new CSSScale(CSS.number(1), CSS.number(2), CSS.number(3)),
    ]);
    assert.strictEqual(String(result), 'translate(1px, 0px) rotate(90deg) perspective(1px) skew(90deg, 45deg) scale3d(1, 2, 3)');
  });

  it('CSSTransformValue containing CSSMathValues', () => {
    const result = new CSSTransformValue([
      new CSSTranslate(new CSSMathSum(CSS.px(1), CSS.em(1)), CSS.px(0)),
      new CSSRotate(new CSSMathSum(CSS.deg(90), CSS.turn(1))),
      new CSSPerspective(new CSSMathSum(CSS.px(1), CSS.em(1))),
      new CSSSkew(new CSSMathProduct(CSS.deg(90), 2), new CSSMathProduct(CSS.turn(1), 2)),
      new CSSScale(
        new CSSMathProduct(CSS.number(1), CSS.number(2)),
        new CSSMathSum(CSS.number(1), CSS.number(1)),
        new CSSMathProduct(CSS.number(3))
      ),
    ]);
    assert.strictEqual(String(result), 'translate(calc(1em + 1px), 0px) rotate(calc(90deg + 360deg)) perspective(calc(1em + 1px)) skew(calc(2 * 90deg), calc(2 * 360deg)) scale3d(calc(1 * 2), calc(1 + 1), calc(3))');
  });

  it('CSSMathInvert with 0 parameter', () => {
    const result = new CSSTransformValue([
      new CSSRotate(
        new CSSMathInvert(
          new CSSUnitValue(0, 'number')),
        0, 0, CSS.deg(0))
      ]);
    assert.strictEqual(String(result), 'rotate3d(calc(1 / 0), 0, 0, 0deg)');
  });

  it('CSSMathInvert with 0 parameter and nested', () => {
    const result = new CSSTransformValue([
      new CSSRotate(
        0, 0, 0,
          new CSSMathProduct(CSS.deg(1),
            new CSSMathInvert(
              new CSSUnitValue(0, 'number')))
        )
      ]);
    assert.strictEqual(String(result), 'rotate3d(0, 0, 0, calc(1deg / 0))');
  });

  it('CSSMatrixComponent with 6 elements', () => {
    const result = new CSSMatrixComponent(new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]));
    assert.strictEqual(String(result), 'matrix(1, 2, 3, 4, 5, 6)');
  });

  it('CSSMatrixComponent with 16 elements', () => {
    const result = new CSSMatrixComponent(new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
    assert.strictEqual(String(result), 'matrix3d(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)');
  });

  it.skip('CSSTransformValue with updated is2D serializes as 2D transforms (Skip: requires manual setup)', () => {});

  it('CSSUnitValue with length unit constructed from IDL serializes correctly', () => {
    const result = new CSSUnitValue(3.14, 'px');
    assert.strictEqual(String(result), '3.14px');
  });

  it('CSSUnitValue with length unit constructed from IDL serializes correctly', () => {
    const result = CSS.px(3.14);
    assert.strictEqual(String(result), '3.14px');
  });

  it('CSSUnitValue with unit "percent" constructed from IDL serializes correctly', () => {
    const result = new CSSUnitValue(3.14, 'percent');
    assert.strictEqual(String(result), '3.14%');
  });

  it('CSSUnitValue with unit "percent" constructed from IDL serializes correctly', () => {
    const result = CSS.percent(3.14);
    assert.strictEqual(String(result), '3.14%');
  });

  it('CSSUnitValue with unit "number" constructed from IDL serializes correctly', () => {
    const result = new CSSUnitValue(3.14, 'number');
    assert.strictEqual(String(result), '3.14');
  });

  it('CSSUnitValue with unit "number" constructed from IDL serializes correctly', () => {
    const result = CSS.number(3.14);
    assert.strictEqual(String(result), '3.14');
  });

  it('CSSUnitValue with integer values constructed from IDL serializes correctly', () => {
    const result = new CSSUnitValue(3, 'number');
    assert.strictEqual(String(result), '3');
  });

  it.skip('CSSKeywordValue from DOMString modified by "value" setter serializes correctly (Skip: requires manual setup)', () => {});

  it.skip('CSSKeywordValue from CSSOM modified by "value" setter serializes correctly (Skip: requires manual setup)', () => {});

  it('CSSKeywordValue constructed from IDL serializes correctly', () => {
    const result = new CSSKeywordValue('auto');
    assert.strictEqual(String(result), 'auto');
  });

  it('CSSKeywordValue constructed from IDL serializes correctly', () => {
    const result = new CSSKeywordValue('inherit');
    assert.strictEqual(String(result), 'inherit');
  });

  it('CSSKeywordValue constructed from IDL serializes correctly', () => {
    const result = new CSSKeywordValue('lemon');
    assert.strictEqual(String(result), 'lemon');
  });

  it.skip('CSSKeywordValue from DOMString modified through "value" setter serializes correctly (Skip: requires manual setup)', () => {});

  it.skip('CSSKeywordValue from CSSOM modified through "value" setter serializes correctly (Skip: requires manual setup)', () => {});

  it('CSSUnparsedValue containing strings serializes to its tokenized contents', () => {
    const result = new CSSUnparsedValue(['lem', 'on', 'ade']);
    assert.strictEqual(String(result), 'lem/**/on/**/ade');
  });

  it('CSSUnparsedValue containing variable references', () => {
    const result = new CSSUnparsedValue([new CSSVariableReferenceValue('--A', new CSSUnparsedValue([new CSSVariableReferenceValue('--B')])), new CSSVariableReferenceValue('--C')]);
    assert.strictEqual(String(result), 'var(--A,var(--B))var(--C)');
  });

  it('CSSUnparsedValue with mix of strings and variable references', () => {
    const result = new CSSUnparsedValue(['foo', 'bar ', new CSSVariableReferenceValue('--A', new CSSUnparsedValue(['baz ', new CSSVariableReferenceValue('--B'), 'lemon'])), new CSSVariableReferenceValue('--C', new CSSUnparsedValue(['ade']))]);
    assert.strictEqual(String(result), 'foo/**/bar var(--A,baz var(--B)lemon)var(--C,ade)');
  });

  });

  describe('Normalization', () => {
  it('translate() with X', () => {
    let result;
    result = CSSTransformValue.parse('translate(1px)');
    const expected = new CSSTranslate(CSS.px(1), CSS.px(0));
    assert.strictEqual(String(result), String(expected));
  });

  it('translate() with X and Y', () => {
    let result;
    result = CSSTransformValue.parse('translate(1%, 1px)');
    const expected = new CSSTranslate(CSS.percent(1), CSS.px(1));
    assert.strictEqual(String(result), String(expected));
  });

  it('translateX()', () => {
    let result;
    result = CSSTransformValue.parse('translateX(1%)');
    const expected = new CSSTranslate(CSS.percent(1), CSS.px(0));
    assert.strictEqual(String(result), String(expected));
  });

  it('translateY()', () => {
    let result;
    result = CSSTransformValue.parse('translateY(1px)');
    const expected = new CSSTranslate(CSS.px(0), CSS.px(1));
    assert.strictEqual(String(result), String(expected));
  });

  it('translate3d()', () => {
    let result;
    result = CSSTransformValue.parse('translate3d(1px, 2%, 3px)');
    const expected = new CSSTranslate(CSS.px(1), CSS.percent(2), CSS.px(3));
    assert.strictEqual(String(result), String(expected));
  });

  it('translateZ()', () => {
    let result;
    result = CSSTransformValue.parse('translateZ(1px)');
    const expected = new CSSTranslate(CSS.px(0), CSS.px(0), CSS.px(1));
    assert.strictEqual(String(result), String(expected));
  });

  it('scale() with one argument', () => {
    let result;
    result = CSSTransformValue.parse('scale(2)');
    const expected = new CSSScale(CSS.number(2), CSS.number(2));
    assert.strictEqual(String(result), String(expected));
  });

  it('scale() with two arguments', () => {
    let result;
    result = CSSTransformValue.parse('scale(2, 3)');
    const expected = new CSSScale(CSS.number(2), CSS.number(3));
    assert.strictEqual(String(result), String(expected));
  });

  it('scaleX()', () => {
    let result;
    result = CSSTransformValue.parse('scaleX(2)');
    const expected = new CSSScale(CSS.number(2), CSS.number(1));
    assert.strictEqual(String(result), String(expected));
  });

  it('scaleY()', () => {
    let result;
    result = CSSTransformValue.parse('scaleY(2)');
    const expected = new CSSScale(CSS.number(1), CSS.number(2));
    assert.strictEqual(String(result), String(expected));
  });

  it('scale3d()', () => {
    let result;
    result = CSSTransformValue.parse('scale3d(1, 2, 3)');
    const expected = new CSSScale(CSS.number(1), CSS.number(2), CSS.number(3));
    assert.strictEqual(String(result), String(expected));
  });

  it('scaleZ()', () => {
    let result;
    result = CSSTransformValue.parse('scaleZ(2)');
    const expected = new CSSScale(CSS.number(1), CSS.number(1), CSS.number(2));
    assert.strictEqual(String(result), String(expected));
  });

  it('rotate()', () => {
    let result;
    result = CSSTransformValue.parse('rotate(90deg)');
    const expected = new CSSRotate(CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('rotate3d()', () => {
    let result;
    result = CSSTransformValue.parse('rotate3d(1, 2, 3, 90deg)');
    const expected = new CSSRotate(CSS.number(1), CSS.number(2), CSS.number(3), CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('rotateX()', () => {
    let result;
    result = CSSTransformValue.parse('rotateX(90deg)');
    const expected = new CSSRotate(CSS.number(1), CSS.number(0), CSS.number(0), CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('rotateY()', () => {
    let result;
    result = CSSTransformValue.parse('rotateY(90deg)');
    const expected = new CSSRotate(CSS.number(0), CSS.number(1), CSS.number(0), CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('rotateZ()', () => {
    let result;
    result = CSSTransformValue.parse('rotateZ(90deg)');
    const expected = new CSSRotate(CSS.number(0), CSS.number(0), CSS.number(1), CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('skew() with only X', () => {
    let result;
    result = CSSTransformValue.parse('skew(90deg)');
    const expected = new CSSSkew(CSS.deg(90), CSS.deg(0));
    assert.strictEqual(String(result), String(expected));
  });

  it('skew() with X and Y which is 0 value', () => {
    let result;
    result = CSSTransformValue.parse('skew(90deg, 0deg)');
    const expected = new CSSSkew(CSS.deg(90), CSS.deg(0));
    assert.strictEqual(String(result), String(expected));
  });

  it('skew() with X and Y', () => {
    let result;
    result = CSSTransformValue.parse('skew(90deg, 45deg)');
    const expected = new CSSSkew(CSS.deg(90), CSS.deg(45));
    assert.strictEqual(String(result), String(expected));
  });

  it('skewX()', () => {
    let result;
    result = CSSTransformValue.parse('skewX(90deg)');
    const expected = new CSSSkewX(CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('skewY()', () => {
    let result;
    result = CSSTransformValue.parse('skewY(90deg)');
    const expected = new CSSSkewY(CSS.deg(90));
    assert.strictEqual(String(result), String(expected));
  });

  it('perspective()', () => {
    let result;
    result = CSSTransformValue.parse('perspective(1px)');
    const expected = new CSSPerspective(CSS.px(1));
    assert.strictEqual(String(result), String(expected));
  });

  it('perspective(none)', () => {
    let result;
    result = CSSTransformValue.parse('perspective(none)');
    const expected = new CSSPerspective(new CSSKeywordValue('none'));
    assert.strictEqual(String(result), String(expected));
  });

  it('Normalizing a matrix() returns a CSSMatrixComponent', () => {
    let result;
    result = CSSTransformValue.parse('matrix(1, 2, 3, 4, 5, 6)');
    const expected = new CSSTransformValue([
        new CSSMatrixComponent(new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]))
      ]);
    assert.strictEqual(String(result), String(expected));
  });

  it('Normalizing a matrix3d() returns a CSSMatrixComponent', () => {
    let result;
    result = CSSTransformValue.parse('matrix3d(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)');
    const expected = new CSSTransformValue([
        new CSSMatrixComponent(new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))
      ]);
    assert.strictEqual(String(result), String(expected));
  });

  it.skip('Normalizing transforms with calc values contains CSSMathValues', () => {
    let result;
    result = CSSTransformValue.parse('translate(calc(1px + 1em)) perspective(calc(1px + 1em))');
    const expected = new CSSTransformValue([
        new CSSTranslate(new CSSMathSum(CSS.px(1), CSS.em(1)), CSS.px(0)),
        new CSSPerspective(new CSSMathSum(CSS.px(1), CSS.em(1))),
      ]);
    assert.strictEqual(String(result), String(expected));
  });

  });

  describe('Parsing', () => {
  it.skip('Parsing calc(1% + 2em + 3px)', () => {
    const result = CSSStyleValue.parse('width', 'calc(1% + 2em + 3px)');
    const expected = new CSSMathSum(CSS.percent(1), CSS.em(2), CSS.px(3));
    assert.strictEqual(String(result), String(expected));
  });

  it.skip('Parsing calc(1px + 2% + 3em)', () => {
    const result = CSSStyleValue.parse('width', 'calc(1px + 2% + 3em)');
    const expected = new CSSMathSum(CSS.px(1), CSS.percent(2), CSS.em(3));
    assert.strictEqual(String(result), String(expected));
  });

  });
});
