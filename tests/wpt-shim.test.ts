/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './wpt-shim.ts';

test('window.getComputedStyle in sandbox shim', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><div id="test" style="color: red;"></div></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  // @ts-expect-error getComputedStyle is mocked on patched window
  assert.ok('getComputedStyle' in win, 'getComputedStyle should be in win');
  // @ts-expect-error getComputedStyle is mocked on patched window
  const el = win.document.getElementById('test')!;
  // @ts-expect-error getComputedStyle is mocked on patched window
  const style = win.getComputedStyle(el);
  assert.ok(style, 'getComputedStyle(el) should return style');
  assert.strictEqual(style.color, 'red');

  // styleMap on computed style is a StylePropertyMapReadOnly
  assert.ok('styleMap' in style, 'styleMap should be in style');
  const styleMap = (style as Record<string, unknown>).styleMap as Record<string, unknown>;
  assert.ok(styleMap, 'styleMap should be defined');
  // @ts-expect-error get method on StylePropertyMapReadOnly
  assert.strictEqual(styleMap.get('color')?.toString(), 'rgb(255, 0, 0)'); // computed map maps red to rgb(255, 0, 0) in our mock ComputedStylePropertyMap
});
