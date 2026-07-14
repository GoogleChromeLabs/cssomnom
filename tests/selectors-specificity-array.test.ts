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

