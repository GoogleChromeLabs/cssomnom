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

import type { ComponentValue, IdentToken, CSSFunction } from '../../types.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';
import { serialize } from '../../serializer.ts';
import { matchesSyntax, PropertyRegistry } from '../../PropertyRegistry.ts';
import { SHORTHANDS } from '../../shorthands.ts';
import { SHORTHANDS_DATA } from '../../data/gen/shorthands.ts';
import { SUPPORTED_PROPERTIES } from '../../data/gen/property-list.ts';
import { STANDARD_PROPERTIES_SYNTAX } from '../../data/gen/standard-syntax.ts';
import { privateToken, hasVarFunction, isCSSFunction } from '../utils/validation.ts';
import { CSSStyleValue } from './CSSStyleValue.ts';
import { CSSKeywordValue } from './CSSKeywordValue.ts';
import { CSSUnparsedValue, tokensToUnparsedSegments } from './CSSUnparsedValue.ts';
import { createCSSStyleValue } from './style-value-factory.ts';
import { tryParsePosition } from '../position/position-parser.ts';
import { CSSTransformValue } from '../transform/CSSTransformValue.ts';
import { parseTranslate, parseRotate, parseScale } from '../transform/transform-parser.ts';
import { CSSColorValue } from '../color/CSSColorValue.ts';
import { POSITION_PROPERTIES, COLOR_PROPERTIES, LIST_PROPERTIES } from '../style-map/style-validation.ts';
import { NAMED_COLORS } from '../../data/gen/colors.ts';

import { parseMathFunction } from '../../math-parser.ts';

