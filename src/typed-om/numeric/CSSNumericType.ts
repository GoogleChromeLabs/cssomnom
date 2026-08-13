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

// Spec: CSS Typed OM Level 1 § 4.1 #numeric-typing
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

export function applyPercentHint(type: CSSNumericType, hint: string): CSSNumericType {
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

export function addTypes(a: CSSNumericType, b: CSSNumericType): CSSNumericType {
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

export function addTypesForSum(a: CSSNumericType, b: CSSNumericType): CSSNumericType | null {
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
