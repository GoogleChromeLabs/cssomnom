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

import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnparsedValue } from '../values/CSSUnparsedValue.ts';
import { CSSVariableReferenceValue } from '../values/CSSVariableReferenceValue.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSPositionValue } from '../position/CSSPositionValue.ts';
import { CSSTransformComponent } from '../transform/CSSTransformComponent.ts';
import { CSSTransformValue } from '../transform/CSSTransformValue.ts';
import { CSSColorValue } from '../color/CSSColorValue.ts';
import { CSSImageValue } from '../values/CSSImageValue.ts';
import { PropertyRegistry } from '../../PropertyRegistry.ts';
import { STANDARD_PROPERTIES_SYNTAX } from '../../data/gen/standard-syntax.ts';
import { SHORTHANDS } from '../../shorthands.ts';
import { NAMED_COLORS } from '../../data/gen/colors.ts';
import { validateProperty } from '../utils/validation.ts';
import {
  matchesLength,
  matchesPercentage,
  matchesLengthPercentage,
  matchesNumber,
  matchesAngle,
  matchesTime,
  matchesFrequency,
  matchesResolution,
  matchesFlex
} from '../utils/type-guards.ts';

export const LIST_PROPERTIES = new Set([
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

export const POSITION_PROPERTIES = new Set([
  'background-position',
  'object-position',
  'transform-origin',
  'perspective-origin',
  'offset-position',
  'offset-anchor',
  'mask-position',
  '-webkit-mask-position',
]);

export const COLOR_PROPERTIES = new Set([
  'color', 'background-color',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-inline-color', 'border-inline-start-color', 'border-inline-end-color',
  'border-block-color', 'border-block-start-color', 'border-block-end-color',
  'outline-color', 'text-decoration-color', 'text-emphasis-color', 'column-rule-color', 'caret-color', 'accent-color',
  'flood-color', 'lighting-color', 'stop-color', 'fill', 'stroke'
]);

export function getPropertyValueSafe(style: unknown, property: string): string {
  if (!style || typeof style !== 'object') return '';
  if ('getPropertyValue' in style && typeof (style as { getPropertyValue: unknown }).getPropertyValue === 'function') {
    return (style as { getPropertyValue: (prop: string) => string }).getPropertyValue(property);
  }
  return '';
}

export function setPropertySafe(style: unknown, _element: unknown, property: string, value: string | null): void {
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

export function getShorthandForLonghand(longhand: string): string | null {
  for (const [shorthand, data] of Object.entries(SHORTHANDS)) {
    if (data.longhands.includes(longhand)) {
      return shorthand;
    }
  }
  return null;
}

const styleCache = new WeakMap<object, Map<string, CSSStyleValue[]>>();

export function getStyleCache(style: unknown): Map<string, CSSStyleValue[]> {
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

export function isEquivalent(a: string, b: string): boolean {
  const clean = (s: unknown) => (typeof s === 'string' ? s : String(s || '')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  return clean(a) === clean(b);
}

interface DummyStyle {
  cssText: string;
  getPropertyValue(p: string): string;
  setProperty(p: string, v: string): void;
}

let dummyStyle: DummyStyle | null = null;
export function getDummyStyle(): DummyStyle {
  if (!dummyStyle) {
    if (typeof globalThis.document === 'undefined') {
      return {
        cssText: '',
        setProperty() {},
        getPropertyValue() { return ''; },
      };
    }
    dummyStyle = globalThis.document.createElement('div').style;
  }
  return dummyStyle;
}

export function shouldWrapInCalc(property: string, val: CSSUnitValue): boolean {
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

// Spec: CSS Typed OM Level 1 § 3.2 #the-stylepropertymap
// Spec: CSS Properties and Values API Level 1 § 3 #syntax-strings
export function matchesStyleValueSyntax(value: CSSStyleValue, syntax: string, propKey: string): boolean {
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

// Spec: CSS Typed OM Level 1 § 3.2 #the-stylepropertymap
export function validateValuesForProperty(property: string, values: (CSSStyleValue | string)[]): string {
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
