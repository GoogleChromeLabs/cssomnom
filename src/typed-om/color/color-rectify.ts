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

import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import {
  matchesNumber,
  matchesPercentage,
  matchesAngle
} from '../utils/type-guards.ts';

// Spec: CSS Typed OM Level 1 § 8.1 #rectify-a-csscolorrgbcomp
export function rectifyColorRGBComp(v: unknown): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') {
    return new CSSUnitValue(v * 100, 'percent');
  }
  if (typeof v === 'string') {
    v = new CSSKeywordValue(v);
  }
  if (v instanceof CSSNumericValue) {
    if (matchesNumber(v.type()) || matchesPercentage(v.type())) {
      return v;
    }
  } else if (v instanceof CSSKeywordValue) {
    if (v.value.toLowerCase() === 'none') {
      return v;
    }
  }
  throw new DOMException('Invalid CSSColorRGBComp value', 'SyntaxError');
}

// Spec: CSS Typed OM Level 1 § 8.1 #rectify-a-csscolorpercent
export function rectifyColorPercent(v: unknown): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') {
    return new CSSUnitValue(v * 100, 'percent');
  }
  if (typeof v === 'string') {
    v = new CSSKeywordValue(v);
  }
  if (v instanceof CSSNumericValue) {
    if (matchesPercentage(v.type())) {
      return v;
    }
  } else if (v instanceof CSSKeywordValue) {
    if (v.value.toLowerCase() === 'none') {
      return v;
    }
  }
  throw new DOMException('Invalid CSSColorPercent value', 'SyntaxError');
}

// Spec: CSS Typed OM Level 1 § 8.1 #rectify-a-csscolornumber
export function rectifyColorNumber(v: unknown): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') {
    return new CSSUnitValue(v, 'number');
  }
  if (typeof v === 'string') {
    v = new CSSKeywordValue(v);
  }
  if (v instanceof CSSNumericValue) {
    if (matchesNumber(v.type())) {
      return v;
    }
  } else if (v instanceof CSSKeywordValue) {
    if (v.value.toLowerCase() === 'none') {
      return v;
    }
  }
  throw new DOMException('Invalid CSSColorNumber value', 'SyntaxError');
}

// Spec: CSS Typed OM Level 1 § 8.1 #rectify-a-csscolorangle
export function rectifyColorAngle(v: unknown): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') {
    return new CSSUnitValue(v, 'deg');
  }
  if (v === undefined) {
    return new CSSKeywordValue('undefined');
  }
  if (typeof v === 'string') {
    v = new CSSKeywordValue(v);
  }
  if (v instanceof CSSNumericValue) {
    if (matchesAngle(v.type())) {
      return v;
    }
  } else if (v instanceof CSSKeywordValue) {
    if (v.value.toLowerCase() === 'none' || v.value.toLowerCase() === 'undefined') {
      return v;
    }
  }
  throw new DOMException('Invalid CSSColorAngle value', 'SyntaxError');
}

export function rectifyColorNumberOrPercent(v: unknown): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') {
    return new CSSUnitValue(v, 'number');
  }
  if (typeof v === 'string') {
    v = new CSSKeywordValue(v);
  }
  if (v instanceof CSSNumericValue) {
    if (matchesNumber(v.type()) || matchesPercentage(v.type())) {
      return v;
    }
  } else if (v instanceof CSSKeywordValue) {
    if (v.value.toLowerCase() === 'none') {
      return v;
    }
  }
  throw new DOMException('Invalid CSSColor channel value', 'SyntaxError');
}
