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
import type { Token, Declaration, ComponentValue, CSSFunction, IdentToken, HashToken } from './types.ts';
import { NAMED_COLORS } from './data/gen/colors.ts';
import { matchesSyntax, PropertyRegistry } from './PropertyRegistry.ts';


import { serialize, getMirrorToken } from './serializer.ts';
import { escape } from './css-escape.ts';
import { parseMathFunction, simplify } from './math-parser.ts';
import { tokenize } from './tokenizer.ts';
import { ParseHooks } from './parse-hooks.ts';
import { SHORTHANDS } from './shorthands.ts';
import { SHORTHANDS_DATA } from './data/gen/shorthands.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds, type CSSUnit } from './data/gen/units.ts';
export type { CSSUnit };
import { formatNumber } from './utils/format.ts';
import { DOMMatrixReadOnly, DOMMatrix, setParseTransformListHook } from './DOMMatrix.ts';
import { SUPPORTED_PROPERTIES } from './data/gen/property-list.ts';
import { STANDARD_PROPERTIES_SYNTAX } from './data/gen/standard-syntax.ts';

function validateProperty(property: string): void {
  if (!property.startsWith('--') && !SUPPORTED_PROPERTIES.has(property.toLowerCase())) {
    throw new TypeError(`Invalid property name "${property}"`);
  }
}

function compareStrings(a: string, b: string): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

function checkBrand(obj: unknown, cls: Function): void {
  if (!(obj instanceof cls)) {
    throw new TypeError('Illegal invocation');
  }
}

function isNumericValue(val: unknown): val is CSSNumericValue {
  if (!val || typeof val !== 'object') return false;
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSNumericValue as typeof CSSNumericValue) || CSSNumericValue;
  return val instanceof Cls;
}

function isKeywordValue(val: unknown): val is CSSKeywordValue {
  if (!val || typeof val !== 'object') return false;
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSKeywordValue as typeof CSSKeywordValue) || CSSKeywordValue;
  return val instanceof Cls;
}

function createUnitValue(value: number, unit: CSSUnit): CSSUnitValue {
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSUnitValue as typeof CSSUnitValue) || CSSUnitValue;
  return new Cls(value, unit);
}

function createKeywordValue(value: string): CSSKeywordValue {
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSKeywordValue as typeof CSSKeywordValue) || CSSKeywordValue;
  return new Cls(value);
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

const POSITION_PROPERTIES = new Set([
  'background-position',
  'object-position',
  'transform-origin',
  'perspective-origin',
  'offset-position',
  'offset-anchor',
  'mask-position',
  '-webkit-mask-position',
]);

// css-typed-om § 3.3 #positionvalue-objects
// css-values-4 § 10.1 Position: the <position> type
function toPositionCoord(val: CSSStyleValue | CSSNumericValue | CSSKeywordValue | null): CSSNumericValue | null {
  if (!val) return null;
  if (val instanceof CSSKeywordValue) {
    const k = val.value.toLowerCase();
    if (k === 'left' || k === 'top') return createUnitValue(0, 'percent');
    if (k === 'center') return createUnitValue(50, 'percent');
    if (k === 'right' || k === 'bottom') return createUnitValue(100, 'percent');
    return null;
  }
  if (val instanceof CSSNumericValue && isLengthPercentage(val.type())) {
    return val;
  }
  return null;
}

function tryParsePosition(trimmed: ComponentValue[], property?: string): CSSPositionValue | null {
  const components = trimmed.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
  if (components.length === 0) return null;

  // 1-value syntax: [ left | center | right | top | bottom | <length-percentage> ]
  if (components.length === 1) {
    const c0 = components[0];
    if (isToken(c0) && c0.type === 'ident') {
      const k = c0.value.toLowerCase();
      if (k === 'left') {
        return new CSSPositionValue(createUnitValue(0, 'percent'), createUnitValue(50, 'percent'));
      }
      if (k === 'right') {
        return new CSSPositionValue(createUnitValue(100, 'percent'), createUnitValue(50, 'percent'));
      }
      if (k === 'top') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(0, 'percent'));
      }
      if (k === 'bottom') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(100, 'percent'));
      }
      if (k === 'center') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(50, 'percent'));
      }
    }
    const sv = createCSSStyleValue(c0, property || 'left');
    const coord = toPositionCoord(sv);
    if (coord) {
      return new CSSPositionValue(coord, createUnitValue(50, 'percent'));
    }
  }

  // 2-value syntax:
  if (components.length === 2) {
    const c0 = components[0];
    const c1 = components[1];

    // Option B: Vertical keyword followed by Horizontal keyword (e.g. "top right")
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase()) &&
        isToken(c1) && c1.type === 'ident' && ['left', 'right', 'center'].includes(c1.value.toLowerCase())) {
      const yCoord = toPositionCoord(new CSSKeywordValue(c0.value));
      const xCoord = toPositionCoord(new CSSKeywordValue(c1.value));
      if (xCoord && yCoord) {
        return new CSSPositionValue(xCoord, yCoord);
      }
    }

    // Option A: Horizontal component followed by Vertical component
    // Disallow vertical keyword followed by length or length followed by horizontal keyword
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase())) {
      return null;
    }
    if (isToken(c1) && c1.type === 'ident' && ['left', 'right'].includes(c1.value.toLowerCase())) {
      return null;
    }

    const sv1 = createCSSStyleValue(c0, property || 'left');
    const sv2 = createCSSStyleValue(c1, property || 'top');
    const coord1 = toPositionCoord(sv1);
    const coord2 = toPositionCoord(sv2);
    if (coord1 && coord2) {
      return new CSSPositionValue(coord1, coord2);
    }
  }

  // 3-value syntax:
  if (components.length === 3) {
    const c0 = components[0];
    const c1 = components[1];
    const c2 = components[2];

    // Case 1: [ left | right ] <offset> [ top | bottom | center ]
    if (isToken(c0) && c0.type === 'ident' && ['left', 'right'].includes(c0.value.toLowerCase())) {
      const off = toPositionCoord(createCSSStyleValue(c1, 'left'));
      const vert = toPositionCoord(createCSSStyleValue(c2, 'top'));
      if (off && vert) {
        const xCoord = c0.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(xCoord, vert);
      }
    }

    // Case 2: [ left | right | center ] [ top | bottom ] <offset>
    if (isToken(c1) && c1.type === 'ident' && ['top', 'bottom'].includes(c1.value.toLowerCase())) {
      const horiz = toPositionCoord(createCSSStyleValue(c0, 'left'));
      const off = toPositionCoord(createCSSStyleValue(c2, 'top'));
      if (horiz && off) {
        const yCoord = c1.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(horiz, yCoord);
      }
    }

    // Case 3: [ top | bottom ] <offset> [ left | right | center ]
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase())) {
      const off = toPositionCoord(createCSSStyleValue(c1, 'top'));
      const horiz = toPositionCoord(createCSSStyleValue(c2, 'left'));
      if (off && horiz) {
        const yCoord = c0.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(horiz, yCoord);
      }
    }
  }

  // 4-value syntax:
  if (components.length === 4) {
    const c0 = components[0];
    const c1 = components[1];
    const c2 = components[2];
    const c3 = components[3];

    // Case A: [ left | right ] <offset1> [ top | bottom ] <offset2>
    if (isToken(c0) && c0.type === 'ident' && ['left', 'right'].includes(c0.value.toLowerCase()) &&
        isToken(c2) && c2.type === 'ident' && ['top', 'bottom'].includes(c2.value.toLowerCase())) {
      const off1 = toPositionCoord(createCSSStyleValue(c1, 'left'));
      const off2 = toPositionCoord(createCSSStyleValue(c3, 'top'));
      if (off1 && off2) {
        const xCoord = c0.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off1)))
          : off1;
        const yCoord = c2.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off2)))
          : off2;
        return new CSSPositionValue(xCoord, yCoord);
      }
    }

    // Case B: [ top | bottom ] <offset1> [ left | right ] <offset2>
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase()) &&
        isToken(c2) && c2.type === 'ident' && ['left', 'right'].includes(c2.value.toLowerCase())) {
      const off1 = toPositionCoord(createCSSStyleValue(c1, 'top'));
      const off2 = toPositionCoord(createCSSStyleValue(c3, 'left'));
      if (off1 && off2) {
        const yCoord = c0.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off1)))
          : off1;
        const xCoord = c2.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off2)))
          : off2;
        return new CSSPositionValue(xCoord, yCoord);
      }
    }
  }

  return null;
}

const COLOR_PROPERTIES = new Set([
  'color', 'background-color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'column-rule-color', 'caret-color', 'fill', 'stroke'
]);

const privateToken = Symbol.for('cssomnom-private-token');

// CSS Typed OM: CSSStyleValue
export class CSSStyleValue {
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
  private _cssText?: string;
  _associatedProperty: string | null = null;

  constructor(cssText?: string, token?: unknown) {
    if (token !== privateToken && this.constructor === CSSStyleValue) {
      throw new TypeError("CSSStyleValue cannot be directly constructed");
    }
    this._cssText = cssText;
  }

  toString(): string {
    return this._cssText || '';
  }

  private static _shouldFallbackToCSSStyleValue(property: string, css: string): boolean {
    const propLower = property.toLowerCase();
    const valueLower = css.toLowerCase().trim();
    
    if (valueLower.includes('var(')) return false;
    
    if (propLower === 'will-change') {
      return valueLower !== 'auto' && valueLower !== 'contents';
    }
    if (propLower === 'filter' || propLower === 'backdrop-filter') {
      return valueLower !== 'none';
    }
    if (propLower === 'cursor') {
      return valueLower.includes('url(');
    }
    return false;
  }

