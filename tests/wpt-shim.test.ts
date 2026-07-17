/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './wpt-shim.ts';
import { StylePropertyMapReadOnly } from '../src/typed-om.ts';

test('window.getComputedStyle in sandbox shim', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><div id="test" style="color: red;"></div></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  assert.ok('getComputedStyle' in win, 'getComputedStyle should be in win');
  const el = win.document.getElementById('test')!;
  const style = win.getComputedStyle(el);
  assert.ok(style, 'getComputedStyle(el) should return style');
  assert.strictEqual(style.color, 'red');

  // styleMap on computed style is a StylePropertyMapReadOnly
  assert.ok('styleMap' in style, 'styleMap should be in style');
  const styleMap = (style as Record<string, unknown>).styleMap as StylePropertyMapReadOnly;
  assert.ok(styleMap, 'styleMap should be defined');
  assert.strictEqual(styleMap.get('color')?.toString(), 'rgb(255, 0, 0)'); // computed map maps red to rgb(255, 0, 0) in our mock ComputedStylePropertyMap
});

test('document.styleSheets in sandbox shim', () => {
  const dom = parseHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          div { color: blue; }
        </style>
        <style>
          span { color: green; }
        </style>
      </head>
      <body></body>
    </html>
  `);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const doc = win.document;
  assert.ok('styleSheets' in doc, 'styleSheets should be in document');
  const sheets = doc.styleSheets;
  assert.strictEqual(sheets.length, 2);
  assert.ok(sheets[0]);
  assert.ok(sheets[1]);
  assert.ok(sheets[0].cssRules);
  assert.strictEqual(sheets[0].cssRules.length, 1);
  assert.strictEqual(sheets[0].cssRules[0].cssText.replace(/\s+/g, ''), 'div{color:blue;}');
});

test('window.matchMedia in sandbox shim', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  assert.ok('matchMedia' in win, 'matchMedia should be in win');
  const mql = win.matchMedia('(max-width: 600px)');
  assert.ok(mql);
  assert.strictEqual(typeof mql.matches, 'boolean');
  assert.strictEqual(mql.media, '(max-width: 600px)');
  assert.strictEqual(typeof mql.addListener, 'function');
  assert.strictEqual(typeof mql.removeListener, 'function');
});
