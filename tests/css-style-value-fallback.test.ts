/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleValue, CSSUnparsedValue } from '../src/typed-om.ts';

test('CSSStyleValue.parseAll returns generic CSSStyleValue for unsupported values', () => {
    const results = CSSStyleValue.parseAll('transform', 'rotate(45deg)');
    assert.strictEqual(results.length, 1);
    assert.ok(!(results[0] instanceof CSSUnparsedValue), 'Should not be CSSUnparsedValue');
    assert.strictEqual(results[0].constructor, CSSStyleValue, 'Should be generic CSSStyleValue');
});
