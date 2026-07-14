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
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleValue, CSSUnitValue, CSSNumericValue, StylePropertyMap, CSS, CSSMathClamp, CSSMathSum, CSSMathNegate, CSSMathInvert, CSSMathMin, CSSMathMax, CSSMathFunction, CSSMathProduct, CSSMathRound } from '../src/typed-om.ts';
import { CSSStyleDeclaration } from '../src/index.ts';
import { simplify } from '../src/math-parser.ts';

test('CSSNumericValue arithmetic methods', () => {
  const px = new CSSUnitValue(10, 'px');
  const sum = px.add(new CSSUnitValue(20, 'px'));
  assert.strictEqual(sum.toString(), '30px');
  
  const diff = px.sub(new CSSUnitValue(5, 'px'));
  assert.strictEqual(diff.toString(), '5px');
  
  const prod = px.mul(2);
  assert.strictEqual(prod.toString(), '20px');
  
  const div = px.div(2);
  assert.strictEqual(div.toString(), '5px');
  
  const min = px.min(new CSSUnitValue(5, 'px'), new CSSUnitValue(15, 'px'));
  assert.strictEqual(min.toString(), '5px');
  
  const max = px.max(new CSSUnitValue(5, 'px'), new CSSUnitValue(15, 'px'));
  assert.strictEqual(max.toString(), '15px');
});

test('CSSMathClamp properties', () => {
  const min = new CSSUnitValue(10, 'px');
  const val = new CSSUnitValue(20, 'px');
  const max = new CSSUnitValue(30, 'px');
  const clamp = new CSSMathClamp(min, val, max);
  
  assert.strictEqual(clamp.lower, min);
  assert.strictEqual(clamp.value, val);
  assert.strictEqual(clamp.upper, max);
});

test('CSSMathValue operator property', () => {
  assert.strictEqual(new CSSMathSum(1, 2).operator, 'sum');
  assert.strictEqual(new CSSMathProduct(1, 2).operator, 'product');
  assert.strictEqual(new CSSMathNegate(1).operator, 'negate');
  assert.strictEqual(new CSSMathInvert(1).operator, 'invert');
  assert.strictEqual(new CSSMathMin(1, 2).operator, 'min');
  assert.strictEqual(new CSSMathMax(1, 2).operator, 'max');
  assert.strictEqual(new CSSMathClamp(1, 2, 3).operator, 'clamp');
  
  const sinFunc = new CSSMathFunction('sin', 45);
  assert.strictEqual(sinFunc.operator, 'sin');
  
  const roundFunc = new CSSMathRound('nearest', 5.5, 1);
  assert.strictEqual(roundFunc.operator, 'round');
});

test('CSSNumericValue equality', () => {
  const px1 = new CSSUnitValue(10, 'px');
  const px2 = new CSSUnitValue(10, 'px');
  const em = new CSSUnitValue(10, 'em');
  const px20 = new CSSUnitValue(20, 'px');

  assert.ok(px1.equals(px2));
  assert.ok(!px1.equals(em));
  assert.ok(!px1.equals(px20));
  assert.ok(px1.add(px2).equals(new CSSUnitValue(10, 'px').add(new CSSUnitValue(10, 'px'))));
  assert.ok(!px1.add(px2).equals(px1.add(em)));
});

test('Modern math functions parsing', async () => {
  const val = await CSS.parseValue('calc(sin(45deg) * 100px)');
  console.log('Parsed val:', val.toString());
  assert.ok(val.toString().includes('sin(45deg)'));
});

test('StylePropertyMap set/get', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('color', 'red');
  const map = new StylePropertyMap(style);
  
  assert.strictEqual(map.get('color')!.toString(), 'red');
  
  map.set('width', '100px');
  assert.strictEqual(style.getPropertyValue('width'), '100px');
  assert.strictEqual(map.get('width')!.toString(), '100px');
  
  map.set('margin', '10px 20px');
  const margin = map.get('margin')!;
  assert.ok(margin.toString().includes('10px 20px'));
});

