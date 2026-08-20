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
  CSSNumericValue,
  CSSUnitValue,
  CSSMathSum,
  CSSMathNegate,
  CSSMathMin,
  CSSMathMax,
  CSSUnparsedValue,
  CSSVariableReferenceValue,
  CSSTransformValue,
  CSSScale,
  CSSTranslate,
  CSSRotate,
  CSSStyleDeclaration,
  StylePropertyMap,
  StylePropertyMapReadOnly,
  CSS,
} from '../src/index.ts';
import { simplify } from '../src/math-parser.ts';

test('Phase 91: Same-Unit Literal Combining in min() / max() (css-values-4 § 10.7 #calc-simplification)', () => {
  // Combine same-unit literals in min()
  const minResult = simplify(
    new CSSMathMin(
      new CSSUnitValue(10, 'px'),
      new CSSUnitValue(20, 'px'),
      new CSSUnitValue(100, 'percent')
    )
  );
  assert.equal(minResult instanceof CSSMathMin, true);
  const minValues = (minResult as CSSMathMin).values;
  assert.equal(minValues.length, 2);
  assert.equal((minValues[0] as CSSUnitValue).value, 10);
  assert.equal((minValues[0] as CSSUnitValue).unit, 'px');
  assert.equal((minValues[1] as CSSUnitValue).value, 100);
  assert.equal((minValues[1] as CSSUnitValue).unit, 'percent');

  // Combine same-unit literals in max()
  const maxResult = simplify(
    new CSSMathMax(
      new CSSUnitValue(5, 'em'),
      new CSSUnitValue(10, 'em'),
      new CSSUnitValue(50, 'px')
    )
  );
  assert.equal(maxResult instanceof CSSMathMax, true);
  const maxValues = (maxResult as CSSMathMax).values;
  assert.equal(maxValues.length, 2);
  assert.equal((maxValues[0] as CSSUnitValue).value, 10);
  assert.equal((maxValues[0] as CSSUnitValue).unit, 'em');
  assert.equal((maxValues[1] as CSSUnitValue).value, 50);
  assert.equal((maxValues[1] as CSSUnitValue).unit, 'px');

  // Single argument remaining simplifies to child
  const singleMin = simplify(
    new CSSMathMin(
      new CSSUnitValue(10, 'px'),
      new CSSUnitValue(20, 'px'),
      new CSSUnitValue(5, 'px')
    )
  );
  assert.equal(singleMin instanceof CSSUnitValue, true);
  assert.equal((singleMin as CSSUnitValue).value, 5);
  assert.equal((singleMin as CSSUnitValue).unit, 'px');

  const singleMax = simplify(
    new CSSMathMax(
      new CSSUnitValue(10, 'px'),
      new CSSUnitValue(20, 'px'),
      new CSSUnitValue(5, 'px')
    )
  );
  assert.equal(singleMax instanceof CSSUnitValue, true);
  assert.equal((singleMax as CSSUnitValue).value, 20);
  assert.equal((singleMax as CSSUnitValue).unit, 'px');

  // Nested min/max flattening
  const nestedMin = simplify(
    new CSSMathMin(
      new CSSUnitValue(10, 'px'),
      new CSSMathMin(new CSSUnitValue(20, 'px'), new CSSUnitValue(100, 'percent'))
    )
  );
  assert.equal(nestedMin instanceof CSSMathMin, true);
  assert.equal((nestedMin as CSSMathMin).values.length, 2);
  assert.equal(((nestedMin as CSSMathMin).values[0] as CSSUnitValue).value, 10);
  assert.equal(((nestedMin as CSSMathMin).values[0] as CSSUnitValue).unit, 'px');
  assert.equal(((nestedMin as CSSMathMin).values[1] as CSSUnitValue).value, 100);
  assert.equal(((nestedMin as CSSMathMin).values[1] as CSSUnitValue).unit, 'percent');

  // Parsing min() / max() inside calc()
  const parsedMin = simplify(CSSNumericValue.parse('calc(min(10px, 20px, 100%))'));
  assert.equal(parsedMin instanceof CSSMathMin, true);
  assert.equal((parsedMin as CSSMathMin).values.length, 2);
  assert.equal(((parsedMin as CSSMathMin).values[0] as CSSUnitValue).value, 10);
  assert.equal(((parsedMin as CSSMathMin).values[0] as CSSUnitValue).unit, 'px');
  assert.equal(((parsedMin as CSSMathMin).values[1] as CSSUnitValue).value, 100);
  assert.equal(((parsedMin as CSSMathMin).values[1] as CSSUnitValue).unit, 'percent');

  const parsedMax = simplify(CSSNumericValue.parse('calc(max(5em, 10em, 50px))'));
  assert.equal(parsedMax instanceof CSSMathMax, true);
  assert.equal((parsedMax as CSSMathMax).values.length, 2);
  assert.equal(((parsedMax as CSSMathMax).values[0] as CSSUnitValue).value, 10);
  assert.equal(((parsedMax as CSSMathMax).values[0] as CSSUnitValue).unit, 'em');
  assert.equal(((parsedMax as CSSMathMax).values[1] as CSSUnitValue).value, 50);
  assert.equal(((parsedMax as CSSMathMax).values[1] as CSSUnitValue).unit, 'px');
});

