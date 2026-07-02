/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';

test('CSSStyleDeclaration.setProperty with null', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('color', 'red');
  assert.strictEqual(style.getPropertyValue('color').trim(), 'red');
  
  // testing LegacyNullToEmptyString support
  style.setProperty('color', null);
  
  assert.strictEqual(style.getPropertyValue('color'), '');
});
