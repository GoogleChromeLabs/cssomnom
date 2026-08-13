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

import type { Declaration, ComponentValue } from '../../types.ts';
import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSUnparsedValue, tokensToUnparsedSegments } from '../values/CSSUnparsedValue.ts';
import { SHORTHANDS } from '../../shorthands.ts';
import { serialize } from '../../serializer.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';
import { validateProperty, compareStrings, privateToken } from '../utils/validation.ts';

export interface StyleReadOnlyLike {
  length: number;
  [index: number]: string;
  getPropertyValue(property: string): string;
  item(index: number): string;
  declarations?: Declaration[];
}

// Spec: CSS Typed OM Level 1 § 2.1 #the-stylepropertymapreadonly-interface
export class StylePropertyMapReadOnly {
  protected _style: StyleReadOnlyLike;
  protected _element?: unknown;

  constructor(styleOrDecls: StyleReadOnlyLike | Declaration[], element?: unknown) {
    if (Array.isArray(styleOrDecls)) {
      this._style = {
        length: styleOrDecls.length,
        getPropertyValue: (prop: string) => {
          const decl = styleOrDecls.find(d => d.name === prop);
          return decl ? serialize(decl.value).trim() : '';
        },
        item: (index: number) => styleOrDecls[index]?.name || '',
        declarations: styleOrDecls,
        ...Object.fromEntries(styleOrDecls.map((d, i) => [i, d.name]))
      } as unknown as StyleReadOnlyLike;
    } else {
      this._style = styleOrDecls;
    }
    this._element = element;
  }

  protected _getDeclarations(): Declaration[] {
    return this._style.declarations || [];
  }

  // css-typed-om § 3.2 #the-stylepropertymap
  private _getKeys(): string[] {
    const rawKeys = new Set<string>();
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      for (const d of declarations) {
        if (d.name) rawKeys.add(d.name);
      }
    } else if (this._style) {
      for (let i = 0; i < this._style.length; i++) {
        const prop = this._style[i] || (typeof this._style.item === 'function' ? this._style.item(i) : '');
        if (prop) {
          rawKeys.add(prop);
        }
      }
    }

    const standardProps = new Set<string>();
    const vendorProps = new Set<string>();
    const customProps = new Set<string>();

    for (const key of rawKeys) {
      if (key.startsWith('--')) {
        // Custom properties: preserved exactly as written (case-sensitive)
        customProps.add(key);
      } else if (key.startsWith('-')) {
        // Vendor-prefixed / experimental properties: ASCII lowercased
        vendorProps.add(key.toLowerCase());
      } else {
        // Standard properties: ASCII lowercased
        standardProps.add(key.toLowerCase());
      }
    }

    const sortedStandard = Array.from(standardProps).sort(compareStrings);
    const sortedVendor = Array.from(vendorProps).sort(compareStrings);
    const sortedCustom = Array.from(customProps).sort(compareStrings);

    return [...sortedStandard, ...sortedVendor, ...sortedCustom];
  }

  get size(): number {
    return this._getKeys().length;
  }

  keys(): IterableIterator<string> {
    return this._getKeys()[Symbol.iterator]();
  }

  values(): IterableIterator<CSSStyleValue[]> {
    const keys = this._getKeys();
    const vals = keys.map(k => this.getAll(k));
    return vals[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, CSSStyleValue[]]> {
    const keys = this._getKeys();
    const entries = keys.map(k => [k, this.getAll(k)] as [string, CSSStyleValue[]]);
    return entries[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, CSSStyleValue[]]> {
    return this.entries();
  }

  forEach(callback: (values: CSSStyleValue[], key: string, map: this) => void, thisArg?: unknown): void {
    const keys = this._getKeys();
    for (const key of keys) {
      callback.call(thisArg, this.getAll(key), key, this);
    }
  }

  get(property: string): CSSStyleValue | undefined {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getRaw(property);
    if (res) {
      res._associatedProperty = propKey;
      return res;
    }
    return undefined;
  }

  protected _getRaw(property: string): CSSStyleValue | null {
    return this._getAllRaw(property)[0] ?? null;
  }

  has(property: string): boolean {
    validateProperty(property);
    const shorthand = SHORTHANDS[property];
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      if (shorthand) {
        return shorthand.longhands.every(lh => declarations.some(d => d.name === lh));
      }
      return declarations.some((d: Declaration) => d.name === property);
    } else {
      if (shorthand) {
        return shorthand.longhands.every(lh => this._style.getPropertyValue(lh) !== '');
      }
      return this._style.getPropertyValue(property) !== '';
    }
  }

  getAll(property: string): CSSStyleValue[] {
    validateProperty(property);
    const propKey = property.startsWith('--') ? property : property.toLowerCase();
    const res = this._getAllRaw(property);
    for (const val of res) {
      val._associatedProperty = propKey;
    }
    return res;
  }

  protected _getAllRaw(property: string): CSSStyleValue[] {
    const shorthand = SHORTHANDS[property];
    const declarations = this._getDeclarations();
    if (declarations.length > 0) {
      if (shorthand) {
        const longhandValues: Record<string, ComponentValue[]> = {};
        let allSet = true;
        for (const lh of shorthand.longhands) {
          const decl = declarations.find(d => d.name === lh);
          if (!decl) {
            allSet = false;
            break;
          }
          longhandValues[lh] = decl.value;
        }
        if (allSet) {
          const contracted = shorthand.contract(longhandValues);
          if (contracted !== null) {
            return [new CSSUnparsedValue([contracted])];
          }
        }
        return [];
      }

      const decl = declarations.find((d: Declaration) => d.name === property);
      if (!decl) return [];
      if (property.startsWith('--')) {
        return [new CSSUnparsedValue(tokensToUnparsedSegments(decl.value))];
      }
      const serialized = serialize(decl.value).trim();
      try {
        return CSSStyleValue.parseAll(property, serialized);
      } catch (e) {
        return [new CSSStyleValue(serialized, privateToken)];
      }
    } else {
      if (shorthand) {
        const val = this._style.getPropertyValue(property);
        if (val) {
          return [new CSSUnparsedValue([val])];
        }
        return [];
      }

      const val = this._style.getPropertyValue(property);
      if (val === '') return [];
      if (property.startsWith('--')) {
        const tokens = tokenize(val);
        const componentValues = ParseHooks.parseComponentValues(tokens);
        return [new CSSUnparsedValue(tokensToUnparsedSegments(componentValues))];
      }
      try {
        return CSSStyleValue.parseAll(property, val);
      } catch (e) {
        return [new CSSStyleValue(val, privateToken)];
      }
    }
  }
}
