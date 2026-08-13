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

import type { CSSUnit } from '../../data/gen/units.ts';
import type { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import type { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSKeywordValue as CSSKeywordValueClass } from '../values/CSSKeywordValue.ts';

export function createUnitValue(value: number, unit: CSSUnit): CSSUnitValue {
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSUnitValue as typeof CSSUnitValue) || CSSUnitValue;
  return new Cls(value, unit);
}

export function createKeywordValue(value: string): CSSKeywordValue {
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSKeywordValue as typeof CSSKeywordValueClass) || CSSKeywordValueClass;
  return new Cls(value);
}

export function ensureNumeric(v: number | CSSNumericValue): CSSNumericValue {
  if (typeof v === 'number') return createUnitValue(v, 'number');
  return v;
}

export function stripOuterParens(s: string): string {
  if (!s.startsWith('(') || !s.endsWith(')')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    if (depth === 0 && i < s.length - 1) return s;
  }
  return s.substring(1, s.length - 1);
}

export function isAlphaUnity(alpha: CSSNumericValue | CSSKeywordValue): boolean {
  if (alpha instanceof CSSUnitValue) {
    return (alpha.unit === 'percent' && alpha.value === 100) || (alpha.unit === 'number' && alpha.value === 1);
  }
  return false;
}

export function formatAlpha(alpha: CSSNumericValue | CSSKeywordValue): string {
  if (alpha instanceof CSSUnitValue && alpha.unit === 'percent') {
    return String(alpha.value / 100);
  }
  return alpha.toString();
}