  static parseAll(property: string, css: string): CSSStyleValue[] {
    if (arguments.length < 2) {
      throw new TypeError("Failed to execute 'parseAll' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
    }
    if (property === '--') {
      throw new TypeError("Invalid property name: '--'");
    }
    if (!property.startsWith('--') && !SUPPORTED_PROPERTIES.has(property.toLowerCase())) {
      throw new TypeError(`Invalid or unsupported property name: '${property}'`);
    }
    const results = CSSStyleValue._parseAll(property, css);
    for (const val of results) {
      val._associatedProperty = property;
    }
    return results;
  }

  private static _parseAll(property: string, css: string): CSSStyleValue[] {
    if (property === '--') {
      throw new TypeError("Invalid property name: '--'");
    }
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    const trimmed = componentValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');

    if (trimmed.length === 0) {
      return [];
    }

    const isCSSWideKeyword = trimmed.length === 1 && trimmed[0].type === 'ident' &&
      ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes((trimmed[0] as IdentToken).value.toLowerCase());

    if (isCSSWideKeyword) {
      return [new CSSKeywordValue((trimmed[0] as IdentToken).value)];
    }

    if (CSSStyleValue._shouldFallbackToCSSStyleValue(property, css)) {
      return [new CSSStyleValue(css, privateToken)];
    }

    const shorthand = SHORTHANDS[property];
    if (shorthand && !hasVarFunction(trimmed)) {
      const expanded = shorthand.expand(trimmed);
      if (expanded === null) {
        throw new TypeError(`Invalid value for shorthand property ${property}: ${css}`);
      }
      for (const [longhand, longhandTokens] of Object.entries(expanded)) {
        const longhandSyntax = STANDARD_PROPERTIES_SYNTAX[longhand.toLowerCase()];
        if (longhandSyntax && !matchesSyntax(longhandTokens, longhandSyntax)) {
          throw new TypeError(`Invalid value for shorthand property ${property}: ${css}`);
        }
      }
      return [new CSSStyleValue(css, privateToken)];
    }

    if (hasVarFunction(trimmed)) {
      return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
    }

    if (property.startsWith('--')) {
      const reg = PropertyRegistry.get(property);
      if (!reg) {
        return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
      }
    }

    const propLower = property.toLowerCase();

    if (POSITION_PROPERTIES.has(propLower)) {
      const posVal = tryParsePosition(trimmed, property);
      if (posVal) return [posVal];
      return [new CSSStyleValue(css, privateToken)];
    }

    if (propLower === 'transform') {
      if (trimmed.length === 1 && trimmed[0].type === 'ident' && trimmed[0].value.toLowerCase() === 'none') {
        return [new CSSKeywordValue('none')];
      }
      return [CSSTransformValue.parse(css)];
    }

    if ((property in SHORTHANDS_DATA) && !hasVarFunction(trimmed)) {
      if (LIST_PROPERTIES.has(propLower) && componentValues.some(t => t.type === 'comma')) {
        const segments: ComponentValue[][] = [[]];
        for (const t of componentValues) {
          if (t.type === 'comma') {
            segments.push([]);
          } else {
            segments[segments.length - 1].push(t);
          }
        }
        return segments
          .map(seg => seg.filter(v => v.type !== 'comment'))
          .filter(seg => seg.some(v => v.type !== 'whitespace'))
          .map(seg => CSSStyleValue.createValueFromTokens(seg, property));
      }
      return [new CSSStyleValue(css, privateToken)];
    }
    if (propLower === 'translate') {
      const args = trimmed.filter(v => v.type !== 'comma');
      if (args.length < 1 || args.length > 3) {
        throw new TypeError(`translate expects 1, 2, or 3 arguments, got ${args.length}`);
      }
      return [parseTranslate('translate', args)];
    }
    if (propLower === 'rotate') {
      const args = trimmed.filter(v => v.type !== 'comma');
      if (args.length !== 1 && args.length !== 4) {
        throw new TypeError(`rotate expects 1 or 4 arguments, got ${args.length}`);
      }
      return [parseRotate('rotate', args)];
    }
    if (propLower === 'scale') {
      const args = trimmed.filter(v => v.type !== 'comma');
      if (args.length < 1 || args.length > 3) {
        throw new TypeError(`scale expects 1, 2, or 3 arguments, got ${args.length}`);
      }
      return [parseScale('scale', args)];
    }

    let syntax: string | undefined = STANDARD_PROPERTIES_SYNTAX[propLower];
    if (!syntax && property.startsWith('--')) {
      syntax = PropertyRegistry.get(property)?.syntax;
    }

    if (syntax && !hasVarFunction(trimmed)) {
      const isListProperty = LIST_PROPERTIES.has(propLower);
      if (isListProperty && trimmed.some(t => t.type === 'comma')) {
        const segments: ComponentValue[][] = [[]];
        for (const t of trimmed) {
          if (t.type === 'comma') {
            segments.push([]);
          } else {
            segments[segments.length - 1].push(t);
          }
        }
        for (const seg of segments) {
          const segTrimmed = seg.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
          if (segTrimmed.length > 0 && !matchesSyntax(segTrimmed, syntax)) {
            throw new TypeError(`Value '${css}' does not match syntax '${syntax}' for property '${property}'`);
          }
        }
      } else {
        if (!matchesSyntax(trimmed, syntax)) {
          throw new TypeError(`Value '${css}' does not match syntax '${syntax}' for property '${property}'`);
        }
      }
    }

    if (COLOR_PROPERTIES.has(propLower)) {
      // For specified color properties, keyword/ident colors (like "red", "transparent", "currentcolor")
      // must remain CSSKeywordValue so they serialize back to their keyword.
      if (trimmed.length === 1 && trimmed[0].type === 'ident') {
        return [new CSSKeywordValue((trimmed[0] as IdentToken).value)];
      }
      try {
        return [CSSColorValue.parse(css)];
      } catch (e) {
        throw new TypeError(`Failed to parse color property ${property}: ${css}`);
      }
    }
    if (trimmed.length === 1) {
      const first = trimmed[0];
      if (first.type === 'ident') {
        const isPositionProperty = POSITION_PROPERTIES.has(propLower);
        const isPositionKeyword = ['left', 'right', 'center', 'top', 'bottom'].includes(first.value.toLowerCase());
        if (!(isPositionProperty && isPositionKeyword)) {
          return [new CSSKeywordValue(first.value)];
        }
      }
      if (first.type === 'function') {
        const fn = first as CSSFunction;
        if (fn.name.toLowerCase() === 'var') {
          const styleValue = createCSSStyleValue(fn);
          if (styleValue) return [styleValue];
        }
      }
    }
    const results: CSSStyleValue[] = [];
    const isListProperty = LIST_PROPERTIES.has(property);
    
    if (isListProperty) {
      let current: ComponentValue[] = [];
      for (const v of componentValues) {
        if (v.type === 'comma') {
          if (current.length > 0) {
            results.push(CSSStyleValue.createValueFromTokens(current, property));
            current = [];
          }
        } else {
          current.push(v);
        }
      }
      if (current.length > 0) {
        results.push(CSSStyleValue.createValueFromTokens(current, property));
      }
    } else {
      if (componentValues.length > 0) {
        results.push(CSSStyleValue.createValueFromTokens(componentValues, property));
      }
    }
    
    return results;
  }

  private static createValueFromTokens(values: ComponentValue[], property?: string): CSSStyleValue {
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
    
    if (property && property.startsWith('--')) {
      const def = PropertyRegistry.get(property);
      if (!def || def.syntax === '*') {
        return new CSSUnparsedValue(tokensToUnparsedSegments(trimmed));
      }
    }
    
    if (property && POSITION_PROPERTIES.has(property.toLowerCase())) {
      const posVal = tryParsePosition(trimmed, property);
      if (posVal) return posVal;
    }

    if (trimmed.length === 1) {
      const sv = createCSSStyleValue(trimmed[0], property);
      if (sv) return sv;
    }
    
    return new CSSStyleValue(serialize(trimmed).trim(), privateToken);
  }

  static parse(property: string, css: string): CSSStyleValue {
    if (arguments.length < 2) {
      throw new TypeError("Failed to execute 'parse' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
    }
    const all = this.parseAll(property, css);
    if (all.length === 0) {
      throw new TypeError(`Invalid value for property ${property}: ${css}`);
    }
    return all[0];
  }
}


// CSS Typed OM: CSSKeywordValue
export class CSSKeywordValue extends CSSStyleValue {
  private _value: string = '';

  constructor(value: string) {
    super();
    if (value === '') {
      throw new TypeError('CSSKeywordValue value cannot be an empty string');
    }
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  set value(newValue: string) {
    if (newValue === '') {
      throw new TypeError('CSSKeywordValue value cannot be an empty string');
    }
    this._value = newValue;
  }

  override toString(): string {
    return escape(this._value);
  }

  serialize(): string {
    return this.toString();
  }
}

// CSS Typed OM: CSSImageValue
export abstract class CSSImageValue extends CSSStyleValue {}


interface RectifyOptions {
  name: string;
  numberToUnit: (v: number) => CSSUnitValue;
  validateNumeric: (type: CSSNumericType) => boolean;
  allowUndefined?: boolean;
  undefinedAsSyntaxError?: boolean;
}

const SIMPLE_NUMERIC = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-zA-Z%]*)$/;

function rectifyColorChannel(
  v: number | string | CSSNumericValue | CSSKeywordValue | undefined,
  options: RectifyOptions
): CSSNumericValue | CSSKeywordValue {
  const { name, numberToUnit, validateNumeric, allowUndefined = false, undefinedAsSyntaxError = false } = options;

  if (v === undefined || v === null) {
    if (allowUndefined && v === undefined) {
      return createKeywordValue('undefined');
    }
    if (undefinedAsSyntaxError) {
      throw new DOMException(`Value cannot be null or undefined`, 'SyntaxError');
    }
    throw new TypeError(`Value cannot be null or undefined`);
  }

  if (typeof v === 'number') {
    return numberToUnit(v);
  }

  let resolved: CSSNumericValue | CSSKeywordValue;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    const match = SIMPLE_NUMERIC.exec(trimmed);
    let matchedValue: CSSNumericValue | null = null;
    if (match) {
      const val = parseFloat(match[1]);
      let unit = match[2];
      if (unit === '%') {
        unit = 'percent';
      } else if (unit === '') {
        unit = 'number';
      }
      matchedValue = createUnitValue(val, unit as CSSUnit);
    }
    
    if (matchedValue) {
      resolved = matchedValue;
    } else {
      try {
        resolved = CSSNumericValue.parse(v);
      } catch {
        resolved = createKeywordValue(v);
      }
    }
  } else {
    resolved = v;
  }

  if (!isNumericValue(resolved) && !isKeywordValue(resolved)) {
    throw new TypeError(`Invalid type for ${name}`);
  }

  if (isNumericValue(resolved)) {
    if (validateNumeric(resolved.type())) {
      return resolved;
    }
  } else {
    const valLower = resolved.value.toLowerCase();
    if (valLower === 'none' || (allowUndefined && valLower === 'undefined')) {
      return resolved;
    }
  }

  throw new DOMException(`Invalid ${name} value`, 'SyntaxError');
}

function rectifyColorRGBComp(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorRGBComp',
    numberToUnit: (num) => createUnitValue(num * 100, 'percent'),
    validateNumeric: (t) => matchesNumber(t) || matchesPercentage(t),
    undefinedAsSyntaxError: true
  });
}

function rectifyColorPercent(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorPercent',
    numberToUnit: (num) => createUnitValue(num * 100, 'percent'),
    validateNumeric: matchesPercentage,
    undefinedAsSyntaxError: true
  });
}

function rectifyColorNumber(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorNumber',
    numberToUnit: (num) => createUnitValue(num, 'number'),
    validateNumeric: matchesNumber
  });
}

function rectifyColorNumberOrPercent(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColor channel',
    numberToUnit: (num) => createUnitValue(num, 'number'),
    validateNumeric: (t) => matchesNumber(t) || matchesPercentage(t)
  });
}

function rectifyColorAngle(v: number | string | CSSNumericValue | CSSKeywordValue, allowUndefined = false): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorAngle',
    numberToUnit: (num) => createUnitValue(num, 'deg'),
    validateNumeric: matchesAngle,
    allowUndefined
  });
}


// CSS Typed OM: CSSColorValue
export abstract class CSSColorValue extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSColorValue) {
      throw new TypeError("CSSColorValue cannot be directly constructed");
    }
  }
  static override parse(css: string): CSSColorValue | CSSKeywordValue {
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'parse' on 'CSSColorValue': 1 argument required, but only 0 present.");
    }
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    
    let singleValue: ComponentValue | null = null;
    for (const v of componentValues) {
      if (v.type === 'whitespace' || v.type === 'comment') {
        continue;
      }
      if (singleValue !== null) {
        throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
      }
      singleValue = v;
    }

    if (!singleValue) {
      throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
    }
    
    const color = reifyColor(singleValue);
    if (color) return color;
    
    throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
  }
}

function isAlphaUnity(alpha: CSSNumericValue | CSSKeywordValue): boolean {
  if (alpha instanceof CSSUnitValue) {
    return (alpha.unit === 'percent' && alpha.value === 100) || (alpha.unit === 'number' && alpha.value === 1);
  }
  return false;
}

function formatAlpha(alpha: CSSNumericValue | CSSKeywordValue): string {
  if (alpha instanceof CSSUnitValue && alpha.unit === 'percent') {
    return String(alpha.value / 100);
  }
  return alpha.toString();
}

