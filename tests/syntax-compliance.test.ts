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
