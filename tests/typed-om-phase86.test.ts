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
import assert from 'node:assert/strict';
import {
  CSSPositionValue,
  CSSVariableReferenceValue,
  CSSUnparsedValue,
  CSSUnitValue,
  CSSMathSum,
  CSSNumericValue,
  CSSStyleValue,
  CSSKeywordValue,
} from '../src/index.ts';

test('Phase 86: CSSPositionValue Constructor & Validation', () => {
  // css-typed-om § 3.3 #positionvalue-objects
  const pos = new CSSPositionValue(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'percent'));
  assert.equal(pos.x instanceof CSSUnitValue, true);
  assert.equal((pos.x as CSSUnitValue).value, 10);
  assert.equal((pos.x as CSSUnitValue).unit, 'px');
  assert.equal(pos.y instanceof CSSUnitValue, true);
  assert.equal((pos.y as CSSUnitValue).value, 20);
  assert.equal((pos.y as CSSUnitValue).unit, 'percent');
  assert.equal(pos.toString(), '10px 20%');

  // Setter mutations
  pos.x = new CSSUnitValue(50, 'percent');
  assert.equal((pos.x as CSSUnitValue).value, 50);
  assert.equal((pos.x as CSSUnitValue).unit, 'percent');

  pos.y = new CSSUnitValue(100, 'px');
  assert.equal((pos.y as CSSUnitValue).value, 100);
  assert.equal((pos.y as CSSUnitValue).unit, 'px');

  // Reject non-numeric and non-length-percentage values
  assert.throws(() => new (CSSPositionValue as unknown as new (x: unknown, y: unknown) => CSSPositionValue)('left' as unknown, new CSSUnitValue(0, 'px')), TypeError);
  assert.throws(() => new (CSSPositionValue as unknown as new (x: unknown, y: unknown) => CSSPositionValue)(new CSSKeywordValue('center'), new CSSUnitValue(0, 'px')), TypeError);
  assert.throws(() => new (CSSPositionValue as unknown as new (x: unknown, y: unknown) => CSSPositionValue)(new CSSUnitValue(10, 's'), new CSSUnitValue(0, 'px')), TypeError);
  assert.throws(() => new (CSSPositionValue as unknown as new (x: unknown, y: unknown) => CSSPositionValue)(new CSSUnitValue(10, 'deg'), new CSSUnitValue(0, 'px')), TypeError);
});

test('Phase 86: CSSPositionValue Parsing & Reification', () => {
  // 1-value syntax
  const centerPos = CSSStyleValue.parse('object-position', 'center') as CSSPositionValue;
  assert.equal(centerPos instanceof CSSPositionValue, true);
  assert.equal((centerPos.x as CSSUnitValue).value, 50);
  assert.equal((centerPos.x as CSSUnitValue).unit, 'percent');
  assert.equal((centerPos.y as CSSUnitValue).value, 50);
  assert.equal((centerPos.y as CSSUnitValue).unit, 'percent');

  const leftPos = CSSStyleValue.parse('object-position', 'left') as CSSPositionValue;
  assert.equal((leftPos.x as CSSUnitValue).value, 0);
  assert.equal((leftPos.x as CSSUnitValue).unit, 'percent');
  assert.equal((leftPos.y as CSSUnitValue).value, 50);
  assert.equal((leftPos.y as CSSUnitValue).unit, 'percent');

  const topPos = CSSStyleValue.parse('object-position', 'top') as CSSPositionValue;
  assert.equal((topPos.x as CSSUnitValue).value, 50);
  assert.equal((topPos.x as CSSUnitValue).unit, 'percent');
  assert.equal((topPos.y as CSSUnitValue).value, 0);
  assert.equal((topPos.y as CSSUnitValue).unit, 'percent');

  const lenPos = CSSStyleValue.parse('object-position', '25px') as CSSPositionValue;
  assert.equal((lenPos.x as CSSUnitValue).value, 25);
  assert.equal((lenPos.x as CSSUnitValue).unit, 'px');
  assert.equal((lenPos.y as CSSUnitValue).value, 50);
  assert.equal((lenPos.y as CSSUnitValue).unit, 'percent');

  // 2-value syntax
  const twoVal1 = CSSStyleValue.parse('background-position', 'left top') as CSSPositionValue;
  assert.equal((twoVal1.x as CSSUnitValue).value, 0);
  assert.equal((twoVal1.x as CSSUnitValue).unit, 'percent');
  assert.equal((twoVal1.y as CSSUnitValue).value, 0);
  assert.equal((twoVal1.y as CSSUnitValue).unit, 'percent');

  const twoVal2 = CSSStyleValue.parse('background-position', 'top right') as CSSPositionValue;
  assert.equal((twoVal2.x as CSSUnitValue).value, 100);
  assert.equal((twoVal2.x as CSSUnitValue).unit, 'percent');
  assert.equal((twoVal2.y as CSSUnitValue).value, 0);
  assert.equal((twoVal2.y as CSSUnitValue).unit, 'percent');

  const twoVal3 = CSSStyleValue.parse('transform-origin', '20px 80%') as CSSPositionValue;
  assert.equal((twoVal3.x as CSSUnitValue).value, 20);
  assert.equal((twoVal3.x as CSSUnitValue).unit, 'px');
  assert.equal((twoVal3.y as CSSUnitValue).value, 80);
  assert.equal((twoVal3.y as CSSUnitValue).unit, 'percent');

  // 4-value syntax
  const fourVal1 = CSSStyleValue.parse('background-position', 'right 10px bottom 20px') as CSSPositionValue;
  assert.equal(fourVal1 instanceof CSSPositionValue, true);
  assert.equal(fourVal1.x instanceof CSSMathSum, true);
  assert.equal(fourVal1.y instanceof CSSMathSum, true);

  const fourVal2 = CSSStyleValue.parse('background-position', 'left 5px top 15px') as CSSPositionValue;
  assert.equal((fourVal2.x as CSSUnitValue).value, 5);
  assert.equal((fourVal2.x as CSSUnitValue).unit, 'px');
  assert.equal((fourVal2.y as CSSUnitValue).value, 15);
  assert.equal((fourVal2.y as CSSUnitValue).unit, 'px');
});