function shouldFallbackToCSSStyleValue(property: string, css: string): boolean {
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

function validateMathFunctions(tokens: ComponentValue[]): boolean {
  for (const t of tokens) {
    if (isCSSFunction(t)) {
      const nameLower = t.name.toLowerCase();
      if (['calc', 'min', 'max', 'clamp'].includes(nameLower)) {
        if (!hasVarFunction(t.value)) {
          try {
            const parsed = parseMathFunction(t.name, t.value);
            if (!parsed) return false;
          } catch {
            return false;
          }
        }
      }
      if (!validateMathFunctions(t.value)) return false;
    } else if (t.type === 'simple-block' && Array.isArray(t.value)) {
      if (!validateMathFunctions(t.value)) return false;
    }
  }
  return true;
}

function createValueFromTokens(values: ComponentValue[], property?: string): CSSStyleValue {
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

export function parseAllStyleValues(property: string, css: string): CSSStyleValue[] {
  if (arguments.length < 2) {
    throw new TypeError("Failed to execute 'parseAll' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
  }
  if (typeof property !== 'string' || property === '') {
    throw new TypeError("Invalid property name: property must be a non-empty string");
  }
  if (property === '--' || (property.startsWith('--') && property.length < 3)) {
    throw new TypeError(`Invalid property name: '${property}'`);
  }
  if (!property.startsWith('--') && !SUPPORTED_PROPERTIES.has(property.toLowerCase())) {
    throw new TypeError(`Invalid or unsupported property name: '${property}'`);
  }
  const results = _parseAll(property, css);
  if (results.length === 0) {
    throw new TypeError(`Invalid value for property '${property}': '${css}'`);
  }
  const propKey = property.startsWith('--') ? property : property.toLowerCase();
  for (const val of results) {
    val._associatedProperty = propKey;
  }
  return results;
}

function _parseAll(property: string, css: string): CSSStyleValue[] {
  if (property === '--' || (property.startsWith('--') && property.length < 3)) {
    throw new TypeError(`Invalid property name: '${property}'`);
  }
  if (typeof css !== 'string' || css.trim() === '') {
    throw new TypeError(`Invalid empty value for property '${property}'`);
  }
  const tokens = tokenize(css);
  if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
    throw new TypeError(`Invalid CSS token in '${css}'`);
  }
  const componentValues = ParseHooks.parseComponentValues(tokens);
  const trimmed = componentValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');

  if (trimmed.length === 0) {
    throw new TypeError(`Invalid empty value for property '${property}'`);
  }

  if (!validateMathFunctions(componentValues)) {
    throw new TypeError(`Invalid math function in value: ${css}`);
  }

  const isCSSWideKeyword = trimmed.length === 1 && trimmed[0].type === 'ident' &&
    ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes((trimmed[0] as IdentToken).value.toLowerCase());

  if (isCSSWideKeyword) {
    return [new CSSKeywordValue((trimmed[0] as IdentToken).value)];
  }

  if (shouldFallbackToCSSStyleValue(property, css)) {
    return [new CSSStyleValue(css, privateToken)];
  }

  const propLower = property.toLowerCase();

  if (hasVarFunction(trimmed)) {
    return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
  }

  if (property.startsWith('--')) {
    const reg = PropertyRegistry.get(property);
    if (!reg) {
      return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
    }
  }

  if (POSITION_PROPERTIES.has(propLower)) {
    const posVal = tryParsePosition(trimmed, property);
    if (posVal) return [posVal];
    return [new CSSStyleValue(css.trim(), privateToken)];
  }

  if (propLower === 'transform') {
    if (trimmed.length === 1 && trimmed[0].type === 'ident' && trimmed[0].value.toLowerCase() === 'none') {
      return [new CSSKeywordValue('none')];
    }
    return [CSSTransformValue.parse(css)];
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
      .map(seg => createValueFromTokens(seg, property));
  }

  if (trimmed.length === 1 && trimmed[0].type === 'ident') {
    const v = trimmed[0].value.toLowerCase();
    if (['initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(v)) {
      return [new CSSKeywordValue(trimmed[0].value)];
    }
  }
  if (trimmed.length === 1 && trimmed[0].type === 'function') {
    const fnName = ('name' in trimmed[0] ? (trimmed[0] as { name?: string }).name : ('value' in trimmed[0] ? (trimmed[0] as { value?: string }).value : ''))?.toString().toLowerCase();
    if (fnName === 'var') {
      return [new CSSUnparsedValue(tokensToUnparsedSegments(trimmed))];
    }
  }

  let syntax: string | undefined = STANDARD_PROPERTIES_SYNTAX[propLower];
  if (!syntax && property.startsWith('--')) {
    syntax = PropertyRegistry.get(property)?.syntax;
  }

  const LOGICAL_2VAL_PROPERTIES = new Set([
    'margin-block', 'margin-inline',
    'padding-block', 'padding-inline',
    'inset-block', 'inset-inline',
    'border-block-width', 'border-inline-width',
    'border-block-style', 'border-inline-style',
    'border-block-color', 'border-inline-color'
  ]);

  const shorthand = SHORTHANDS[propLower];
  if (shorthand && !hasVarFunction(trimmed)) {
    const expanded = shorthand.expand(trimmed);
    if (expanded === null) {
      throw new TypeError(`Invalid value for shorthand property ${property}: ${css}`);
    }
    if (!LOGICAL_2VAL_PROPERTIES.has(propLower)) {
      return [new CSSStyleValue(css.trim(), privateToken)];
    }
  }

  if (propLower in SHORTHANDS_DATA && !hasVarFunction(trimmed)) {
    const parsed = ParseHooks.parseStyleAttribute(tokenize(`${property}: ${css}`));
    if (parsed.declarations.length === 0) {
      throw new TypeError(`Invalid value for shorthand property ${property}: ${css}`);
    }
    if (!LOGICAL_2VAL_PROPERTIES.has(propLower)) {
      return [new CSSStyleValue(css.trim(), privateToken)];
    }
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
    if (trimmed.length === 1 && trimmed[0].type === 'ident') {
      const kw = (trimmed[0] as IdentToken).value.toLowerCase();
      const syntax = STANDARD_PROPERTIES_SYNTAX[propLower];
      if (
        kw in NAMED_COLORS ||
        kw === 'currentcolor' ||
        kw === 'transparent' ||
        kw === 'auto' ||
        kw === 'invert' ||
        kw === 'none' ||
        (syntax && syntax.split('|').map(s => s.trim().toLowerCase()).includes(kw))
      ) {
        return [new CSSKeywordValue((trimmed[0] as IdentToken).value)];
      }
    }
    try {
      return [CSSColorValue.parse(css)];
    } catch {
      throw new TypeError(`Invalid value for color property ${property}: ${css}`);
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
          results.push(createValueFromTokens(current, property));
          current = [];
        }
      } else {
        current.push(v);
      }
    }
    if (current.length > 0) {
      results.push(createValueFromTokens(current, property));
    }
  } else {
    if (componentValues.length > 0) {
      results.push(createValueFromTokens(componentValues, property));
    }
  }

  return results;
}

export function parseStyleValue(property: string, css: string): CSSStyleValue {
  if (arguments.length < 2) {
    throw new TypeError("Failed to execute 'parse' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
  }
  const all = parseAllStyleValues(property, css);
  if (all.length === 0) {
    throw new TypeError(`Invalid value for property ${property}: ${css}`);
  }
  return all[0];
}

CSSStyleValue.parseAll = parseAllStyleValues;
CSSStyleValue.parse = parseStyleValue;

ParseHooks.validatePropertyValue = (property: string, value: string): boolean => {
  if (property.startsWith('--')) return true;
  const lowerProp = property.toLowerCase();
  if (!SUPPORTED_PROPERTIES.has(lowerProp)) return true;
  const lowerVal = value.trim().toLowerCase();
  if (['initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(lowerVal)) return true;
  if (lowerVal.includes('var(') || lowerVal.includes('calc(') || lowerVal.includes('env(') || lowerVal.includes('attr(')) return true;

  const tokens = tokenize(value).filter(t => t.type !== 'whitespace' && t.type !== 'EOF');
  if (tokens.length === 0 || tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) return false;

  // Reject unitless non-zero numbers on length properties (e.g. width: -100 or width: 100)
  if (tokens.length === 1 && tokens[0].type === 'number' && tokens[0].value !== 0) {
    const syntax = STANDARD_PROPERTIES_SYNTAX[lowerProp] || '';
    if (!syntax.includes('<number>') && !syntax.includes('<integer>') && !syntax.includes('<flex>')) {
      return false;
    }
  }

  // Reject negative dimensions on non-negative properties
  if (tokens.length === 1 && tokens[0].type === 'dimension' && (tokens[0] as { value?: number }).value !== undefined && (tokens[0] as { value: number }).value < 0) {
    const syntax = STANDARD_PROPERTIES_SYNTAX[lowerProp] || '';
    if (syntax.includes('[0,∞]') || syntax.includes('[0,') || syntax.includes('[0.0,')) {
      return false;
    }
  }

  return true;
};



