/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
