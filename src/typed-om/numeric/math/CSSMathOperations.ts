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

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathnegate
export class CSSMathNegate extends CSSMathValue {
  readonly value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSMathNegate': 1 argument required, but only " + arguments.length + " present.");
    }
    super();
    this.value = ensureNumeric(child);
  }
  get operator(): string { return 'negate'; }
  serialize(): string {
    return `(-${this.value.serialize()})`;
  }
  override toString(): string {
    return `calc(-${stripOuterParens(this.value.serialize())})`;
  }
  override type(): CSSNumericType {
    return this.value.type();
  }
}

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathinvert
export class CSSMathInvert extends CSSMathValue {
  readonly value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSMathInvert': 1 argument required, but only " + arguments.length + " present.");
    }
    super();
    this.value = ensureNumeric(child);
  }
  get operator(): string { return 'invert'; }
  serialize(): string {
    return `(1 / ${this.value.serialize()})`;
  }
  override toString(): string {
    return `calc(1 / ${stripOuterParens(this.value.serialize())})`;
  }
  override type(): CSSNumericType {
    const t = this.value.type();
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

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathsum
export class CSSMathSum extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathSum requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'sum');
    this.values = new CSSNumericArray(numericArgs);
  }
  get operator(): string { return 'sum'; }
  serialize(): string {
    const sortedChildren = sortNumericNodes([...this.values]);
    let s = '(';
    s += sortedChildren[0].serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathNegate) {
        s += ` - ${stripOuterParens(child.value.serialize())}`;
      } else {
        s += ` + ${child.serialize()}`;
      }
    }
    s += ')';
    return s;
  }
  override type(): CSSNumericType {
    if (this.values.length === 0) return {};
    const types = this.values.map(v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in sum');
      return combined;
    });
  }
}

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathproduct
export class CSSMathProduct extends CSSMathValue {
  readonly values: CSSNumericArray;
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
    this.values = new CSSNumericArray(numericArgs);
  }
  get operator(): string { return 'product'; }
  serialize(): string {
    const sortedChildren = sortNumericNodes([...this.values]);
    let s = '(';
    s += sortedChildren[0].serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathInvert) {
        // CSS Values 4 #serialize-a-calculation-tree
        s += ` / ${stripOuterParens(child.value.serialize())}`;
        continue;
      }
      s += ` * ${child.serialize()}`;
    }
    s += ')';
    return s;
  }
  override type(): CSSNumericType {
    let result: CSSNumericType = {};
    this.values.forEach(child => {
      result = addTypes(result, child.type());
    });
    return result;
  }
}

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathmin
export class CSSMathMin extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMin requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'min');
    this.values = new CSSNumericArray(numericArgs);
  }
  get operator(): string { return 'min'; }
  serialize(): string {
    return `min(${this.values.map(c => stripOuterParens(c.serialize())).join(', ')})`;
  }
  override type(): CSSNumericType {
    if (this.values.length === 0) return {};
    const types = this.values.map(v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in min');
      return combined;
    });
  }
}

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathmax
export class CSSMathMax extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMax requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    validateCompatibleSumTypes(numericArgs, 'max');
    this.values = new CSSNumericArray(numericArgs);
  }
  get operator(): string { return 'max'; }
  serialize(): string {
    return `max(${this.values.map(c => stripOuterParens(c.serialize())).join(', ')})`;
  }
  override type(): CSSNumericType {
    if (this.values.length === 0) return {};
    const types = this.values.map(v => v.type());
    return types.reduce((acc, curr) => {
      const combined = addTypesForSum(acc, curr);
      if (!combined) throw new TypeError('Incompatible types in max');
      return combined;
    });
  }
}

// Spec: CSS Typed OM Level 1 § 4.4 #cssmathclamp
export class CSSMathClamp extends CSSMathValue {
  readonly lower: CSSNumericValue | CSSKeywordValue;
  readonly value: CSSNumericValue;
  readonly upper: CSSNumericValue | CSSKeywordValue;
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

    this.lower = l;
    this.value = v;
    this.upper = u;
  }
  get operator(): string { return 'clamp'; }
  serialize(): string {
    return `clamp(${stripOuterParens(this.lower.serialize())}, ${stripOuterParens(this.value.serialize())}, ${stripOuterParens(this.upper.serialize())})`;
  }
  override type(): CSSNumericType {
    let result = this.value.type();
    if (this.lower && typeof (this.lower as CSSNumericValue).type === 'function') {
      const combined = addTypesForSum(result, (this.lower as CSSNumericValue).type());
      if (combined) result = combined;
    }
    if (this.upper && typeof (this.upper as CSSNumericValue).type === 'function') {
      const combined = addTypesForSum(result, (this.upper as CSSNumericValue).type());
      if (combined) result = combined;
    }
    return result;
  }
}

