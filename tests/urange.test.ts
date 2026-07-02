/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';

test('Tokenizer: unicode-range', () => {
  const tokens1 = tokenize('U+0025-00FF', true);
  assert.strictEqual(tokens1[0].type, 'unicode-range');
  assert.strictEqual(tokens1[0].value, 'U+0025-00FF');

  const tokens2 = tokenize('U+4??', true);
  assert.strictEqual(tokens2[0].type, 'unicode-range');
  assert.strictEqual(tokens2[0].value, 'U+0400-04FF');
});
