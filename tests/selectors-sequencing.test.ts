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

test('SelectorParser: Pseudo-element sequencing', () => {
  // Spec: A pseudo-element may only appear at the end of a compound selector.
  // Spec: Only one pseudo-element may appear in a compound selector.
  // Spec: In a complex selector, a pseudo-element may only appear at the end of the last compound selector.

  // Invalid: multiple pseudo-elements (should throw or fail to parse as a single compound)
  // Our parser currently might just parse them both into the same compound-selector.
  
  const invalidSelectors = [
    'div::before::after',
    'div::before.class',
    'div::before#id',
    'div::before[attr]',
    'div::before div',
    'div::before + div'
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    if (ast) {
        let foundPseudo = false;
        for (let i = 0; i < (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items.length; i++) {
            const item = (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[i];
            if (item.type === 'compound-selector') {
                let compoundPseudo = 0;
                for (let j = 0; j < item.selectors.length; j++) {
                    const s = item.selectors[j];
                    if (s.type === 'pseudo-element-selector') {
                        compoundPseudo++;
                        if (j !== item.selectors.length - 1) {
                            assert.fail(`Pseudo-element not at end of compound in: ${sel}`);
                        }
                    }
                }
                if (compoundPseudo > 1) {
                     assert.fail(`Multiple pseudo-elements in compound in: ${sel}`);
                }
                if (compoundPseudo > 0) {
                    if (foundPseudo) assert.fail(`Pseudo-element in non-last compound in: ${sel}`);
                    foundPseudo = true;
                    const nextItem = (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[i+1];
                    if (nextItem) {
                         assert.fail(`Pseudo-element followed by other items in: ${sel}`);
                    }
                }
            }
        }
    }
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
    let ast = null;
    try {
      ast = Parser.parseSelectorAST(sel);
    } catch (e) {
      // Throwing is a valid way to reject invalid selectors
      continue;
    }
    
    if (ast) {
      const compound = (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0];
      if (compound && compound.type === 'compound-selector') {
        const selectors = compound.selectors;
        for (let i = 1; i < selectors.length; i++) {
          const s = selectors[i];
          if (s.type === 'type-selector' || s.type === 'universal-selector') {
            assert.fail(`Type or universal selector at index ${i} in: ${sel}`);
          }
        }
      }
    }
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