export class CSSRGB extends CSSColorValue {
  private _r!: CSSNumericValue | CSSKeywordValue;
  private _g!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    r: number | string | CSSNumericValue | CSSKeywordValue,
    g: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.r = r;
    this.g = g;
    this.b = b;
    this.alpha = alpha;
  }

  get r(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._r; }
  set r(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._r = rectifyColorRGBComp(val); }

  get g(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._g; }
  set g(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._g = rectifyColorRGBComp(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._b = rectifyColorRGBComp(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    // CSS Color 4 #css-serialization-of-srgb:
    // "For compatibility, the legacy form with comma separators is used; exactly one ASCII space follows each comma."
    // Alpha is omitted if unity, and serialized as a unitless <number> otherwise.
    // Note: HSL and HWB serialize using modern space-separated syntax, but sRGB is legacy for web compat.
    const r = this.r.toString();
    const g = this.g.toString();
    const b = this.b.toString();
    
    if (isAlphaUnity(this.alpha)) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${formatAlpha(this.alpha)})`;
  }
}

export class CSSHSL extends CSSColorValue {
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _s!: CSSNumericValue | CSSKeywordValue;
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue | CSSKeywordValue,
    s: number | string | CSSNumericValue | CSSKeywordValue,
    l: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.h = h;
    this.s = s;
    this.l = l;
    this.alpha = alpha;
  }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._h = rectifyColorAngle(val, true); }

  get s(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._s; }
  set s(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._s = rectifyColorPercent(val); }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._l = rectifyColorPercent(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `hsl(${this.h} ${this.s} ${this.l})`;
    }
    return `hsl(${this.h} ${this.s} ${this.l} / ${this.alpha})`;
  }
}

export class CSSHWB extends CSSColorValue {
  private _h!: CSSNumericValue;
  private _w!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue,
    w: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.h = h;
    this.w = w;
    this.b = b;
    this.alpha = alpha;
  }

  get h(): CSSNumericValue { checkBrand(this, CSSHWB); return this._h; }
  set h(val: number | string | CSSNumericValue) {
    checkBrand(this, CSSHWB);
    const rectified = rectifyColorAngle(val);
    if (!(rectified instanceof CSSNumericValue)) {
      throw new TypeError(`CSSHWB.h must be a CSSNumericValue`);
    }
    this._h = rectified;
  }

  get w(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._w; }
  set w(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._w = rectifyColorPercent(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._b = rectifyColorPercent(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `hwb(${this.h} ${this.w} ${this.b})`;
    }
    return `hwb(${this.h} ${this.w} ${this.b} / ${this.alpha})`;
  }
}

export class CSSLab extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _a!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._l = rectifyColorPercent(val); }

  get a(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._a; }
  set a(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._a = rectifyColorNumber(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._b = rectifyColorNumber(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `lab(${this.l} ${this.a} ${this.b})`;
    }
    return `lab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

export class CSSLCH extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _c!: CSSNumericValue | CSSKeywordValue;
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._l = rectifyColorPercent(val); }

  get c(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._c; }
  set c(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._c = rectifyColorPercent(val); }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._h = rectifyColorAngle(val, true); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `lch(${this.l} ${this.c} ${this.h})`;
    }
    return `lch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

export class CSSOKLab extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _a!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._l = rectifyColorPercent(val); }

  get a(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._a; }
  set a(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._a = rectifyColorNumber(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._b = rectifyColorNumber(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `oklab(${this.l} ${this.a} ${this.b})`;
    }
    return `oklab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

