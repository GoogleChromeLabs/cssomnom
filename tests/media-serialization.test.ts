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
import { MediaParser, serializeMediaQuery } from '../src/MediaParser.ts';

test('MediaParser: Omit "all and" in serialization', () => {
  assert.deepEqual(MediaParser.parse('all and (min-width: 100px)').map(serializeMediaQuery), ['(min-width: 100px)']);
  assert.deepEqual(MediaParser.parse('all and (color)').map(serializeMediaQuery), ['(color)']);
  
  // Should not omit if it's not "all and"
  assert.deepEqual(MediaParser.parse('screen and (min-width: 100px)').map(serializeMediaQuery), ['screen and (min-width: 100px)']);
  assert.deepEqual(MediaParser.parse('not all and (min-width: 100px)').map(serializeMediaQuery), ['not all and (min-width: 100px)']);
  
  // Should preserve "all" if it's alone
  assert.deepEqual(MediaParser.parse('all').map(serializeMediaQuery), ['all']);
});
