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

import type { CSSFunction, Token } from '../../types.ts';
import type { CSSUnit } from '../../data/gen/units.ts';
import { CSSNumericValue } from './CSSNumericValue.ts';
import { CSSUnitValue } from './CSSUnitValue.ts';
import {
  CSSMathSum,
  CSSMathProduct,
  CSSMathNegate,
  CSSMathInvert,
  CSSMathMin,
  CSSMathMax,
  CSSMathClamp,
  CSSMathRound,
  CSSMathFunction
} from './math/CSSMathOperations.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';
import { parseMathFunction, simplify } from '../../math-parser.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds } from '../../data/gen/units.ts';
import { compareStrings } from '../utils/validation.ts';
import { ensureNumeric } from '../utils/formatting.ts';
import { createCSSStyleValue } from '../values/style-value-factory.ts';

type SumValueItem = { value: number; unitMap: Map<string, number> };
type SumValue = SumValueItem[];

function areUnitMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [unit, power] of a) {
    if (b.get(unit) !== power) return false;
  }
  return true;
}

function isCompatible(u1: string, u2: string): boolean {
  if (u1 === u2) return true;
  const b1 = unitToBase[u1];
  const b2 = unitToBase[u2];
  if (!b1 || !b2 || b1 === 'number' || b1 === 'percent') return false;
  if (b1 !== b2) return false;
  const abs = ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'q', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'hz', 'khz', 'dpi', 'dpcm', 'dppx'];
  return abs.includes(u1) && abs.includes(u2);
}

function createCSSUnitValueFromSumValueItem(item: SumValueItem): CSSUnitValue | null {
  if (item.unitMap.size > 1) return null;
  if (item.unitMap.size === 0) return new CSSUnitValue(item.value, 'number');
  const entry = item.unitMap.entries().next().value;
  if (!entry) return new CSSUnitValue(item.value, 'number');
  const [unit, power] = entry;
  if (power !== 1) return null;
  return new CSSUnitValue(item.value, unit as CSSUnit);
}

function createSumValue(node: CSSNumericValue): SumValue | null {
  if (node instanceof CSSUnitValue) {
    let unit: string = node.unit;
    let value = node.value;

    if (unitToBase[unit] === 'length' && unitToPixels[unit]) {
      value *= unitToPixels[unit];
      unit = 'px';
    } else if (unitToBase[unit] === 'angle' && unitToRadians[unit]) {
      value *= unitToRadians[unit] / unitToRadians['deg'];
      unit = 'deg';
    } else if (unitToBase[unit] === 'time' && unitToSeconds[unit]) {
      value *= unitToSeconds[unit];
      unit = 's';
    } else if (unit === 'khz') { value *= 1000; unit = 'hz'; }
    else if (unit === 'dpi') { value /= 96; unit = 'dppx'; }
    else if (unit === 'dpcm') { value /= 96 / 2.54; unit = 'dppx'; }
    else if (unit === 'x') { unit = 'dppx'; }

    const unitMap = new Map<string, number>();
    if (unit !== 'number') unitMap.set(unit, 1);
    return [{ value, unitMap }];
  }

  if (node instanceof CSSMathSum) {
    const values: SumValue = [];
    for (const item of node.values) {
      const itemSum = createSumValue(item);
      if (!itemSum) return null;
      for (const sub of itemSum) {
        const existing = values.find(v => areUnitMapsEqual(v.unitMap, sub.unitMap));
        if (existing) {
          existing.value += sub.value;
        } else {
          values.push({ value: sub.value, unitMap: new Map(sub.unitMap) });
        }
      }
    }
    return values;
  }

  if (node instanceof CSSMathNegate) {
    const sum = createSumValue(node.value);
    if (!sum) return null;
    return sum.map(v => ({ value: -v.value, unitMap: v.unitMap }));
  }

  if (node instanceof CSSMathInvert) {
    const sum = createSumValue(node.value);
    if (!sum || sum.length > 1) return null;
    const item = sum[0];
    const newUnitMap = new Map<string, number>();
    for (const [u, p] of item.unitMap) newUnitMap.set(u, -p);
    return [{ value: 1 / item.value, unitMap: newUnitMap }];
  }

  if (node instanceof CSSMathProduct) {
    let values: SumValue = [{ value: 1, unitMap: new Map() }];
    for (const item of node.values) {
      const nextSum = createSumValue(item);
      if (!nextSum) return null;
      const temp: SumValue = [];
      for (const i1 of values) {
        for (const i2 of nextSum) {
          const newUnitMap = new Map(i1.unitMap);
          for (const [u, p] of i2.unitMap) {
            newUnitMap.set(u, (newUnitMap.get(u) || 0) + p);
            if (newUnitMap.get(u) === 0) newUnitMap.delete(u);
          }
          temp.push({ value: i1.value * i2.value, unitMap: newUnitMap });
        }
      }
      values = temp;
    }
    return values;
  }

  if (node instanceof CSSMathMin || node instanceof CSSMathMax) {
    const args = node.values.map(v => createSumValue(v));
    if (args.some(a => !a || a.length > 1)) return null;
    const firstMap = args[0]![0].unitMap;
    if (args.some(a => !areUnitMapsEqual(a![0].unitMap, firstMap))) return null;

    const numericValues = args.map(a => a![0].value);
    const finalValue = node instanceof CSSMathMin ? Math.min(...numericValues) : Math.max(...numericValues);
    return [{ value: finalValue, unitMap: firstMap }];
  }

  if (node instanceof CSSMathClamp) {
    if (node.lower instanceof CSSKeywordValue || node.upper instanceof CSSKeywordValue) {
      return null;
    }
    const lowerSum = createSumValue(node.lower as CSSNumericValue);
    const valueSum = createSumValue(node.value);
    const upperSum = createSumValue(node.upper as CSSNumericValue);

    if (!lowerSum || lowerSum.length > 1) return null;
    if (!valueSum || valueSum.length > 1) return null;
    if (!upperSum || upperSum.length > 1) return null;

    const unitMap = valueSum[0].unitMap;
    if (!areUnitMapsEqual(lowerSum[0].unitMap, unitMap)) return null;
    if (!areUnitMapsEqual(upperSum[0].unitMap, unitMap)) return null;

    const lowerVal = lowerSum[0].value;
    const val = valueSum[0].value;
    const upperVal = upperSum[0].value;

    const finalValue = Math.max(lowerVal, Math.min(val, upperVal));
    return [{ value: finalValue, unitMap }];
  }

  return null;
}

