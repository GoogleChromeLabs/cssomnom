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
import { MediaParser, serializeMediaQuery, DEFAULT_MEDIA_ENV } from '../src/MediaParser.ts';

test('MediaParser: Validate media feature values and evaluation', () => {
  const env = { ...DEFAULT_MEDIA_ENV };

  // width should take a length
  assert.deepEqual(MediaParser.parse('(width: 100px)').map(serializeMediaQuery), ['(width: 100px)']);
  assert.strictEqual(MediaParser.evaluate('(width: invalid)', env), false);
  assert.strictEqual(MediaParser.evaluate('(width: 100deg)', env), false);
  
  // height should take a length
  assert.deepEqual(MediaParser.parse('(height: 50vh)').map(serializeMediaQuery), ['(height: 50vh)']);
  assert.strictEqual(MediaParser.evaluate('(height: 10)', env), false);
  assert.strictEqual(MediaParser.evaluate('(height: 0)', env), false);
  
  // grid should take an integer
  assert.deepEqual(MediaParser.parse('(grid: 1)').map(serializeMediaQuery), ['(grid: 1)']);
  assert.strictEqual(MediaParser.evaluate('(grid: 1.5)', env), false);
  
  // orientation should take an ident, but only specific ones
  assert.deepEqual(MediaParser.parse('(orientation: portrait)').map(serializeMediaQuery), ['(orientation: portrait)']);
  assert.strictEqual(MediaParser.evaluate('(orientation: invalid)', env), false);
  assert.strictEqual(MediaParser.evaluate('(orientation: 100px)', env), false);
  
  // resolution should take a resolution or 'infinite'
  assert.deepEqual(MediaParser.parse('(resolution: 300dpi)').map(serializeMediaQuery), ['(resolution: 300dpi)']);
  assert.deepEqual(MediaParser.parse('(resolution: infinite)').map(serializeMediaQuery), ['(resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(min-resolution: infinite)').map(serializeMediaQuery), ['(min-resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(max-resolution: infinite)').map(serializeMediaQuery), ['(max-resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(resolution < infinite)').map(serializeMediaQuery), ['(resolution < infinite)']);

  // Range context validation
  assert.strictEqual(MediaParser.evaluate('(width > 100deg)', env), false);
  assert.strictEqual(MediaParser.evaluate('(100deg < width)', env), false);
  assert.strictEqual(MediaParser.evaluate('(100px < width < 200deg)', env), false);
  assert.deepEqual(MediaParser.parse('(width > calc(100px + 50px))').map(serializeMediaQuery), ['(width > calc(150px))']);
  assert.strictEqual(MediaParser.evaluate('(width > calc(100deg))', env), false);

  // Boolean context should reject min- and max- prefixes
  assert.strictEqual(MediaParser.evaluate('(min-width)', env), false);
  assert.strictEqual(MediaParser.evaluate('(max-width)', env), false);
  assert.deepEqual(MediaParser.parse('(width)').map(serializeMediaQuery), ['(width)']);

  // Unknown features evaluate to false
  assert.strictEqual(MediaParser.evaluate('(unknown-feature: 100px)', env), false);
  assert.strictEqual(MediaParser.evaluate('(unknown-feature)', env), false);
});

