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
import { MediaList } from '../src/index.ts';

test('MediaList.appendMedium normalization', () => {
  const ml = new MediaList('screen');
  ml.appendMedium('SCREEN'); // Should be ignored as it normalizes to 'screen'
  assert.strictEqual(ml.length, 1);
  assert.strictEqual(ml.mediaText, 'screen');
  
  ml.appendMedium('(min-width: 100px)');
  ml.appendMedium('( min-width: 100px )'); // Should be ignored if normalized
  assert.strictEqual(ml.length, 2);
});

test('MediaList.deleteMedium normalization', () => {
  const ml = new MediaList('screen, (min-width: 100px)');
  ml.deleteMedium('SCREEN');
  assert.strictEqual(ml.length, 1);
  assert.strictEqual(ml.mediaText, '(min-width: 100px)');
  
  ml.deleteMedium('( min-width: 100px )');
  assert.strictEqual(ml.length, 0);
});

test('MediaList unit lowercase coercion', () => {
  const ml = new MediaList('(min-width: 100PX)');
  assert.strictEqual(ml.mediaText, '(min-width: 100px)');
});

test('MediaList.toString() returns mediaText', () => {
  const ml = new MediaList('screen, print');
  assert.strictEqual(ml.toString(), 'screen, print');
});

test('MediaList.deleteMedium removes all occurrences', () => {
  const ml = new MediaList();
  ml.mediaText = 'screen, print, screen';
  assert.strictEqual(ml.length, 3);
  ml.deleteMedium('screen');
  assert.strictEqual(ml.length, 1);
  assert.strictEqual(ml.mediaText, 'print');
});
