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

import type { CSSNumericType } from '../CSSNumericType.ts';
import type { CSSNumericValue } from '../CSSNumericValue.ts';
import { CSSMathValue } from './CSSMathValue.ts';
import { CSSNumericArray } from '../CSSNumericArray.ts';
import { CSSUnitValue } from '../CSSUnitValue.ts';
import { CSSKeywordValue } from '../../values/CSSKeywordValue.ts';
import { addTypes, addTypesForSum } from '../CSSNumericType.ts';
import { sortNumericNodes } from './math-sorting.ts';
import { ensureNumeric, stripOuterParens } from '../../utils/formatting.ts';

function validateCompatibleSumTypes(numericArgs: CSSNumericValue[], context: string): void {
  if (numericArgs.length > 0) {
    const firstType = numericArgs[0].type();
    for (let i = 1; i < numericArgs.length; i++) {
      if (!addTypesForSum(firstType, numericArgs[i].type())) {
        throw new TypeError(`Incompatible types in ${context}`);
      }
    }
  }
}

function serializeMathBound(node: CSSNumericValue | CSSKeywordValue): string {
  return node instanceof CSSKeywordValue ? node.toString() : node._serialize();
}

// Prototype getters (`value`, `values`, `lower`, `upper`) across CSSMath* subclasses are used
// purely for WPT idlharness conformance even though instance fields have better ergonomics.
// TODO: reconsider this if perf or ergonomics make the test failures worth it.
// css-typed-om #cssmathnegate
export class CSSMathNegate extends CSSMathValue {
  /** @internal */ readonly _operator = 'negate';
  private _value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSMathNegate': 1 argument required, but only " + arguments.length + " present.");
    }
    super();
    this._value = ensureNumeric(child);
  }
  get value(): CSSNumericValue { return this._value; }
  /** @internal */
  override _serialize(): string {
    return `(-${this._value._serialize()})`;
  }
  override toString(): string {
    return `calc(-${stripOuterParens(this._value._serialize())})`;
  }
  override type(): CSSNumericType {
    return this._value.type();
  }
}

// css-typed-om #cssmathinvert
export class CSSMathInvert extends CSSMathValue {
  /** @internal */ readonly _operator = 'invert';
  private _value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSMathInvert': 1 argument required, but only " + arguments.length + " present.");
    }
    super();
    this._value = ensureNumeric(child);
  }
  get value(): CSSNumericValue { return this._value; }
  /** @internal */
  override _serialize(): string {
    return `(1 / ${this._value._serialize()})`;
  }
  override toString(): string {
    return `calc(1 / ${stripOuterParens(this._value._serialize())})`;
  }
  override type(): CSSNumericType {
    const t = this._value.type();
    const result: CSSNumericType = {};
    const res = result as Record<string, unknown>;
    for (const [key, value] of Object.entries(t)) {
      if (key !== 'percentHint') {
        res[key] = -(value as number);
      }
    }
    if (t.percentHint) {
      result.percentHint = t.percentHint;
    }
    return result;
  }
}

// css-typed-om #cssmathsum
export class CSSMathSum extends CSSMathValue {
  /** @internal */ readonly _operator = 'sum';
  private _values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathSum requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'sum');
    this._values = new CSSNumericArray(numericArgs);
  }
  get values(): CSSNumericArray { return this._values; }
  /** @internal */
  override _serialize(): string {
    const sortedChildren = sortNumericNodes([...this._values]);
    let s = '(';
    s += sortedChildren[0]._serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathNegate) {
        s += ` - ${stripOuterParens(child.value._serialize())}`;
      } else {
        s += ` + ${child._serialize()}`;
      }
    }
    s += ')';
    return s;
  }
  override type(): CSSNumericType {
    if (this._values.length === 0) return {};
    const types = Array.from(this._values, v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in sum');
      return combined;
    });
  }
}

// css-typed-om #cssmathproduct
export class CSSMathProduct extends CSSMathValue {
  /** @internal */ readonly _operator = 'product';
  private _values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathProduct requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    let currentType: CSSNumericType = {};
    for (const arg of numericArgs) {
      currentType = addTypes(currentType, arg.type());
    }
    this._values = new CSSNumericArray(numericArgs);
  }
  get values(): CSSNumericArray { return this._values; }
  /** @internal */
  override _serialize(): string {
    const sortedChildren = sortNumericNodes([...this._values]);
    let s = '(';
    s += sortedChildren[0]._serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathInvert) {
        // css-values-4 #serialize-a-calculation-tree
        s += ` / ${stripOuterParens(child.value._serialize())}`;
        continue;
      }
      s += ` * ${child._serialize()}`;
    }
    s += ')';
    return s;
  }
  override type(): CSSNumericType {
    let result: CSSNumericType = {};
    this._values.forEach(child => {
      result = addTypes(result, child.type());
    });
    return result;
  }
}

