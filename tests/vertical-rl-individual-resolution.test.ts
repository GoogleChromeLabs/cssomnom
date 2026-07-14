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
