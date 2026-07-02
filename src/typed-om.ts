/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { Token, Declaration, ComponentValue, CSSFunction, IdentToken } from './types.ts';


import { serialize } from './serializer.ts';
import { parseMathFunction, simplify } from './math-parser.ts';
import { tokenize } from './tokenizer.ts';
import { ParseHooks } from './parse-hooks.ts';
import { SHORTHANDS } from './shorthands.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds, type CSSUnit } from './data/units.ts';

function compareStrings(a: string, b: string): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

const LIST_PROPERTIES = new Set([
  'background',
  'background-image',
  'background-position',
  'background-repeat',
  'background-attachment',
  'background-origin',
  'background-clip',
  'background-size',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'animation',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
  'box-shadow',
  'text-shadow',
  'font-family',
]);

// CSS Typed OM: CSSStyleValue
export class CSSStyleValue {
  private _cssText?: string;

  constructor(cssText?: string) {
    this._cssText = cssText;
  }

  toString(): string {
    return this._cssText || '';
  }

  static parseAll(property: string, css: string): CSSStyleValue[] {
    if (property === '--') {
      throw new TypeError("Invalid property name: '--'");
    }
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    const results: CSSStyleValue[] = [];
    
    const isListProperty = LIST_PROPERTIES.has(property);
    
    if (isListProperty) {
      let current: ComponentValue[] = [];
      for (const v of componentValues) {
        if (v.type === 'comma') {
          if (current.length > 0) {
            results.push(CSSStyleValue.createValueFromTokens(current));
            current = [];
          }
        } else {
          current.push(v);
        }
      }
      if (current.length > 0) {
        results.push(CSSStyleValue.createValueFromTokens(current));
      }
    } else {
      if (componentValues.length > 0) {
        results.push(CSSStyleValue.createValueFromTokens(componentValues));
      }
    }
    
    return results;
  }

  private static createValueFromTokens(values: ComponentValue[]): CSSStyleValue {
    let start = 0;
    while (start < values.length && (values[start].type === 'whitespace' || values[start].type === 'comment')) {
      start++;
    }
    let end = values.length - 1;
    while (end >= 0 && (values[end].type === 'whitespace' || values[end].type === 'comment')) {
      end--;
    }
    
    if (start > end) {
      throw new TypeError('Invalid empty value');
    }
    
    const trimmed = values.slice(start, end + 1);
    
    if (trimmed.length === 1) {
      const sv = createCSSStyleValue(trimmed[0]);
      if (sv) return sv;
    }
    
    return new CSSStyleValue(serialize(trimmed).trim());
  }

  static parse(property: string, css: string): CSSStyleValue {
    const all = this.parseAll(property, css);
    if (all.length === 0) {
      throw new TypeError(`Invalid value for property ${property}: ${css}`);
    }
    return all[0];
  }
}


// CSS Typed OM: CSSKeywordValue
export class CSSKeywordValue extends CSSStyleValue {
  value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  override toString(): string {
    return this.value;
  }

  serialize(): string {
    return this.toString();
  }
}

// CSS Typed OM: CSSImageValue
export abstract class CSSImageValue extends CSSStyleValue {}

function ensureColorChannel(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') return new CSSUnitValue(v, 'number');
  if (typeof v === 'string') {
    try {
      return CSSNumericValue.parse(v);
    } catch (e) {
      return new CSSKeywordValue(v);
    }
  }
  return v;
}

// CSS Typed OM: CSSColorValue
export abstract class CSSColorValue extends CSSStyleValue {
  static override parse(css: string): CSSColorValue {
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens).filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (componentValues.length === 0) {
      throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
    }
    if (componentValues.length > 1) {
      throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
    }
    
    const v = componentValues[0];
    const color = reifyColor(v);
    if (color) return color;
    
    throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
  }
}

export class CSSRGB extends CSSColorValue {
  r: CSSNumericValue | CSSKeywordValue;
  g: CSSNumericValue | CSSKeywordValue;
  b: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    r: number | string | CSSNumericValue | CSSKeywordValue,
    g: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.r = ensureColorChannel(r);
    this.g = ensureColorChannel(g);
    this.b = ensureColorChannel(b);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `rgb(${this.r} ${this.g} ${this.b} / ${this.alpha})`;
  }
}

export class CSSHSL extends CSSColorValue {
  h: CSSNumericValue | CSSKeywordValue;
  s: CSSNumericValue | CSSKeywordValue;
  l: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue | CSSKeywordValue,
    s: number | string | CSSNumericValue | CSSKeywordValue,
    l: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.h = ensureColorChannel(h);
    this.s = ensureColorChannel(s);
    this.l = ensureColorChannel(l);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `hsl(${this.h} ${this.s} ${this.l} / ${this.alpha})`;
  }
}

export class CSSHWB extends CSSColorValue {
  h: CSSNumericValue | CSSKeywordValue;
  w: CSSNumericValue | CSSKeywordValue;
  b: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue | CSSKeywordValue,
    w: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.h = ensureColorChannel(h);
    this.w = ensureColorChannel(w);
    this.b = ensureColorChannel(b);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `hwb(${this.h} ${this.w} ${this.b} / ${this.alpha})`;
  }
}

export class CSSLab extends CSSColorValue {
  l: CSSNumericValue | CSSKeywordValue;
  a: CSSNumericValue | CSSKeywordValue;
  b: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.l = ensureColorChannel(l);
    this.a = ensureColorChannel(a);
    this.b = ensureColorChannel(b);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `lab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

export class CSSLch extends CSSColorValue {
  l: CSSNumericValue | CSSKeywordValue;
  c: CSSNumericValue | CSSKeywordValue;
  h: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.l = ensureColorChannel(l);
    this.c = ensureColorChannel(c);
    this.h = ensureColorChannel(h);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `lch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

export class CSSOKLab extends CSSColorValue {
  l: CSSNumericValue | CSSKeywordValue;
  a: CSSNumericValue | CSSKeywordValue;
  b: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.l = ensureColorChannel(l);
    this.a = ensureColorChannel(a);
    this.b = ensureColorChannel(b);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `oklab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

export class CSSOKLCH extends CSSColorValue {
  l: CSSNumericValue | CSSKeywordValue;
  c: CSSNumericValue | CSSKeywordValue;
  h: CSSNumericValue | CSSKeywordValue;
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.l = ensureColorChannel(l);
    this.c = ensureColorChannel(c);
    this.h = ensureColorChannel(h);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    return `oklch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

export class CSSColor extends CSSColorValue {
  colorSpace: CSSKeywordValue | string;
  channels: (CSSNumericValue | CSSKeywordValue)[];
  alpha: CSSNumericValue | CSSKeywordValue;