function isStandardCSSNumericValue(node: CSSNumericValue): boolean {
  if (node instanceof CSSUnitValue) {
    return true;
  }
  if (node instanceof CSSMathSum || node instanceof CSSMathProduct || node instanceof CSSMathMin || node instanceof CSSMathMax) {
    return node.values.every(isStandardCSSNumericValue);
  }
  if (node instanceof CSSMathClamp) {
    const lowerStandard = !(node.lower instanceof CSSNumericValue) || isStandardCSSNumericValue(node.lower);
    const valueStandard = isStandardCSSNumericValue(node.value);
    const upperStandard = !(node.upper instanceof CSSNumericValue) || isStandardCSSNumericValue(node.upper);
    return lowerStandard && valueStandard && upperStandard;
  }
  if (node instanceof CSSMathNegate || node instanceof CSSMathInvert) {
    return isStandardCSSNumericValue(node.value);
  }
  if (node instanceof CSSMathRound) {
    return isStandardCSSNumericValue(node.value) && isStandardCSSNumericValue(node.precision);
  }
  if (node instanceof CSSMathFunction) {
    return Array.from(node.values).every(isStandardCSSNumericValue);
  }
  return false;
}

// Attach prototype methods to CSSNumericValue
CSSNumericValue.prototype.to = function(unit: string): CSSUnitValue {
  if (arguments.length < 1) {
    throw new TypeError("Failed to execute 'to' on 'CSSNumericValue': 1 argument required, but only 0 present.");
  }
  if (!unitToBase[unit]) {
    throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
  }
  const sum = createSumValue(this);
  if (!sum || sum.length > 1) {
    throw new TypeError(`Cannot convert ${this.serialize()} to ${unit}`);
  }
  const item = createCSSUnitValueFromSumValueItem(sum[0]);
  if (!item) throw new TypeError(`Cannot convert ${this.serialize()} to ${unit}`);
  return item.to(unit);
};

CSSNumericValue.prototype.toSum = function(...units: string[]): CSSMathSum {
  for (const unit of units) {
    if (!unitToBase[unit]) throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
  }

  const sum = createSumValue(this);
  if (!sum) {
    throw new TypeError(`Cannot create sum value from ${this.serialize()}`);
  }

  const values = sum.map(item => createCSSUnitValueFromSumValueItem(item));
  if (values.some(v => v === null)) throw new TypeError(`Cannot create sum value from ${this.serialize()}`);

  let unitValues = values as CSSUnitValue[];

  if (units.length === 0) {
    unitValues.sort((a, b) => compareStrings(a.unit, b.unit));
    return new CSSMathSum(...unitValues);
  }

  const result: CSSUnitValue[] = [];
  const remaining = [...unitValues];

  for (const unit of units) {
    const temp = new CSSUnitValue(0, unit as CSSUnit);
    for (let i = 0; i < remaining.length; i++) {
      const value = remaining[i];
      if (isCompatible(value.unit, unit)) {
        const converted = value.to(unit);
        temp.value += converted.value;
        remaining.splice(i, 1);
        i--;
      }
    }
    result.push(temp);
  }

  if (remaining.length > 0) {
    throw new TypeError(`Remaining units: ${remaining.map(v => v.unit).join(', ')}`);
  }

  return new CSSMathSum(...result);
};

