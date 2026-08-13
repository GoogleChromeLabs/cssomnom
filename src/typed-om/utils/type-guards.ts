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
import type { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import type { CSSKeywordValue } from '../values/CSSKeywordValue.ts';

export function isNumericValue(val: unknown): val is CSSNumericValue {
  if (!val || typeof val !== 'object') return false;
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSNumericValue as unknown as { prototype: unknown }) || undefined;
  if (Cls && val instanceof (Cls as unknown as Function)) return true;
  return typeof (val as CSSNumericValue).type === 'function' && typeof (val as CSSNumericValue).toSum === 'function';
}

export function isKeywordValue(val: unknown): val is CSSKeywordValue {
  if (!val || typeof val !== 'object') return false;
  const Cls = (typeof globalThis !== 'undefined' && (globalThis as unknown as Record<string, unknown>).CSSKeywordValue as unknown as { prototype: unknown }) || undefined;
  if (Cls && val instanceof (Cls as unknown as Function)) return true;
  return typeof (val as CSSKeywordValue).value === 'string' && (val as { constructor: { name: string } }).constructor?.name === 'CSSKeywordValue';
}

export function matchesLength(type: CSSNumericType): boolean {
  return (type.length || 0) === 1 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'length');
}

export function matchesPercentage(type: CSSNumericType): boolean {
  return (type.percent || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined);
}

export function matchesLengthPercentage(type: CSSNumericType): boolean {
  return matchesLength(type) || matchesPercentage(type);
}

export function matchesNumber(type: CSSNumericType): boolean {
  return (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined);
}

export function matchesAngle(type: CSSNumericType): boolean {
  return (type.angle || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'angle');
}

export function matchesTime(type: CSSNumericType): boolean {
  return (type.time || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'time');
}

export function matchesFrequency(type: CSSNumericType): boolean {
  return (type.frequency || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'frequency');
}

export function matchesResolution(type: CSSNumericType): boolean {
  return (type.resolution || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.flex || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'resolution');
}

export function matchesFlex(type: CSSNumericType): boolean {
  return (type.flex || 0) === 1 &&
         (type.length || 0) === 0 &&
         (type.angle || 0) === 0 &&
         (type.time || 0) === 0 &&
         (type.frequency || 0) === 0 &&
         (type.resolution || 0) === 0 &&
         (type.percent || 0) === 0 &&
         (type.percentHint === null || type.percentHint === undefined || type.percentHint === 'flex');
}

export function isLengthPercentage(type: CSSNumericType): boolean {
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
