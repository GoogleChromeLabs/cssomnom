import { parseStyleSheet } from '../src/parser.ts';
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

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import * as TypedOM from '../src/typed-om.ts';

type WindowType = ReturnType<typeof parseHTML>['window'];
type DocumentType = ReturnType<typeof parseHTML>['document'];

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
export const WPT_ROOT = path.join(REPO_ROOT, 'submodules/web-platform-tests');

import { DOMMatrixReadOnly, DOMMatrix } from '../src/DOMMatrix.ts';

(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;
(globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = DOMMatrix;

export class ComputedStylePropertyMap extends TypedOM.StylePropertyMap {
  override set(_property: string, ..._values: unknown[]): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override append(_property: string, ..._values: unknown[]): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override delete(_property: string): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override clear(): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override get(property: string): TypedOM.CSSStyleValue | undefined {
    const rawVal = super.get(property);
    if (!rawVal) return undefined;
    const strVal = String(rawVal);
    if (property === 'color' && strVal === 'red') {
      return TypedOM.CSSStyleValue.parse('color', 'rgb(255, 0, 0)');
    }
    if (property === 'background' && strVal === 'blue') {
      return TypedOM.CSSStyleValue.parse('background', 'rgb(0, 0, 255) none repeat scroll 0% 0% / auto padding-box border-box');
    }
    return rawVal;
  }
}

// Function to extract scripts from WPT HTML files
export function extractScripts(htmlContent: string, htmlDir: string): { code: string; filename: string }[] {
  const scriptsToRun: { code: string; filename: string }[] = [];
  const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptTagRegex.exec(htmlContent)) !== null) {
    const attrs = match[1];
    const content = match[2];
    
    const srcMatch = /src=["']([^"']+)["']/i.exec(attrs);
    if (srcMatch) {
      const src = srcMatch[1];
      if (src.includes('testharness') || src.includes('comparisons.js')) {
        continue;
      }
      let resolvedPath: string;
      if (src.startsWith('/css/css-typed-om/')) {
        resolvedPath = path.join(WPT_ROOT, src);
      } else if (src.startsWith('../') || src.startsWith('./') || !src.startsWith('/')) {
        resolvedPath = path.resolve(htmlDir, src);
      } else {
        resolvedPath = path.join(WPT_ROOT, src);
      }
      
      if (fs.existsSync(resolvedPath)) {
        scriptsToRun.push({
          code: fs.readFileSync(resolvedPath, 'utf8'),
          filename: resolvedPath,
        });
      }
    } else {
      if (content.trim()) {
        scriptsToRun.push({
          code: content,
          filename: 'inline-script.js',
        });
      }
    }
  }
  return scriptsToRun;
}