  constructor(
    colorSpace: CSSKeywordValue | string,
    channels: (number | string | CSSNumericValue | CSSKeywordValue)[],
    alpha: number | string | CSSNumericValue | CSSKeywordValue = new CSSUnitValue(1, 'number')
  ) {
    super();
    this.colorSpace = colorSpace;
    this.channels = channels.map(ensureColorChannel);
    this.alpha = ensureColorChannel(alpha);
  }

  override toString(): string {
    const channelsStr = this.channels.map(c => c.toString()).join(' ');
    return `color(${this.colorSpace} ${channelsStr} / ${this.alpha})`;
  }
}

export interface CSSNumericType {
  length?: number;
  angle?: number;
  time?: number;
  frequency?: number;
  resolution?: number;
  flex?: number;
  percent?: number;
  percentHint?: 'length' | 'angle' | 'time' | 'frequency' | 'resolution' | 'flex';
}

function addTypes(a: CSSNumericType, b: CSSNumericType): CSSNumericType {
  const result: CSSNumericType = { ...a };
  const res = result as Record<string, unknown>;
  for (const [key, value] of Object.entries(b)) {
    if (key === 'percentHint') {
       if (result.percentHint && result.percentHint !== value) throw new Error('Percent hint mismatch');
       res.percentHint = value;
    } else {
       const current = res[key] as number | undefined;
       res[key] = (current || 0) + (value as number);
    }
  }
  return result;
}

function applyPercentHint(type: CSSNumericType, hint: string): CSSNumericType {
  const result = { ...type };
  result.percentHint = hint as 'length' | 'angle' | 'time' | 'frequency' | 'resolution' | 'flex';
  const res = result as Record<string, number>;
  if (res[hint] === undefined) res[hint] = 0;
  if (hint !== 'percent' && res['percent'] !== undefined) {
    res[hint] += res['percent'];
    res['percent'] = 0;
  }
  return result;
}


function addTypesForSum(a: CSSNumericType, b: CSSNumericType): CSSNumericType | null {
  let t1 = { ...a };
  let t2 = { ...b };
  
  if (t1.percentHint && t2.percentHint && t1.percentHint !== t2.percentHint) {
    return null;
  }
  
  if (t1.percentHint && !t2.percentHint) {
    t2 = applyPercentHint(t2, t1.percentHint);
  } else if (t2.percentHint && !t1.percentHint) {
    t1 = applyPercentHint(t1, t2.percentHint);
  }
  
  const match = (x: CSSNumericType, y: CSSNumericType) => {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) {
      if (key === 'percentHint') continue;
      const valX = (x as Record<string, number>)[key] || 0;
      const valY = (y as Record<string, number>)[key] || 0;
      if (valX !== valY) return false;
    }
    return true;
  };
  
  if (match(t1, t2)) {
    return t1;
  }
  
  const hasPercent = (t: CSSNumericType) => (t as Record<string, number>)['percent'] !== 0;
  const hasOther = (t: CSSNumericType) => Object.keys(t).some(k => k !== 'percent' && k !== 'percentHint' && (t as Record<string, number>)[k] !== 0);
  
  if ((hasPercent(t1) || hasPercent(t2)) && (hasOther(t1) || hasOther(t2))) {
    const getOtherBase = (t: CSSNumericType) => Object.keys(t).find(k => k !== 'percent' && k !== 'percentHint' && (t as Record<string, number>)[k] !== 0);
    const otherBase = getOtherBase(t1) || getOtherBase(t2);
    if (otherBase) {
      const nt1 = applyPercentHint(t1, otherBase);
      const nt2 = applyPercentHint(t2, otherBase);
      if (match(nt1, nt2)) {
        return nt1;
      }
    }
  }
  
  return null;
}








// CSS Typed OM: CSSNumericValue
export abstract class CSSNumericValue extends CSSStyleValue {
  abstract serialize(): string;
  abstract type(): CSSNumericType;

  to(unit: string): CSSUnitValue {
    const sum = createSumValue(this);
    if (!sum || sum.length > 1) {
       throw new TypeError(`Cannot convert ${this.serialize()} to ${unit}`);
    }
    const item = createCSSUnitValueFromSumValueItem(sum[0]);
    if (!item) throw new TypeError(`Cannot convert ${this.serialize()} to ${unit}`);
    return item.to(unit);
  }

  toSum(...units: string[]): CSSMathSum {
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
  }


  static parse(css: string): CSSNumericValue {
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
      if (sv instanceof CSSNumericValue) return simplify(sv);
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }
    if (v.type === 'function') {
      const mathNode = parseMathFunction((v as CSSFunction).name, (v as CSSFunction).value);
      if (mathNode) return simplify(mathNode);
      throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
    }
    throw new DOMException(`Invalid numeric value: ${css}`, 'SyntaxError');
  }

  add(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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

    return new CSSMathSum(...allValues);
  }
  sub(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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
  }
  mul(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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
  }
  div(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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
  }
  min(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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
  }
  max(...values: (number | CSSNumericValue)[]): CSSNumericValue {
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
  }

  equals(...values: (number | CSSNumericValue)[]): boolean {
    if (values.length === 0) return true;
    for (const v of values) {
      if (!this._equals(v)) return false;
    }
    return true;
  }

