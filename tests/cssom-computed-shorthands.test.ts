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

import { test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { CSSStyleSheet, StyleSheet, CSSRule } from '../src/CSSOM.ts';
import { patchWindowForTypedOM } from './wpt-shim.ts';

test('CSSComputedStyleDeclaration: border-top, border-right, border-bottom, border-left synthesis', () => {
  // cssom-1 § 6.2 & § 6.8
  const dom = parseHTML(`
    <style>
      #box {
        border-top: 1px solid rgb(255, 0, 0);
        border-right: 2px dashed rgb(0, 255, 0);
        border-bottom: 3px dotted rgb(0, 0, 255);
        border-left: 4px double rgb(0, 0, 0);
      }
    </style>
    <div id="box"></div>
  `);
  patchWindowForTypedOM(dom.window);
  const el = dom.document.getElementById('box')!;
  const style = dom.window.getComputedStyle(el);

  assert.strictEqual(style.getPropertyValue('border-top'), '1px solid rgb(255, 0, 0)');
  assert.strictEqual(style.getPropertyValue('border-right'), '2px dashed rgb(0, 255, 0)');
  assert.strictEqual(style.getPropertyValue('border-bottom'), '3px dotted rgb(0, 0, 255)');
  assert.strictEqual(style.getPropertyValue('border-left'), '4px double rgb(0, 0, 0)');
});

test('CSSComputedStyleDeclaration: border shorthand synthesis when 4 sides match', () => {
  // cssom-1 § 6.2 & § 6.8
  const dom = parseHTML(`
    <style>
      #match {
        border: 2px solid rgb(0, 128, 0);
      }
      #mismatch {
        border-top: 2px solid rgb(0, 128, 0);
        border-bottom: 3px solid rgb(0, 128, 0);
      }
    </style>
    <div id="match"></div>
    <div id="mismatch"></div>
  `);
  patchWindowForTypedOM(dom.window);

  const matchEl = dom.document.getElementById('match')!;
  const matchStyle = dom.window.getComputedStyle(matchEl);
  assert.strictEqual(matchStyle.getPropertyValue('border'), '2px solid rgb(0, 128, 0)');

  const mismatchEl = dom.document.getElementById('mismatch')!;
  const mismatchStyle = dom.window.getComputedStyle(mismatchEl);
  assert.strictEqual(mismatchStyle.getPropertyValue('border'), '');
});

test('CSSComputedStyleDeclaration: mutation throws NoModificationAllowedError DOMException', () => {
  // cssom-1 § 6.4.3
  const dom = parseHTML('<div id="d"></div>');
  patchWindowForTypedOM(dom.window);
  const el = dom.document.getElementById('d')!;
  const style = dom.window.getComputedStyle(el);

  assert.throws(
    () => {
      style.setProperty('color', 'red');
    },
    (err: unknown) => {
      return err instanceof DOMException && err.name === 'NoModificationAllowedError';
    }
  );

  assert.throws(
    () => {
      style.removeProperty('color');
    },
    (err: unknown) => {
      return err instanceof DOMException && err.name === 'NoModificationAllowedError';
    }
  );

  assert.throws(
    () => {
      style.cssText = 'color: blue';
    },
    (err: unknown) => {
      return err instanceof DOMException && err.name === 'NoModificationAllowedError';
    }
  );
});

test('CSSComputedStyleDeclaration: relative position auto offsets resolve to 0px', () => {
  // cssom-1 § 6.8 #resolved-values
  const dom = parseHTML(`
    <style>
      #rel {
        position: relative;
        left: auto;
        top: auto;
      }
    </style>
    <div id="rel"></div>
  `);
  patchWindowForTypedOM(dom.window);
  const el = dom.document.getElementById('rel')!;
  const style = dom.window.getComputedStyle(el);

  assert.strictEqual(style.getPropertyValue('left'), '0px');
  assert.strictEqual(style.getPropertyValue('right'), '0px');
  assert.strictEqual(style.getPropertyValue('top'), '0px');
  assert.strictEqual(style.getPropertyValue('bottom'), '0px');
});

test('CSSStyleSheet: CORS origin-clean flag throws SecurityError on cssRules access', () => {
  // cssom-1 § 6.5.1
  const cleanSheet = CSSStyleSheet.createInternal([], () => null as unknown as CSSRule, true);
  assert.doesNotThrow(() => cleanSheet.cssRules);

  const taintedSheet = CSSStyleSheet.createInternal([], () => null as unknown as CSSRule, false);
  assert.throws(
    () => taintedSheet.cssRules,
    (err: unknown) => {
      return err instanceof DOMException && err.name === 'SecurityError';
    }
  );
});

test('StyleSheet & CSSStyleSheet: IDL properties exist on prototype chain', () => {
  // cssom-1 § 6.5 & § 6.6
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'type')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'href')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'ownerNode')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'parentStyleSheet')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'title')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'media')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'disabled')?.get, 'function');

  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'ownerRule')?.get, 'function');
  assert.strictEqual(typeof Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules')?.get, 'function');
});

test('StyleSheet: title dynamically reflects ownerNode getAttribute("title")', () => {
  // cssom-1 § 6.5
  const dom = parseHTML('<style title="initial-title">div { color: red; }</style>');
  patchWindowForTypedOM(dom.window);
  const styleEl = dom.document.querySelector('style')!;
  const sheet = styleEl.sheet!;

  assert.strictEqual(sheet.title, 'initial-title');
  styleEl.setAttribute('title', 'updated-title');
  assert.strictEqual(sheet.title, 'updated-title');
});
