/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';

test('logical border-radius contraction in vertical-rl', () => {
  const style = new CSSStyleDeclaration();
  style.setProperty('writing-mode', 'vertical-rl');
  console.log('Writing mode:', style.getPropertyValue('writing-mode'));
  style.setProperty('border-start-start-radius', '10px');
  style.setProperty('border-start-end-radius', '20px');
  style.setProperty('border-end-end-radius', '30px');
  style.setProperty('border-end-start-radius', '40px');

  // Now we check what 'border-radius' returns.
  // Since border-radius doesn't support 'logical' keyword, 
  // it should probably NOT contract if it would be incorrect.
  // Or it should return the values in physical order.
  
  // Actually, our current serializer blindly contracts logicalLonghands for border-radius (if they are all set).
  // It will produce 'border-radius: 10px 20px 30px 40px'.
  // This means: tl=10px, tr=20px, br=30px, bl=40px.
  // But wait:
  // start-start (10px) is top-right. So tr should be 10px.
  // end-start (40px) is top-left. So tl should be 40px.
  // They are swapped!
  
  const borderRadius = style.getPropertyValue('border-radius');
  console.log('Border radius:', borderRadius);
  
  // If it returned physical border-radius, it should be '40px 10px 20px 30px'?
  // No, the project's serializer currently doesn't know about writing-mode for contraction.
  
  // Let's see what it actually returns.
  assert.notStrictEqual(borderRadius, '10px 20px 30px 40px', 'Should not blindly contract logical radii into physical shorthand if they dont match');
});
