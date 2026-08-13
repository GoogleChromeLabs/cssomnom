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

import type { CSSFunction } from '../../types.ts';
import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSTransformComponent } from './CSSTransformComponent.ts';
import { DOMMatrix } from '../../DOMMatrix.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';
import {
  parseTranslate,
  parseScale,
  parseRotate,
  parseSkew,
  parsePerspective,
  parseMatrix
} from './transform-parser.ts';

// Spec: CSS Typed OM Level 1 § 5 #transformvalue-objects
export class CSSTransformValue extends CSSStyleValue {
  [index: number]: CSSTransformComponent;
  public components: CSSTransformComponent[];
  constructor(components: CSSTransformComponent[]) {
    super();
    if (components.length === 0) {
      throw new TypeError('CSSTransformValue requires at least one transform component');
    }
    this.components = components;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          return target.components[index];
        }
        return Reflect.get(target, prop, receiver);
      },
      // css-typed-om § 7 #transformvalue-objects
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const index = parseInt(prop, 10);
          if (index < 0 || index > target.components.length) {
            throw new RangeError(`Index ${index} is out of bounds (length ${target.components.length})`);
          }
          if (!(value instanceof CSSTransformComponent)) {
            throw new TypeError('Value must be an instance of CSSTransformComponent');
          }
          target.components[index] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      }
    });
  }

  get length(): number { return this.components.length; }
  [Symbol.iterator]() { return this.components[Symbol.iterator](); }
  entries(): IterableIterator<[number, CSSTransformComponent]> { return this.components.entries(); }
  keys(): IterableIterator<number> { return this.components.keys(); }
  values(): IterableIterator<CSSTransformComponent> { return this.components.values(); }
  forEach(callback: (value: CSSTransformComponent, index: number, array: CSSTransformComponent[]) => void, thisArg?: unknown): void {
    this.components.forEach(callback, thisArg);
  }
  item(index: number): CSSTransformComponent | undefined { return this.components[index]; }
  get is2D(): boolean {
    return this.components.every(c => c.is2D);
  }

  toMatrix(): DOMMatrix {
    let result = this.components[0]?.toMatrix() ?? new DOMMatrix([1, 0, 0, 1, 0, 0]);
    for (let i = 1; i < this.components.length; i++) {
      const next = this.components[i].toMatrix();
      result = result.multiply(next);
    }
    return result;
  }

  toString(): string {
    return this.components.map(c => c.toString()).join(' ');
  }

  static parse(css: string): CSSTransformValue {
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'parse' on 'CSSTransformValue': 1 argument required, but only 0 present.");
    }
    const tokens = tokenize(css);
    const componentValues = ParseHooks.parseComponentValues(tokens);

    const components: CSSTransformComponent[] = [];
    for (const v of componentValues) {
      if (v.type === 'whitespace' || v.type === 'comment') continue;
      if (v.type === 'comma') {
        throw new TypeError('CSSTransformValue.parse: Comma token not allowed at top level');
      }
      if (v.type !== 'function') {
        throw new TypeError('CSSTransformValue.parse: Expected function token at top level');
      }
      const fn = v as CSSFunction;
      const name = fn.name.toLowerCase();
      const args = fn.value.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'comma');

      const knownTransformFunctions = [
        'translate', 'translatex', 'translatey', 'translatez', 'translate3d',
        'scale', 'scalex', 'scaley', 'scalez', 'scale3d',
        'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d',
        'skew', 'skewx', 'skewy',
        'perspective',
        'matrix', 'matrix3d'
      ];

      if (!knownTransformFunctions.includes(name)) {
        throw new TypeError(`CSSTransformValue.parse: Unknown transform function '${fn.name}'`);
      }

      if (name === 'translate' || name === 'translatex' || name === 'translatey' || name === 'translatez' || name === 'translate3d') {
        components.push(parseTranslate(name, args));
      } else if (name === 'scale' || name === 'scalex' || name === 'scaley' || name === 'scalez' || name === 'scale3d') {
        components.push(parseScale(name, args));
      } else if (name === 'rotate' || name === 'rotatex' || name === 'rotatey' || name === 'rotatez' || name === 'rotate3d') {
        components.push(parseRotate(name, args));
      } else if (name === 'skew' || name === 'skewx' || name === 'skewy') {
        components.push(parseSkew(name, args));
      } else if (name === 'perspective') {
        components.push(parsePerspective(args));
      } else if (name === 'matrix' || name === 'matrix3d') {
        components.push(parseMatrix(name, args));
      }
    }
    return new CSSTransformValue(components);
  }
}
