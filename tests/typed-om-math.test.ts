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
import type { CSSUnit } from '../src/data/units.ts';
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
  const parsed = CSSStyleValue.parse('width', 'calc(1px + 2em)');
  assert.ok(parsed instanceof CSSMathSum, 'Expected CSSMathSum');
  assert.strictEqual(parsed.values.length, 2, 'Expected 2 values in sum');
});

test('CSSMathValue parsing simplifies and flattens parentheses', () => {
  const parsed = CSSStyleValue.parse('width', 'calc((1px + 2em) + 3%)');
  assert.ok(parsed instanceof CSSMathSum, 'Expected CSSMathSum');
  assert.strictEqual(parsed.values.length, 3, 'Expected 3 values in sum (flattened)');
});

test('CSSMathSum constructor validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  assert.throws(() => {
    new CSSMathSum(px, s);
  }, TypeError);
});

test('CSSMathMin constructor validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  assert.throws(() => {
    new CSSMathMin(px, s);
  }, TypeError);
});

test('CSSMathMax constructor validates consistency', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(1, 's');
  assert.throws(() => {
    new CSSMathMax(px, s);
  }, TypeError);
});


test('CSSNumericValue.simplify() handles advanced math functions', () => {
  const zeroDeg = new CSSUnitValue(0, 'deg');
  const sin = new CSSMathFunction('sin', zeroDeg);
  assert.strictEqual(simplify(sin).toString(), '0');

  const cos = new CSSMathFunction('cos', zeroDeg);
  assert.strictEqual(simplify(cos).toString(), '1');

  const sinUnitless = new CSSMathFunction('sin', new CSSUnitValue(0, 'number'));
  assert.strictEqual(simplify(sinUnitless).toString(), '0');

  const cosUnitless = new CSSMathFunction('cos', new CSSUnitValue(0, 'number'));
  assert.strictEqual(simplify(cosUnitless).toString(), '1');

  const sqrt = new CSSMathFunction('sqrt', 4);
  assert.strictEqual(simplify(sqrt).toString(), '2');

  const pow = new CSSMathFunction('pow', 2, 3);
  assert.strictEqual(simplify(pow).toString(), '8');

  const sign = new CSSMathFunction('sign', -5);
  assert.strictEqual(simplify(sign).toString(), '-1');

  const round = new CSSMathRound('nearest', 5.5, 1);
  assert.strictEqual(simplify(round).toString(), '6');

  const hypotDiffUnits = new CSSMathFunction('hypot', new CSSUnitValue(3, 'cm'), new CSSUnitValue(40, 'mm'));
  const simplifiedHypot = simplify(hypotDiffUnits);
  assert.ok(simplifiedHypot instanceof CSSUnitValue);
  assert.strictEqual(simplifiedHypot.unit, 'px');
  assert.strictEqual(Math.round(simplifiedHypot.value * 1000) / 1000, 188.976);

  const atan2Val = new CSSMathFunction('atan2', new CSSUnitValue(10, 'px'), new CSSUnitValue(10, 'px'));
  assert.strictEqual(simplify(atan2Val).toString(), '45deg');

  const modVal = new CSSMathFunction('mod', new CSSUnitValue(10, 'px'), new CSSUnitValue(3, 'px'));
  assert.strictEqual(simplify(modVal).toString(), '1px');

  const remVal = new CSSMathFunction('rem', new CSSUnitValue(10, 'px'), new CSSUnitValue(3, 'px'));
  assert.strictEqual(simplify(remVal).toString(), '1px');

  const expVal = new CSSMathFunction('exp', new CSSUnitValue(1, 'number'));
  assert.strictEqual(Math.round((simplify(expVal) as CSSUnitValue).value * 1000) / 1000, 2.718);

  const logVal = new CSSMathFunction('log', new CSSUnitValue(10, 'number'), new CSSUnitValue(10, 'number'));
  assert.strictEqual(simplify(logVal).toString(), '1');
});