CSSNumericValue.parse = function(css: string): CSSNumericValue {
  if (arguments.length < 1) {
    throw new TypeError("Failed to execute 'parse' on 'CSSNumericValue': 1 argument required, but only 0 present.");
  }
  try {
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens).filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (componentValues.length === 0) {
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }
    if (componentValues.length > 1) {
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }

    const v = componentValues[0];
    if (v.type === 'number' || v.type === 'percentage' || v.type === 'dimension') {
      if (v.type === 'dimension') {
        const unit = v.unit;
        if (!(unit in unitToBase)) {
          throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
        }
      }
      const sv = createCSSStyleValue(v as Token);
      if (sv instanceof CSSNumericValue) return sv;
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }
    if (v.type === 'function') {
      const mathNode = parseMathFunction((v as CSSFunction).name, (v as CSSFunction).value);
      if (mathNode) {
        if (!isStandardCSSNumericValue(mathNode)) {
          throw new DOMException(`Unsupported mathematical function: ${css}`, 'SyntaxError');
        }
        try {
          mathNode.type();
        } catch (e) {
          throw new DOMException(`Invalid types in mathematical function: ${css}`, 'SyntaxError');
        }
        if ((v as CSSFunction).name.toLowerCase() === 'calc') {
          return simplify(mathNode);
        }
        return mathNode;
      }
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }
    throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'SyntaxError') {
      throw e;
    }
    throw new DOMException(`Invalid numeric value: ${css}. Details: ${e instanceof Error ? e.message : e}`, 'SyntaxError');
  }
};

CSSNumericValue.prototype.add = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const rectifiedValues = values.map(v => ensureNumeric(v));
  let allValues: CSSNumericValue[] = [];
  if (this instanceof CSSMathSum) {
    allValues.push(...this.values);
  } else {
    allValues.push(this);
  }
  allValues.push(...rectifiedValues);

  if (allValues.every(v => v instanceof CSSUnitValue)) {
    const unitValues = allValues as CSSUnitValue[];
    const firstUnit = unitValues[0].unit;
    if (unitValues.every(v => v.unit === firstUnit)) {
      const sum = unitValues.reduce((acc, v) => acc + v.value, 0);
      return new CSSUnitValue(sum, firstUnit);
    }
  }

  const sumNode = new CSSMathSum(...allValues);
  sumNode.type();
  return sumNode;
};

CSSNumericValue.prototype.sub = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const negatedValues = values.map(v => {
    const num = ensureNumeric(v);
    if (num instanceof CSSMathNegate) {
      return num.value;
    }
    if (num instanceof CSSUnitValue) {
      return new CSSUnitValue(-num.value, num.unit);
    }
    return new CSSMathNegate(num);
  });
  return this.add(...negatedValues);
};

CSSNumericValue.prototype.mul = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const rectifiedValues = values.map(v => ensureNumeric(v));
  let allValues: CSSNumericValue[] = [];
  if (this instanceof CSSMathProduct) {
    allValues.push(...this.values);
  } else {
    allValues.push(this);
  }
  allValues.push(...rectifiedValues);

  if (allValues.every(v => v instanceof CSSUnitValue)) {
    const unitValues = allValues as CSSUnitValue[];
    const numberValues = unitValues.filter(v => v.unit === 'number');
    const nonNumberValues = unitValues.filter(v => v.unit !== 'number');

    if (nonNumberValues.length === 0) {
      const prod = numberValues.reduce((acc, v) => acc * v.value, 1);
      return new CSSUnitValue(prod, 'number');
    }
    if (nonNumberValues.length === 1) {
      const prod = unitValues.reduce((acc, v) => acc * v.value, 1);
      return new CSSUnitValue(prod, nonNumberValues[0].unit);
    }
  }

  return new CSSMathProduct(...allValues);
};

