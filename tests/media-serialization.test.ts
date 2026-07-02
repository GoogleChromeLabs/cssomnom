/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