test('CSSNumericValue.simplify() handles unit canonicalization for min/max/clamp', () => {
  const tenMm = new CSSUnitValue(10, 'mm');
  const oneCm = new CSSUnitValue(1, 'cm');
  
  const min = new CSSMathMin(tenMm, oneCm);
  const simplifiedMin = simplify(min);
  assert.ok(simplifiedMin instanceof CSSMathMin); // Should not eagerly fold structure
  assert.strictEqual(simplifiedMin.to('mm').toString(), '10mm');

  const minDiff = new CSSMathMin(new CSSUnitValue(10, 'mm'), new CSSUnitValue(2, 'cm'));
  const simplifiedMinDiff = simplify(minDiff);
  assert.ok(simplifiedMinDiff instanceof CSSMathMin);
  assert.strictEqual(simplifiedMinDiff.to('mm').toString(), '10mm');

  const minMixed = new CSSMathMin(new CSSUnitValue(10, 'mm'), new CSSUnitValue(1, 'em'), new CSSUnitValue(20, 'mm'));
  const simplifiedMinMixed = simplify(minMixed);
  assert.ok(simplifiedMinMixed instanceof CSSMathMin);
  assert.strictEqual(simplifiedMinMixed.values.length, 3);
  assert.strictEqual(simplifiedMinMixed.values.item(0)?.toString(), '10mm');
  assert.strictEqual(simplifiedMinMixed.values.item(1)?.toString(), '1em');
  assert.strictEqual(simplifiedMinMixed.values.item(2)?.toString(), '20mm');

  const max = new CSSMathMax(tenMm, oneCm);
  const simplifiedMax = simplify(max);
  assert.ok(simplifiedMax instanceof CSSMathMax);
  assert.strictEqual(simplifiedMax.to('mm').toString(), '10mm');

  const clamp = new CSSMathClamp(new CSSUnitValue(5, 'mm'), tenMm, oneCm);
  const simplifiedClamp = simplify(clamp);
  assert.ok(simplifiedClamp instanceof CSSMathClamp);
  assert.ok(Math.abs(simplifiedClamp.to('mm').value - 10) < 1e-9);
  assert.strictEqual(simplifiedClamp.to('mm').unit, 'mm');
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
  const round5 = new CSSMathRound('nearest', val, one, false);
  assert.strictEqual(round5.serialize(), 'round(5.5, 1)');

  // Case 6: step '1' was omitted in source -> should be omitted in serialization
  const round6 = new CSSMathRound('nearest', val, one, true);
  assert.strictEqual(round6.serialize(), 'round(5.5)');
});

