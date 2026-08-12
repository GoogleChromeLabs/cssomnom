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

test('Tokenizer: unicode-range', () => {
  const tokens1 = tokenize('U+0025-00FF', true);
  assert.strictEqual(tokens1[0].type, 'unicode-range');
  assert.strictEqual(tokens1[0].value, 'U+25-FF');

  const tokens2 = tokenize('U+4??', true);
  assert.strictEqual(tokens2[0].type, 'unicode-range');
  assert.strictEqual(tokens2[0].value, 'U+400-4FF');
});