test('Phase 86: CSSVariableReferenceValue & Fallback Preservation', () => {
  // css-typed-om § 3.4 #variable-reference-value-objects
  const refNoFallback = new CSSVariableReferenceValue('--custom');
  assert.equal(refNoFallback.variable, '--custom');
  assert.equal(refNoFallback.fallback, null);
  assert.equal(refNoFallback.toString(), 'var(--custom)');

  const fallback = new CSSUnparsedValue(['red']);
  const refWithFallback = new CSSVariableReferenceValue('--custom', fallback);
  assert.equal(refWithFallback.variable, '--custom');
  assert.equal(refWithFallback.fallback, fallback);
  assert.equal(refWithFallback.toString(), 'var(--custom,red)');

  // Validation
  assert.throws(() => new CSSVariableReferenceValue('--'), TypeError);
  assert.throws(() => new CSSVariableReferenceValue('custom'), TypeError);
  assert.throws(() => new (CSSVariableReferenceValue as unknown as new (v: string, f: unknown) => CSSVariableReferenceValue)('--custom', 'red' as unknown), TypeError);

  refNoFallback.variable = '--new-name';
  assert.equal(refNoFallback.variable, '--new-name');
  assert.throws(() => { refNoFallback.variable = 'invalid'; }, TypeError);
});

test('Phase 86: Calc Tree Simplification & Numeric Normalization', () => {
  // CSS Values 4 § 10.7 & CSS Typed OM 1 § 4.3
  const calc1 = CSSNumericValue.parse('calc(0% + 0%)');
  assert.equal(calc1 instanceof CSSUnitValue, true);
  assert.equal((calc1 as CSSUnitValue).value, 0);
  assert.equal((calc1 as CSSUnitValue).unit, 'percent');

  const calc2 = CSSNumericValue.parse('calc(10px + 20px)');
  assert.equal(calc2 instanceof CSSUnitValue, true);
  assert.equal((calc2 as CSSUnitValue).value, 30);
  assert.equal((calc2 as CSSUnitValue).unit, 'px');

  const calc3 = CSSNumericValue.parse('calc(1px + calc(1px) + calc(1px * 2) + 1%)');
  assert.equal(calc3 instanceof CSSMathSum, true);
  const sum3 = calc3 as CSSMathSum;
  assert.equal(sum3.values.length, 2);
  assert.equal((sum3.values[0] as CSSUnitValue).value, 4);
  assert.equal((sum3.values[0] as CSSUnitValue).unit, 'px');
  assert.equal((sum3.values[1] as CSSUnitValue).value, 1);
  assert.equal((sum3.values[1] as CSSUnitValue).unit, 'percent');

  const calc4 = CSSNumericValue.parse('calc(10px + 5em)');
  assert.equal(calc4 instanceof CSSMathSum, true);
  const sum4 = calc4 as CSSMathSum;
  assert.equal(sum4.values.length, 2);
});
