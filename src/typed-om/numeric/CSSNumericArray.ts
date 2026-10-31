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
import { applyValueIterable } from '../../webidl.ts';

// css-typed-om #cssnumericarray
export class CSSNumericArray {
  [index: number]: CSSNumericValue;
  private _values: readonly CSSNumericValue[];
  declare [Symbol.iterator]: () => IterableIterator<CSSNumericValue>;
  declare entries: () => IterableIterator<[number, CSSNumericValue]>;
  declare keys: () => IterableIterator<number>;
  declare values: () => IterableIterator<CSSNumericValue>;
  declare forEach: (callback: (value: CSSNumericValue, index: number, parent: CSSNumericArray) => void, thisArg?: unknown) => void;

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
      },
      has(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return index >= 0 && index < target._values.length;
        }
        return Reflect.has(target, prop);
      }
    });
  }

  get length(): number { return this._values.length; }
}

applyValueIterable(CSSNumericArray);