// css-typed-om #cssmathmin
export class CSSMathMin extends CSSMathValue {
  /** @internal */ readonly _operator = 'min';
  private _values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMin requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'min');
    this._values = new CSSNumericArray(numericArgs);
  }
  get values(): CSSNumericArray { return this._values; }
  /** @internal */
  override _serialize(): string {
    return `min(${Array.from(this._values, c => stripOuterParens(c._serialize())).join(', ')})`;
  }
  override type(): CSSNumericType {
    if (this._values.length === 0) return {};
    const types = Array.from(this._values, v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in min');
      return combined;
    });
  }
}

// css-typed-om #cssmathmax
export class CSSMathMax extends CSSMathValue {
  /** @internal */ readonly _operator = 'max';
  private _values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMax requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'max');
    this._values = new CSSNumericArray(numericArgs);
  }
  get values(): CSSNumericArray { return this._values; }
  /** @internal */
  override _serialize(): string {
    return `max(${Array.from(this._values, c => stripOuterParens(c._serialize())).join(', ')})`;
  }
  override type(): CSSNumericType {
    if (this._values.length === 0) return {};
    const types = Array.from(this._values, v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in max');
      return combined;
    });
  }
}

// css-typed-om #cssmathclamp
export class CSSMathClamp extends CSSMathValue {
  /** @internal */ readonly _operator = 'clamp';
  private _lower: CSSNumericValue | CSSKeywordValue;
  private _value: CSSNumericValue;
  private _upper: CSSNumericValue | CSSKeywordValue;
  constructor(lower: number | CSSNumericValue | CSSKeywordValue, value: number | CSSNumericValue, upper: number | CSSNumericValue | CSSKeywordValue) {
    if (arguments.length < 3) {
      throw new TypeError("Failed to construct 'CSSMathClamp': 3 arguments required, but only " + arguments.length + " present.");
    }
    super();
    const l = typeof lower === 'number' ? new CSSUnitValue(lower, 'number') : lower;
    const v = ensureNumeric(value);
    const u = typeof upper === 'number' ? new CSSUnitValue(upper, 'number') : upper;

    if (l && typeof (l as CSSNumericValue).type === 'function') {
      if (!addTypesForSum((l as CSSNumericValue).type(), v.type())) {
        throw new TypeError('Incompatible types in clamp');
      }
    }
    if (u && typeof (u as CSSNumericValue).type === 'function') {
      if (!addTypesForSum((u as CSSNumericValue).type(), v.type())) {
        throw new TypeError('Incompatible types in clamp');
      }
    }
    if (l && u && typeof (l as CSSNumericValue).type === 'function' && typeof (u as CSSNumericValue).type === 'function') {
      if (!addTypesForSum((l as CSSNumericValue).type(), (u as CSSNumericValue).type())) {
        throw new TypeError('Incompatible types in clamp');
      }
    }

    this._lower = l;
    this._value = v;
    this._upper = u;
  }
  get lower(): CSSNumericValue | CSSKeywordValue { return this._lower; }
  get value(): CSSNumericValue { return this._value; }
  get upper(): CSSNumericValue | CSSKeywordValue { return this._upper; }
  /** @internal */
  override _serialize(): string {
    return `clamp(${stripOuterParens(serializeMathBound(this._lower))}, ${stripOuterParens(this._value._serialize())}, ${stripOuterParens(serializeMathBound(this._upper))})`;
  }
  override type(): CSSNumericType {
    let result = this._value.type();
    if (this._lower && typeof (this._lower as CSSNumericValue).type === 'function') {
      const combined = addTypesForSum(result, (this._lower as CSSNumericValue).type());
      if (combined) result = combined;
    }
    if (this._upper && typeof (this._upper as CSSNumericValue).type === 'function') {
      const combined = addTypesForSum(result, (this._upper as CSSNumericValue).type());
      if (combined) result = combined;
    }
    return result;
  }
}

// css-values-4 #round-func
export class CSSMathRound extends CSSMathValue {
  /** @internal */ readonly _operator = 'round';
  readonly strategy: string;
  readonly value: CSSNumericValue;
  readonly precision: CSSNumericValue;
  readonly precisionOmitted: boolean;

  constructor(strategy: string, value: number | CSSNumericValue, precision: number | CSSNumericValue, precisionOmitted?: boolean) {
    super();
    this.strategy = strategy;
    this.value = ensureNumeric(value);

    let p = ensureNumeric(precision);
    let pOmitted = precisionOmitted;
    if (pOmitted === undefined) {
      pOmitted = p instanceof CSSUnitValue && p.unit === 'number' && p.value === 1;
    }

    if (pOmitted && p instanceof CSSUnitValue && p.unit === 'number' && p.value === 1) {
      const v = this.value;
      if (v instanceof CSSUnitValue && v.unit !== 'number') {
        p = new CSSUnitValue(1, v.unit);
      }
    }
    this.precision = p;
    this.precisionOmitted = pOmitted;

    if (!addTypesForSum(this.value.type(), this.precision.type())) {
      throw new TypeError('Incompatible types in round');
    }
  }

