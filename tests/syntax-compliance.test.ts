/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';

test('Tokenizer: url() whitespace', () => {
  const t1 = tokenize('url(  http://example.com  )');
  assert.strictEqual(t1[0].type, 'url');
  assert.strictEqual(t1[0].value, 'http://example.com');
});

test('Tokenizer: Numeric token sign', () => {
  const t1 = tokenize('+123');
  assert.strictEqual(t1[0].type, 'number');
  assert.strictEqual(t1[0].value, 123);
  assert.strictEqual(t1[0].sign, '+');

  const t2 = tokenize('-45px');
  assert.strictEqual(t2[0].type, 'dimension');
  assert.strictEqual(t2[0].value, -45);
  assert.strictEqual(t2[0].sign, '-');

  const t3 = tokenize('0');
  assert.strictEqual(t3[0].type, 'number');
  assert.strictEqual(t3[0].value, 0);
  assert.strictEqual(t3[0].sign, null);
});
