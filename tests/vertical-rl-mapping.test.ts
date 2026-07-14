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
import { resolveLogicalProperty } from '../src/data/LogicalMapping.ts';

test('logical border-radius mapping in vertical-rl', () => {
  const writingMode = 'vertical-rl';
  const direction = 'ltr';

  // spec: border-start-start-radius is the corner at the intersection of block-start and inline-start sides.
  // vertical-rl, ltr:
  // block-start: right
  // inline-start: top
  // corner: top-right
  assert.strictEqual(
    resolveLogicalProperty('border-start-start-radius', writingMode, direction),
    'border-top-right-radius'
  );

  // spec: border-start-end-radius is the corner at the intersection of block-start and inline-end sides.
  // vertical-rl, ltr:
  // block-start: right
  // inline-end: bottom
  // corner: bottom-right
  assert.strictEqual(
    resolveLogicalProperty('border-start-end-radius', writingMode, direction),
    'border-bottom-right-radius'
  );

  // spec: border-end-start-radius is the corner at the intersection of block-end and inline-start sides.
  // vertical-rl, ltr:
  // block-end: left
  // inline-start: top
  // corner: top-left
  assert.strictEqual(
    resolveLogicalProperty('border-end-start-radius', writingMode, direction),
    'border-top-left-radius'
  );

  // spec: border-end-end-radius is the corner at the intersection of block-end and inline-end sides.
  // vertical-rl, ltr:
  // block-end: left
  // inline-end: bottom
  // corner: bottom-left
  assert.strictEqual(
    resolveLogicalProperty('border-end-end-radius', writingMode, direction),
    'border-bottom-left-radius'
  );
});