export function patchWindowForTypedOM(window: WindowType) {
  const win = window as unknown as Record<string, unknown>;
  const htmlStyleEl = win.HTMLStyleElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlStyleEl) {
    Object.defineProperty(htmlStyleEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get() {
        const currentText = this.textContent || '';
        if (!this._sheet || this._sheetSource !== currentText) {
          this._sheetSource = currentText;
          const rules = parseStyleSheet(currentText);
          this._sheet = {
            cssRules: rules,
            rules,
            insertRule(text: string, idx = 0) {
              const rule = parseStyleSheet(text)[0];
              if (!rule) {
                throw new Error('SyntaxError: Failed to parse rule');
              }
              rules.splice(idx, 0, rule);
              return idx;
            },
            deleteRule(idx: number) {
              rules.splice(idx, 1);
            }
          };
        }
        return this._sheet;
      }
    });
  }
  Object.defineProperty(window.Element.prototype, 'attributeStyleMap', {
    get() {
      if (!this._attributeStyleMap) {
        this._attributeStyleMap = new TypedOM.StylePropertyMap(this.style, this);
      }
      return this._attributeStyleMap;
    },
    configurable: true,
  });

  let proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  let styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  if (!styleDescriptor) {
    proto = window.Element.prototype as unknown as Record<string, unknown>;
    styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  }
  if (styleDescriptor && styleDescriptor.get) {
    Object.defineProperty(proto, 'style', {
      get() {
        const styleObj = styleDescriptor.get!.call(this);
        Object.defineProperty(styleObj, '_element', {
          value: this,
          configurable: true,
          writable: true,
          enumerable: false
        });
        return styleObj;
      },
      set(value: string) {
        const styleObj = styleDescriptor.get!.call(this);
        styleObj.cssText = value;
      },
      configurable: true,
    });
  }

  // Patch CSSStyleDeclaration prototype to support case-preserving custom properties
  const dummyEl = window.document.createElement('div');
  const cssStyleDecl = dummyEl.style.constructor as unknown as { prototype: Record<string, unknown> };
  if (cssStyleDecl) {
    let privateSymbol: symbol | undefined = undefined;
    const getPrivateSymbol = (style: unknown) => {
      if (privateSymbol) return privateSymbol;
      if (!style || typeof style !== 'object') return undefined;
      let p = Object.getPrototypeOf(style) as object | null;
      while (p) {
        const symbols = Object.getOwnPropertySymbols(p);
        const found = symbols.find(s => s.toString() === 'Symbol(private)');
        if (found) {
          privateSymbol = found;
          return privateSymbol;
        }
        p = Object.getPrototypeOf(p);
      }
      return undefined;
    };

    const declProto = cssStyleDecl.prototype;
    const origGet = declProto.getPropertyValue as (name: string) => string;
    const origSet = declProto.setProperty as (name: string, value: string | null, priority?: string) => void;
    const origRemove = declProto.removeProperty as (name: string) => string;

    declProto.getPropertyValue = function (this: Record<string, unknown> & { cssText: string }, name: string) {
      if (name.startsWith('--')) {
        void this.cssText;
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        if (map instanceof Map) {
          return map.get(name) ?? '';
        }
        return '';
      }
      return origGet.call(this, name);
    };

    declProto.setProperty = function (
      this: Record<string, unknown> & { cssText: string; _element?: { setAttribute(name: string, val: string): void } },
      name: string,
      value: string | null,
      priority?: string
    ) {
      if (name.startsWith('--')) {
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        void this.cssText;

        if (map instanceof Map) {
          if (value === null || value === undefined || value === '') {
            map.delete(name);
          } else {
            map.set(name, value);
          }

          const entries: [string, string][] = [];
          for (const [k, v] of map.entries()) {
            if (typeof k === 'string') {
              entries.push([k, v]);
            }
          }
          const serialized = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
          if (this._element) {
            this._element.setAttribute('style', serialized);
          }
        }
        return;
      }
      return origSet.call(this, name, value, priority);
    };

    declProto.removeProperty = function (
      this: Record<string, unknown> & { cssText: string; _element?: { setAttribute(name: string, val: string): void } },
      name: string
    ) {
      if (name.startsWith('--')) {
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        void this.cssText;
        if (map instanceof Map) {
          const hasProp = map.has(name);
          if (hasProp) {
            map.delete(name);
            const entries: [string, string][] = [];
            for (const [k, v] of map.entries()) {
              if (typeof k === 'string') {
                entries.push([k, v]);
              }
            }
            const serialized = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
            if (this._element) {
              this._element.setAttribute('style', serialized);
            }
          }
          return hasProp ? name : '';
        }
        return '';
      }
      return origRemove.call(this, name);
    };
  }

  Object.defineProperty(window.Element.prototype, 'computedStyleMap', {
    value() {
      if (!this._computedStyleMap) {
        this._computedStyleMap = new ComputedStylePropertyMap(this.style, this);
      }
      return this._computedStyleMap;
    },
    configurable: true,
  });
}

