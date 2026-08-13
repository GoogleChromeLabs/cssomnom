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

import type { ComponentValue, Token, CSSFunction } from '../../types.ts';
import { SUPPORTED_PROPERTIES } from '../../data/gen/property-list.ts';

export const privateToken = Symbol.for('cssomnom-private-token');

export function validateProperty(property: string): void {
  if (!property.startsWith('--') && !SUPPORTED_PROPERTIES.has(property.toLowerCase())) {
    throw new TypeError(`Invalid property name "${property}"`);
  }
}

export function compareStrings(a: string, b: string): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

export function checkBrand(obj: unknown, cls: Function): void {
  if (!(obj instanceof cls)) {
    throw new TypeError('Illegal invocation');
  }
}

export function isToken(val: ComponentValue): val is Token {
  const type = typeof (val as { value: unknown }).value;
  return type === 'string' || type === 'number';
}

export function isCSSFunction(val: ComponentValue): val is CSSFunction {
  return typeof val === 'object' && val !== null && 'type' in val && val.type === 'function' && 'name' in val && Array.isArray(val.value);
}

export function hasVarFunction(values: ComponentValue[]): boolean {
  for (const v of values) {
    if (isCSSFunction(v)) {
      if (v.name.toLowerCase() === 'var') {
        return true;
      }
      if (hasVarFunction(v.value)) {
        return true;
      }
    } else if (v.type === 'simple-block') {
      if (hasVarFunction(v.value)) {
        return true;
      }
    }
  }
  return false;
}