  private _equals(other: number | CSSNumericValue): boolean {
    if (typeof other === 'number') {
      return this instanceof CSSUnitValue && this.value === other && this.unit === 'number';
    }
    if (this === other) return true;
    if (this.constructor !== other.constructor) return false;

    if (this instanceof CSSUnitValue && other instanceof CSSUnitValue) {
      return this.value === other.value && this.unit === other.unit;
    }


    if (this instanceof CSSMathSum && other instanceof CSSMathSum) {
      return this.values.length === other.values.length && this.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
    }
    if (this instanceof CSSMathProduct && other instanceof CSSMathProduct) {
      return this.values.length === other.values.length && this.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
    }
    if (this instanceof CSSMathMin && other instanceof CSSMathMin) {
      return this.values.length === other.values.length && this.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
    }
    if (this instanceof CSSMathMax && other instanceof CSSMathMax) {
      return this.values.length === other.values.length && this.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
    }
    if (this instanceof CSSMathClamp && other instanceof CSSMathClamp) {
      const lowerEquals = (this.lower instanceof CSSKeywordValue && other.lower instanceof CSSKeywordValue)
        ? this.lower.value === other.lower.value
        : (this.lower instanceof CSSNumericValue && other.lower instanceof CSSNumericValue)
          ? this.lower.equals(other.lower)
          : false;
          
      const upperEquals = (this.upper instanceof CSSKeywordValue && other.upper instanceof CSSKeywordValue)
        ? this.upper.value === other.upper.value
        : (this.upper instanceof CSSNumericValue && other.upper instanceof CSSNumericValue)
          ? this.upper.equals(other.upper)
          : false;

      return lowerEquals && this.value.equals(other.value) && upperEquals;
    }
    if (this instanceof CSSMathNegate && other instanceof CSSMathNegate) {
      return this.value.equals(other.value);
    }
    if (this instanceof CSSMathInvert && other instanceof CSSMathInvert) {
      return this.value.equals(other.value);
    }

    return false;
  }
}

export class CSSNumericArray {
  private _values: readonly CSSNumericValue[];
  constructor(values: CSSNumericValue[]) {
    this._values = [...values];
    Object.freeze(this._values);
  }
  get length(): number { return this._values.length; }
  [Symbol.iterator]() { return this._values[Symbol.iterator](); }
  entries(): IterableIterator<[number, CSSNumericValue]> { return this._values.entries(); }
  keys(): IterableIterator<number> { return this._values.keys(); }
  values(): IterableIterator<CSSNumericValue> { return this._values.values(); }
  forEach(callback: (value: CSSNumericValue, index: number) => void, thisArg?: unknown): void {
    this._values.forEach(callback, thisArg);
  }
  item(index: number): CSSNumericValue | undefined { return this._values[index]; }
  map<U>(callback: (value: CSSNumericValue, index: number) => U): U[] {
    return this._values.map(callback);
  }
  every(callback: (value: CSSNumericValue, index: number) => boolean): boolean {
    return this._values.every(callback);
  }
}



export interface DOMMatrixReadOnly {
  readonly is2D: boolean;
  readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number;
  readonly m11: number; readonly m12: number; readonly m13: number; readonly m14: number;
  readonly m21: number; readonly m22: number; readonly m23: number; readonly m24: number;
  readonly m31: number; readonly m32: number; readonly m33: number; readonly m34: number;
  readonly m41: number; readonly m42: number; readonly m43: number; readonly m44: number;
}

export interface DOMMatrix extends DOMMatrixReadOnly {
  a: number; b: number; c: number; d: number; e: number; f: number;
  m11: number; m12: number; m13: number; m14: number;
  m21: number; m22: number; m23: number; m24: number;
  m31: number; m32: number; m33: number; m34: number;
  m41: number; m42: number; m43: number; m44: number;
}


// CSS Typed OM: CSSUnitValue
export class CSSUnitValue extends CSSNumericValue {
  value: number;
  unit: CSSUnit;

  constructor(value: number, unit: CSSUnit) {
    super();
    this.value = value;
    this.unit = unit;
  }

  override toString(): string {
    if (this.value === Infinity) {
      return this.unit === 'number' ? 'infinity' : `calc(infinity * 1${this.unit})`;
    }
    if (this.value === -Infinity) {
      return this.unit === 'number' ? '-infinity' : `calc(-infinity * 1${this.unit})`;
    }
    if (Number.isNaN(this.value)) {
      return this.unit === 'number' ? 'nan' : `calc(nan * 1${this.unit})`;
    }
    if (this.unit === 'number') {
      return this.value.toString();
    }
    if (this.unit === 'percent') {
      return `${this.value}%`;
    }
    return `${this.value}${this.unit}`;
  }

  serialize(): string {
    return this.toString();
  }

  override type(): CSSNumericType {
    const t: CSSNumericType = {};
    const base = unitToBase[this.unit];
    if (!base || base === 'number') return t;
    if (base === 'percent') {
      t.percent = 1;
    } else {
      (t as Record<string, unknown>)[base] = 1;
    }
    return t;
  }

  override to(unit: string): CSSUnitValue {
    if (this.unit === unit) return this;
    const base = unitToBase[this.unit];
    const targetBase = unitToBase[unit];
    if (!base || base !== targetBase || base === 'number' || base === 'percent') {
      throw new TypeError(`Cannot convert ${this.unit} to ${unit}`);
    }

    let canonical: number;
    let targetFactor: number;

    if (base === 'length') {
      if (!unitToPixels[this.unit] || !unitToPixels[unit]) throw new TypeError('Unsupported length conversion');
      canonical = this.value * unitToPixels[this.unit];
      targetFactor = unitToPixels[unit];
    } else if (base === 'angle') {
      canonical = this.value * unitToRadians[this.unit];
      targetFactor = unitToRadians[unit];
    } else if (base === 'time') {
      canonical = this.value * unitToSeconds[this.unit];
      targetFactor = unitToSeconds[unit];
    } else {
      throw new TypeError(`Unsupported conversion for ${base}`);
    }

    return new CSSUnitValue(canonical / targetFactor, unit as CSSUnit);
  }
}

// CSS Helper
// Moved to typed-om.ts to avoid circular dependency

