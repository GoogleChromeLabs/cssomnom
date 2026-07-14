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

test('Validate pseudo-classes against generated list', () => {
  // Valid pseudo-classes
  assert.ok(Parser.parseSelectorAST(':hover'));
  assert.ok(Parser.parseSelectorAST(':active'));
  assert.ok(Parser.parseSelectorAST(':is(.foo)'));
  
  // Invalid pseudo-classes
  assert.strictEqual(Parser.parseSelectorAST(':non-existent-pseudo-class'), null);
  assert.strictEqual(Parser.parseSelectorAST(':bogus'), null);
});

test('Allow -webkit- prefixed pseudo-classes as quirks', () => {
  assert.ok(Parser.parseSelectorAST(':-webkit-autofill'));
  assert.ok(Parser.parseSelectorAST(':-webkit-any-link'));
  assert.ok(Parser.parseSelectorAST(':-webkit-drag'));
});

test('Validate pseudo-elements against generated list', () => {
  // Valid pseudo-elements
  assert.ok(Parser.parseSelectorAST('::before'));
  assert.ok(Parser.parseSelectorAST('::after'));
  assert.ok(Parser.parseSelectorAST('::placeholder'));
  
  // Legacy pseudo-elements (single colon)
  assert.ok(Parser.parseSelectorAST(':before'));
  assert.ok(Parser.parseSelectorAST(':after'));
  
  // Invalid pseudo-elements
  assert.strictEqual(Parser.parseSelectorAST('::non-existent-pseudo-element'), null);
  assert.strictEqual(Parser.parseSelectorAST('::bogus'), null);
});

test('Forbid pseudo-elements inside logical pseudos', () => {
  // :not is not forgiving, should fail completely
  assert.strictEqual(Parser.parseSelectorAST(':not(::before)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':not(:before)'), null);
});

test('Allow :not() chaining after pseudo-elements if arguments are valid', () => {
  assert.ok(Parser.parseSelectorAST('::before:not(:hover)'));
  assert.strictEqual(Parser.parseSelectorAST('::before:not(.foo)'), null);
});