// Spec: CSS Values 4 § 10.6 #round-func
export class CSSMathRound extends CSSMathValue {
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

  get operator(): string { return 'round'; }

  // CSS Values 4: The round() function is serialized as:
  // - If the rounding strategy is nearest, it is omitted.
  // - If the step value is 1 and was omitted in the source, it is omitted in the serialization.
  serialize(): string {
    const args: string[] = [];

    if (this.strategy !== 'nearest') {
      args.push(this.strategy);
    }

    args.push(stripOuterParens(this.value.serialize()));

    if (!this.precisionOmitted) {
      args.push(stripOuterParens(this.precision.serialize()));
    }

    return `round(${args.join(', ')})`;
  }

  override toString(): string {
    return this.serialize();
  }

  override type(): CSSNumericType {
    const combined = addTypesForSum(this.value.type(), this.precision.type());
    if (!combined) {
      throw new TypeError('Incompatible types in round');
    }
    return combined;
  }
}

// Spec: CSS Values 4 § 10 #math-func
export class CSSMathFunction extends CSSMathValue {
  readonly values: CSSNumericArray;
  readonly name: string;
  constructor(name: string, ...args: (number | CSSNumericValue)[]) {
    super();
    this.name = name;
    this.values = new CSSNumericArray(args.map(ensureNumeric));
  }

  get operator(): string {
    return this.name;
  }

  serialize(): string {
    const argsStr = this.values.map(c => {
      let s = c.serialize();
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
    return this.serialize();
  }

  override type(): CSSNumericType {
    if (this.values.length === 0) return {};
    const name = this.name.toLowerCase();

    if (['sin', 'cos', 'tan'].includes(name)) {
      if (this.values.length !== 1) {
        throw new TypeError(`${name} requires exactly 1 argument`);
      }
      const t = this.values.item(0)!.type();
      if (addTypesForSum(t, { angle: 1 }) === null && addTypesForSum(t, {}) === null) {
        throw new TypeError(`Invalid argument type in ${name}`);
      }
      return {};
    }

    if (['asin', 'acos', 'atan'].includes(name)) {
      if (this.values.length !== 1) {
        throw new TypeError(`${name} requires exactly 1 argument`);
      }
      const t = this.values.item(0)!.type();
      if (addTypesForSum(t, {}) === null) {
        throw new TypeError(`Argument to ${name} must be a number`);
      }
      return { angle: 1 };
    }

    if (name === 'atan2') {
      if (this.values.length !== 2) {
        throw new TypeError('atan2 requires exactly 2 arguments');
      }
      const t1 = this.values.item(0)!.type();
      const t2 = this.values.item(1)!.type();
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
      const t = this.values.item(0)!.type();
      if (addTypesForSum(t, {}) === null) throw new TypeError(`Argument to ${name} must be a number`);
      return {};
    }

    if (name === 'pow') {
      if (this.values.length !== 2) throw new TypeError('pow requires exactly 2 arguments');
      const t1 = this.values.item(0)!.type();
      const t2 = this.values.item(1)!.type();
      if (addTypesForSum(t1, {}) === null || addTypesForSum(t2, {}) === null) {
        throw new TypeError('Arguments to pow must be numbers');
      }
      return {};
    }

    if (name === 'log') {
      if (this.values.length < 1 || this.values.length > 2) throw new TypeError('log requires 1 or 2 arguments');
      for (let i = 0; i < this.values.length; i++) {
        if (addTypesForSum(this.values.item(i)!.type(), {}) === null) {
          throw new TypeError('Arguments to log must be numbers');
        }
      }
      return {};
    }

    if (name === 'hypot') {
      const firstType = this.values.item(0)!.type();
      for (let i = 1; i < this.values.length; i++) {
        if (addTypesForSum(firstType, this.values.item(i)!.type()) === null) {
          throw new TypeError('Incompatible argument types in hypot');
        }
      }
      return firstType;
    }

    if (['mod', 'rem'].includes(name)) {
      if (this.values.length !== 2) throw new TypeError(`${name} requires exactly 2 arguments`);
      const t1 = this.values.item(0)!.type();
      const t2 = this.values.item(1)!.type();
      const combined = addTypesForSum(t1, t2);
      if (combined === null) {
        throw new TypeError(`Incompatible argument types in ${name}`);
      }
      return combined;
    }

    return this.values.item(0)!.type();
  }
}
