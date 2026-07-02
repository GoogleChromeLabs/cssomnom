/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
