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
import { MediaParser, MediaQueryValidator, serializeMediaQuery } from '../src/MediaParser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import type { GeneralEnclosed } from '../src/types.ts';



test('Media Queries 3-valued logic: unknown ORed with valid', () => {
  // (unknown) or (width > 0) is syntactically valid, so canonical serialization preserves it
  const result = MediaParser.parse('(unknown-feature) or (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), '(unknown-feature) or (width > 0px)');
  // Under standard environment with width = 800px > 0px: false OR true -> true
  assert.strictEqual(MediaParser.evaluate('(unknown-feature) or (width > 0px)'), true);
});

test('Media Queries 3-valued logic: unknown ANDed with valid', () => {
  const result = MediaParser.parse('(unknown-feature) and (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), '(unknown-feature) and (width > 0px)');
  // unknown AND true -> unknown -> false in boolean context
  assert.strictEqual(MediaParser.evaluate('(unknown-feature) and (width > 0px)'), false);
});

test('Media Queries 3-valued logic: general-enclosed as unknown', () => {
  const result = MediaParser.parse('(future-func(val)) or (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'future-func(val) or (width > 0px)');
  assert.strictEqual(MediaParser.evaluate('(future-func(val)) or (width > 0px)'), true);
});

test('Media Queries 3-valued logic: nested unknown features', () => {
  const result = MediaParser.parse('((unknown-feature)) or (width > 0px)');
  assert.strictEqual(serializeMediaQuery(result[0]), '(unknown-feature) or (width > 0px)');
  assert.strictEqual(MediaParser.evaluate('((unknown-feature)) or (width > 0px)'), true);
});

test('Media Queries: not modifier precedence', () => {
  const result = MediaParser.parse('not all and (unknown-feature)');
  assert.strictEqual(serializeMediaQuery(result[0]), 'not all and (unknown-feature)');
  // not (true AND unknown) = not (unknown) = unknown -> false
  assert.strictEqual(MediaParser.evaluate('not all and (unknown-feature)'), false);
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
  assert.strictEqual(serializeMediaQuery(result[0]), '(unknown-feature: 10px)');
  assert.strictEqual(MediaParser.evaluate('(unknown-feature: 10px)'), false);
});

test('Media Queries: preserve unknown feature with min- prefix in boolean context', () => {
  const result = MediaParser.parse('(min-unknown-feature)');
  assert.strictEqual(serializeMediaQuery(result[0]), '(min-unknown-feature)');
  assert.strictEqual(MediaParser.evaluate('(min-unknown-feature)'), false);
});

test('Media Queries: evaluate static method exists on MediaParser', () => {
  assert.strictEqual(typeof MediaParser.evaluate, 'function');
});
