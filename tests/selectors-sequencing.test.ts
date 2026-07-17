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
import { Parser } from '../src/parser.ts';
import type { CompoundSelector } from '../src/types.ts';

function assertSelectorRejected(sel: string) {
  const ast = Parser.parseSelectorAST(sel);
  assert.strictEqual(ast, null, `Should reject invalid selector: ${sel}`);
}

test('SelectorParser: Pseudo-element sequencing', () => {
  // Spec: A pseudo-element may only appear at the end of a compound selector.
  // Spec: Only one pseudo-element may appear in a compound selector.
  // Spec: In a complex selector, a pseudo-element may only appear at the end of the last compound selector.

  const invalidSelectors = [
    'div::before::after',
    'div::before.class',
    'div::before#id',
    'div::before[attr]',
    'div::before div',
    'div::before + div'
  ];

  for (const sel of invalidSelectors) {
    assertSelectorRejected(sel);
  }
});

test('SelectorParser: Pseudo-element followed by allowed pseudo-classes', () => {
  // Spec: A pseudo-element may be followed by any combination of the user action pseudo-classes.
  // (hover, active, focus, focus-visible, focus-within)
  const valid = 'div::before:hover';
  const ast = Parser.parseSelectorAST(valid);
  assert.ok(ast);
  const compound = ((ast!.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as CompoundSelector);
  assert.strictEqual(compound.selectors.length, 3);
  assert.strictEqual(compound.selectors[0].type, 'type-selector');
  assert.strictEqual(compound.selectors[1].type, 'pseudo-element-selector');
  assert.strictEqual(compound.selectors[2].type, 'pseudo-class-selector');
});

test('SelectorParser: Type selector position', () => {
  // Spec: If a compound selector contains a type selector or universal selector,
  // that selector must come first in the sequence.
  
  const invalidSelectors = [
    '[attr]div',
    '[attr]*',
    ':hoverdiv',
    ':hover*',
    '&foo'
  ];

  for (const sel of invalidSelectors) {
    assertSelectorRejected(sel);
  }
});

test('SelectorParser: Trailing Garbage Rejection', () => {
  const invalidSelectors = [
    'div ;',
    'div .class ;',
    'div, .class ;',
    'div ;, .class',
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.strictEqual(ast, null, `Should reject selector with trailing garbage: ${sel}`);
  }
});

test('SelectorParser: ID selector hashType restriction', () => {
  // Spec: A <hash-token> with the type flag set to "id" is an ID selector.
  // If hashType is 'unrestricted', it should fail to parse as an ID selector.
  const invalidSelectors = [
    '#123',
    'div#123',
    '#123.class'
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.strictEqual(ast, null, `Should reject ID selector with hashType 'unrestricted': ${sel}`);
  }
});

test('SelectorParser: Relaxed pseudo-elements and pseudo-classes after ::part() and ::slotted()', () => {
  const validSelectors = [
    'div::part(button):hover',
    'div::part(button):checked',
    'div::part(button)::before',
    'div::part(button)::selection',
    'div::slotted(span):hover',
    'div::slotted(span):checked',
    'div::slotted(span)::after',
    'div::slotted(span)::placeholder'
  ];

  for (const sel of validSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.ok(ast, `Should accept valid relaxed selector: ${sel}`);
  }
});