test('Phase 91: Negation Distribution over CSSMathSum (css-values-4 § 10.7 step 6.3)', () => {
  // -(A + B) -> (-A) + (-B)
  const sum = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'percent'));
  const negated = simplify(new CSSMathNegate(sum));

  assert.equal(negated instanceof CSSMathSum, true);
  const values = (negated as CSSMathSum).values;
  assert.equal(values.length, 2);
  assert.equal(values[0] instanceof CSSUnitValue, true);
  assert.equal((values[0] as CSSUnitValue).value, -10);
  assert.equal((values[0] as CSSUnitValue).unit, 'px');
  assert.equal(values[1] instanceof CSSUnitValue, true);
  assert.equal((values[1] as CSSUnitValue).value, -20);
  assert.equal((values[1] as CSSUnitValue).unit, 'percent');

  // -(-A + B) -> A + (-B)
  const sumWithNegate = new CSSMathSum(new CSSMathNegate(new CSSUnitValue(10, 'px')), new CSSUnitValue(20, 'percent'));
  const negated2 = simplify(new CSSMathNegate(sumWithNegate));
  assert.equal(negated2 instanceof CSSMathSum, true);
  const values2 = (negated2 as CSSMathSum).values;
  assert.equal(values2.length, 2);
  assert.equal(values2[0] instanceof CSSUnitValue, true);
  assert.equal((values2[0] as CSSUnitValue).value, 10);
  assert.equal((values2[0] as CSSUnitValue).unit, 'px');
  assert.equal(values2[1] instanceof CSSUnitValue, true);
  assert.equal((values2[1] as CSSUnitValue).value, -20);
  assert.equal((values2[1] as CSSUnitValue).unit, 'percent');

  // Parsing -(10px + 20%)
  const parsed = CSSNumericValue.parse('calc(-(10px + 20%))');
  assert.equal(parsed instanceof CSSMathSum, true);
  assert.equal(((parsed as CSSMathSum).values[0] as CSSUnitValue).value, -10);
  assert.equal(((parsed as CSSMathSum).values[0] as CSSUnitValue).unit, 'px');
  assert.equal(((parsed as CSSMathSum).values[1] as CSSUnitValue).value, -20);
  assert.equal(((parsed as CSSMathSum).values[1] as CSSUnitValue).unit, 'percent');
});

test('Phase 91: Indexed Property Proxy Setters (CSSUnparsedValue & CSSTransformValue)', () => {
  // CSSUnparsedValue indexed setters
  const unparsed = new CSSUnparsedValue(['foo', 'bar']);
  assert.equal(unparsed.length, 2);
  assert.equal(unparsed[0], 'foo');
  assert.equal(unparsed[1], 'bar');

  // Replace existing element
  unparsed[0] = 'baz';
  assert.equal(unparsed[0], 'baz');

  // Append at index === length
  unparsed[2] = 'qux';
  assert.equal(unparsed.length, 3);
  assert.equal(unparsed[2], 'qux');

  // Append CSSVariableReferenceValue
  unparsed[3] = new CSSVariableReferenceValue('--custom');
  assert.equal(unparsed.length, 4);
  assert.equal(unparsed[3] instanceof CSSVariableReferenceValue, true);

  // Out of bounds index throws RangeError
  assert.throws(() => {
    unparsed[5] = 'out-of-bounds';
  }, RangeError);

  assert.throws(() => {
    (unparsed as unknown as Record<string, unknown>)[100] = 'out-of-bounds';
  }, RangeError);

  // Invalid value type throws TypeError
  assert.throws(() => {
    (unparsed as unknown as Record<number, unknown>)[0] = 12345;
  }, TypeError);

  // CSSTransformValue indexed setters
  const transform = new CSSTransformValue([
    new CSSScale(1, 1),
    new CSSTranslate(CSS.px(10), CSS.px(20)),
  ]);
  assert.equal(transform.length, 2);

  // Replace existing element
  transform[0] = new CSSScale(2, 3);
  assert.equal(transform[0] instanceof CSSScale, true);
  assert.equal(((transform[0] as CSSScale).x as CSSUnitValue).value, 2);
  assert.equal(((transform[0] as CSSScale).y as CSSUnitValue).value, 3);

  // Append at index === length
  transform[2] = new CSSRotate(CSS.deg(45));
  assert.equal(transform.length, 3);
  assert.equal(transform[2] instanceof CSSRotate, true);

  // Out of bounds index throws RangeError
  assert.throws(() => {
    transform[4] = new CSSScale(1, 1);
  }, RangeError);

  // Invalid value type throws TypeError
  assert.throws(() => {
    (transform as unknown as Record<number, unknown>)[0] = 'not-a-component';
  }, TypeError);
});