function reifyColor(v: ComponentValue): CSSColorValue | null {
  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();
    if (nameLower === 'rgb' || nameLower === 'rgba') {
      const args = fn.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
      const nonCommaArgs = args.filter(t => t.type !== 'comma');
      if (nonCommaArgs.length >= 3) {
        const r = createCSSStyleValue(nonCommaArgs[0]);
        const g = createCSSStyleValue(nonCommaArgs[1]);
        const b = createCSSStyleValue(nonCommaArgs[2]);
        let alpha: CSSStyleValue | null = new CSSUnitValue(1, 'number');
        if (nonCommaArgs.length >= 4) {
             alpha = createCSSStyleValue(nonCommaArgs[3]);
        }
        if (r && g && b && alpha) {
             return new CSSRGB(r as CSSNumericValue | CSSKeywordValue, g as CSSNumericValue | CSSKeywordValue, b as CSSNumericValue | CSSKeywordValue, alpha as CSSNumericValue | CSSKeywordValue);
        }
      }
    }
  }
  return null;
}

/**
 * Converts a parsed component value into a Typed OM CSSStyleValue.
 */
export function createCSSStyleValue(v: ComponentValue): CSSStyleValue | null {
  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();
    if (['calc', 'min', 'max', 'clamp'].includes(nameLower)) {
       const mathNode = parseMathFunction(fn.name, fn.value);
       if (mathNode) {
         return mathNode;
       }
    }
    if (nameLower === 'var') {
        const args = fn.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
        if (args.length === 0 || args[0].type !== 'ident' || !(args[0] as IdentToken).value.startsWith('--') || (args[0] as IdentToken).value === '--') {
           // Invalid var()
           return new CSSUnparsedValue([serialize([v]).trim()]);
        }
        const varName = (args[0] as IdentToken).value;

        if (args.length > 1 && args[1].type !== 'comma') {
           // Invalid var() - fallback must be comma-separated
           return new CSSUnparsedValue([serialize([v]).trim()]);
        }
        let fallback: CSSUnparsedValue | null = null;
       
       // Find first comma
       let commaIdx = -1;
       for (let i = 0; i < fn.value.length; i++) {
          if (fn.value[i].type === 'comma') {
             commaIdx = i;
             break;
          }
       }
       
       if (commaIdx !== -1) {
          const fallbackTokens = fn.value.slice(commaIdx + 1);
          fallback = new CSSUnparsedValue([serialize(fallbackTokens).trim()]);
       }
       
       return new CSSUnparsedValue([new CSSVariableReferenceValue(varName, fallback)]);
    }
    if (nameLower === 'url') {
       // CSSImageValue for url()
       return new (class extends CSSImageValue {
         override toString() { return `url(${serialize(fn.value).trim()})`; }
       })();
    }
  }
  if (isToken(v)) {
    switch (v.type) {
      case 'ident':
        return new CSSKeywordValue(v.value);
      case 'number':
        return new CSSUnitValue(v.value, 'number');
      case 'percentage':
        return new CSSUnitValue(v.value, 'percent');
      case 'dimension':
        return new CSSUnitValue(v.value, (v.unit || '') as CSSUnit);

      case 'url':
        // CSSImageValue for url()
        return new (class extends CSSImageValue {
          override toString() { return `url("${v.value}")`; }
        })();
      default:
        return null;
    }
  }
  return null;
}

function isToken(val: ComponentValue): val is Token {
  const type = typeof (val as { value: unknown }).value;
  return type === 'string' || type === 'number';
}

// CSS Typed OM: CSSVariableReferenceValue
export class CSSVariableReferenceValue {
  variable: string;
  fallback: CSSUnparsedValue | null;

  constructor(variable: string, fallback: CSSUnparsedValue | null = null) {
    this.variable = variable;
    this.fallback = fallback;
  }

  toString(): string {
    if (this.fallback) {
      return `var(${this.variable},${this.fallback.toString()})`;
    }
    return `var(${this.variable})`;
  }
}

// CSS Typed OM: CSSUnparsedValue
export class CSSUnparsedValue extends CSSStyleValue {
  private _values: (string | CSSVariableReferenceValue)[];

  constructor(values: (string | CSSVariableReferenceValue)[]) {
    super();
    this._values = values;
  }

  get length(): number { return this._values.length; }
  [Symbol.iterator]() { return this._values[Symbol.iterator](); }
  entries(): IterableIterator<[number, string | CSSVariableReferenceValue]> { return this._values.entries(); }
  keys(): IterableIterator<number> { return this._values.keys(); }
  values(): IterableIterator<string | CSSVariableReferenceValue> { return this._values.values(); }
  forEach(callback: (value: string | CSSVariableReferenceValue, index: number) => void, thisArg?: unknown): void {
    this._values.forEach(callback, thisArg);
  }
  item(index: number): string | CSSVariableReferenceValue | undefined { return this._values[index]; }

  override toString(): string {
    let s = '';
    for (let i = 0; i < this._values.length; i++) {
      const current = this._values[i];
      const prev = i > 0 ? this._values[i - 1] : null;

      if (typeof current === 'string' && typeof prev === 'string') {
        // If both are strings, we might need a /**/ joiner if they don't have spaces
        if (!prev.endsWith(' ') && !current.startsWith(' ')) {
          s += '/**/';
        }
      }
      
      s += current.toString();
    }
    return s;
  }

  serialize(): string {
    return this.toString();
  }

  type(): CSSNumericType {
    if (this._values.length === 0) return {};
    const first = this._values[0];
    if (typeof first === 'string') return {};
    return (first as unknown as CSSNumericValue).type();
  }
}

// CSS Typed OM: CSSMathValue
export abstract class CSSMathValue extends CSSNumericValue {
  abstract serialize(): string;
  override toString(): string {
    const s = this.serialize();
    if (this.operator === 'number') return s;
    if (['min', 'max', 'clamp'].includes(this.operator)) return s;
    return `calc(${stripOuterParens(s)})`;
  }
  abstract get operator(): string;
}

function ensureNumeric(v: number | CSSNumericValue): CSSNumericValue {
  if (typeof v === 'number') return new CSSUnitValue(v, 'number');
  return v;
}

