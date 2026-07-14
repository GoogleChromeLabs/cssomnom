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

export function deleteRuleFromArray(rules: Rule[], index: number): void {
  if (index < 0 || index >= rules.length) {
    throw new DOMException('Index size error', 'IndexSizeError');
  }
  rules.splice(index, 1);
}
