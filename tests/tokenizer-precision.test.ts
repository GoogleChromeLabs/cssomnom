/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';

test('Numeric tokens hold computed number directly in value', () => {
  const tokens = tokenize('123.456');
  const token = tokens.find(t => t.type === 'number');
  assert.ok(token);
  assert.strictEqual(typeof token.value, 'number');
  assert.strictEqual(token.value, 123.456);
});

test('Percentage tokens hold computed number directly in value', () => {
  const tokens = tokenize('50%');
  const token = tokens.find(t => t.type === 'percentage');
  assert.ok(token);
  assert.strictEqual(typeof token.value, 'number');
  assert.strictEqual(token.value, 50);
});

test('Dimension tokens hold computed number directly in value', () => {
  const tokens = tokenize('10px');
  const token = tokens.find(t => t.type === 'dimension');
  assert.ok(token);
  assert.strictEqual(typeof token.value, 'number');
  assert.strictEqual(token.value, 10);
});

test('Precision test for large exponent', () => {
  const tokens = tokenize('1.23456789e-300');
  const token = tokens.find(t => t.type === 'number');
  assert.ok(token);
  assert.strictEqual(token.value, 1.2345678899999999e-300);
});