function stripOuterParens(s: string): string {
  if (!s.startsWith('(') || !s.endsWith(')')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    if (depth === 0 && i < s.length - 1) return s;
  }
  return s.substring(1, s.length - 1);
}

export class CSSMathNegate extends CSSMathValue {
  readonly value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
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

export class CSSMathInvert extends CSSMathValue {
  readonly value: CSSNumericValue;
  constructor(child: number | CSSNumericValue) {
    super();
    this.value = ensureNumeric(child);
  }
  get operator(): string { return 'invert'; }
  serialize(): string {
    if (this.value instanceof CSSUnitValue && this.value.unit === 'number') {
      return `(1 / ${this.value.serialize()})`;
    }
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
    return result;
  }
}

export class CSSMathSum extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    this.values = new CSSNumericArray(args.map(ensureNumeric));
  }
  get operator(): string { return 'sum'; }
  serialize(): string {
    const sortedChildren = sortSumChildren([...this.values]);
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

export class CSSMathProduct extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    this.values = new CSSNumericArray(args.map(ensureNumeric));
  }
  get operator(): string { return 'product'; }
  serialize(): string {
    const sortedChildren = sortProductChildren([...this.values]);
    let s = '(';
    s += sortedChildren[0].serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathInvert) {
        const val = child.value as unknown as { value: number };
        if (!(val.value === 0)) {
           s += ` / ${stripOuterParens(child.value.serialize())}`;
           continue;
        }
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

export class CSSMathMin extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    this.values = new CSSNumericArray(args.map(ensureNumeric));
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

export class CSSMathMax extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    this.values = new CSSNumericArray(args.map(ensureNumeric));
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

export class CSSMathClamp extends CSSMathValue {
  readonly lower: CSSNumericValue | CSSKeywordValue;
  readonly value: CSSNumericValue;
  readonly upper: CSSNumericValue | CSSKeywordValue;
  constructor(lower: number | CSSNumericValue | CSSKeywordValue, value: number | CSSNumericValue, upper: number | CSSNumericValue | CSSKeywordValue) {
    super();
    this.lower = typeof lower === 'number' ? new CSSUnitValue(lower, 'number') : lower;
    this.value = ensureNumeric(value);
    this.upper = typeof upper === 'number' ? new CSSUnitValue(upper, 'number') : upper;
  }
  get operator(): string { return 'clamp'; }
  serialize(): string {
    return `clamp(${stripOuterParens(this.lower.serialize())}, ${stripOuterParens(this.value.serialize())}, ${stripOuterParens(this.upper.serialize())})`;
  }
  override type(): CSSNumericType {
    return this.value.type();
  }
}

export class CSSMathRound extends CSSMathValue {
  readonly strategy: string;
  readonly value: CSSNumericValue;
  readonly precision: CSSNumericValue;
  readonly precisionOmitted: boolean;

  constructor(strategy: string, value: number | CSSNumericValue, precision: number | CSSNumericValue, precisionOmitted?: boolean) {
    super();
    this.strategy = strategy;
    this.value = ensureNumeric(value);
    this.precision = ensureNumeric(precision);
    if (precisionOmitted !== undefined) {
      this.precisionOmitted = precisionOmitted;
    } else {
      this.precisionOmitted = this.precision instanceof CSSUnitValue && 
                              this.precision.unit === 'number' && 
                              this.precision.value === 1;
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
    return this.value.type();
  }
}

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
      // Most functions don't want outer parens on their arguments if they were just simplified sums
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
    
    // CSS Values 4 § 10.5 Trigonometric Functions
    // sin(), cos(), tan() return a number.
    // sign() returns a number.
    // CSS Values 4 § 10.6 Exponential Functions
    // sqrt(), pow(), log(), exp() return a number.
    if (['sin', 'cos', 'tan', 'sign', 'sqrt', 'pow', 'log', 'exp'].includes(name)) {
      return {};
    }
    
    // CSS Values 4 § 10.5.2 Inverse Trigonometric Functions
    // asin(), acos(), atan(), atan2() return an angle.
    if (['asin', 'acos', 'atan', 'atan2'].includes(name)) {
      return { angle: 1 };
    }
    
    return this.values.item(0)!.type();
  }
}

function sortSumChildren(nodes: CSSNumericValue[]): CSSNumericValue[] {
  const allSimple = nodes.every(n => n instanceof CSSUnitValue);
  if (!allSimple) return nodes;

  const getUnit = (n: unknown) => (n as { unit: string }).unit;
  const getValue = (n: unknown) => (n as { value: number }).value;

  const percents = nodes.filter(n => getUnit(n) === 'percent')
    .sort((a, b) => getValue(a) - getValue(b));
  const dimensions = nodes.filter(n => getUnit(n) !== 'number' && getUnit(n) !== 'percent')
    .sort((a, b) => compareStrings(getUnit(a), getUnit(b)));
  const numbers = nodes.filter(n => getUnit(n) === 'number')
    .sort((a, b) => getValue(a) - getValue(b));

  return [...percents, ...dimensions, ...numbers];
}

function sortProductChildren(nodes: CSSNumericValue[]): CSSNumericValue[] {
  const allSimple = nodes.every(n => n instanceof CSSUnitValue);
  if (!allSimple) return nodes;

  const getUnit = (n: unknown) => (n as { unit: string }).unit;
  const getValue = (n: unknown) => (n as { value: number }).value;

  const numbers = nodes.filter(n => getUnit(n) === 'number')
    .sort((a, b) => getValue(a) - getValue(b));
  const percents = nodes.filter(n => getUnit(n) === 'percent')
    .sort((a, b) => getValue(a) - getValue(b));
  const dimensions = nodes.filter(n => getUnit(n) !== 'number' && getUnit(n) !== 'percent')
    .sort((a, b) => compareStrings(getUnit(a), getUnit(b)));

  return [...numbers, ...percents, ...dimensions];
}

export abstract class CSSTransformComponent {
  is2D: boolean = true;
  abstract toString(): string;
  
  toMatrix(): DOMMatrixReadOnly {
    throw new Error('toMatrix() not implemented for this transform component.');
  }
}

