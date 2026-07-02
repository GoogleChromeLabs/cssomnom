/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
