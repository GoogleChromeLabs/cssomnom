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

import type { CSSNumericValue } from './CSSNumericValue.ts';

// Spec: CSS Typed OM Level 1 § 4.3 #numeric-array
export class CSSNumericArray {
  [index: number]: CSSNumericValue;
  private _values: readonly CSSNumericValue[];

  constructor(values: CSSNumericValue[]) {
    this._values = [...values];
    Object.freeze(this._values);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target._values[index];
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  get length(): number { return this._values.length; }
  [Symbol.iterator]() { return this._values[Symbol.iterator](); }
  entries(): IterableIterator<[number, CSSNumericValue]> { return this._values.entries(); }
  keys(): IterableIterator<number> { return this._values.keys(); }
  values(): IterableIterator<CSSNumericValue> { return this._values.values(); }
  forEach(callback: (value: CSSNumericValue, index: number) => void, thisArg?: unknown): void {
    this._values.forEach(callback, thisArg);
  }
  item(index: number): CSSNumericValue | undefined { return this._values[index]; }
  map<U>(callback: (value: CSSNumericValue, index: number) => U): U[] {
    return this._values.map(callback);
  }
  every(callback: (value: CSSNumericValue, index: number) => boolean): boolean {
    return this._values.every(callback);
  }
}