export class CSSTranslate extends CSSTransformComponent {
  public x: CSSNumericValue;
  public y: CSSNumericValue;
  public z: CSSNumericValue;
  constructor(x: CSSNumericValue, y: CSSNumericValue, z?: CSSNumericValue) {
    super();
    this.x = x;
    this.y = y;
    this.z = z ?? new CSSUnitValue(0, 'px');
    this.is2D = !z;
  }
  toString(): string {
    if (this.is2D) return `translate(${this.x}, ${this.y})`;
    return `translate3d(${this.x}, ${this.y}, ${this.z})`;
  }

  override toMatrix(): DOMMatrixReadOnly {
    const x = this.x.to('px').value;
    const y = this.y.to('px').value;
    const z = this.z ? this.z.to('px').value : 0;
    
    if (this.is2D) {
      return new (globalThis as unknown as { DOMMatrixReadOnly: new (vals: number[]) => DOMMatrixReadOnly }).DOMMatrixReadOnly([1, 0, 0, 1, x, y]);
    } else {
      return new (globalThis as unknown as { DOMMatrixReadOnly: new (vals: number[]) => DOMMatrixReadOnly }).DOMMatrixReadOnly([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    }
  }
}

export class CSSScale extends CSSTransformComponent {
  public x: CSSNumericValue;
  public y: CSSNumericValue;
  public z: CSSNumericValue;
  constructor(x: CSSNumericValue, y: CSSNumericValue, z?: CSSNumericValue) {
    super();
    this.x = x;
    this.y = y;
    this.z = z ?? new CSSUnitValue(1, 'number');
    this.is2D = !z;
  }
  toString(): string {
    if (this.is2D) return `scale(${this.x}, ${this.y})`;
    return `scale3d(${this.x}, ${this.y}, ${this.z})`;
  }
}

export class CSSRotate extends CSSTransformComponent {
  public x: CSSNumericValue;
  public y: CSSNumericValue;
  public z: CSSNumericValue;
  public angle!: CSSNumericValue;

  constructor(angle: CSSNumericValue);
  constructor(x: CSSNumericValue, y: CSSNumericValue, z: CSSNumericValue, angle: CSSNumericValue);
  constructor(xOrAngle: CSSNumericValue, y?: CSSNumericValue, z?: CSSNumericValue, angle?: CSSNumericValue) {
    super();
    if (y === undefined) {
      this.angle = xOrAngle;
      this.x = new CSSUnitValue(0, 'number');
      this.y = new CSSUnitValue(0, 'number');
      this.z = new CSSUnitValue(1, 'number');
      this.is2D = true;
    } else {
      this.x = xOrAngle;
      this.y = y;
      this.z = z!;
      this.angle = angle!;
      this.is2D = false;
    }
  }

  toString(): string {
    if (this.is2D) return `rotate(${this.angle})`;
    return `rotate3d(${this.x}, ${this.y}, ${this.z}, ${this.angle})`;
  }
}

export class CSSSkew extends CSSTransformComponent {
  public ax: CSSNumericValue;
  public ay: CSSNumericValue;
  constructor(ax: CSSNumericValue, ay: CSSNumericValue) {
    super();
    this.ax = ax;
    this.ay = ay;
    this.is2D = true;
  }
  toString(): string {
    if (this.ay instanceof CSSUnitValue && this.ay.value === 0) return `skew(${this.ax})`;
    return `skew(${this.ax}, ${this.ay})`;
  }
}

export class CSSSkewX extends CSSTransformComponent {
  public ax: CSSNumericValue;
  constructor(ax: CSSNumericValue) {
    super();
    this.ax = ax;
    this.is2D = true;
  }
  toString(): string {
    return `skewX(${this.ax})`;
  }
}

export class CSSSkewY extends CSSTransformComponent {
  public ay: CSSNumericValue;
  constructor(ay: CSSNumericValue) {
    super();
    this.ay = ay;
    this.is2D = true;
  }
  toString(): string {
    return `skewY(${this.ay})`;
  }
}

export class CSSPerspective extends CSSTransformComponent {
  public length: CSSNumericValue | string | CSSKeywordValue;
  constructor(length: CSSNumericValue | string | CSSKeywordValue) {
    super();
    this.length = length;
    this.is2D = false;
  }
  toString(): string {
    if (typeof this.length === 'string') return `perspective(${this.length})`;
    if (this.length instanceof CSSKeywordValue) return `perspective(${this.length})`;
    if (this.length instanceof CSSUnitValue && this.length.value < 0) {
      return `perspective(calc(${this.length}))`;
    }
    return `perspective(${this.length})`;
  }
}

export interface CSSMatrixComponentOptions {
  is2D?: boolean;
}

export class CSSMatrixComponent extends CSSTransformComponent {
  public matrix: DOMMatrix;
  constructor(matrix: DOMMatrixReadOnly, options?: CSSMatrixComponentOptions) {
    super();
    this.matrix = matrix as DOMMatrix;
    if (options && options.is2D !== undefined) {
      this.is2D = options.is2D;
    } else {
      this.is2D = matrix.is2D;
    }
  }

  toString(): string {
    if (this.is2D) {
      return `matrix(${this.matrix.a}, ${this.matrix.b}, ${this.matrix.c}, ${this.matrix.d}, ${this.matrix.e}, ${this.matrix.f})`;
    }
    return `matrix3d(${this.matrix.m11}, ${this.matrix.m12}, ${this.matrix.m13}, ${this.matrix.m14}, ${this.matrix.m21}, ${this.matrix.m22}, ${this.matrix.m23}, ${this.matrix.m24}, ${this.matrix.m31}, ${this.matrix.m32}, ${this.matrix.m33}, ${this.matrix.m34}, ${this.matrix.m41}, ${this.matrix.m42}, ${this.matrix.m43}, ${this.matrix.m44})`;
  }

  override toMatrix(): DOMMatrixReadOnly {
    return this.matrix;
  }
}

export class CSSTransformValue extends CSSStyleValue {
  public components: CSSTransformComponent[];
  constructor(components: CSSTransformComponent[]) {
    super();
    this.components = components;
  }

  get length(): number { return this.components.length; }
  [Symbol.iterator]() { return this.components[Symbol.iterator](); }
  entries(): IterableIterator<[number, CSSTransformComponent]> { return this.components.entries(); }
  keys(): IterableIterator<number> { return this.components.keys(); }
  values(): IterableIterator<CSSTransformComponent> { return this.components.values(); }
  forEach(callback: (value: CSSTransformComponent, index: number, array: CSSTransformComponent[]) => void, thisArg?: unknown): void {
    this.components.forEach(callback, thisArg);
  }
  item(index: number): CSSTransformComponent | undefined { return this.components[index]; }
  get is2D(): boolean {
    return this.components.every(c => c.is2D);
  }
  toString(): string {
    return this.components.map(c => c.toString()).join(' ');
  }

  static parse(css: string): CSSTransformValue {
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    
    const components: CSSTransformComponent[] = [];
    for (const v of componentValues) {
      if (v.type === 'whitespace' || v.type === 'comma') continue;
      if (v.type === 'function') {
        const fn = v as CSSFunction;
        const name = fn.name.toLowerCase();
        const args = fn.value.filter(v => v.type !== 'whitespace' && v.type !== 'comma');
        
        if (name === 'translate' || name === 'translatex' || name === 'translatey' || name === 'translatez' || name === 'translate3d') {
          components.push(parseTranslate(name, args));
        } else if (name === 'scale' || name === 'scalex' || name === 'scaley' || name === 'scalez' || name === 'scale3d') {
          components.push(parseScale(name, args));
        } else if (name === 'rotate' || name === 'rotatex' || name === 'rotatey' || name === 'rotatez' || name === 'rotate3d') {
          components.push(parseRotate(name, args));
        } else if (name === 'skew' || name === 'skewx' || name === 'skewy') {
          components.push(parseSkew(name, args));
        } else if (name === 'perspective') {
          components.push(parsePerspective(args));
        } else if (name === 'matrix' || name === 'matrix3d') {
          components.push(parseMatrix(name, args));
        }
      }
    }
    return new CSSTransformValue(components);
  }
}

function parseTranslate(name: string, args: ComponentValue[]): CSSTranslate {
  const x = parseNumeric(args[0]);
  let y: CSSNumericValue = new CSSUnitValue(0, 'px');
  let z: CSSNumericValue | undefined = undefined;

  
  if (name === 'translate' || name === 'translate3d') {
    if (args.length > 1) y = parseNumeric(args[1]);
    if (args.length > 2) z = parseNumeric(args[2]);
  } else if (name === 'translatex') {
    // defaults ok
  } else if (name === 'translatey') {
    return new CSSTranslate(new CSSUnitValue(0, 'px'), x);
  } else if (name === 'translatez') {
    return new CSSTranslate(new CSSUnitValue(0, 'px'), new CSSUnitValue(0, 'px'), x);
  }
  
  return new CSSTranslate(x, y, z);
}

function parseScale(name: string, args: ComponentValue[]): CSSScale {
  const x = parseNumeric(args[0]);
  let y = x;
  let z: CSSNumericValue | undefined = undefined;
  
  if (name === 'scale' || name === 'scale3d') {
    if (args.length > 1) y = parseNumeric(args[1]);
    if (args.length > 2) z = parseNumeric(args[2]);
  } else if (name === 'scalex') {
    y = new CSSUnitValue(1, 'number');
  } else if (name === 'scaley') {
    return new CSSScale(new CSSUnitValue(1, 'number'), x);
  } else if (name === 'scalez') {
    return new CSSScale(new CSSUnitValue(1, 'number'), new CSSUnitValue(1, 'number'), x);
  }
  
  return new CSSScale(x, y, z);
}

function parseRotate(name: string, args: ComponentValue[]): CSSRotate {
  if (name === 'rotatex') {
    return new CSSRotate(new CSSUnitValue(1, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotatey') {
    return new CSSRotate(new CSSUnitValue(0, 'number'), new CSSUnitValue(1, 'number'), new CSSUnitValue(0, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotatez') {
    return new CSSRotate(new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(1, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotate') {
    if (args.length === 1) return new CSSRotate(parseNumeric(args[0]));
    return new CSSRotate(new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(1, 'number'), parseNumeric(args[args.length-1]));
  }
  if (name === 'rotate3d') {
    return new CSSRotate(parseNumeric(args[0]), parseNumeric(args[1]), parseNumeric(args[2]), parseNumeric(args[3]));
  }
  return new CSSRotate(parseNumeric(args[0]));
}


function parseSkew(name: string, args: ComponentValue[]): CSSTransformComponent {
  if (name === 'skewx') return new CSSSkewX(parseNumeric(args[0]));
  if (name === 'skewy') return new CSSSkewY(parseNumeric(args[0]));
  const ax = parseNumeric(args[0]);
  const ay = args.length > 1 ? parseNumeric(args[1]) : new CSSUnitValue(0, 'deg');
  return new CSSSkew(ax, ay);
}

function parsePerspective(args: ComponentValue[]): CSSPerspective {
  const arg = args[0];
  if (arg.type === 'ident' && arg.value.toLowerCase() === 'none') {
    return new CSSPerspective(new CSSKeywordValue('none'));
  }

  return new CSSPerspective(parseNumeric(arg));
}

function parseMatrix(name: string, args: ComponentValue[]): CSSMatrixComponent {
  const vals = args.map(a => {
    if (a.type === 'number') return a.value;
    return 0;
  });

  // In a real implementation we would use a real DOMMatrix
  // But our mock in tests should be enough if we just use it for serialization
  return new CSSMatrixComponent(new (globalThis as unknown as { DOMMatrixReadOnly: new (vals: number[]) => DOMMatrixReadOnly }).DOMMatrixReadOnly(vals));

}

function parseNumeric(v: ComponentValue): CSSNumericValue {
  if (v.type === 'number' || v.type === 'percentage' || v.type === 'dimension') {
    const sv = createCSSStyleValue(v as Token);
    if (sv instanceof CSSNumericValue) return sv;
  }
  if (v.type === 'function') {
    const mathNode = parseMathFunction((v as CSSFunction).name, (v as CSSFunction).value);
    if (mathNode instanceof CSSNumericValue) return mathNode;
  }
  return new CSSUnitValue(0, 'number');
}


export class StylePropertyMapReadOnly {
  private declarations: Declaration[];

  constructor(declarations: Declaration[]) {
    this.declarations = declarations;
  }

  get(property: string): CSSStyleValue | null {
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const longhandValues: Record<string, ComponentValue[]> = {};
      let allSet = true;
      for (const lh of shorthand.longhands) {
        const decl = this.declarations.find(d => d.name === lh);
        if (!decl) {
          allSet = false;
          break;
        }
        longhandValues[lh] = decl.value;
      }
      if (allSet) {
        const contracted = shorthand.contract(longhandValues);
        if (contracted !== null) {
          // Shorthands in Typed OM usually return CSSUnparsedValue
          return new CSSUnparsedValue([contracted]);
        }
      }
    }

    const decl = this.declarations.find((d: Declaration) => d.name === property);
    if (!decl) return null;
    return this._getForDecl(decl);
  }

  protected _getForDecl(decl: Declaration): CSSStyleValue | null {
    let nonWsVal: ComponentValue | null = null;
    let count = 0;
    for (const v of decl.value) {
      if (v.type !== 'whitespace') {
        nonWsVal = v;
        count++;
        if (count > 1) break;
      }
    }
    
    if (count === 1 && nonWsVal) {
      if (isToken(nonWsVal)) {
        const styleValue = createCSSStyleValue(nonWsVal);
        if (styleValue) return styleValue;
      } else if (nonWsVal.type === 'function') {
        if (['calc', 'min', 'max', 'clamp', 'round'].includes(nonWsVal.name.toLowerCase())) {
          const mathNode = parseMathFunction(nonWsVal.name, nonWsVal.value);
          if (mathNode) {
            if (mathNode instanceof CSSUnitValue) {
              return mathNode;
            }
            const nameLower = nonWsVal.name.toLowerCase();
            if (['min', 'max', 'clamp', 'round'].includes(nameLower)) {
              return mathNode;
            }
            return new CSSMathFunction(nameLower, mathNode);
          }
        }
      }
    }
    
    // Fallback to CSSUnparsedValue for complex values
    return new CSSUnparsedValue([serialize(decl.value).trim()]);
  }

  has(property: string): boolean {
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      return shorthand.longhands.every(lh => this.declarations.some(d => d.name === lh));
    }
    return this.declarations.some((d: Declaration) => d.name === property);
  }

  getAll(property: string): CSSStyleValue[] {
    const decl = this.declarations.find((d: Declaration) => d.name === property);
    if (!decl) return [];
    
    const results: CSSStyleValue[] = [];
    for (const v of decl.value) {
      if (v.type === 'whitespace' || v.type === 'comma') continue;
      const sv = createCSSStyleValue(v);
      if (sv) results.push(sv);
      else results.push(new CSSUnparsedValue([serialize([v]).trim()]));
    }
    return results;
  }
}

interface StyleLike {
  declarations: Declaration[];
  getPropertyValue(property: string): string;
  setProperty(property: string, value: string): void;
  removeProperty(property: string): void;
  length: number;
  item(index: number): string;
}

export class StylePropertyMap extends StylePropertyMapReadOnly {
  private _style: StyleLike;

  constructor(style: StyleLike) {
    super([]);
    this._style = style;
  }

  override get(property: string): CSSStyleValue | null {
    const value = this._style.getPropertyValue(property);
    if (!value) return null;
    
    // For shorthands, return CSSUnparsedValue
    if (SHORTHANDS[property]) {
      return new CSSUnparsedValue([value.trim()]);
    }
    
    // Try to parse as single value
    const tokens = tokenize(value);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    
    if (componentValues.length === 0) return null;
    if (componentValues.length === 1) {
      return createCSSStyleValue(componentValues[0]);
    }
    
    return new CSSUnparsedValue([value.trim()]);
  }

  override getAll(property: string): CSSStyleValue[] {
    const value = this._style.getPropertyValue(property);
    if (!value) return [];
    
    const tokens = tokenize(value);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    const results: CSSStyleValue[] = [];
    for (const v of componentValues) {
      if (v.type === 'whitespace' || v.type === 'comma') continue;
      const sv = createCSSStyleValue(v);
      if (sv) results.push(sv);
      else results.push(new CSSUnparsedValue([serialize([v]).trim()]));
    }
    return results;
  }

  override has(property: string): boolean {
    return this._style.getPropertyValue(property) !== '';
  }

  set(property: string, ...values: (CSSStyleValue | string)[]): void {
    const serialized = values.map(v => v.toString()).join(' ');
    this._style.setProperty(property, serialized);
  }

  append(property: string, ...values: (CSSStyleValue | string)[]): void {
    const current = this._style.getPropertyValue(property);
    const serialized = values.map(v => v.toString()).join(' ');
    const newValue = current ? `${current}, ${serialized}` : serialized;
    this._style.setProperty(property, newValue);
  }

  delete(property: string): void {
    this._style.removeProperty(property);
  }

  clear(): void {
    const props = [];
    for (let i = 0; i < this._style.length; i++) {
      props.push(this._style.item(i));
    }
    for (const p of props) {
      this._style.removeProperty(p);
    }
  }
}

// Sum Value Helpers
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
  // Check if both are absolute
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
    
    // Canonicalize
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

export class CSSPositionValue extends CSSStyleValue {
  private _x: CSSNumericValue;
  private _y: CSSNumericValue;

  constructor(x: CSSNumericValue, y: CSSNumericValue) {
    super();
    this._x = x;
    this._y = y;
  }

  get x(): CSSNumericValue {
    return this._x;
  }

  set x(val: CSSNumericValue) {
    this._x = val;
  }

  get y(): CSSNumericValue {
    return this._y;
  }

  set y(val: CSSNumericValue) {
    this._y = val;
  }

  serialize(): string {
    return `${this._x.serialize()} ${this._y.serialize()}`;
  }

  override toString(): string {
    return `${this._x} ${this._y}`;
  }
}

export { CSS } from './parser-api.ts';
