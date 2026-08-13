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

import type { ComponentValue, IdentToken } from '../../types.ts';
import { CSSStyleValue } from './CSSStyleValue.ts';
import { CSSVariableReferenceValue } from './CSSVariableReferenceValue.ts';
import { serialize, getMirrorToken } from '../../serializer.ts';
import { isCSSFunction, hasVarFunction } from '../utils/validation.ts';
import type { CSSNumericType } from '../numeric/CSSNumericType.ts';

// Spec: CSS Typed OM Level 1 § 3.4 #unparsedvalue-objects
export class CSSUnparsedValue extends CSSStyleValue {
  [index: number]: string | CSSVariableReferenceValue;
  private _values: (string | CSSVariableReferenceValue)[];

  constructor(values: (string | CSSVariableReferenceValue)[]) {
    super();
    this._values = values;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target._values[index];
        }
        return Reflect.get(target, prop, receiver);
      },
      // css-typed-om § 3.4 #unparsedvalue-objects
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          if (index < 0 || index > target._values.length) {
            throw new RangeError(`Index ${index} is out of bounds (length ${target._values.length})`);
          }
          if (typeof value !== 'string' && !(value instanceof CSSVariableReferenceValue)) {
            throw new TypeError('Value must be a string or CSSVariableReferenceValue');
          }
          target._values[index] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      }
    });
  }

  get length(): number { return this._values.length; }
  [Symbol.iterator]() { return this._values[Symbol.iterator](); }
  entries(): IterableIterator<[number, string | CSSVariableReferenceValue]> { return this._values.entries(); }
  keys(): IterableIterator<number> { return this._values.keys(); }
  values(): IterableIterator<string | CSSVariableReferenceValue> { return this._values.values(); }
  forEach(callback: (value: string | CSSVariableReferenceValue, index: number, parent: CSSUnparsedValue) => void, thisArg?: unknown): void {
    for (let i = 0; i < this._values.length; i++) {
      callback.call(thisArg, this._values[i], i, this);
    }
  }
  item(index: number): string | CSSVariableReferenceValue | undefined { return this._values[index]; }

  override toString(): string {
    let s = '';
    const isIdentChar = (c: string) => /[a-zA-Z0-9_-]/.test(c);

    for (let i = 0; i < this._values.length; i++) {
      const current = this._values[i];
      const prev = i > 0 ? this._values[i - 1] : null;

      if (prev !== null) {
        const prevStr = prev.toString();
        const currentStr = current.toString();
        if (!prevStr.endsWith(' ') && !currentStr.startsWith(' ')) {
          if (prevStr.length > 0 && currentStr.length > 0) {
            if (isIdentChar(prevStr[prevStr.length - 1]) && isIdentChar(currentStr[0])) {
              s += '/**/';
            }
          }
        }
      }

      s += current.toString();
    }
    return s;
  }

  serialize(): string {
    return this.toString();
  }

  type(): CSSNumericType {
    return {};
  }
}

export function tokensToUnparsedSegments(values: ComponentValue[]): (string | CSSVariableReferenceValue)[] {
  const segments: (string | CSSVariableReferenceValue)[] = [];
  let pendingTokens: ComponentValue[] = [];

  const flushPending = () => {
    if (pendingTokens.length > 0) {
      segments.push(serialize(pendingTokens));
      pendingTokens = [];
    }
  };

  const processNode = (node: ComponentValue) => {
    if (isCSSFunction(node) && node.name.toLowerCase() === 'var') {
      flushPending();

      const args = node.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
      // If invalid var(), just serialize it as a string
      if (args.length === 0 || args[0].type !== 'ident' || !(args[0] as IdentToken).value.startsWith('--') || (args[0] as IdentToken).value === '--') {
        pendingTokens.push(node);
        return;
      }
      if (args.length > 1 && args[1].type !== 'comma') {
        pendingTokens.push(node);
        return;
      }

      const varName = (args[0] as IdentToken).value;
      let fallback: CSSUnparsedValue | null = null;

      let commaIdx = -1;
      for (let i = 0; i < node.value.length; i++) {
        if (node.value[i].type === 'comma') {
          commaIdx = i;
          break;
        }
      }

      if (commaIdx !== -1) {
        const fallbackTokens = node.value.slice(commaIdx + 1);
        fallback = new CSSUnparsedValue(tokensToUnparsedSegments(fallbackTokens));
      }

      segments.push(new CSSVariableReferenceValue(varName, fallback));
    } else if (isCSSFunction(node)) {
      // If it contains a var() somewhere in its children, we must decompose it
      if (hasVarFunction(node.value)) {
        flushPending();

        // Push the opening "funcName("
        segments.push(node.name.toLowerCase() + '(');

        // Recursively add children segments
        const innerSegments = tokensToUnparsedSegments(node.value);
        for (const seg of innerSegments) {
          if (typeof seg === 'string') {
            // Merge strings if possible
            const last = segments[segments.length - 1];
            if (typeof last === 'string') {
              segments[segments.length - 1] = last + seg;
            } else {
              segments.push(seg);
            }
          } else {
            segments.push(seg);
          }
        }

        // Push the closing ")"
        const last = segments[segments.length - 1];
        if (typeof last === 'string') {
          segments[segments.length - 1] = last + ')';
        } else {
          segments.push(')');
        }
      } else {
        pendingTokens.push(node);
      }
    } else if (node.type === 'simple-block') {
      // Simple blocks with associated open brackets, e.g. [, {, (
      if (hasVarFunction(node.value)) {
        flushPending();

        const start = node.associatedToken.value as string;
        const end = getMirrorToken(start);

        segments.push(start);

        const innerSegments = tokensToUnparsedSegments(node.value);
        for (const seg of innerSegments) {
          if (typeof seg === 'string') {
            const last = segments[segments.length - 1];
            if (typeof last === 'string') {
              segments[segments.length - 1] = last + seg;
            } else {
              segments.push(seg);
            }
          } else {
            segments.push(seg);
          }
        }

        const last = segments[segments.length - 1];
        if (typeof last === 'string') {
          segments[segments.length - 1] = last + end;
        } else {
          segments.push(end);
        }
      } else {
        pendingTokens.push(node);
      }
    } else {
      pendingTokens.push(node);
    }
  };

  for (const val of values) {
    processNode(val);
  }
  flushPending();

  // Clean up whitespace/empty string segments and merge adjacent string segments
  const finalSegments: (string | CSSVariableReferenceValue)[] = [];
  for (const seg of segments) {
    if (typeof seg === 'string') {
      if (seg === '') continue;
      const last = finalSegments[finalSegments.length - 1];
      if (typeof last === 'string') {
        finalSegments[finalSegments.length - 1] = last + seg;
      } else {
        finalSegments.push(seg);
      }
    } else {
      finalSegments.push(seg);
    }
  }

  return finalSegments;
}