test('CSSNumericValue.toSum()', () => {
  const val = new CSSUnitValue(1, 'in');
  
  const sum = val.toSum('px');
  assert.ok(sum instanceof CSSMathSum);
  assert.strictEqual(sum.values.length, 1);
  assert.ok(sum.values.item(0) instanceof CSSUnitValue);
  assert.strictEqual((sum.values.item(0) as CSSUnitValue).value, 96);
  assert.strictEqual((sum.values.item(0) as CSSUnitValue).unit, 'px');

  const val2 = new CSSMathSum(new CSSUnitValue(1, 'px'), new CSSUnitValue(1, 'in'));
  
  const sum2 = val2.toSum(); // Simplify
  assert.strictEqual(sum2.values.length, 1);
  assert.strictEqual((sum2.values.item(0) as CSSUnitValue).value, 97);
  assert.strictEqual((sum2.values.item(0) as CSSUnitValue).unit, 'px');

  const val3 = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(1, 'em'));
  
  const sum3 = val3.toSum('px', 'em');
  assert.strictEqual(sum3.values.length, 2);
  assert.strictEqual((sum3.values.item(0) as CSSUnitValue).unit, 'px');
  assert.strictEqual((sum3.values.item(0) as CSSUnitValue).value, 10);
  assert.strictEqual((sum3.values.item(1) as CSSUnitValue).unit, 'em');
  assert.strictEqual((sum3.values.item(1) as CSSUnitValue).value, 1);
});

test('CSSMathClamp.toSum()', () => {
  const min = new CSSUnitValue(10, 'px');
  const val = new CSSUnitValue(20, 'px');
  const max = new CSSUnitValue(30, 'px');
  const clamp = new CSSMathClamp(min, val, max);
  
  const sum = clamp.toSum();
  assert.strictEqual(sum.values.length, 1);
  assert.strictEqual((sum.values.item(0) as CSSUnitValue).value, 20);
  assert.strictEqual((sum.values.item(0) as CSSUnitValue).unit, 'px');
});

test('Subclass Property Renaming', () => {
  const sum = new CSSMathSum(1, 2);
  assert.ok('values' in sum);
  assert.ok(!('children' in sum));
});

test('CSSMathValue parsing preserves structure', () => {
  const parsed = CSSStyleValue.parse('width', 'calc(1px + 2px)');
  assert.ok(parsed instanceof CSSMathSum, 'Expected CSSMathSum');
  assert.strictEqual(parsed.values.length, 2, 'Expected 2 values in sum');
});

test('CSSMathValue parsing preserves structure of parentheses', () => {
  const parsed = CSSStyleValue.parse('width', 'calc((1px + 2px) + 3px)');
  assert.ok(parsed instanceof CSSMathSum, 'Expected CSSMathSum');
  assert.strictEqual(parsed.values.length, 2, 'Expected 2 values in sum (not flattened)');
  assert.ok(parsed.values.item(0) instanceof CSSMathSum, 'Expected first child to be CSSMathSum');
});

test('CSSMathSum.type() validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  const sum = new CSSMathSum(px, s);
  
  assert.throws(() => {
    sum.type();
  }, TypeError);
});

test('CSSMathMin.type() validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  const min = new CSSMathMin(px, s);
  
  assert.throws(() => {
    min.type();
  }, TypeError);
});

test('CSSMathMax.type() validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  const max = new CSSMathMax(px, s);
  
  assert.throws(() => {
    max.type();
  }, TypeError);
});


test('CSSNumericValue.simplify() handles advanced math functions', () => {
  const zeroDeg = new CSSUnitValue(0, 'deg');
  const sin = new CSSMathFunction('sin', zeroDeg);
  assert.strictEqual(simplify(sin).toString(), '0');

  const cos = new CSSMathFunction('cos', zeroDeg);
  assert.strictEqual(simplify(cos).toString(), '1');

  const sqrt = new CSSMathFunction('sqrt', 4);
  assert.strictEqual(simplify(sqrt).toString(), '2');

  const pow = new CSSMathFunction('pow', 2, 3);
  assert.strictEqual(simplify(pow).toString(), '8');

  const sign = new CSSMathFunction('sign', -5);
  assert.strictEqual(simplify(sign).toString(), '-1');

  const round = new CSSMathRound('nearest', 5.5, 1);
  assert.strictEqual(simplify(round).toString(), '6');
});

test('CSSNumericValue.simplify() handles unit canonicalization for min/max/clamp', () => {
  const tenMm = new CSSUnitValue(10, 'mm');
  const oneCm = new CSSUnitValue(1, 'cm');
  
  const min = new CSSMathMin(tenMm, oneCm);
  const simplifiedMin = simplify(min);
  assert.ok(simplifiedMin instanceof CSSUnitValue);
  assert.strictEqual(simplifiedMin.unit, 'px');
  assert.ok(Math.abs(simplifiedMin.value - 37.795275) < 0.001);

  const max = new CSSMathMax(tenMm, oneCm);
  const simplifiedMax = simplify(max);
  assert.ok(simplifiedMax instanceof CSSUnitValue);
  assert.strictEqual(simplifiedMax.unit, 'px');
  assert.ok(Math.abs(simplifiedMax.value - 37.795275) < 0.001);

  const clamp = new CSSMathClamp(new CSSUnitValue(5, 'mm'), tenMm, oneCm);
  const simplifiedClamp = simplify(clamp);
  assert.ok(simplifiedClamp instanceof CSSUnitValue);
  assert.strictEqual(simplifiedClamp.unit, 'px');
  assert.ok(Math.abs(simplifiedClamp.value - 37.795275) < 0.001);
});