test('Phase 91: StylePropertyMap Custom Property Case Sensitivity & Validation', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('--myCustomProp', 'red');
  style.setProperty('--mycustomprop', 'blue');
  const map = new StylePropertyMap(style);

  // Case-sensitive get
  const valUpper = map.get('--myCustomProp');
  const valLower = map.get('--mycustomprop');
  assert.equal(valUpper !== undefined, true);
  assert.equal(valLower !== undefined, true);
  assert.equal(valUpper?.toString(), 'red');
  assert.equal(valLower?.toString(), 'blue');
  assert.equal(valUpper?._associatedProperty, '--myCustomProp');
  assert.equal(valLower?._associatedProperty, '--mycustomprop');

  // Mismatched case lookup returns undefined
  assert.equal(map.get('--MyCustomProp'), undefined);

  // Mismatched associated property throws TypeError on set
  assert.throws(() => {
    map.set('--otherProp', valUpper!);
  }, TypeError);

  assert.throws(() => {
    map.set('--mycustomprop', valUpper!);
  }, TypeError);

  // Correct associated property succeeds
  map.set('--myCustomProp', valUpper!);
  assert.equal(style.getPropertyValue('--myCustomProp'), 'red');

  // StylePropertyMap.append throws on existing var() reference
  map.set('background-image', 'var(--bg), url("b.png")');
  assert.throws(() => {
    map.append('background-image', 'url("c.png")');
  }, TypeError);

  // StylePropertyMap.append throws on unparsed var value
  assert.throws(() => {
    map.append('background-image', new CSSUnparsedValue(['url("c.png")']));
  }, TypeError);
});

test('Phase 91: StylePropertyMapReadOnly Iteration Order Partitioning', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('--zeta', '1');
  style.setProperty('color', 'red');
  style.setProperty('-webkit-transform', 'none');
  style.setProperty('background-color', 'blue');
  style.setProperty('--alpha', '2');
  style.setProperty('-webkit-appearance', 'none');

  const map = new StylePropertyMap(style);
  const keys = Array.from(map.keys());

  // Standard (alphabetic) -> Vendor-prefixed (alphabetic) -> Custom (alphabetic, exact case)
  assert.deepEqual(keys, [
    'background-color',
    'color',
    '-webkit-appearance',
    '-webkit-transform',
    '--alpha',
    '--zeta',
  ]);

  const entries = Array.from(map.entries());
  assert.equal(entries.length, 6);
  assert.equal(entries[0][0], 'background-color');
  assert.equal(entries[1][0], 'color');
  assert.equal(entries[2][0], '-webkit-appearance');
  assert.equal(entries[3][0], '-webkit-transform');
  assert.equal(entries[4][0], '--alpha');
  assert.equal(entries[5][0], '--zeta');

  // Also test with Declaration[] input containing non-standard vendor prefixes
  const declMap = new StylePropertyMapReadOnly([
    { type: 'declaration', name: '--z', value: [], important: false },
    { type: 'declaration', name: '-moz-box', value: [], important: false },
    { type: 'declaration', name: 'color', value: [], important: false },
    { type: 'declaration', name: '--a', value: [], important: false },
    { type: 'declaration', name: 'background', value: [], important: false },
  ]);
  assert.deepEqual(Array.from(declMap.keys()), [
    'background',
    'color',
    '-moz-box',
    '--a',
    '--z',
  ]);
});
