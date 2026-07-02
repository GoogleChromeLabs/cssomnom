/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveLogicalProperty } from '../src/data/LogicalMapping.ts';

test('resolveLogicalProperty mappings in vertical-rl', () => {
  const writingMode = 'vertical-rl';
  const direction = 'ltr';

  // border-start-start-radius in vertical-rl, ltr:
  // block-start is Right, inline-start is Top.
  // Physical: border-top-right-radius
  assert.strictEqual(
    resolveLogicalProperty('border-start-start-radius', writingMode, direction),
    'border-top-right-radius'
  );

  // border-start-end-radius in vertical-rl, ltr:
  // block-start is Right, inline-end is Bottom.
  // Physical: border-bottom-right-radius
  assert.strictEqual(
    resolveLogicalProperty('border-start-end-radius', writingMode, direction),
    'border-bottom-right-radius'
  );

  // border-end-start-radius in vertical-rl, ltr:
  // block-end is Left, inline-start is Top.
  // Physical: border-top-left-radius
  assert.strictEqual(
    resolveLogicalProperty('border-end-start-radius', writingMode, direction),
    'border-top-left-radius'
  );

  // border-end-end-radius in vertical-rl, ltr:
  // block-end is Left, inline-end is Bottom.
  // Physical: border-bottom-left-radius
  assert.strictEqual(
    resolveLogicalProperty('border-end-end-radius', writingMode, direction),
    'border-bottom-left-radius'
  );
});