CSSNumericValue.prototype.div = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const invertedValues = values.map(v => {
    const num = ensureNumeric(v);
    if (num instanceof CSSMathInvert) {
      return num.value;
    }
    if (num instanceof CSSUnitValue && num.unit === 'number') {
      if (num.value === 0) {
        throw new RangeError('Division by zero');
      }
      return new CSSUnitValue(1 / num.value, 'number');
    }
    return new CSSMathInvert(num);
  });
  return this.mul(...invertedValues);
};

CSSNumericValue.prototype.min = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const rectifiedValues = values.map(v => ensureNumeric(v));
  let allValues: CSSNumericValue[] = [];
  if (this instanceof CSSMathMin) {
    allValues.push(...this.values);
  } else {
    allValues.push(this);
  }
  allValues.push(...rectifiedValues);

  if (allValues.every(v => v instanceof CSSUnitValue)) {
    const unitValues = allValues as CSSUnitValue[];
    const firstUnit = unitValues[0].unit;
    if (unitValues.every(v => v.unit === firstUnit)) {
      const minVal = Math.min(...unitValues.map(v => v.value));
      return new CSSUnitValue(minVal, firstUnit);
    }
  }

  return new CSSMathMin(...allValues);
};

CSSNumericValue.prototype.max = function(...values: (number | CSSNumericValue)[]): CSSNumericValue {
  const rectifiedValues = values.map(v => ensureNumeric(v));
  let allValues: CSSNumericValue[] = [];
  if (this instanceof CSSMathMax) {
    allValues.push(...this.values);
  } else {
    allValues.push(this);
  }
  allValues.push(...rectifiedValues);

  if (allValues.every(v => v instanceof CSSUnitValue)) {
    const unitValues = allValues as CSSUnitValue[];
    const firstUnit = unitValues[0].unit;
    if (unitValues.every(v => v.unit === firstUnit)) {
      const maxVal = Math.max(...unitValues.map(v => v.value));
      return new CSSUnitValue(maxVal, firstUnit);
    }
  }

  return new CSSMathMax(...allValues);
};

function equalsInternal(a: CSSNumericValue, other: number | CSSNumericValue): boolean {
  if (typeof other === 'number') {
    return a instanceof CSSUnitValue && a.value === other && a.unit === 'number';
  }
  if (a === other) return true;
  if (a.constructor !== other.constructor) return false;

  if (a instanceof CSSUnitValue && other instanceof CSSUnitValue) {
    return a.value === other.value && a.unit === other.unit;
  }

  if (a instanceof CSSMathSum && other instanceof CSSMathSum) {
    return a.values.length === other.values.length && a.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
  }
  if (a instanceof CSSMathProduct && other instanceof CSSMathProduct) {
    return a.values.length === other.values.length && a.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
  }
  if (a instanceof CSSMathMin && other instanceof CSSMathMin) {
    return a.values.length === other.values.length && a.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
  }
  if (a instanceof CSSMathMax && other instanceof CSSMathMax) {
    return a.values.length === other.values.length && a.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
  }
  if (a instanceof CSSMathClamp && other instanceof CSSMathClamp) {
    const lowerEquals = (a.lower instanceof CSSKeywordValue && other.lower instanceof CSSKeywordValue)
      ? a.lower.value === other.lower.value
      : (a.lower instanceof CSSNumericValue && other.lower instanceof CSSNumericValue)
        ? a.lower.equals(other.lower)
        : false;

    const upperEquals = (a.upper instanceof CSSKeywordValue && other.upper instanceof CSSKeywordValue)
      ? a.upper.value === other.upper.value
      : (a.upper instanceof CSSNumericValue && other.upper instanceof CSSNumericValue)
        ? a.upper.equals(other.upper)
        : false;

    return lowerEquals && a.value.equals(other.value) && upperEquals;
  }
  if (a instanceof CSSMathNegate && other instanceof CSSMathNegate) {
    return a.value.equals(other.value);
  }
  if (a instanceof CSSMathInvert && other instanceof CSSMathInvert) {
    return a.value.equals(other.value);
  }
  if (a instanceof CSSMathRound && other instanceof CSSMathRound) {
    return a.strategy === other.strategy &&
           a.value.equals(other.value) &&
           a.precision.equals(other.precision);
  }
  if (a instanceof CSSMathFunction && other instanceof CSSMathFunction) {
    return a.name === other.name &&
           a.values.length === other.values.length &&
           a.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
  }

  return false;
}

CSSNumericValue.prototype.equals = function(...values: (number | CSSNumericValue)[]): boolean {
  if (values.length === 0) return true;
  for (const v of values) {
    if (!equalsInternal(this, v)) return false;
  }
  return true;
};
