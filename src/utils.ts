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
import type { Rule } from './types.ts';

export function camelToDashed(str: string): string {
  return str.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).replace(/^ms-/, '-ms-');
}

export function createIndexedProxy<T extends object, V, R = V>(
  target: T,
  getArray: (t: T) => V[],
  mapValue: (v: V) => R = (v) => v as unknown as R
) {
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop);
        const arr = getArray(t);
        const val = arr[index];
        return val !== undefined ? mapValue(val) : undefined;
      }
      return (t as unknown as Record<string | symbol, unknown>)[prop];
    }
  });
}

// cssom-1 § 6.5.4 #remove-a-css-rule
export function deleteRuleFromArray(rules: Rule[], index: number): Rule {
  // 1. Set length to the number of items in list.
  // 2. If index is greater than or equal to length (or index < 0), throw IndexSizeError.
  if (index < 0 || index >= rules.length) {
    throw new DOMException('Index size error', 'IndexSizeError');
  }
  // 3. Set old rule to the indexth item in list.
  const oldRule = rules[index];
  // 5. Remove rule old rule from list at zero-indexed position index.
  rules.splice(index, 1);
  // 6. Set old rule's parent CSS rule and parent CSS style sheet to null.
  if (oldRule && typeof oldRule === 'object') {
    if ('parentRule' in oldRule) {
      (oldRule as { parentRule: unknown }).parentRule = null;
    }
    if ('parentStyleSheet' in oldRule) {
      (oldRule as { parentStyleSheet: unknown }).parentStyleSheet = null;
    }
  }
  return oldRule;
}

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

export function angleFromVector(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  return Math.atan2(y, x) * RAD_TO_DEG;
}

