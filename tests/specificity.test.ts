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

/**
 * Spec: https://drafts.csswg.org/selectors-4/#specificity-rules
 *
 * Specificity is represented as (A, B, C) where:
 * A = number of ID selectors
 * B = number of class selectors, attribute selectors, and pseudo-classes
 * C = number of type selectors and pseudo-elements
 */

import { Parser } from '../src/parser.ts';

test('Specificity: Parser.calculateSpecificity', () => {
  assert.deepStrictEqual(Parser.calculateSpecificity('#id.class'), [[1, 1, 0]]);
});


test('Specificity: Basic selectors', () => {

  // * (universal selector)
  assert.deepStrictEqual(Parser.calculateSpecificity('*'), [[0, 0, 0]]);

  // type selector
  assert.deepStrictEqual(Parser.calculateSpecificity('li'), [[0, 0, 1]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('ul li'), [[0, 0, 2]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('ul ol+li'), [[0, 0, 3]]);

  // class, attribute, pseudo-class
  assert.deepStrictEqual(Parser.calculateSpecificity('.red'), [[0, 1, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('[rel=up]'), [[0, 1, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity(':hover'), [[0, 1, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('li.red'), [[0, 1, 1]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('ul ol li.red'), [[0, 1, 3]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('li.red.level'), [[0, 2, 1]]);

  // ID selector
  assert.deepStrictEqual(Parser.calculateSpecificity('#x34y'), [[1, 0, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('#s12:not(FOO)'), [[1, 0, 1]]);
});

test('Specificity: :is(), :not(), :has(), :matches()', () => {
  // Specificity is the most specific complex selector in its argument.
  
  // :is(em, #foo) -> (1, 0, 0) because #foo is (1, 0, 0)
  assert.deepStrictEqual(Parser.calculateSpecificity(':is(em, #foo)'), [[1, 0, 0]]);
  
  // :not(em, strong#foo) -> (1, 0, 1) because strong#foo is (1, 0, 1)
  assert.deepStrictEqual(Parser.calculateSpecificity(':not(em, strong#foo)'), [[1, 0, 1]]);
  
  // :has(> img) -> (0, 0, 1) because img is (0, 0, 1)
  assert.deepStrictEqual(Parser.calculateSpecificity('a:has(> img)'), [[0, 0, 2]]); // a (0,0,1) + img (0,0,1)
  
  // .foo :is(.bar, #baz) -> (1, 1, 0) because .foo is (0,1,0) and #baz is (1,0,0)
  assert.deepStrictEqual(Parser.calculateSpecificity('.foo :is(.bar, #baz)'), [[1, 1, 0]]);
  
  // :matches(em, #foo) -> (1, 0, 0) because #foo is (1, 0, 0)
  assert.deepStrictEqual(Parser.calculateSpecificity(':matches(em, #foo)'), [[1, 0, 0]]);
});

test('Specificity: :where()', () => {
  // :where() always has 0 specificity
  assert.deepStrictEqual(Parser.calculateSpecificity(':where(em, #foo#bar#baz)'), [[0, 0, 0]]);
  
  // .qux:where(em, #foo#bar#baz) -> (0, 1, 0) because .qux is (0, 1, 0)
  assert.deepStrictEqual(Parser.calculateSpecificity('.qux:where(em, #foo#bar#baz)'), [[0, 1, 0]]);
});

test('Specificity: :nth-child() and :nth-last-child()', () => {
  // specificity of the pseudo-class itself (1 in B) + specificity of the most specific complex selector in its argument
  
  // :nth-child(even) -> (0, 1, 0)
  assert.deepStrictEqual(Parser.calculateSpecificity(':nth-child(even)'), [[0, 1, 0]]);
  
  // :nth-child(even of li, .item) -> (0, 2, 0) because .item is (0, 1, 0) + pseudo-class (0, 1, 0)
  assert.deepStrictEqual(Parser.calculateSpecificity(':nth-child(even of li, .item)'), [[0, 2, 0]]);
});

test('Specificity: pseudo-elements', () => {
  // pseudo-elements count as C (type selectors)
  assert.deepStrictEqual(Parser.calculateSpecificity('li::before'), [[0, 0, 2]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('li::first-line'), [[0, 0, 2]]);
});

test('Specificity: repeated selectors', () => {
  // Repeated occurrences of the same simple selector do increase specificity
  assert.deepStrictEqual(Parser.calculateSpecificity('.foo.foo'), [[0, 2, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity('#bar#bar'), [[2, 0, 0]]);
});

test('Specificity: :host(), :host-context(), ::slotted()', () => {
  // :host() specificity is 1 in B + specificity of argument
  assert.deepStrictEqual(Parser.calculateSpecificity(':host'), [[0, 1, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity(':host(.foo)'), [[0, 2, 0]]); // .foo is (0,1,0)
  assert.deepStrictEqual(Parser.calculateSpecificity(':host(div)'), [[0, 1, 1]]); // div is (0,0,1)
  
  // :host-context() specificity is 1 in B + specificity of argument
  assert.deepStrictEqual(Parser.calculateSpecificity(':host-context(.foo)'), [[0, 2, 0]]);
  assert.deepStrictEqual(Parser.calculateSpecificity(':host-context(div)'), [[0, 1, 1]]);
  
  // ::slotted() specificity is 1 in C + specificity of argument
  assert.deepStrictEqual(Parser.calculateSpecificity('::slotted(*)'), [[0, 0, 1]]); // * is (0,0,0)
  assert.deepStrictEqual(Parser.calculateSpecificity('::slotted(.foo)'), [[0, 1, 1]]); // .foo is (0,1,0) + pseudo-element (0,0,1)
  assert.deepStrictEqual(Parser.calculateSpecificity('::slotted(div)'), [[0, 0, 2]]); // div is (0,0,1) + pseudo-element (0,0,1)
});

test('Specificity: & selector (nesting)', () => {
  // Without parent specificity (should be treated as :where(:scope) which has zero specificity)
  assert.deepStrictEqual(Parser.calculateSpecificity('&'), [[0, 0, 0]]);
});