test('CSSMathRound serialization adheres to omission rules', () => {
  const val = new CSSUnitValue(5.5, 'number');
  const one = new CSSUnitValue(1, 'number');
  const two = new CSSUnitValue(2, 'number');

  // Case 1: strategy 'nearest' and step '1' should be omitted
  const round1 = new CSSMathRound('nearest', val, one);
  assert.strictEqual(round1.serialize(), 'round(5.5)');

  // Case 2: strategy 'up' and step '1' -> strategy kept, step omitted
  const round2 = new CSSMathRound('up', val, one);
  assert.strictEqual(round2.serialize(), 'round(up, 5.5)');

  // Case 3: strategy 'nearest' and step '2' -> strategy omitted, step kept
  const round3 = new CSSMathRound('nearest', val, two);
  assert.strictEqual(round3.serialize(), 'round(5.5, 2)');

  // Case 4: strategy 'up' and step '2' -> both kept
  const round4 = new CSSMathRound('up', val, two);
  assert.strictEqual(round4.serialize(), 'round(up, 5.5, 2)');

  // Case 5: step '1' was NOT omitted in source -> should NOT be omitted in serialization
  const round5 = CSSStyleValue.parse('width', 'calc(round(5.5, 1))') as CSSMathRound;
  assert.strictEqual(round5.serialize(), 'round(5.5, 1)');

  // Case 6: step '1' was omitted in source -> should be omitted in serialization
  const round6 = CSSStyleValue.parse('width', 'calc(round(5.5))') as CSSMathRound;
  assert.strictEqual(round6.serialize(), 'round(5.5)');
});

test('CSSMathFunction.type() for trig and expo functions', () => {
  const asin = new CSSMathFunction('asin', 0.5);
  assert.deepStrictEqual(asin.type(), { angle: 1 });

  const acos = new CSSMathFunction('acos', 0.5);
  assert.deepStrictEqual(acos.type(), { angle: 1 });

  const atan = new CSSMathFunction('atan', 0.5);
  assert.deepStrictEqual(atan.type(), { angle: 1 });

  const atan2 = new CSSMathFunction('atan2', 1, 1);
  assert.deepStrictEqual(atan2.type(), { angle: 1 });

  const sin = new CSSMathFunction('sin', new CSSUnitValue(45, 'deg'));
  assert.deepStrictEqual(sin.type(), {});

  const sqrt = new CSSMathFunction('sqrt', 4);
  assert.deepStrictEqual(sqrt.type(), {});

  const hypot = new CSSMathFunction('hypot', new CSSUnitValue(3, 'px'), new CSSUnitValue(4, 'px'));
  assert.deepStrictEqual(hypot.type(), { length: 1 });
});

test('CSSMathSum serialization sorts dimensions by code point order, ignoring locale', () => {
  const originalLocaleCompare = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = function(compareString) {
      if (this === 'em' && compareString === 'px') return 1;
      if (this === 'px' && compareString === 'em') return -1;
      return 0;
    };
    
    const sum = new CSSMathSum(new CSSUnitValue(1, 'px'), new CSSUnitValue(1, 'em'));
    // With mocked localeCompare, 'px' < 'em', so it would sort as (1px + 1em) if using localeCompare.
    // But we want code point order where 'em' < 'px', so it should be (1em + 1px).
    assert.strictEqual(sum.serialize(), '(1em + 1px)');
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});

test('mod() and rem() type validation', () => {
  // Same types should pass
  assert.ok(CSSStyleValue.parse('width', 'calc(mod(10px, 3px))'));
  assert.ok(CSSStyleValue.parse('width', 'calc(rem(10px, 3px))'));
  assert.ok(CSSStyleValue.parse('width', 'calc(mod(10, 3))'));
  
  // Different types should fail
  assert.throws(() => {
    CSSStyleValue.parse('width', 'calc(mod(10px, 3s))');
  }, DOMException);
  
  assert.throws(() => {
    CSSStyleValue.parse('width', 'calc(rem(10px, 3))');
  }, DOMException);
});
test('CSSNumericValue.simplify() distribution conditions', () => {
  // calc(2 * (10px + min(5px, 1em))) should NOT distribute since min(5px, 1em) is not a leaf CSSUnitValue
  const node = CSSStyleValue.parse('width', 'calc(2 * (10px + min(5px, 1em)))') as CSSNumericValue;
  const simplified = simplify(node);
  assert.strictEqual(simplified.toString(), 'calc(2 * (min(5px, 1em) + 10px))');
});