test('CSSMathSum serialization order: Percentages -> Dimensions', () => {
  const sum = new CSSMathSum(
    new CSSUnitValue(10, 'px'),
    new CSSUnitValue(2, 'percent')
  );
  assert.strictEqual(sum.serialize(), '(2% + 10px)');
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

test('Zero-valued power keys are deleted from CSSNumericType', () => {
  const px = new CSSUnitValue(10, 'px');
  const invPx = new CSSMathInvert(px);
  const prod = new CSSMathProduct(px, invPx);
  assert.deepStrictEqual(prod.type(), {});
});

test('CSSMathInvert.type() preserves percentHint', () => {
  const sum = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(2, 'percent'));
  assert.strictEqual(sum.type().percentHint, 'length');
  
  const invert = new CSSMathInvert(sum);
  assert.strictEqual(invert.type().percentHint, 'length');
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

test('CSSMathProduct.type() propagates percentHint correctly', () => {
  const sum = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(2, 'percent'));
  const pct = new CSSUnitValue(50, 'percent');
  const prod = new CSSMathProduct(sum, pct);
  
  assert.deepStrictEqual(prod.type(), { length: 2, percentHint: 'length' });
});

test('CSSMathClamp.type() resolves combined type and propagates percentHint', () => {
  const lower = new CSSMathSum(new CSSUnitValue(10, 'px'), new CSSUnitValue(2, 'percent'));
  const value = new CSSUnitValue(50, 'px');
  const upper = new CSSUnitValue(100, 'px');
  const clamp = new CSSMathClamp(lower, value, upper);
  
  assert.deepStrictEqual(clamp.type(), { length: 1, percentHint: 'length' });
});

test('CSSMathRound constructor type validation and type() resolution', () => {
  const px = new CSSUnitValue(10, 'px');
  const s = new CSSUnitValue(2, 's');
  
  assert.throws(() => {
    new CSSMathRound('nearest', px, s);
  }, TypeError);
  
  const round1 = new CSSMathRound('nearest', px, new CSSUnitValue(1, 'px'));
  assert.deepStrictEqual(round1.type(), { length: 1 });

  const round2 = new CSSMathRound('nearest', px, new CSSUnitValue(1, 'number'), true);
  assert.deepStrictEqual(round2.type(), { length: 1 });
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

test('clamp() simplification to CSSUnitValue', () => {
  const clampDirect = new CSSMathClamp(new CSSUnitValue(10, 'px'), new CSSUnitValue(15, 'px'), new CSSUnitValue(20, 'px'));
  const simplified = simplify(clampDirect);
  assert.ok(simplified instanceof CSSMathClamp);
  assert.strictEqual(simplified.to('px').value, 15);
  assert.strictEqual(simplified.to('px').unit, 'px');

  const parsed = CSSNumericValue.parse('clamp(10px, 15px, 20px)');
  assert.ok(parsed instanceof CSSMathClamp);
  assert.strictEqual(parsed.toString(), 'clamp(10px, 15px, 20px)');

  const parsedMin = CSSNumericValue.parse('clamp(10px, 5px, 20px)');
  assert.ok(parsedMin instanceof CSSMathClamp);
  assert.strictEqual(parsedMin.to('px').value, 10);

  const parsedMax = CSSNumericValue.parse('clamp(10px, 25px, 20px)');
  assert.ok(parsedMax instanceof CSSMathClamp);
  assert.strictEqual(parsedMax.to('px').value, 20);

  // also test compatible units (e.g. px and in)
  const parsedMixed = CSSNumericValue.parse('clamp(96px, 1.5in, 192px)');
  assert.ok(parsedMixed instanceof CSSMathClamp);
  assert.strictEqual(parsedMixed.to('in').value, 1.5);
});

test('CSSMathProduct dimensional division and inversion simplification', () => {
  // 10px * (1 / 2px) -> 5
  const px = new CSSUnitValue(10, 'px');
  const invPx = new CSSMathInvert(new CSSUnitValue(2, 'px'));
  const prod1 = new CSSMathProduct(px, invPx);
  const simplified1 = simplify(prod1);
  assert.ok(simplified1 instanceof CSSUnitValue);
  assert.strictEqual(simplified1.value, 5);
  assert.strictEqual(simplified1.unit, 'number');

  // 10px * 2s * (1 / 4s) -> 5px
  const s = new CSSUnitValue(2, 's');
  const invS = new CSSMathInvert(new CSSUnitValue(4, 's'));
  const prod2 = new CSSMathProduct(px, s, invS);
  const simplified2 = simplify(prod2);
  assert.ok(simplified2 instanceof CSSUnitValue);
  assert.strictEqual(simplified2.value, 5);
  assert.strictEqual(simplified2.unit, 'px');

  // 10px * (1 / 2s) -> should NOT simplify to CSSUnitValue since px/s is not a valid CSS dimension
  const prod3 = new CSSMathProduct(px, invS);
  const simplified3 = simplify(prod3);
  assert.ok(simplified3 instanceof CSSMathProduct);
});

test('addTypesForSum loops over all base types for percent hint resolution', () => {
  // t1: percent: 1, time: -1, length: 1
  const t1 = CSS.percent(10).div(CSS.s(1)).mul(CSS.px(10));
  // t2: percent: 2, time: -1
  const t2 = CSS.percent(20).mul(CSS.percent(20)).div(CSS.s(1));
  
  // They should match when percent is resolved to length, so t1 + t2 should be valid
  const sum = t1.add(t2);
  assert.ok(sum);
  assert.strictEqual(sum.type().percentHint, 'length');
});

test('CSS.rad and CSS.turn factories do not convert to degrees', () => {
  const radVal = CSS.rad(Math.PI);
  assert.strictEqual(radVal.value, Math.PI);
  assert.strictEqual(radVal.unit, 'rad');

  const turnVal = CSS.turn(0.5);
  assert.strictEqual(turnVal.value, 0.5);
  assert.strictEqual(turnVal.unit, 'turn');
});

test('CSSNumericValue.parse preserves mathematical AST structure', () => {
  const val = CSSNumericValue.parse('calc(1px + 2px)');
  assert.ok(val instanceof CSSMathSum);
  const values = (val as CSSMathSum).values;
  assert.strictEqual(values.length, 2);
  assert.strictEqual(values.item(0)?.toString(), '1px');
  assert.strictEqual(values.item(1)?.toString(), '2px');
});

test('CSSUnitValue constructor validates unit', () => {
  assert.throws(() => {
    new CSSUnitValue(10, 'invalid-unit' as unknown as CSSUnit);
  }, (err: unknown) => err instanceof TypeError);
});

test('math constructors throw on empty arguments list', () => {
  const constructors = [CSSMathSum, CSSMathProduct, CSSMathMin, CSSMathMax];
  for (const Ctor of constructors) {
    assert.throws(() => {
      new Ctor();
    }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
  }
});

test('CSSMathProduct constructor validates argument types', () => {
  const v1 = new CSSUnitValue(10, 'percent');
  const v2 = new CSSUnitValue(20, 'percent');
  const lenPercent = v1.add(new CSSUnitValue(5, 'px'));
  const timePercent = v2.add(new CSSUnitValue(5, 's'));
  assert.throws(() => {
    new CSSMathProduct(lenPercent, timePercent);
  }, (err: unknown) => err instanceof TypeError);
});

test('equals support for CSSMathRound and CSSMathFunction', () => {
  const r1 = new CSSMathRound('up', new CSSUnitValue(15, 'px'), new CSSUnitValue(10, 'px'));
  const r2 = new CSSMathRound('up', new CSSUnitValue(15, 'px'), new CSSUnitValue(10, 'px'));
  const r3 = new CSSMathRound('down', new CSSUnitValue(15, 'px'), new CSSUnitValue(10, 'px'));
  const r4 = new CSSMathRound('up', new CSSUnitValue(15, 'px'), new CSSUnitValue(5, 'px'));

  assert.ok(r1.equals(r2));
  assert.ok(!r1.equals(r3));
  assert.ok(!r1.equals(r4));

  const f1 = new CSSMathFunction('sin', new CSSUnitValue(90, 'deg'));
  const f2 = new CSSMathFunction('sin', new CSSUnitValue(90, 'deg'));
  const f3 = new CSSMathFunction('cos', new CSSUnitValue(90, 'deg'));
  const f4 = new CSSMathFunction('sin', new CSSUnitValue(45, 'deg'));

  assert.ok(f1.equals(f2));
  assert.ok(!f1.equals(f3));
  assert.ok(!f1.equals(f4));
});

test('CSS factory methods for Hz, kHz, and Q are correctly cased', () => {
  const css = CSS as unknown as Record<string, Function>;
  const cssObj = CSS as unknown as Record<string, unknown>;

  assert.strictEqual(typeof css.Hz, 'function');
  assert.strictEqual(typeof css.kHz, 'function');
  assert.strictEqual(typeof css.Q, 'function');

  assert.strictEqual(cssObj.hz, undefined);
  assert.strictEqual(cssObj.khz, undefined);
  assert.strictEqual(cssObj.q, undefined);

  const hzVal = css.Hz(60) as CSSUnitValue;
  assert.strictEqual(hzVal.value, 60);
  assert.strictEqual(hzVal.unit, 'hz');

  const khzVal = css.kHz(2.4) as CSSUnitValue;
  assert.strictEqual(khzVal.value, 2.4);
  assert.strictEqual(khzVal.unit, 'khz');

  const qVal = css.Q(10) as CSSUnitValue;
  assert.strictEqual(qVal.value, 10);
  assert.strictEqual(qVal.unit, 'q');
});
