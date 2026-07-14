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

test('logical margin contraction in vertical-rl', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('writing-mode', 'vertical-rl');
  style.setProperty('margin-block-start', '10px');
  style.setProperty('margin-inline-start', '20px');
  style.setProperty('margin-block-end', '30px');
  style.setProperty('margin-inline-end', '40px');

  // margin: logical 10px 20px 30px 40px
  // In vertical-rl: 
  // block-start = right = 10px
  // inline-start = top = 20px
  // block-end = left = 30px
  // inline-end = bottom = 40px
  
  // Physical margin order: top, right, bottom, left
  // Expected physical: 20px 10px 40px 30px
  
  const margin = style.getPropertyValue('margin');
  console.log('Margin:', margin);
  
  // Since it supports logical keyword, it should preferably return the logical one.
  assert.strictEqual(margin, 'logical 10px 20px 30px 40px');
});
