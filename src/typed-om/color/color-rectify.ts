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

import type { CSSNumericType } from '../numeric/CSSNumericType.ts';

function rectifyColorComponent(
  v: unknown,
  numUnit: 'percent' | 'number' | 'deg',
  numScale: number,
  matches: (type: CSSNumericType) => boolean,
  label: string,
  allowUndefined = false,
): CSSNumericValue | CSSKeywordValue {
  if (typeof v === 'number') return new CSSUnitValue(v * numScale, numUnit);
  if (allowUndefined && v === undefined) return new CSSKeywordValue('undefined');
  const val = typeof v === 'string' ? new CSSKeywordValue(v) : v;
  if (val instanceof CSSNumericValue && matches(val.type())) return val;
  if (val instanceof CSSKeywordValue) {
    const kw = val.value.toLowerCase();
    if (kw === 'none' || (allowUndefined && kw === 'undefined')) return val;
  }
  throw new DOMException(`Invalid ${label} value`, 'SyntaxError');
}

const matchesNumberOrPercent = (t: CSSNumericType) => matchesNumber(t) || matchesPercentage(t);

// css-typed-om #cssrgb #rectify-a-csscolorrgbcomp
export const rectifyColorRGBComp = (v: unknown) => rectifyColorComponent(v, 'percent', 100, matchesNumberOrPercent, 'CSSColorRGBComp');
// css-typed-om #cssrgb #rectify-a-csscolorpercent
export const rectifyColorPercent = (v: unknown) => rectifyColorComponent(v, 'percent', 100, matchesPercentage, 'CSSColorPercent');
// css-typed-om #cssrgb #rectify-a-csscolornumber
export const rectifyColorNumber = (v: unknown) => rectifyColorComponent(v, 'number', 1, matchesNumber, 'CSSColorNumber');
// css-typed-om #cssrgb #rectify-a-csscolorangle
export const rectifyColorAngle = (v: unknown) => rectifyColorComponent(v, 'deg', 1, matchesAngle, 'CSSColorAngle', true);
export const rectifyColorNumberOrPercent = (v: unknown) => rectifyColorComponent(v, 'number', 1, matchesNumberOrPercent, 'CSSColor channel');
