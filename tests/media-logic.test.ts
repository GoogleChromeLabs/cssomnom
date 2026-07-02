/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { MediaParser, MediaQueryValidator, serializeMediaQuery } from '../src/MediaParser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import type { GeneralEnclosed } from '../src/types.ts';



test('Media Queries 3-valued logic: unknown ORed with valid', () => {
  // (unknown) or (width > 0) could be true if width > 0
  const result = MediaParser.parse('(unknown-feature) or (width > 0px)');
  // Statically it serializes to 'not all' because it contains unknown feature
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries 3-valued logic: unknown ANDed with valid', () => {
  const result = MediaParser.parse('(unknown-feature) and (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries 3-valued logic: general-enclosed as unknown', () => {
  const result = MediaParser.parse('(future-func(val)) or (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries 3-valued logic: nested unknown features', () => {
  const result = MediaParser.parse('((unknown-feature)) or (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries: not modifier precedence', () => {
  const result = MediaParser.parse('not all and (unknown-feature)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries: build AST for <general-enclosed> (function)', () => {
  const tokens = tokenize('future-func(val)');
  const parser = new Parser(tokens);
  const values = parser.parseComponentValues();
  const validator = new MediaQueryValidator(values);
  const result = (validator as unknown as { parseMediaInParens(): boolean | GeneralEnclosed | null }).parseMediaInParens();
  assert.strictEqual(typeof result, 'object', 'Expected object for general-enclosed');
  if (result !== null && typeof result === 'object') {
    assert.strictEqual(result.type, 'general-enclosed');
    assert.strictEqual(result.name, 'future-func');
  }
});

test('Media Queries: build AST for <general-enclosed> (parens)', () => {
  const tokens = tokenize('(100px)');
  const parser = new Parser(tokens);
  const values = parser.parseComponentValues();
  const validator = new MediaQueryValidator(values);
  const result = (validator as unknown as { parseMediaInParens(): boolean | GeneralEnclosed | null }).parseMediaInParens();
  assert.strictEqual(typeof result, 'object', 'Expected object for general-enclosed');
  if (result !== null && typeof result === 'object') {
    assert.strictEqual(result.type, 'general-enclosed');
    assert.strictEqual(result.name, undefined);
  }
});

test('Media Queries: preserve unknown feature with colon', () => {
  const result = MediaParser.parse('(unknown-feature: 10px)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries: preserve unknown feature with min- prefix in boolean context', () => {
  const result = MediaParser.parse('(min-unknown-feature)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all');
});

test('Media Queries: evaluate should not exist', () => {
  const validator = new MediaQueryValidator([]);
  // @ts-expect-error - testing removal
  assert.strictEqual(validator.evaluate, undefined);
});
