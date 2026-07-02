/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
