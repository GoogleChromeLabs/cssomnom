/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';

test('logical border-radius individual resolution in vertical-rl', () => {
  const styleDecl = new CSSStyleDeclaration();
  const style = styleDecl as unknown as Record<string, string>;
  styleDecl.setProperty('writing-mode', 'vertical-rl');
  styleDecl.setProperty('border-start-start-radius', '10px');

  // In CSSStyleDeclaration (style object), properties do NOT alias each other
  assert.strictEqual(style.borderTopRightRadius, ''); // Proxies return '' for unset via getPropertyValue
  assert.strictEqual(styleDecl.getPropertyValue('border-top-right-radius'), '');
  assert.strictEqual(style.borderStartStartRadius, '10px');
  
  // And conversely
  styleDecl.setProperty('border-bottom-left-radius', '20px');
  assert.strictEqual(style.borderEndEndRadius, '');
  assert.strictEqual(styleDecl.getPropertyValue('border-end-end-radius'), '');
  assert.strictEqual(style.borderBottomLeftRadius, '20px');
});
