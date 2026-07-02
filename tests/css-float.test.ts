/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';

test('cssFloat maps to float in CSSStyleDeclaration', () => {
  const style = new CSSStyleDeclaration();
  style.cssFloat = 'left';
  assert.strictEqual(style.getPropertyValue('float'), 'left');
  assert.strictEqual(style.cssFloat, 'left');
});
