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
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';

test('Validate :nth-child() arguments', () => {
  // Valid arguments
  assert.ok(Parser.parseSelectorAST(':nth-child(even)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(odd)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n+1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n + 1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(+2n+1)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(5)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(-n+3)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(n-3)'));
  assert.ok(Parser.parseSelectorAST(':nth-child(2n + 1 of .foo)'));

  // Invalid arguments
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(abc)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n +)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n + foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(of .foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(2n + 1 of)'), null);
});

test('Validate :dir() arguments', () => {
  assert.ok(Parser.parseSelectorAST(':dir(ltr)'));
  assert.ok(Parser.parseSelectorAST(':dir(rtl)'));
  
  assert.strictEqual(Parser.parseSelectorAST(':dir(123)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':dir(ltr, rtl)'), null);
});

test('Validate :lang() arguments', () => {
  assert.ok(Parser.parseSelectorAST(':lang(en)'));
  assert.ok(Parser.parseSelectorAST(':lang("en")'));
  assert.ok(Parser.parseSelectorAST(':lang(en, fr)'));
  
  assert.strictEqual(Parser.parseSelectorAST(':lang(123)'), null);
});
