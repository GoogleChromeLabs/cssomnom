/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

test('CSSStyleDeclaration.setProperty preserves property order on update', () => {
  const css = 'color: red; background: blue;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.length, 2);
  assert.strictEqual(style.item(0), 'color');
  assert.strictEqual(style.item(1), 'background');
  
  // Update existing property
  style.setProperty('color', 'green');
  
  // Order should be preserved
  assert.strictEqual(style.length, 2, 'Length should still be 2');
  assert.strictEqual(style.item(0), 'color', 'First item should still be color');
  assert.strictEqual(style.item(1), 'background', 'Second item should still be background');
  
  // Verify value is updated
  assert.strictEqual(style.getPropertyValue('color').trim(), 'green');
});

test('CSSStyleDeclaration.setProperty appends new property to the end', () => {
  const css = 'color: red; background: blue;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  style.setProperty('font-size', '12px');
  
  assert.strictEqual(style.length, 3);
  assert.strictEqual(style.item(0), 'color');
  assert.strictEqual(style.item(1), 'background');
  assert.strictEqual(style.item(2), 'font-size');
});
