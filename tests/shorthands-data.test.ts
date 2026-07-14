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
import { SHORTHANDS_DATA } from '../src/data/shorthands.ts';

test('shorthands data compliance: physical box shorthands have exactly 4 physical longhands', () => {
  const boxShorthands = ['margin', 'padding', 'inset', 'border-width', 'border-style', 'border-color'];
  for (const shorthand of boxShorthands) {
    const longhands = SHORTHANDS_DATA[shorthand as keyof typeof SHORTHANDS_DATA];
    assert.strictEqual(longhands.length, 4, `Shorthand ${shorthand} must have exactly 4 longhands, got ${longhands.length}. Logical aliases must not be mixed into standard shorthand expansion data.`);
  }
});
