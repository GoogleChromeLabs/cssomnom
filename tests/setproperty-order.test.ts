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
