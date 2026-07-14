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
import { CSSStyleDeclaration } from '../src/index.ts';

test('Logical shorthand getPropertyValue with mixed physical longhands', () => {
  const style = new CSSStyleDeclaration();
  
  style.setProperty('margin-block-start', '10px');
  style.setProperty('margin-block-end', '20px');
  
  assert.strictEqual(style.getPropertyValue('margin-block'), '10px 20px');
  
  style.setProperty('margin-top', '5px');
  
  assert.strictEqual(style.getPropertyValue('margin-block'), '');
});

test('Logical shorthand getPropertyValue with mixed physical longhands (border)', () => {
  const style = new CSSStyleDeclaration();
  
  style.setProperty('border-block-start', '1px solid black');
  style.setProperty('border-block-end', '1px solid black');
  
  assert.strictEqual(style.getPropertyValue('border-block'), '1px solid black');
  
  style.setProperty('border-top-width', '2px');
  
  assert.strictEqual(style.getPropertyValue('border-block'), '');
});

test('Physical shorthand border-radius getPropertyValue with mixed logical longhands', () => {
  const style = new CSSStyleDeclaration();
  
  // Set physical longhands
  style.setProperty('border-top-left-radius', '10px');
  style.setProperty('border-top-right-radius', '10px');
  style.setProperty('border-bottom-right-radius', '10px');
  style.setProperty('border-bottom-left-radius', '10px');
  
  // Querying border-radius should work
  assert.strictEqual(style.getPropertyValue('border-radius'), '10px');
  
  // Set a logical longhand that overlaps
  style.setProperty('border-start-start-radius', '20px');
  
  // Querying border-radius should now return empty string because of the mix
  assert.strictEqual(style.getPropertyValue('border-radius'), '');
});