export class CSSOKLCH extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _c!: CSSNumericValue | CSSKeywordValue;
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._l = rectifyColorPercent(val); }

  get c(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._c; }
  set c(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._c = rectifyColorPercent(val); }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._h = rectifyColorAngle(val, true); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `oklch(${this.l} ${this.c} ${this.h})`;
    }
    return `oklch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

export class CSSColor extends CSSColorValue {
  private _colorSpace!: CSSKeywordValue;
  private _channels!: (CSSNumericValue | CSSKeywordValue)[];
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    colorSpace: CSSKeywordValue | string,
    channels: (number | string | CSSNumericValue | CSSKeywordValue)[],
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.colorSpace = colorSpace;
    this._channels = channels.map(c => rectifyColorNumberOrPercent(c));
    this.alpha = alpha;
  }

  get colorSpace(): CSSKeywordValue { checkBrand(this, CSSColor); return this._colorSpace; }
  set colorSpace(val: CSSKeywordValue | string) {
    checkBrand(this, CSSColor);
    this._colorSpace = typeof val === 'string' ? createKeywordValue(val) : val;
  }

  get channels(): (CSSNumericValue | CSSKeywordValue)[] { checkBrand(this, CSSColor); return this._channels; }
  set channels(val: (number | string | CSSNumericValue | CSSKeywordValue)[]) {
    checkBrand(this, CSSColor);
    if (!Array.isArray(val)) {
      throw new TypeError("channels must be an array");
    }
    this._channels = val.map(c => rectifyColorNumberOrPercent(c));
  }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSColor); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) {
    checkBrand(this, CSSColor);
    this._alpha = rectifyColorNumberOrPercent(val);
  }

  override toString(): string {
    let channelsStr = '';
    for (let i = 0; i < this.channels.length; i++) {
      if (i > 0) channelsStr += ' ';
      channelsStr += this.channels[i].toString();
    }
    if (isAlphaUnity(this.alpha)) {
      return `color(${this.colorSpace.value} ${channelsStr})`;
    }
    return `color(${this.colorSpace.value} ${channelsStr} / ${this.alpha})`;
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
  let t1 = { ...a };
  let t2 = { ...b };
  
  if (t1.percentHint && t2.percentHint && t1.percentHint !== t2.percentHint) {
    throw new TypeError('Percent hint mismatch');
  }
  
  if (t1.percentHint && !t2.percentHint) {
    t2 = applyPercentHint(t2, t1.percentHint);
  } else if (t2.percentHint && !t1.percentHint) {
    t1 = applyPercentHint(t1, t2.percentHint);
  }

  const result: CSSNumericType = { ...t1 };
  const res = result as Record<string, unknown>;
  for (const [key, value] of Object.entries(t2)) {
    if (key === 'percentHint') {
       res.percentHint = value;
    } else {
       const current = res[key] as number | undefined;
       const newVal = (current || 0) + (value as number);
       if (newVal === 0) {
         delete res[key];
       } else {
         res[key] = newVal;
       }
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
    delete res['percent'];
  }
  if (res[hint] === 0) {
    delete res[hint];
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
    const baseTypes = ['length', 'angle', 'time', 'frequency', 'resolution', 'flex'];
    for (const base of baseTypes) {
      const nt1 = applyPercentHint(t1, base);
      const nt2 = applyPercentHint(t2, base);
      if (match(nt1, nt2)) {
        return nt1;
      }
    }
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

// CSS Typed OM: CSSNumericValue
export abstract class CSSNumericValue extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSNumericValue) {
      throw new TypeError("CSSNumericValue cannot be directly constructed");
    }
  }
  abstract serialize(): string;
  abstract type(): CSSNumericType;

  to(unit: string): CSSUnitValue {
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
            // css-values-4 § 10.7 #calc-simplification
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

    const sumNode = new CSSMathSum(...allValues);
    sumNode.type();
    return sumNode;
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
    if (this instanceof CSSMathRound && other instanceof CSSMathRound) {
      return this.strategy === other.strategy &&
             this.value.equals(other.value) &&
             this.precision.equals(other.precision);
    }
    if (this instanceof CSSMathFunction && other instanceof CSSMathFunction) {
      return this.name === other.name &&
             this.values.length === other.values.length &&
             this.values.every((v: CSSNumericValue, i: number) => v.equals(other.values.item(i)!));
    }

    return false;
  }
}

export class CSSNumericArray {
  [index: number]: CSSNumericValue;
  private _values: readonly CSSNumericValue[];
  constructor(values: CSSNumericValue[]) {
    this._values = [...values];
    Object.freeze(this._values);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target._values[index];
        }
        return Reflect.get(target, prop, receiver);
      }
    });
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



export { DOMMatrixReadOnly, DOMMatrix };

function newDOMMatrix(elements?: number[]): DOMMatrix {
  return new DOMMatrix(elements);
}


// CSS Typed OM: CSSUnitValue
export class CSSUnitValue extends CSSNumericValue {
  value: number;
  unit: CSSUnit;

  constructor(value: number, unit: CSSUnit) {
    super();
    const normalizedUnit = typeof unit === 'string' ? unit.toLowerCase() as CSSUnit : unit;
    if (!unitToBase[normalizedUnit]) {
      throw new TypeError(`Invalid unit: ${unit}`);
    }
    this.value = value;
    this.unit = normalizedUnit;
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
      return formatNumber(this.value);
    }
    if (this.unit === 'percent') {
      return `${formatNumber(this.value)}%`;
    }
    return `${formatNumber(this.value)}${this.unit}`;
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
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'to' on 'CSSNumericValue': 1 argument required, but only 0 present.");
    }
    if (!unitToBase[unit]) {
      throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
    }
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
    } else if (base === 'resolution') {
      const toDppx: Record<string, number> = {
        'dppx': 1,
        'x': 1,
        'dpi': 1 / 96,
        'dpcm': 2.54 / 96
      };
      if (!toDppx[this.unit] || !toDppx[unit]) throw new TypeError('Unsupported resolution conversion');
      canonical = this.value * toDppx[this.unit];
      targetFactor = toDppx[unit];
    } else {
      throw new TypeError(`Unsupported conversion for ${base}`);
    }

    return new CSSUnitValue(canonical / targetFactor, unit as CSSUnit);
  }
}

// CSS Helper
// Moved to typed-om.ts to avoid circular dependency

type ColorReifier = (args: (CSSNumericValue | CSSKeywordValue)[], alpha: number | CSSNumericValue | CSSKeywordValue) => CSSColorValue | null;

const COLOR_REIFIERS: Record<string, ColorReifier> = {
  rgb: (args, alpha) => new CSSRGB(args[0], args[1], args[2], alpha),
  rgba: (args, alpha) => new CSSRGB(args[0], args[1], args[2], alpha),
  hsl: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHSL(h, args[1], args[2], alpha);
  },
  hsla: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHSL(h, args[1], args[2], alpha);
  },
  hwb: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHWB(h as CSSNumericValue, args[1], args[2], alpha);
  },
  lab: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value, 'percent');
    }
    let a = args[1];
    let b = args[2];
    if (a instanceof CSSUnitValue && a.unit === 'percent') {
      a = new CSSUnitValue(a.value * 1.25, 'number');
    }
    if (b instanceof CSSUnitValue && b.unit === 'percent') {
      b = new CSSUnitValue(b.value * 1.25, 'number');
    }
    return new CSSLab(l, a, b, alpha);
  },
  lch: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value, 'percent');
    }
    let c = args[1];
    if (c instanceof CSSUnitValue && c.unit === 'number') {
      c = new CSSUnitValue(c.value / 1.5, 'percent');
    }
    let h = args[2];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSLCH(l, c, h, alpha);
  },
  oklab: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value * 100, 'percent');
    }
    let a = args[1];
    let b = args[2];
    if (a instanceof CSSUnitValue && a.unit === 'percent') {
      a = new CSSUnitValue(a.value * 0.004, 'number');
    }
    if (b instanceof CSSUnitValue && b.unit === 'percent') {
      b = new CSSUnitValue(b.value * 0.004, 'number');
    }
    return new CSSOKLab(l, a, b, alpha);
  },
  oklch: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value * 100, 'percent');
    }
    let c = args[1];
    if (c instanceof CSSUnitValue && c.unit === 'number') {
      c = new CSSUnitValue(c.value / 0.004, 'percent');
    }
    let h = args[2];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSOKLCH(l, c, h, alpha);
  },
};

function parseColorArgs(
  nameLower: string,
  fnValue: ComponentValue[]
): { args: (CSSNumericValue | CSSKeywordValue)[]; alpha: CSSNumericValue | CSSKeywordValue } | null {
  const tokens: ComponentValue[] = [];
  let slashIndex = -1;
  
  for (const t of fnValue) {
    if (t.type === 'whitespace' || t.type === 'comment') continue;
    if (t.type === 'delim' && t.value === '/') {
      if (slashIndex !== -1) return null;
      slashIndex = tokens.length;
      continue;
    }
    tokens.push(t);
  }

  if (tokens.length === 0) return null;

  const hasCommas = tokens.some(t => t.type === 'comma');
  const extractedArgs: (CSSNumericValue | CSSKeywordValue)[] = [];

  if (hasCommas) {
    if (slashIndex !== -1) return null;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (i % 2 === 1) {
        if (token.type !== 'comma') return null;
      } else {
        if (token.type === 'comma') return null;
        const val = createCSSStyleValue(token);
        if (!(val instanceof CSSNumericValue || val instanceof CSSKeywordValue)) return null;
        extractedArgs.push(val);
      }
    }
  } else {
    for (const token of tokens) {
      if (token.type === 'comma') return null;
      const val = createCSSStyleValue(token);
      if (!(val instanceof CSSNumericValue || val instanceof CSSKeywordValue)) return null;
      extractedArgs.push(val);
    }
  }

  if (nameLower === 'color') {
    if (extractedArgs.length < 2) return null;
    const alpha = slashIndex !== -1 ? extractedArgs[extractedArgs.length - 1] : new CSSUnitValue(1, 'number');
    const channels = slashIndex !== -1 ? extractedArgs.slice(1, -1) : extractedArgs.slice(1);
    return { args: [extractedArgs[0], ...channels], alpha };
  }

  if (slashIndex !== -1) {
    if (slashIndex !== extractedArgs.length - 1) return null;
    if (extractedArgs.length !== 4) return null;
    return { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] };
  } else {
    if (hasCommas && extractedArgs.length === 4) {
      return { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] };
    }
    if (extractedArgs.length === 3) {
      return { args: extractedArgs, alpha: new CSSUnitValue(1, 'number') };
    }
  }
  return null;
}

function reifyColor(v: ComponentValue): CSSColorValue | CSSKeywordValue | null {
  const normalizeAlpha = (a: CSSNumericValue | CSSKeywordValue) => {
    if (a instanceof CSSUnitValue && a.unit === 'number') {
      return a.value;
    }
    return a;
  };

  if (v.type === 'hash') {
    const hex = (v as HashToken).value;
    const len = hex.length;
    if (len !== 3 && len !== 4 && len !== 6 && len !== 8) {
      return null;
    }
    let r = 0, g = 0, b = 0, alpha = 1;
    if (len === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (len === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      alpha = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (len === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (len === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      alpha = parseInt(hex.slice(6, 8), 16) / 255;
    }
    return new CSSRGB(new CSSUnitValue(r, 'number'), new CSSUnitValue(g, 'number'), new CSSUnitValue(b, 'number'), alpha);
  }

  if (v.type === 'ident') {
    const name = (v as IdentToken).value.toLowerCase();
    if (name in NAMED_COLORS) {
      const parts = NAMED_COLORS[name];
      const r = parts[0];
      const g = parts[1];
      const b = parts[2];
      const alpha = parts.length > 3 ? parts[3]! : 1;
      return new CSSRGB(new CSSUnitValue(r, 'number'), new CSSUnitValue(g, 'number'), new CSSUnitValue(b, 'number'), alpha);
    }
    const systemColors = new Set([
      'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext',
      'buttonface', 'buttontext', 'buttonborder', 'field', 'fieldtext',
      'highlight', 'highlighttext', 'mark', 'marktext', 'graytext',
      'currentcolor',
      'activeborder', 'activecaption', 'appworkspace', 'background', 'buttonhighlight', 'buttonshadow',
      'inactiveborder', 'inactivecaption', 'inactivecaptiontext', 'infobackground', 'infotext',
      'menu', 'menutext', 'scrollbar', 'threeddarkshadow', 'threedface', 'threedhighlight',
      'threedlightshadow', 'threedshadow', 'window', 'windowframe', 'windowtext'
    ]);
    if (systemColors.has(name)) {
      return new CSSKeywordValue(name);
    }
  }

  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();
    
    if (nameLower in COLOR_REIFIERS || nameLower === 'color') {
      const parsed = parseColorArgs(nameLower, fn.value);
      if (!parsed) return null;

      if (nameLower === 'color') {
        const colorSpace = parsed.args[0];
        if (!(colorSpace instanceof CSSKeywordValue)) return null;
        return new CSSColor(colorSpace, parsed.args.slice(1), parsed.alpha);
      }

      const reifier = COLOR_REIFIERS[nameLower];
      if (reifier) {
        return reifier(parsed.args, normalizeAlpha(parsed.alpha));
      }
    }
  }
  return null;
}

/**
 * Converts a parsed component value into a Typed OM CSSStyleValue.
 */
export function createCSSStyleValue(v: ComponentValue, property?: string): CSSStyleValue | null {
  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();
    if (['calc', 'min', 'max', 'clamp'].includes(nameLower)) {
       const mathNode = parseMathFunction(fn.name, fn.value);
       if (mathNode) {
         if (nameLower === 'calc') {
           const simplified = simplify(mathNode);
           if (simplified instanceof CSSUnitValue) {
             return new CSSMathSum(simplified);
           }
           return simplified;
         }
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
          let start = 0;
          while (start < fallbackTokens.length && (fallbackTokens[start].type === 'whitespace' || fallbackTokens[start].type === 'comment')) {
            start++;
          }
          let end = fallbackTokens.length - 1;
          while (end >= start && (fallbackTokens[end].type === 'whitespace' || fallbackTokens[end].type === 'comment')) {
            end--;
          }
          const trimmedFallback = fallbackTokens.slice(start, end + 1);
          fallback = new CSSUnparsedValue(tokensToUnparsedSegments(trimmedFallback));
       }
       
       return new CSSUnparsedValue([new CSSVariableReferenceValue(varName, fallback)]);
    }
    if (nameLower === 'url') {
       // CSSImageValue for url()
       return new (class extends CSSImageValue {
         override toString() { return `url(${serialize(fn.value).trim()})`; }
       })();
    }
    if (nameLower.endsWith('gradient')) {
       return new (class extends CSSImageValue {
         override toString() { return serialize([v]).trim(); }
       })();
    }
  }
  if (isToken(v)) {
    switch (v.type) {
      case 'ident':
        return new CSSKeywordValue(v.value);
      case 'number':
        if (v.value === 0 && property) {
          const propLower = property.toLowerCase();
          let syntax: string | undefined = STANDARD_PROPERTIES_SYNTAX[propLower];
          if (!syntax && property.startsWith('--')) {
            syntax = PropertyRegistry.get(property)?.syntax;
          }
          if (syntax && (syntax.includes('<length>') || syntax.includes('<length-percentage>') || syntax.includes('<dimension>'))) {
            return new CSSUnitValue(0, 'px');
          }
        }
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

function isCSSFunction(val: ComponentValue): val is CSSFunction {
  return typeof val === 'object' && val !== null && 'type' in val && val.type === 'function' && 'name' in val && Array.isArray(val.value);
}

function hasVarFunction(values: ComponentValue[]): boolean {
  for (const v of values) {
    if (isCSSFunction(v)) {
      if (v.name.toLowerCase() === 'var') {
        return true;
      }
      if (hasVarFunction(v.value)) {
        return true;
      }
    } else if (v.type === 'simple-block') {
      if (hasVarFunction(v.value)) {
        return true;
      }
    }
  }
  return false;
}

function tokensToUnparsedSegments(values: ComponentValue[]): (string | CSSVariableReferenceValue)[] {
  const segments: (string | CSSVariableReferenceValue)[] = [];
  let pendingTokens: ComponentValue[] = [];

  const flushPending = () => {
    if (pendingTokens.length > 0) {
      segments.push(serialize(pendingTokens));
      pendingTokens = [];
    }
  };

  const processNode = (node: ComponentValue) => {
    if (isCSSFunction(node) && node.name.toLowerCase() === 'var') {
      flushPending();
      
      const args = node.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
      // If invalid var(), just serialize it as a string
      if (args.length === 0 || args[0].type !== 'ident' || !(args[0] as IdentToken).value.startsWith('--') || (args[0] as IdentToken).value === '--') {
        pendingTokens.push(node);
        return;
      }
      if (args.length > 1 && args[1].type !== 'comma') {
        pendingTokens.push(node);
        return;
      }

      const varName = (args[0] as IdentToken).value;
      let fallback: CSSUnparsedValue | null = null;
      
      let commaIdx = -1;
      for (let i = 0; i < node.value.length; i++) {
        if (node.value[i].type === 'comma') {
          commaIdx = i;
          break;
        }
      }
      
      if (commaIdx !== -1) {
        const fallbackTokens = node.value.slice(commaIdx + 1);
        fallback = new CSSUnparsedValue(tokensToUnparsedSegments(fallbackTokens));
      }

      segments.push(new CSSVariableReferenceValue(varName, fallback));
    } else if (isCSSFunction(node)) {
      // If it contains a var() somewhere in its children, we must decompose it
      if (hasVarFunction(node.value)) {
        flushPending();
        
        // Push the opening "funcName("
        segments.push(node.name.toLowerCase() + '(');
        
        // Recursively add children segments
        const innerSegments = tokensToUnparsedSegments(node.value);
        for (const seg of innerSegments) {
          if (typeof seg === 'string') {
            // Merge strings if possible
            const last = segments[segments.length - 1];
            if (typeof last === 'string') {
              segments[segments.length - 1] = last + seg;
            } else {
              segments.push(seg);
            }
          } else {
            segments.push(seg);
          }
        }
        
        // Push the closing ")"
        const last = segments[segments.length - 1];
        if (typeof last === 'string') {
          segments[segments.length - 1] = last + ')';
        } else {
          segments.push(')');
        }
      } else {
        pendingTokens.push(node);
      }
    } else if (node.type === 'simple-block') {
      // Simple blocks with associated open brackets, e.g. [, {, (
      if (hasVarFunction(node.value)) {
        flushPending();
        
        const start = node.associatedToken.value as string;
        const end = getMirrorToken(start);
        
        segments.push(start);
        
        const innerSegments = tokensToUnparsedSegments(node.value);
        for (const seg of innerSegments) {
          if (typeof seg === 'string') {
            const last = segments[segments.length - 1];
            if (typeof last === 'string') {
              segments[segments.length - 1] = last + seg;
            } else {
              segments.push(seg);
            }
          } else {
            segments.push(seg);
          }
        }
        
        const last = segments[segments.length - 1];
        if (typeof last === 'string') {
          segments[segments.length - 1] = last + end;
        } else {
          segments.push(end);
        }
      } else {
        pendingTokens.push(node);
      }
    } else {
      pendingTokens.push(node);
    }
  };

  for (const val of values) {
    processNode(val);
  }
  flushPending();

  // Clean up whitespace/empty string segments and merge adjacent string segments
  const finalSegments: (string | CSSVariableReferenceValue)[] = [];
  for (const seg of segments) {
    if (typeof seg === 'string') {
      if (seg === '') continue;
      const last = finalSegments[finalSegments.length - 1];
      if (typeof last === 'string') {
        finalSegments[finalSegments.length - 1] = last + seg;
      } else {
        finalSegments.push(seg);
      }
    } else {
      finalSegments.push(seg);
    }
  }

  return finalSegments;
}

// CSS Typed OM: CSSVariableReferenceValue
// css-typed-om § 3.4 #variable-reference-value-objects
export class CSSVariableReferenceValue {
  private _variable!: string;
  private _fallback: CSSUnparsedValue | null = null;

  constructor(variable: string, fallback: CSSUnparsedValue | null = null) {
    this.variable = variable;
    if (fallback !== null && fallback !== undefined) {
      if (!(fallback instanceof CSSUnparsedValue)) {
        throw new TypeError("Fallback must be a CSSUnparsedValue or null.");
      }
      this._fallback = fallback;
    } else {
      this._fallback = null;
    }
  }

  get variable(): string {
    return this._variable;
  }

  set variable(value: string) {
    if (typeof value !== 'string' || !value.startsWith('--') || value === '--') {
      throw new TypeError("Variable name must start with '--' and not be empty.");
    }
    this._variable = value;
  }

  get fallback(): CSSUnparsedValue | null {
    return this._fallback;
  }

  toString(): string {
    if (this._fallback !== null) {
      return `var(${this._variable},${this._fallback.toString()})`;
    }
    return `var(${this._variable})`;
  }
}
// CSS Typed OM: CSSUnparsedValue
export class CSSUnparsedValue extends CSSStyleValue {
  [index: number]: string | CSSVariableReferenceValue;
  private _values: (string | CSSVariableReferenceValue)[];

  constructor(values: (string | CSSVariableReferenceValue)[]) {
    super();
    this._values = values;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target._values[index];
        }
        return Reflect.get(target, prop, receiver);
      },
      // css-typed-om § 3.4 #unparsedvalue-objects
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          if (index < 0 || index > target._values.length) {
            throw new RangeError(`Index ${index} is out of bounds (length ${target._values.length})`);
          }
          if (typeof value !== 'string' && !(value instanceof CSSVariableReferenceValue)) {
            throw new TypeError('Value must be a string or CSSVariableReferenceValue');
          }
          target._values[index] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      }
    });
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
    const isIdentChar = (c: string) => /[a-zA-Z0-9_-]/.test(c);
    
    for (let i = 0; i < this._values.length; i++) {
      const current = this._values[i];
      const prev = i > 0 ? this._values[i - 1] : null;

      if (prev !== null) {
        const prevStr = prev.toString();
        const currentStr = current.toString();
        if (!prevStr.endsWith(' ') && !currentStr.startsWith(' ')) {
          if (prevStr.length > 0 && currentStr.length > 0) {
            if (isIdentChar(prevStr[prevStr.length - 1]) && isIdentChar(currentStr[0])) {
              s += '/**/';
            }
          }
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
  constructor() {
    super();
    if (this.constructor === CSSMathValue) {
      throw new TypeError("CSSMathValue cannot be directly constructed");
    }
  }
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
    if (t.percentHint) {
      result.percentHint = t.percentHint;
    }
    return result;
  }
}

export class CSSMathSum extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathSum requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    if (numericArgs.length > 0) {
      const firstType = numericArgs[0].type();
      for (let i = 1; i < numericArgs.length; i++) {
        if (!addTypesForSum(firstType, numericArgs[i].type())) {
          throw new TypeError('Incompatible types in sum');
        }
      }
    }
    this.values = new CSSNumericArray(numericArgs);
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
    const sortedChildren = sortProductChildren([...this.values]);
    let s = '(';
    s += sortedChildren[0].serialize();
    for (let i = 1; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child instanceof CSSMathInvert) {
        // CSS Values 4 #serialize-a-calculation-tree:
        // "If child is an Invert node, append " / " to s, then serialize the Invert's child..."
        // There is no exception for division by zero; it serializes as "/ 0" rather than "* (1 / 0)".
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

export class CSSMathMin extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMin requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    if (numericArgs.length > 0) {
      const firstType = numericArgs[0].type();
      for (let i = 1; i < numericArgs.length; i++) {
        if (!addTypesForSum(firstType, numericArgs[i].type())) {
          throw new TypeError('Incompatible types in min');
        }
      }
    }
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

export class CSSMathMax extends CSSMathValue {
  readonly values: CSSNumericArray;
  constructor(...args: (number | CSSNumericValue)[]) {
    super();
    if (args.length === 0) {
      throw new DOMException('CSSMathMax requires at least one argument', 'SyntaxError');
    }
    const numericArgs = args.map(ensureNumeric);
    if (numericArgs.length > 0) {
      const firstType = numericArgs[0].type();
      for (let i = 1; i < numericArgs.length; i++) {
        if (!addTypesForSum(firstType, numericArgs[i].type())) {
          throw new TypeError('Incompatible types in max');
        }
      }
    }
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

export class CSSMathClamp extends CSSMathValue {
  readonly lower: CSSNumericValue | CSSKeywordValue;
  readonly value: CSSNumericValue;
  readonly upper: CSSNumericValue | CSSKeywordValue;
  constructor(lower: number | CSSNumericValue | CSSKeywordValue, value: number | CSSNumericValue, upper: number | CSSNumericValue | CSSKeywordValue) {
    super();
    const l = typeof lower === 'number' ? new CSSUnitValue(lower, 'number') : lower;
    const v = ensureNumeric(value);
    const u = typeof upper === 'number' ? new CSSUnitValue(upper, 'number') : upper;

    if (l instanceof CSSNumericValue) {
      if (!addTypesForSum(l.type(), v.type())) {
        throw new TypeError('Incompatible types in clamp');
      }
    }
    if (u instanceof CSSNumericValue) {
      if (!addTypesForSum(u.type(), v.type())) {
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
    if (this.lower instanceof CSSNumericValue) {
      const combined = addTypesForSum(result, this.lower.type());
      if (combined) result = combined;
    }
    if (this.upper instanceof CSSNumericValue) {
      const combined = addTypesForSum(result, this.upper.type());
      if (combined) result = combined;
    }
    return result;
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

  return [...numbers, ...percents, ...dimensions];
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

function matchesLength(type: CSSNumericType): boolean {
  return (type.length || 0) === 1 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'length');
}

function matchesPercentage(type: CSSNumericType): boolean {
  return (type.percent || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined);
}

function matchesLengthPercentage(type: CSSNumericType): boolean {
  return matchesLength(type) || matchesPercentage(type);
}

function matchesNumber(type: CSSNumericType): boolean {
  return (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined);
}

function matchesAngle(type: CSSNumericType): boolean {
  return (type.angle || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'angle');
}

function matchesTime(type: CSSNumericType): boolean {
  return (type.time || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'time');
}

function matchesFrequency(type: CSSNumericType): boolean {
  return (type.frequency || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'frequency');
}

function matchesResolution(type: CSSNumericType): boolean {
  return (type.resolution || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'resolution');
}

function matchesFlex(type: CSSNumericType): boolean {
  return (type.flex || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'flex');
}

// css-typed-om § 3.2 #the-stylepropertymap
// css-properties-values-api § 3 #syntax-strings
function matchesStyleValueSyntax(value: CSSStyleValue, syntax: string, propKey: string): boolean {
  const propLower = propKey.toLowerCase();
  if (value instanceof CSSUnparsedValue || value instanceof CSSVariableReferenceValue) {
    return true;
  }
  if (value.constructor === CSSStyleValue) {
    if (value._associatedProperty !== null && value._associatedProperty !== propKey) {
      return false;
    }
    return true;
  }
  if (syntax === '*' || !syntax) {
    return true;
  }

  if (value instanceof CSSKeywordValue) {
    const kw = value.value.toLowerCase();
    const CSS_WIDE = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default']);
    if (CSS_WIDE.has(kw)) return true;

    if (syntax.includes('<custom-ident>') || syntax.includes('<string>')) return true;

    const parts = syntax.split('|').map(s => s.trim().toLowerCase());
    if (parts.includes(kw)) return true;

    if (syntax.includes('<color>')) {
      const SYSTEM_COLORS = new Set([
        'canvas', 'canvastext', 'linktext', 'visitedtext', 'activeborder', 'activecaption', 'appworkspace',
        'background', 'buttonface', 'buttonhighlight', 'buttonshadow', 'buttontext', 'captiontext', 'graytext',
        'highlight', 'highlighttext', 'inactiveborder', 'inactivecaption', 'inactivecaptiontext', 'infobackground',
        'infotext', 'menu', 'menutext', 'scrollbar', 'threeddarkshadow', 'threedface', 'threedhighlight',
        'threedlightshadow', 'threedshadow', 'window', 'windowframe', 'windowtext', 'currentcolor'
      ]);
      if (kw in NAMED_COLORS || SYSTEM_COLORS.has(kw) || kw === 'currentcolor') {
        return true;
      }
    }

    if (syntax.includes('<position>') && ['left', 'right', 'center', 'top', 'bottom'].includes(kw)) {
      return true;
    }

    if ((syntax.includes('<image>') || syntax.includes('<transform-list>')) && kw === 'none') {
      return true;
    }

    return false;
  }

  if (value instanceof CSSNumericValue) {
    const t = value.type();
    const hasLengthPct = syntax.includes('<length-percentage>');
    const hasLength = syntax.includes('<length>') || hasLengthPct;
    const hasPercentage = syntax.includes('<percentage>') || hasLengthPct;
    const hasNumber = syntax.includes('<number>') || syntax.includes('<integer>');
    const hasAngle = syntax.includes('<angle>');
    const hasTime = syntax.includes('<time>');
    const hasFrequency = syntax.includes('<frequency>');
    const hasResolution = syntax.includes('<resolution>');
    const hasFlex = syntax.includes('<flex>');

    if (matchesLengthPercentage(t)) {
      if (matchesLength(t) && hasLength) return true;
      if (matchesPercentage(t) && hasPercentage) return true;
      if (hasLengthPct) return true;
    }
    if (matchesNumber(t) && hasNumber) return true;
    if (matchesPercentage(t) && hasPercentage) return true;
    if (matchesAngle(t) && hasAngle) return true;
    if (matchesTime(t) && hasTime) return true;
    if (matchesFrequency(t) && hasFrequency) return true;
    if (matchesResolution(t) && hasResolution) return true;
    if (matchesFlex(t) && hasFlex) return true;

    return false;
  }

  if (value instanceof CSSTransformValue || value instanceof CSSTransformComponent) {
    return syntax.includes('<transform-list>') || syntax.includes('<transform-function>') ||
      propLower === 'transform' || propLower === 'translate' || propLower === 'rotate' || propLower === 'scale';
  }

  if (value instanceof CSSColorValue) {
    return syntax.includes('<color>') || COLOR_PROPERTIES.has(propLower);
  }

  if (value instanceof CSSImageValue) {
    return syntax.includes('<image>') || syntax.includes('<url>');
  }

  if (value instanceof CSSPositionValue) {
    return syntax.includes('<position>') || syntax.includes('<length-percentage>') || POSITION_PROPERTIES.has(propLower);
  }

  return false;
}

export abstract class CSSTransformComponent extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSTransformComponent) {
      throw new TypeError("CSSTransformComponent cannot be directly constructed");
    }
  }
  protected _is2D: boolean = true;
  get is2D(): boolean {
    return this._is2D;
  }
  set is2D(val: boolean) {
    this._is2D = val;
  }
  abstract toString(): string;
  
  toMatrix(): DOMMatrix {
    throw new Error('toMatrix() not implemented for this transform component.');
  }
}

export class CSSTranslate extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;

  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z?: number | CSSNumericValue) {
    super();
    this.x = ensureNumeric(x);
    this.y = ensureNumeric(y);
    if (z !== undefined) {
      this.z = ensureNumeric(z);
      this._is2D = false;
    } else {
      this._z = new CSSUnitValue(0, 'px');
      this._is2D = true;
    }
  }

  get x(): CSSNumericValue {
    return this._x;
  }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLengthPercentage(numericVal.type())) {
      throw new TypeError('CSSTranslate.x must be a length or percentage');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue {
    return this._y;
  }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLengthPercentage(numericVal.type())) {
      throw new TypeError('CSSTranslate.y must be a length or percentage');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue {
    return this._z;
  }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLength(numericVal.type())) {
      throw new TypeError('CSSTranslate.z must be a length');
    }
    this._z = numericVal;
  }

  override get is2D(): boolean {
    return this._is2D;
  }
  override set is2D(value: boolean) {
    this._is2D = value;
    if (value) {
      this._z = new CSSUnitValue(0, 'px');
    }
  }

  toString(): string {
    if (this.is2D) return `translate(${this.x}, ${this.y})`;
    return `translate3d(${this.x}, ${this.y}, ${this.z})`;
  }

  override toMatrix(): DOMMatrix {
    const x = this.x.to('px').value;
    const y = this.y.to('px').value;
    const z = this.z.to('px').value;
    
    if (this.is2D) {
      return newDOMMatrix([1, 0, 0, 1, x, y]);
    } else {
      return newDOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    }
  }
}

export class CSSScale extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;
  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z?: number | CSSNumericValue) {
    super();
    this.x = x;
    this.y = y;
    this.z = z !== undefined ? z : new CSSUnitValue(1, 'number');
    this.is2D = z === undefined;
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.x must be a unitless number');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.y must be a unitless number');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.z must be a unitless number');
    }
    this._z = numericVal;
  }
  toString(): string {
    if (this.is2D) {
      if (this.x.equals(this.y)) {
        return `scale(${this.x})`;
      }
      return `scale(${this.x}, ${this.y})`;
    }
    return `scale3d(${this.x}, ${this.y}, ${this.z})`;
  }

  override toMatrix(): DOMMatrix {
    const x = this.x.to('number').value;
    const y = this.y.to('number').value;
    const z = this.z.to('number').value;
    
    if (this.is2D) {
      return newDOMMatrix([x, 0, 0, y, 0, 0]);
    } else {
      return newDOMMatrix([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
    }
  }
}

// css-typed-om-1 § 7.3 #dom-cssrotate-angle
// css-transforms-2 § 3 #transform-functions
function normalizeAngleUnits(node: CSSNumericValue): CSSNumericValue {
  if (node instanceof CSSUnitValue) {
    if (node.unit === 'turn') return new CSSUnitValue(node.value * 360, 'deg');
    if (node.unit === 'grad') return new CSSUnitValue(node.value * 0.9, 'deg');
    if (node.unit === 'rad') return new CSSUnitValue(node.value * (180 / Math.PI), 'deg');
    return node;
  }
  if (node instanceof CSSMathSum) {
    return new CSSMathSum(...node.values.map(normalizeAngleUnits));
  }
  if (node instanceof CSSMathProduct) {
    return new CSSMathProduct(...node.values.map(normalizeAngleUnits));
  }
  if (node instanceof CSSMathNegate) {
    return new CSSMathNegate(normalizeAngleUnits(node.value));
  }
  if (node instanceof CSSMathInvert) {
    return new CSSMathInvert(normalizeAngleUnits(node.value));
  }
  return node;
}

export class CSSRotate extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;
  private _angle!: CSSNumericValue;

  constructor(angle: number | CSSNumericValue);
  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z: number | CSSNumericValue, angle: number | CSSNumericValue);
  constructor(xOrAngle: number | CSSNumericValue, y?: number | CSSNumericValue, z?: number | CSSNumericValue, angle?: number | CSSNumericValue) {
    super();
    if (y === undefined) {
      this.angle = ensureNumeric(xOrAngle);
      this._x = new CSSUnitValue(0, 'number');
      this._y = new CSSUnitValue(0, 'number');
      this._z = new CSSUnitValue(1, 'number');
      this.is2D = true;
    } else {
      this.x = ensureNumeric(xOrAngle);
      this.y = ensureNumeric(y);
      this.z = ensureNumeric(z!);
      this.angle = ensureNumeric(angle!);
      this.is2D = false;
    }
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.x must be a unitless number');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.y must be a unitless number');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.z must be a unitless number');
    }
    this._z = numericVal;
  }

  get angle(): CSSNumericValue { return this._angle; }
  set angle(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesAngle(numericVal.type())) {
      throw new TypeError('CSSRotate.angle must be an angle');
    }
    this._angle = normalizeAngleUnits(numericVal);
  }

  toString(): string {
    if (this.is2D) return `rotate(${this.angle})`;
    return `rotate3d(${this.x}, ${this.y}, ${this.z}, ${this.angle})`;
  }

  override toMatrix(): DOMMatrix {
    const rad = this.angle.to('rad').value;
    
    if (this.is2D) {
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      return newDOMMatrix([c, s, -s, c, 0, 0]);
    } else {
      let x = this.x.to('number').value;
      let y = this.y.to('number').value;
      let z = this.z.to('number').value;
      
      const len = Math.hypot(x, y, z);
      if (len === 0) {
        x = 0;
        y = 0;
        z = 1;
      } else {
        x /= len;
        y /= len;
        z /= len;
      }
      
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const t = 1 - c;
      
      return newDOMMatrix([
        t * x * x + c,
        t * x * y + s * z,
        t * x * z - s * y,
        0,
        t * x * y - s * z,
        t * y * y + c,
        t * y * z + s * x,
        0,
        t * x * z + s * y,
        t * y * z - s * x,
        t * z * z + c,
        0,
        0,
        0,
        0,
        1
      ]);
    }
  }
}

export class CSSSkew extends CSSTransformComponent {
  private _ax!: CSSNumericValue;
  private _ay!: CSSNumericValue;
  constructor(ax: number | CSSNumericValue, ay: number | CSSNumericValue) {
    super();
    this.ax = ax;
    this.ay = ay;
    this.is2D = true;
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkew.ax must be an angle');
    }
    this._ax = normalizeAngleUnits(numericVal);
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkew.ay must be an angle');
    }
    this._ay = normalizeAngleUnits(numericVal);
  }
  toString(): string {
    if (this.ay instanceof CSSUnitValue && this.ay.value === 0) return `skew(${this.ax})`;
    return `skew(${this.ax}, ${this.ay})`;
  }
  override toMatrix(): DOMMatrix {
    const axRad = this.ax.to('rad').value;
    const ayRad = this.ay.to('rad').value;
    return newDOMMatrix([1, Math.tan(ayRad), Math.tan(axRad), 1, 0, 0]);
  }
}

export class CSSSkewX extends CSSTransformComponent {
  private _ax!: CSSNumericValue;
  constructor(ax: number | CSSNumericValue) {
    super();
    this.ax = ax;
    this.is2D = true;
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkewX.ax must be an angle');
    }
    this._ax = numericVal;
  }
  toString(): string {
    return `skewX(${this.ax})`;
  }
  override toMatrix(): DOMMatrix {
    const axRad = this.ax.to('rad').value;
    return newDOMMatrix([1, 0, Math.tan(axRad), 1, 0, 0]);
  }
}

export class CSSSkewY extends CSSTransformComponent {
  private _ay!: CSSNumericValue;
  constructor(ay: number | CSSNumericValue) {
    super();
    this.ay = ay;
    this.is2D = true;
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkewY.ay must be an angle');
    }
    this._ay = numericVal;
  }
  toString(): string {
    return `skewY(${this.ay})`;
  }
  override toMatrix(): DOMMatrix {
    const ayRad = this.ay.to('rad').value;
    return newDOMMatrix([1, Math.tan(ayRad), 0, 1, 0, 0]);
  }
}

export class CSSPerspective extends CSSTransformComponent {
  private _length!: CSSNumericValue | CSSKeywordValue;
  constructor(length: number | string | CSSNumericValue | CSSKeywordValue) {
    super();
    this.length = length;
    this.is2D = false;
  }
  get length(): CSSNumericValue | CSSKeywordValue { return this._length; }
  set length(val: number | string | CSSNumericValue | CSSKeywordValue) {
    let resolved: CSSNumericValue | CSSKeywordValue;
    if (typeof val === 'string') {
      try {
        resolved = CSSNumericValue.parse(val);
      } catch {
        resolved = new CSSKeywordValue(val);
      }
    } else if (typeof val === 'number') {
      resolved = ensureNumeric(val);
    } else {
      resolved = val;
    }
    
    if (resolved instanceof CSSNumericValue) {
      if (!matchesLength(resolved.type())) {
        throw new TypeError('CSSPerspective.length must be a length');
      }
    } else if (resolved instanceof CSSKeywordValue) {
      if (resolved.value.toLowerCase() !== 'none') {
        throw new TypeError('CSSPerspective.length keyword must be none');
      }
    } else {
      throw new TypeError('CSSPerspective.length must be a length or none keyword');
    }
    this._length = resolved;
  }
  toString(): string {
    if (this.length instanceof CSSKeywordValue) return `perspective(${this.length})`;
    if (this.length instanceof CSSUnitValue && this.length.value < 0) {
      return `perspective(calc(${this.length}))`;
    }
    return `perspective(${this.length})`;
  }
  override toMatrix(): DOMMatrix {
    if (this.length instanceof CSSKeywordValue) {
      return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    const val = this.length.to('px').value;
    if (val <= 0) {
      return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    return new DOMMatrix([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, -1 / val,
      0, 0, 0, 1
    ]);
  }
}

export interface CSSMatrixComponentOptions {
  is2D?: boolean;
}

export class CSSMatrixComponent extends CSSTransformComponent {
  public matrix: DOMMatrix;
  constructor(matrix: DOMMatrixReadOnly, options?: CSSMatrixComponentOptions) {
    super();
    this.matrix = new DOMMatrix(matrix);
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

  override toMatrix(): DOMMatrix {
    if (this.is2D) {
      return new DOMMatrix([
        this.matrix.a,
        this.matrix.b,
        this.matrix.c,
        this.matrix.d,
        this.matrix.e,
        this.matrix.f,
      ]);
    }
    const copy = DOMMatrix.fromMatrix(this.matrix);
    copy.is2D = false;
    return copy;
  }
}

export class CSSTransformValue extends CSSStyleValue {
  [index: number]: CSSTransformComponent;
  public components: CSSTransformComponent[];
  constructor(components: CSSTransformComponent[]) {
    super();
    if (components.length === 0) {
      throw new TypeError('CSSTransformValue requires at least one transform component');
    }
    this.components = components;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target.components[index];
        }
        return Reflect.get(target, prop, receiver);
      },
      // css-typed-om § 7 #transformvalue-objects
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          if (index < 0 || index > target.components.length) {
            throw new RangeError(`Index ${index} is out of bounds (length ${target.components.length})`);
          }
          if (!(value instanceof CSSTransformComponent)) {
            throw new TypeError('Value must be an instance of CSSTransformComponent');
          }
          target.components[index] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      }
    });
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

  toMatrix(): DOMMatrix {
    let result = this.components[0]?.toMatrix() ?? newDOMMatrix([1, 0, 0, 1, 0, 0]);
    for (let i = 1; i < this.components.length; i++) {
      const next = this.components[i].toMatrix();
      result = result.multiply(next);
    }
    return result;
  }

  toString(): string {
    return this.components.map(c => c.toString()).join(' ');
  }

  static parse(css: string): CSSTransformValue {
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'parse' on 'CSSTransformValue': 1 argument required, but only 0 present.");
    }
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);
    
    const components: CSSTransformComponent[] = [];
    for (const v of componentValues) {
      if (v.type === 'whitespace' || v.type === 'comment') continue;
      if (v.type === 'comma') {
        throw new TypeError('CSSTransformValue.parse: Comma token not allowed at top level');
      }
      if (v.type !== 'function') {
        throw new TypeError('CSSTransformValue.parse: Expected function token at top level');
      }
      const fn = v as CSSFunction;
      const name = fn.name.toLowerCase();
      const args = fn.value.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'comma');
      
      const knownTransformFunctions = [
        'translate', 'translatex', 'translatey', 'translatez', 'translate3d',
        'scale', 'scalex', 'scaley', 'scalez', 'scale3d',
        'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d',
        'skew', 'skewx', 'skewy',
        'perspective',
        'matrix', 'matrix3d'
      ];
      
      if (!knownTransformFunctions.includes(name)) {
        throw new TypeError(`CSSTransformValue.parse: Unknown transform function '${fn.name}'`);
      }
      
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
    return new CSSTransformValue(components);
  }
}

function parseTranslate(name: string, args: ComponentValue[]): CSSTranslate {
  if (name === 'translatex' || name === 'translatey' || name === 'translatez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'translate3d') {
    if (args.length !== 3) throw new TypeError(`translate3d() expects 3 arguments, got ${args.length}`);
  } else if (name === 'translate') {
    if (args.length < 1 || args.length > 3) throw new TypeError(`translate() expects 1, 2, or 3 arguments, got ${args.length}`);
  }

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
  if (name === 'scalex' || name === 'scaley' || name === 'scalez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'scale3d') {
    if (args.length !== 3) throw new TypeError(`scale3d() expects 3 arguments, got ${args.length}`);
  } else if (name === 'scale') {
    if (args.length < 1 || args.length > 3) throw new TypeError(`scale() expects 1, 2, or 3 arguments, got ${args.length}`);
  }

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
  if (name === 'rotatex' || name === 'rotatey' || name === 'rotatez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'rotate3d') {
    if (args.length !== 4) throw new TypeError(`rotate3d() expects 4 arguments, got ${args.length}`);
  } else if (name === 'rotate') {
    if (args.length !== 1 && args.length !== 4) throw new TypeError(`rotate() expects 1 or 4 arguments, got ${args.length}`);
  }

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
    return new CSSRotate(parseNumeric(args[0]), parseNumeric(args[1]), parseNumeric(args[2]), parseNumeric(args[3]));
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

  return new CSSMatrixComponent(new DOMMatrixReadOnly(vals));

}

function parseNumeric(v: ComponentValue): CSSNumericValue {
  if (v.type === 'number' || v.type === 'percentage' || v.type === 'dimension') {
    const sv = createCSSStyleValue(v as Token);
    if (sv instanceof CSSNumericValue) return sv;
  }
  if (v.type === 'function') {
    const mathNode = parseMathFunction((v as CSSFunction).name, (v as CSSFunction).value);
    if (mathNode instanceof CSSNumericValue) return simplify(mathNode);
  }
  return new CSSUnitValue(0, 'number');
}


export interface StyleReadOnlyLike {
  length: number;
  [index: number]: string;
  getPropertyValue(property: string): string;
  item(index: number): string;
  declarations?: Declaration[];
}

export interface StyleLike extends StyleReadOnlyLike {
  setProperty(property: string, value: string | null, priority?: string): void;
  removeProperty(property: string): string;
}

export class StylePropertyMapReadOnly {
  protected _style: StyleReadOnlyLike;
  protected _element?: unknown;

  constructor(styleOrDecls: StyleReadOnlyLike | Declaration[], element?: unknown) {
    if (Array.isArray(styleOrDecls)) {
      this._style = {
        length: styleOrDecls.length,
        getPropertyValue: (prop: string) => {
          const decl = styleOrDecls.find(d => d.name === prop);
          return decl ? serialize(decl.value).trim() : '';
        },
        item: (index: number) => styleOrDecls[index]?.name || '',
        declarations: styleOrDecls,
        ...Object.fromEntries(styleOrDecls.map((d, i) => [i, d.name]))
      } as unknown as StyleReadOnlyLike;
    } else {
      this._style = styleOrDecls;
    }
    this._element = element;
  }

  protected _getDeclarations(): Declaration[] {
    return this._style.declarations || [];
  }

  // css-typed-om § 3.2 #the-stylepropertymap
  private _getKeys(): string[] {
    const rawKeys = new Set<string>();
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      for (const d of declarations) {
        if (d.name) rawKeys.add(d.name);
      }
    } else if (this._style) {
      for (let i = 0; i < this._style.length; i++) {
        const prop = this._style[i] || (typeof this._style.item === 'function' ? this._style.item(i) : '');
        if (prop) {
          rawKeys.add(prop);
        }
      }
    }

    const standardProps = new Set<string>();
    const vendorProps = new Set<string>();
    const customProps = new Set<string>();

    for (const key of rawKeys) {
      if (key.startsWith('--')) {
        // Custom properties: preserved exactly as written (case-sensitive)
        customProps.add(key);
      } else if (key.startsWith('-')) {
        // Vendor-prefixed / experimental properties: ASCII lowercased
        vendorProps.add(key.toLowerCase());
      } else {
        // Standard properties: ASCII lowercased
        standardProps.add(key.toLowerCase());
      }
    }

    const sortedStandard = Array.from(standardProps).sort(compareStrings);
    const sortedVendor = Array.from(vendorProps).sort(compareStrings);
    const sortedCustom = Array.from(customProps).sort(compareStrings);

    return [...sortedStandard, ...sortedVendor, ...sortedCustom];
  }

  get size(): number {
    return this._getKeys().length;
  }

  keys(): IterableIterator<string> {
    return this._getKeys()[Symbol.iterator]();
  }

  values(): IterableIterator<CSSStyleValue[]> {
    const keys = this._getKeys();
    const vals = keys.map(k => this.getAll(k));
    return vals[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, CSSStyleValue[]]> {
    const keys = this._getKeys();
    const entries = keys.map(k => [k, this.getAll(k)] as [string, CSSStyleValue[]]);
    return entries[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, CSSStyleValue[]]> {
    return this.entries();
  }

  forEach(callback: (values: CSSStyleValue[], key: string, map: this) => void, thisArg?: unknown): void {
    const keys = this._getKeys();
    for (const key of keys) {
      callback.call(thisArg, this.getAll(key), key, this);
    }
  }

  get(property: string): CSSStyleValue | undefined {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getRaw(property);
    if (res) {
      res._associatedProperty = propKey;
      return res;
    }
    return undefined;
  }

  protected _getRaw(property: string): CSSStyleValue | null {
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const declarations = this._getDeclarations();
      if (declarations.length > 0) {
        const longhandValues: Record<string, ComponentValue[]> = {};
        let allSet = true;
        for (const lh of shorthand.longhands) {
          const decl = declarations.find(d => d.name === lh);
          if (!decl) {
            allSet = false;
            break;
          }
          longhandValues[lh] = decl.value;
        }
        if (allSet) {
          const contracted = shorthand.contract(longhandValues);
          if (contracted !== null) {
            return new CSSUnparsedValue([contracted]);
          }
        }
      } else {
        const val = this._style.getPropertyValue(property);
        if (val) {
          return new CSSUnparsedValue([val]);
        }
      }
      return null;
    }

    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      const decl = declarations.find((d: Declaration) => d.name === property);
      if (!decl) return null;
      if (property.startsWith('--')) {
        return new CSSUnparsedValue(tokensToUnparsedSegments(decl.value));
      }
      const serialized = serialize(decl.value).trim();
      try {
        const parsed = CSSStyleValue.parseAll(property, serialized);
        return parsed.length > 0 ? parsed[0] : null;
      } catch (e) {
        return new CSSStyleValue(serialized, privateToken);
      }
    } else {
      const val = this._style.getPropertyValue(property);
      if (val === '') return null;
      if (property.startsWith('--')) {
        const tokens = tokenize(val);
        const componentValues = ParseHooks.parseComponentValues(tokens);
        return new CSSUnparsedValue(tokensToUnparsedSegments(componentValues));
      }
      try {
        const parsed = CSSStyleValue.parseAll(property, val);
        return parsed.length > 0 ? parsed[0] : null;
      } catch (e) {
        return new CSSStyleValue(val, privateToken);
      }
    }
  }

  has(property: string): boolean {
    validateProperty(property);
    const shorthand = SHORTHANDS[property];
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      if (shorthand) {
        return shorthand.longhands.every(lh => declarations.some(d => d.name === lh));
      }
      return declarations.some((d: Declaration) => d.name === property);
    } else {
      if (shorthand) {
        return shorthand.longhands.every(lh => this._style.getPropertyValue(lh) !== '');
      }
      return this._style.getPropertyValue(property) !== '';
    }
  }

  getAll(property: string): CSSStyleValue[] {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getAllRaw(property);
    for (const val of res) {
      val._associatedProperty = propKey;
    }
    return res;
  }

  protected _getAllRaw(property: string): CSSStyleValue[] {
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      const decl = declarations.find((d: Declaration) => d.name === property);
      if (!decl) return [];
      if (property.startsWith('--')) {
        return [new CSSUnparsedValue(tokensToUnparsedSegments(decl.value))];
      }
      const serialized = serialize(decl.value).trim();
      try {
        return CSSStyleValue.parseAll(property, serialized);
      } catch (e) {
        return [new CSSStyleValue(serialized, privateToken)];
      }
    } else {
      const val = this._style.getPropertyValue(property);
      if (val === '') return [];
      if (property.startsWith('--')) {
        const tokens = tokenize(val);
        const componentValues = ParseHooks.parseComponentValues(tokens);
        return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
      }
      try {
        return CSSStyleValue.parseAll(property, val);
      } catch (e) {
        return [new CSSStyleValue(val, privateToken)];
      }
    }
  }
}

function getPropertyValueSafe(style: unknown, property: string): string {
  if (!style || typeof style !== 'object') return '';
  if ('getPropertyValue' in style && typeof (style as { getPropertyValue: unknown }).getPropertyValue === 'function') {
    return (style as { getPropertyValue: (prop: string) => string }).getPropertyValue(property);
  }
  return '';
}

function setPropertySafe(style: unknown, _element: unknown, property: string, value: string | null): void {
  if (!style || typeof style !== 'object') return;
  if (value !== null) {
    if ('setProperty' in style && typeof (style as { setProperty: unknown }).setProperty === 'function') {
      (style as { setProperty: (prop: string, val: string) => void }).setProperty(property, value);
    }
  } else {
    if ('removeProperty' in style && typeof (style as { removeProperty: unknown }).removeProperty === 'function') {
      (style as { removeProperty: (prop: string) => void }).removeProperty(property);
    }
  }
}



function getShorthandForLonghand(longhand: string): string | null {
  for (const [shorthand, data] of Object.entries(SHORTHANDS)) {
    if (data.longhands.includes(longhand)) {
      return shorthand;
    }
  }
  return null;
}

const styleCache = new WeakMap<object, Map<string, CSSStyleValue[]>>();

function getStyleCache(style: unknown): Map<string, CSSStyleValue[]> {
  if (!style || typeof style !== 'object') return new Map();
  try {
    let cache = styleCache.get(style as object);
    if (!cache) {
      cache = new Map<string, CSSStyleValue[]>();
      styleCache.set(style as object, cache);
    }
    return cache;
  } catch (e) {
    return new Map();
  }
}

function isEquivalent(a: string, b: string): boolean {
  const clean = (s: unknown) => (typeof s === 'string' ? s : String(s || '')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  return clean(a) === clean(b);
}

let dummyStyle: CSSStyleDeclaration | null = null;
function getDummyStyle(): CSSStyleDeclaration {
  if (!dummyStyle) {
    if (typeof globalThis.document === 'undefined') {
      return {
        cssText: '',
        length: 0,
        setProperty() {},
        getPropertyValue() { return ''; },
        removeProperty() {},
        item() { return ''; }
      } as unknown as CSSStyleDeclaration;
    }
    dummyStyle = globalThis.document.createElement('div').style;
  }
  return dummyStyle;
}

function shouldWrapInCalc(property: string, val: CSSUnitValue): boolean {
  const propLower = property.toLowerCase();
  if (propLower.startsWith('--')) return false;

  const temp = getDummyStyle();

  // Test raw
  temp.cssText = '';
  try {
    temp.setProperty(property, val.toString());
    if (temp.getPropertyValue(property) !== '') {
      return false;
    }
  } catch (e) {}

  // Test calc
  temp.cssText = '';
  try {
    temp.setProperty(property, `calc(${val.toString()})`);
    return temp.getPropertyValue(property) !== '';
  } catch (e) {}

  return false;
}

// css-typed-om § 3.2 #the-stylepropertymap
function validateValuesForProperty(property: string, values: (CSSStyleValue | string)[]): string {
  validateProperty(property);
  const propKey = property.startsWith('--') ? property : property.toLowerCase();
  const isList = LIST_PROPERTIES.has(propKey);

  if (!isList && values.length > 1) {
    throw new TypeError(`Property ${property} is not list-valued and cannot accept multiple values`);
  }

  if (values.length > 1) {
    for (const val of values) {
      if (val instanceof CSSUnparsedValue) {
        throw new TypeError('Cannot mix CSSUnparsedValue with other values');
      }
      if (typeof val === 'string' && val.toLowerCase().includes('var(')) {
        throw new TypeError('Cannot mix variable references with other values');
      }
    }
  }

  const syntax = propKey.startsWith('--') ? PropertyRegistry.get(property)?.syntax : STANDARD_PROPERTIES_SYNTAX[propKey];

  const valStrings: string[] = [];
  for (const val of values) {
    if (typeof val === 'string') {
      if (!propKey.startsWith('--')) {
        try {
          CSSStyleValue.parseAll(property, val);
        } catch (e) {
          throw new TypeError(`Invalid value for property ${property}: ${val}`);
        }
      }
      valStrings.push(val);
    } else {
      if (val._associatedProperty !== null && val._associatedProperty !== propKey) {
        throw new TypeError(`CSSStyleValue is associated with ${val._associatedProperty}, not ${property}`);
      }
      if (syntax && !matchesStyleValueSyntax(val, syntax, propKey)) {
        throw new TypeError(`Invalid value of type ${val.constructor.name} for property ${property}`);
      }
      if (val instanceof CSSUnitValue) {
        if (shouldWrapInCalc(property, val)) {
          valStrings.push(`calc(${val.toString()})`);
        } else {
          valStrings.push(val.toString());
        }
      } else {
        valStrings.push(val.toString());
      }
    }
  }

  const finalString = valStrings.join(isList ? ', ' : ' ');

  if (!propKey.startsWith('--')) {
    try {
      CSSStyleValue.parseAll(property, finalString);
    } catch (e) {
      throw new TypeError(`Invalid value for property ${property}: ${finalString}`);
    }
  }

  return finalString;
}

export class StylePropertyMap extends StylePropertyMapReadOnly {
  declare protected _style: StyleLike;

  constructor(style: StyleLike, element?: unknown) {
    super(style, element);
  }

  protected override _getDeclarations(): Declaration[] {
    return this._style.declarations || [];
  }

  private _checkPendingSubstitution(property: string): void {
    const shorthand = getShorthandForLonghand(property);
    if (shorthand) {
      const shorthandVal = getPropertyValueSafe(this._style, shorthand);
      if (shorthandVal.includes('var(')) {
        throw new TypeError(`Property ${property} is a longhand of shorthand ${shorthand} which has a pending substitution`);
      }
    }
  }

  override get(property: string): CSSStyleValue | undefined {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getRaw(property);
    if (res) {
      res._associatedProperty = propKey;
      return res;
    }
    return undefined;
  }

  protected override _getRaw(property: string): CSSStyleValue | null {
    const value = getPropertyValueSafe(this._style, property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    if (!value) {
      getStyleCache(this._style).delete(propKey);
      return null;
    }

    const cached = getStyleCache(this._style).get(propKey);
    if (cached && cached.length > 0) {
      const isList = LIST_PROPERTIES.has(propKey);
      const separator = isList ? ', ' : ' ';
      const cachedStr = cached.map(v => v.toString()).join(separator);
      if (isEquivalent(cachedStr, value)) {
        return cached[0];
      }
    }

    if (property.startsWith('--')) {
      const tokens = tokenize(value);
      const componentValues = ParseHooks.parseComponentValues(tokens);
      const res = new CSSUnparsedValue(tokensToUnparsedSegments(componentValues));
      getStyleCache(this._style).set(propKey, [res]);
      return res;
    }
    
    if (SHORTHANDS[property]) {
      const tokens = tokenize(value);
      const componentValues = ParseHooks.parseComponentValues(tokens);
      const res = new CSSUnparsedValue(tokensToUnparsedSegments(componentValues));
      getStyleCache(this._style).set(propKey, [res]);
      return res;
    }
    
    try {
      const parsed = CSSStyleValue.parseAll(property, value);
      if (parsed.length > 0) {
        getStyleCache(this._style).set(propKey, parsed);
        return parsed[0];
      }
      return null;
    } catch (e) {
      const res = new CSSStyleValue(value, privateToken);
      getStyleCache(this._style).set(propKey, [res]);
      return res;
    }
  }

  override getAll(property: string): CSSStyleValue[] {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getAllRaw(property);
    for (const val of res) {
      val._associatedProperty = propKey;
    }
    return res;
  }

  protected override _getAllRaw(property: string): CSSStyleValue[] {
    const value = getPropertyValueSafe(this._style, property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    if (!value) {
      getStyleCache(this._style).delete(propKey);
      return [];
    }

    const cached = getStyleCache(this._style).get(propKey);
    if (cached) {
      const isList = LIST_PROPERTIES.has(propKey);
      const separator = isList ? ', ' : ' ';
      const cachedStr = cached.map(v => v.toString()).join(separator);
      if (isEquivalent(cachedStr, value)) {
        return cached;
      }
    }

    if (property.startsWith('--')) {
      const tokens = tokenize(value);
      const componentValues = ParseHooks.parseComponentValues(tokens);
      const res = [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
      getStyleCache(this._style).set(propKey, res);
      return res;
    }
    
    try {
      const parsed = CSSStyleValue.parseAll(property, value);
      getStyleCache(this._style).set(propKey, parsed);
      return parsed;
    } catch (e) {
      const res = [new CSSStyleValue(value, privateToken)];
      getStyleCache(this._style).set(propKey, res);
      return res;
    }
  }

  override has(property: string): boolean {
    validateProperty(property);
    return getPropertyValueSafe(this._style, property) !== '';
  }

  set(property: string, ...values: (CSSStyleValue | string)[]): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    if (values.length === 0) {
      throw new TypeError(`set() on property ${property} requires at least one value.`);
    }
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const finalString = validateValuesForProperty(property, values);
    setPropertySafe(this._style, this._element, property, finalString);
    try {
      const parsed = CSSStyleValue.parseAll(property, finalString);
      getStyleCache(this._style).set(propKey, parsed);
    } catch (e) {
      getStyleCache(this._style).delete(propKey);
    }
  }

  // css-typed-om § 3.2 #dom-stylepropertymap-append
  append(property: string, ...values: (CSSStyleValue | string)[]): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    for (const val of values) {
      if (typeof val === 'string' && val.includes('var(')) {
        throw new TypeError("Cannot append CSSUnparsedValue or CSSVariableReferenceValue.");
      }
      if (val instanceof CSSUnparsedValue || val instanceof CSSVariableReferenceValue) {
        throw new TypeError("Cannot append CSSUnparsedValue or CSSVariableReferenceValue.");
      }
    }
    if (values.length === 0) {
      throw new TypeError(`append() on property ${property} requires at least one value.`);
    }
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    if (!LIST_PROPERTIES.has(propKey)) {
      throw new TypeError(`Property ${property} is not list-valued and cannot be appended to.`);
    }

    // Check if existing property contains a var() reference per css-typed-om § 3.2 step 7
    const current = getPropertyValueSafe(this._style, property);
    if (current && current.includes('var(')) {
      throw new TypeError(`Cannot append to property ${property} because it contains a var() reference.`);
    }
    const existingRaw = this._getRaw(property);
    if (existingRaw instanceof CSSUnparsedValue || existingRaw instanceof CSSVariableReferenceValue) {
      throw new TypeError(`Cannot append to property ${property} because it contains a var() reference.`);
    }

    const finalString = validateValuesForProperty(property, values);
    const newValue = current ? `${current}, ${finalString}` : finalString;

    if (!propKey.startsWith('--')) {
      try {
        CSSStyleValue.parseAll(property, newValue);
      } catch (e) {
        throw new TypeError(`Invalid combined value for property ${property}: ${newValue}`);
      }
    }

    setPropertySafe(this._style, this._element, property, newValue);
    try {
      const parsed = CSSStyleValue.parseAll(property, newValue);
      getStyleCache(this._style).set(propKey, parsed);
    } catch (e) {
      getStyleCache(this._style).delete(propKey);
    }
  }

  delete(property: string): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    setPropertySafe(this._style, this._element, property, null);
    getStyleCache(this._style).delete(propKey);
  }

  clear(): void {
    getStyleCache(this._style).clear();
    if (this._element && typeof this._element === 'object' && 'removeAttribute' in this._element && typeof this._element.removeAttribute === 'function') {
      (this._element.removeAttribute as (name: string) => void)('style');
    } else {
      const props = [];
      for (let i = 0; i < this._style.length; i++) {
        props.push(this._style.item(i));
      }
      for (const p of props) {
        setPropertySafe(this._style, this._element, p, null);
      }
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

function isLengthPercentage(type: CSSNumericType): boolean {
  const allowedKeys = ['length', 'percent', 'percentHint'];
  const t = type as Record<string, number | string | undefined>;
  for (const key of Object.keys(t)) {
    if (!allowedKeys.includes(key) && t[key] !== 0 && t[key] !== undefined) {
      return false;
    }
  }
  if (type.percentHint !== undefined && type.percentHint !== 'length') {
    return false;
  }
  const lengthVal = type.length || 0;
  const percentVal = type.percent || 0;
  return (lengthVal + percentVal) === 1;
}

// css-typed-om § 3.3 #positionvalue-objects
function validatePositionCoord(val: unknown, paramName: string): void {
  if (!isNumericValue(val)) {
    throw new TypeError(`${paramName} must be a CSSNumericValue`);
  }
  if (!isLengthPercentage(val.type())) {
    throw new TypeError(`${paramName} must be a <length-percentage>`);
  }
}

export class CSSPositionValue extends CSSStyleValue {
  private _x: CSSNumericValue;
  private _y: CSSNumericValue;

  constructor(x: CSSNumericValue, y: CSSNumericValue) {
    super();
    validatePositionCoord(x, 'x');
    validatePositionCoord(y, 'y');
    this._x = x;
    this._y = y;
  }

  get x(): CSSNumericValue {
    return this._x;
  }

  set x(val: CSSNumericValue) {
    validatePositionCoord(val, 'x');
    this._x = val;
  }

  get y(): CSSNumericValue {
    return this._y;
  }

  set y(val: CSSNumericValue) {
    validatePositionCoord(val, 'y');
    this._y = val;
  }

  serialize(): string {
    return `${this._x.serialize()} ${this._y.serialize()}`;
  }

  override toString(): string {
    return `${this._x.toString()} ${this._y.toString()}`;
  }
}

export { CSS } from './parser-api.ts';

setParseTransformListHook((str) => {
  try {
    const transformVal = CSSTransformValue.parse(str);
    const matrix = transformVal.toMatrix();
    // matrix.toFloat64Array() returns a column-major Float64Array.
    // The parseMatrixString fallback expects row-major. So we transpose it back to row-major!
    const colMajor = matrix.toFloat64Array();
    const rowMajor = new Float64Array(16);
    rowMajor[0] = colMajor[0];  rowMajor[1] = colMajor[4];  rowMajor[2] = colMajor[8];  rowMajor[3] = colMajor[12];
    rowMajor[4] = colMajor[1];  rowMajor[5] = colMajor[5];  rowMajor[6] = colMajor[9];  rowMajor[7] = colMajor[13];
    rowMajor[8] = colMajor[2];  rowMajor[9] = colMajor[6];  rowMajor[10] = colMajor[10]; rowMajor[11] = colMajor[14];
    rowMajor[12] = colMajor[3]; rowMajor[13] = colMajor[7]; rowMajor[14] = colMajor[11]; rowMajor[15] = colMajor[15];
    return { is2D: matrix.is2D, values: rowMajor };
  } catch (err) {
    throw new DOMException(`Failed to parse transform list: "${str}"`, 'SyntaxError');
  }
});