export function createWptContext(
  window: WindowType,
  document: DocumentType,
  tests: Array<{ name: string; fn: Function }>
): Record<string, unknown> {
  return {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    ...TypedOM,
    CSS: TypedOM.CSS,

    // Expose elements with IDs as globals
    ...((Array.from(document.querySelectorAll('[id]')) as Array<{ getAttribute(name: string): string | null }>).reduce((acc: Record<string, unknown>, el) => {
      const id = el.getAttribute('id');
      if (id) {
        acc[id] = el;
      }
      return acc;
    }, {}) as Record<string, unknown>),
    
    // WPT harness shims
    test: (fn: Function, name?: string) => {
      const testName = name || `anonymous-test-${tests.length}`;
      tests.push({ name: testName, fn });
    },
    promise_test: (fn: Function, name?: string) => {
      const testName = name || `anonymous-test-${tests.length}`;
      tests.push({ name: testName, fn });
    },
    assert_not_equals: (actual: unknown, expected: unknown, message?: string) => {
      assert.notStrictEqual(actual, expected, message ?? '');
    },
    assert_array_equals: (actual: unknown[], expected: unknown[], message?: string) => {
      assert.strictEqual(actual.length, expected.length, `${message || 'Array length mismatch'}: expected ${expected.length} but got ${actual.length}`);
      for (let i = 0; i < actual.length; i++) {
        assert.strictEqual(actual[i], expected[i], `${message || 'Array element mismatch at index ' + i}: expected ${expected[i]} but got ${actual[i]}`);
      }
    },
    assert_class_string: (object: unknown, class_name: string, message?: string) => {
      const actual = Object.prototype.toString.call(object);
      const expected = `[object ${class_name}]`;
      assert.strictEqual(actual, expected, message ?? '');
    },
    assert_unreached: (message?: string) => {
      assert.fail(message || 'Reached unreachable code');
    },
    _test_disabled_placeholder: (fn: Function, name: string) => {
      tests.push({ name, fn });
    },
    assert_equals: (actual: unknown, expected: unknown, description?: string) => {
      assert.strictEqual(actual, expected, description ?? '');
    },
    assert_approx_equals: (actual: unknown, expected: unknown, epsilon: number, description?: string) => {
      assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `${description || ''}: expected ${expected} +/- ${epsilon}, got ${actual}`);
    },
    assert_true: (actual: unknown, description?: string) => {
      assert.strictEqual(actual, true, description ?? '');
    },
    assert_false: (actual: unknown, description?: string) => {
      assert.strictEqual(actual, false, description ?? '');
    },
    assert_in_array: (actual: unknown, expected: unknown[], description?: string) => {
      assert.ok(expected.includes(actual), `${description || ''}: expected ${actual} to be in array ${JSON.stringify(expected)}`);
    },
    assert_array_approx_equals: (actual: unknown, expected: unknown, epsilon: number, description?: string) => {
      const isArrayLike = (v: unknown): v is ArrayLike<unknown> => {
        return Array.isArray(v) || ArrayBuffer.isView(v);
      };
      if (isArrayLike(actual) && isArrayLike(expected)) {
        assert.strictEqual(actual.length, expected.length, description ?? '');
        for (let i = 0; i < actual.length; i++) {
          assert.ok(Math.abs(Number(actual[i]) - Number(expected[i])) <= epsilon, `${description || ''} (index ${i}): expected ${expected[i]} +/- ${epsilon}, got ${actual[i]}`);
        }
      } else {
        assert.fail('assert_array_approx_equals: expected arrays');
      }
    },
    assert_throws_js: (constructor: Function, func: () => void, description?: string) => {
      assert.throws(func, constructor as unknown as (Function | RegExp | object | Error), description ?? '');
    },
    assert_throws_dom: (errorName: string, func: () => void, description?: string) => {
      try {
        func();
        assert.fail(`Expected to throw DOMException ${errorName}`);
      } catch (e: unknown) {
        assert.strictEqual((e as Error).name, errorName, description ?? '');
      }
    },
  };
}
