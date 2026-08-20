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

import type { Declaration } from '../../types.ts';
import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSUnparsedValue, tokensToUnparsedSegments } from '../values/CSSUnparsedValue.ts';
import { CSSVariableReferenceValue } from '../values/CSSVariableReferenceValue.ts';
import type { StyleReadOnlyLike } from './StylePropertyMapReadOnly.ts';
import { StylePropertyMapReadOnly } from './StylePropertyMapReadOnly.ts';
import {
  LIST_PROPERTIES,
  getPropertyValueSafe,
  setPropertySafe,
  getShorthandForLonghand,
  getStyleCache,
  isEquivalent,
  validateValuesForProperty
} from './style-validation.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';
import { validateProperty, privateToken } from '../utils/validation.ts';

export interface StyleLike extends StyleReadOnlyLike {
  setProperty(property: string, value: string | null, priority?: string): void;
  removeProperty(property: string): string;
}

// Spec: CSS Typed OM Level 1 § 2.2 #the-stylepropertymap-interface
export class StylePropertyMap extends StylePropertyMapReadOnly {
  declare protected _style: StyleLike;

  constructor(style: StyleLike, element?: unknown) {
    super(style, element);
  }

  protected override _getDeclarations(): Declaration[] {
    return this._style.declarations || [];
  }

  private _checkPendingSubstitution(property: string): void {
    const shorthand = getShorthandForLonghand(property);
    if (shorthand) {
      const shorthandVal = getPropertyValueSafe(this._style, shorthand);
      if (shorthandVal.includes('var(')) {
        throw new TypeError(`Property ${property} is a longhand of shorthand ${shorthand} which has a pending substitution`);
      }
    }
  }

  override get(property: string): CSSStyleValue | undefined {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getRaw(property);
    if (res) {
      res._associatedProperty = propKey;
      return res;
    }
    return undefined;
  }

  protected override _getRaw(property: string): CSSStyleValue | null {
    return this._getAllRaw(property)[0] ?? null;
  }

  override getAll(property: string): CSSStyleValue[] {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getAllRaw(property);
    for (const val of res) {
      val._associatedProperty = propKey;
    }
    return res;
  }

  protected override _getAllRaw(property: string): CSSStyleValue[] {
    const value = getPropertyValueSafe(this._style, property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    if (!value) {
      getStyleCache(this._style).delete(propKey);
      return [];
    }

    const cached = getStyleCache(this._style).get(propKey);
    if (cached) {
      const isList = LIST_PROPERTIES.has(propKey);
      const separator = isList ? ', ' : ' ';
      const cachedStr = cached.map(v => v.toString()).join(separator);
      if (isEquivalent(cachedStr, value)) {
        return cached;
      }
    }

    if (property.startsWith('--')) {
      const tokens = tokenize(value);
      const componentValues = ParseHooks.parseComponentValues(tokens);
      const res = [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
      getStyleCache(this._style).set(propKey, res);
      return res;
    }

    try {
      const parsed = CSSStyleValue.parseAll(property, value);
      getStyleCache(this._style).set(propKey, parsed);
      return parsed;
    } catch (e) {
      const res = [new CSSStyleValue(value, privateToken)];
      getStyleCache(this._style).set(propKey, res);
      return res;
    }
  }

  override has(property: string): boolean {
    validateProperty(property);
    return getPropertyValueSafe(this._style, property) !== '';
  }

  set(property: string, ...values: (CSSStyleValue | string)[]): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    if (values.length === 0) {
      throw new TypeError(`set() on property ${property} requires at least one value.`);
    }
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const finalString = validateValuesForProperty(property, values);
    setPropertySafe(this._style, this._element, property, finalString);
    try {
      const parsed = CSSStyleValue.parseAll(property, finalString);
      getStyleCache(this._style).set(propKey, parsed);
    } catch (e) {
      getStyleCache(this._style).delete(propKey);
    }
  }

  // css-typed-om § 3.2 #dom-stylepropertymap-append
  append(property: string, ...values: (CSSStyleValue | string)[]): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    for (const val of values) {
      if (typeof val === 'string' && val.includes('var(')) {
        throw new TypeError("Cannot append CSSUnparsedValue or CSSVariableReferenceValue.");
      }
      if (val instanceof CSSUnparsedValue || val instanceof CSSVariableReferenceValue) {
        throw new TypeError("Cannot append CSSUnparsedValue or CSSVariableReferenceValue.");
      }
    }
    if (values.length === 0) {
      throw new TypeError(`append() on property ${property} requires at least one value.`);
    }
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    if (!LIST_PROPERTIES.has(propKey)) {
      throw new TypeError(`Property ${property} is not list-valued and cannot be appended to.`);
    }

    // Check if existing property contains a var() reference or CSS-wide keyword per css-typed-om § 3.2 step 7
    const current = getPropertyValueSafe(this._style, property);
    if (current && ['initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(current.trim().toLowerCase())) {
      throw new TypeError(`Cannot append to CSS-wide keyword '${current}'.`);
    }
    if (current && current.includes('var(')) {
      throw new TypeError(`Cannot append to property ${property} because it contains a var() reference.`);
    }
    const existingRaw = this._getRaw(property);
    if (existingRaw instanceof CSSUnparsedValue || existingRaw instanceof CSSVariableReferenceValue) {
      throw new TypeError(`Cannot append to property ${property} because it contains a var() reference.`);
    }

    const finalString = validateValuesForProperty(property, values);
    const newValue = current ? `${current}, ${finalString}` : finalString;

    if (!propKey.startsWith('--')) {
      try {
        CSSStyleValue.parseAll(property, newValue);
      } catch (e) {
        throw new TypeError(`Invalid combined value for property ${property}: ${newValue}`);
      }
    }

    setPropertySafe(this._style, this._element, property, newValue);
    try {
      const parsed = CSSStyleValue.parseAll(property, newValue);
      getStyleCache(this._style).set(propKey, parsed);
    } catch (e) {
      getStyleCache(this._style).delete(propKey);
    }
  }

  delete(property: string): void {
    validateProperty(property);
    this._checkPendingSubstitution(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    setPropertySafe(this._style, this._element, property, null);
    getStyleCache(this._style).delete(propKey);
  }

  clear(): void {
    getStyleCache(this._style).clear();
    if (this._element && typeof this._element === 'object' && 'removeAttribute' in this._element && typeof this._element.removeAttribute === 'function') {
      (this._element.removeAttribute as (name: string) => void)('style');
    } else {
      const props = [];
      for (let i = 0; i < this._style.length; i++) {
        props.push(this._style.item(i));
      }
      for (const p of props) {
        setPropertySafe(this._style, this._element, p, null);
      }
    }
  }
}