  // css-values-4: The round() function is serialized as:
  // - If the rounding strategy is nearest, it is omitted.
  // - If the step value is 1 and was omitted in the source, it is omitted in the serialization.
  /** @internal */
  override _serialize(): string {
    const args: string[] = [];

    if (this.strategy !== 'nearest') {
      args.push(this.strategy);
    }

    args.push(stripOuterParens(this.value._serialize()));

    if (!this.precisionOmitted) {
      args.push(stripOuterParens(this.precision._serialize()));
    }

    return `round(${args.join(', ')})`;
  }

  override toString(): string {
    return this._serialize();
  }

  override type(): CSSNumericType {
    const combined = addTypesForSum(this.value.type(), this.precision.type());
    if (!combined) {
      throw new TypeError('Incompatible types in round');
    }
    return combined;
  }
}

// css-values-4 #math
export class CSSMathFunction extends CSSMathValue {
  /** @internal */ readonly _operator: string;
  readonly values: CSSNumericArray;
  readonly name: string;
  constructor(name: string, ...args: (number | CSSNumericValue)[]) {
    super();
    this.name = name;
    this._operator = name;
    this.values = new CSSNumericArray(args.map(ensureNumeric));
  }

  /** @internal */
  override _serialize(): string {
    const argsStr = Array.from(this.values, c => {
      let s = c._serialize();
      if (s.startsWith('(') && s.endsWith(')')) {
        s = s.slice(1, -1);
      }
      return s;
    }).join(', ');

    if (this.name === 'calc') {
      return `calc(${argsStr})`;
    }
    return `${this.name}(${argsStr})`;
  }

  override toString(): string {
    return this._serialize();
  }

  override type(): CSSNumericType {
    if (this.values.length === 0) return {};
    const name = this.name.toLowerCase();

    if (['sin', 'cos', 'tan'].includes(name)) {
      if (this.values.length !== 1) {
        throw new TypeError(`${name} requires exactly 1 argument`);
      }
      const t = this.values[0]!.type();
      if (addTypesForSum(t, { angle: 1 }) === null && addTypesForSum(t, {}) === null) {
        throw new TypeError(`Invalid argument type in ${name}`);
      }
      return {};
    }

    if (['asin', 'acos', 'atan'].includes(name)) {
      if (this.values.length !== 1) {
        throw new TypeError(`${name} requires exactly 1 argument`);
      }
      const t = this.values[0]!.type();
      if (addTypesForSum(t, {}) === null) {
        throw new TypeError(`Argument to ${name} must be a number`);
      }
      return { angle: 1 };
    }

    if (name === 'atan2') {
      if (this.values.length !== 2) {
        throw new TypeError('atan2 requires exactly 2 arguments');
      }
      const t1 = this.values[0]!.type();
      const t2 = this.values[1]!.type();
      if (addTypesForSum(t1, t2) === null) {
        throw new TypeError('Incompatible argument types in atan2');
      }
      return { angle: 1 };
    }

    if (name === 'sign') {
      if (this.values.length !== 1) throw new TypeError('sign requires exactly 1 argument');
      return {};
    }
    if (['sqrt', 'exp'].includes(name)) {
      if (this.values.length !== 1) throw new TypeError(`${name} requires exactly 1 argument`);
      const t = this.values[0]!.type();
      if (addTypesForSum(t, {}) === null) throw new TypeError(`Argument to ${name} must be a number`);
      return {};
    }

    if (name === 'pow') {
      if (this.values.length !== 2) throw new TypeError('pow requires exactly 2 arguments');
      const t1 = this.values[0]!.type();
      const t2 = this.values[1]!.type();
      if (addTypesForSum(t1, {}) === null || addTypesForSum(t2, {}) === null) {
        throw new TypeError('Arguments to pow must be numbers');
      }
      return {};
    }

    if (name === 'log') {
      if (this.values.length < 1 || this.values.length > 2) throw new TypeError('log requires 1 or 2 arguments');
      for (let i = 0; i < this.values.length; i++) {
        if (addTypesForSum(this.values[i]!.type(), {}) === null) {
          throw new TypeError('Arguments to log must be numbers');
        }
      }
      return {};
    }

    if (name === 'hypot') {
      const firstType = this.values[0]!.type();
      for (let i = 1; i < this.values.length; i++) {
        if (addTypesForSum(firstType, this.values[i]!.type()) === null) {
          throw new TypeError('Incompatible argument types in hypot');
        }
      }
      return firstType;
    }

    if (['mod', 'rem'].includes(name)) {
      if (this.values.length !== 2) throw new TypeError(`${name} requires exactly 2 arguments`);
      const t1 = this.values[0]!.type();
      const t2 = this.values[1]!.type();
      const combined = addTypesForSum(t1, t2);
      if (combined === null) {
        throw new TypeError(`Incompatible argument types in ${name}`);
      }
      return combined;
    }

    return this.values[0]!.type();
  }
}
