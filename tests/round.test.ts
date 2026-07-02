/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CSSNumericValue } from '../src/typed-om.ts';

describe('round() function', () => {
  it('should parse and serialize round() with strategy keyword', () => {
    const result = CSSNumericValue.parse('round(up, 15px, 10px)');
    assert.strictEqual(result.toString(), '20px');
  });

  it('should parse round() without strategy keyword', () => {
    const result = CSSNumericValue.parse('round(15px, 10px)');
    assert.strictEqual(result.toString(), '20px');
  });
});
