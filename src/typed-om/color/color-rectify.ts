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

import type { CSSNumericType } from '../numeric/CSSNumericType.ts';
import type { CSSUnit } from '../../data/gen/units.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import {
  isNumericValue,
  isKeywordValue,
  matchesNumber,
  matchesPercentage,
  matchesAngle
} from '../utils/type-guards.ts';
import { createUnitValue, createKeywordValue } from '../utils/formatting.ts';

interface RectifyOptions {
  name: string;
  numberToUnit: (v: number) => CSSUnitValue;
  validateNumeric: (type: CSSNumericType) => boolean;
  allowUndefined?: boolean;
  undefinedAsSyntaxError?: boolean;
}

const SIMPLE_NUMERIC = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-zA-Z%]*)$/;

export function rectifyColorChannel(
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

export function rectifyColorRGBComp(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorRGBComp',
    numberToUnit: (num) => createUnitValue(num * 100, 'percent'),
    validateNumeric: (t) => matchesNumber(t) || matchesPercentage(t),
    undefinedAsSyntaxError: true
  });
}

export function rectifyColorPercent(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorPercent',
    numberToUnit: (num) => createUnitValue(num * 100, 'percent'),
    validateNumeric: matchesPercentage,
    undefinedAsSyntaxError: true
  });
}

export function rectifyColorNumber(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorNumber',
    numberToUnit: (num) => createUnitValue(num, 'number'),
    validateNumeric: matchesNumber
  });
}

export function rectifyColorNumberOrPercent(v: number | string | CSSNumericValue | CSSKeywordValue): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColor channel',
    numberToUnit: (num) => createUnitValue(num, 'number'),
    validateNumeric: (t) => matchesNumber(t) || matchesPercentage(t)
  });
}

export function rectifyColorAngle(v: number | string | CSSNumericValue | CSSKeywordValue, allowUndefined = false): CSSNumericValue | CSSKeywordValue {
  return rectifyColorChannel(v, {
    name: 'CSSColorAngle',
    numberToUnit: (num) => createUnitValue(num, 'deg'),
    validateNumeric: matchesAngle,
    allowUndefined
  });
}
