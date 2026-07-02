/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';

test('Top-level specificity should return an array of specificities', () => {
  const spec = Parser.calculateSpecificity('a, .b, #c');
  // Currently this returns [1, 0, 0] (the max)
  // We want it to return [[0,0,1], [0,1,0], [1,0,0]]
  
  assert.ok(Array.isArray(spec[0]), 'Should return an array of specificities');
  assert.deepStrictEqual(spec, [[0, 0, 1], [0, 1, 0], [1, 0, 0]]);
});

test('Single selector should also return an array of specificities for consistency', () => {
  const spec = Parser.calculateSpecificity('a');
  assert.ok(Array.isArray(spec), 'Should return an array');
  assert.ok(Array.isArray(spec[0]), 'First element should be an array (tuple)');
  assert.deepStrictEqual(spec, [[0, 0, 1]]);
});

