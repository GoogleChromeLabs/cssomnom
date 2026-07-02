/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { MediaParser, serializeMediaQuery } from '../src/MediaParser.ts';

test('MediaParser: Validate media feature values', () => {
  // width should take a length
  assert.deepEqual(MediaParser.parse('(width: 100px)').map(serializeMediaQuery), ['(width: 100px)']);
  assert.deepEqual(MediaParser.parse('(width: invalid)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(width: 100deg)').map(serializeMediaQuery), ['not all']); // 100deg is not a length
  
  // height should take a length
  assert.deepEqual(MediaParser.parse('(height: 50vh)').map(serializeMediaQuery), ['(height: 50vh)']);
  assert.deepEqual(MediaParser.parse('(height: 10)').map(serializeMediaQuery), ['not all']); // 10 is not a length (except 0)
  assert.deepEqual(MediaParser.parse('(height: 0)').map(serializeMediaQuery), ['(height: 0)']); // 0 is a length
  
  // grid should take an integer
  assert.deepEqual(MediaParser.parse('(grid: 1)').map(serializeMediaQuery), ['(grid: 1)']);
  assert.deepEqual(MediaParser.parse('(grid: 1.5)').map(serializeMediaQuery), ['not all']);
  
  // orientation should take an ident, but only specific ones
  assert.deepEqual(MediaParser.parse('(orientation: portrait)').map(serializeMediaQuery), ['(orientation: portrait)']);
  assert.deepEqual(MediaParser.parse('(orientation: invalid)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(orientation: 100px)').map(serializeMediaQuery), ['not all']);
  
  // resolution should take a resolution or 'infinite'
  assert.deepEqual(MediaParser.parse('(resolution: 300dpi)').map(serializeMediaQuery), ['(resolution: 300dpi)']);
  assert.deepEqual(MediaParser.parse('(resolution: infinite)').map(serializeMediaQuery), ['(resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(min-resolution: infinite)').map(serializeMediaQuery), ['(min-resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(max-resolution: infinite)').map(serializeMediaQuery), ['(max-resolution: infinite)']);
  assert.deepEqual(MediaParser.parse('(resolution < infinite)').map(serializeMediaQuery), ['(resolution < infinite)']);

  // Range context validation
  assert.deepEqual(MediaParser.parse('(width > 100deg)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(100deg < width)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(100px < width < 200deg)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(width > calc(100px + 50px))').map(serializeMediaQuery), ['(width > calc(100px + 50px))']);
  assert.deepEqual(MediaParser.parse('(width > calc(100deg))').map(serializeMediaQuery), ['not all']);

  // Boolean context should reject min- and max- prefixes
  assert.deepEqual(MediaParser.parse('(min-width)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(max-width)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(width)').map(serializeMediaQuery), ['(width)']);

  // Unknown features should be preserved in AST but serialize to not all
  assert.deepEqual(MediaParser.parse('(unknown-feature: 100px)').map(serializeMediaQuery), ['not all']);
  assert.deepEqual(MediaParser.parse('(unknown-feature)').map(serializeMediaQuery), ['not all']);
});

