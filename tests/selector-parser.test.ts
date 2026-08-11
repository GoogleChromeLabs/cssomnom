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
import * as assert from 'node:assert';
import { SelectorParser } from '../src/SelectorParser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import type { CompoundSelector, ComplexSelector, Combinator } from '../src/types.ts';

test('SelectorParser throws SyntaxError if list is unforgiving and empty', () => {
  const tokens = tokenize(''); // Empty input
  const parser = new SelectorParser(tokens); // unforgiving
  
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message === 'Selector list cannot be empty';
  });
});

test('SelectorParser does not throw if list is forgiving and empty', () => {
  const tokens = tokenize(''); // Empty input
  const parser = new SelectorParser(tokens, { forgiving: true }); // forgiving
  
  const result = parser.parse();
  assert.strictEqual(result.selectors.length, 0);
});

test('SelectorParser throws SyntaxError if complex selector items length is 0', () => {
  const tokens = tokenize('123'); // Invalid selector starting with number
  const parser = new SelectorParser(tokens); // unforgiving
  
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message === 'Complex selector cannot be empty';
  });
});

test('SelectorParser propagates insideHas to :host sub-parser', () => {
  const tokens = tokenize(':has(:host(::before))');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message === 'Pseudo-elements are not allowed in this context';
  });
});

test('SelectorParser throws SyntaxError if pseudo-element is used inside ::slotted()', () => {
  const tokens = tokenize('::slotted(div::before)');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message === 'Pseudo-elements are not allowed in this context';
  });
});

test('SelectorParser allows non-functional obsolete -webkit- quirks', () => {
  const tokens = tokenize('::-webkit-unknown');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  const result = parser.parse();
  assert.strictEqual(result.selectors.length, 1);
  const compound = (result.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  assert.strictEqual(compound.selectors[0].type, 'pseudo-element-selector');
  assert.strictEqual((compound.selectors[0] as { name: string }).name, '-webkit-unknown');
});

test('SelectorParser rejects functional obsolete -webkit- quirks if unknown', () => {
  const tokens = tokenize('::-webkit-unknown()');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message.includes('Unknown pseudo-element');
  });
});

test('SelectorParser allows :-webkit-autofill', () => {
  const tokens = tokenize(':-webkit-autofill');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  const result = parser.parse();
  assert.strictEqual(result.selectors.length, 1);
  const compound = (result.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  assert.strictEqual(compound.selectors[0].type, 'pseudo-class-selector');
  assert.strictEqual((compound.selectors[0] as { name: string }).name, 'autofill');
});

test('SelectorParser allows :has-slotted', () => {
  const tokens = tokenize(':has-slotted');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  const result = parser.parse();
  assert.strictEqual(result.selectors.length, 1);
  const compound = (result.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  assert.strictEqual(compound.selectors[0].type, 'pseudo-class-selector');
  assert.strictEqual((compound.selectors[0] as { name: string }).name, 'has-slotted');
});

test('SelectorParser throws SyntaxError for invalid namespaced type selector', () => {
  const tokens = tokenize('ns|123');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => {
    return (err as { name?: string }).name === 'SyntaxError' && (err as Error).message.includes('Expected identifier or * after namespace pipe');
  });
});

test('SelectorParser allows relative selectors when allowRelative is true', () => {
  const tokens = tokenize('> .foo, + .bar');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues(), { allowRelative: true });
  const result = parser.parse();
  assert.strictEqual(result.selectors.length, 2);

  const sel1 = result.selectors[0] as ComplexSelector;
  assert.strictEqual(sel1.items[0].type, 'combinator');
  assert.strictEqual((sel1.items[0] as Combinator).value, '>');
  assert.strictEqual(sel1.items[1].type, 'compound-selector');

  const sel2 = result.selectors[1] as ComplexSelector;
  assert.strictEqual(sel2.items[0].type, 'combinator');
  assert.strictEqual((sel2.items[0] as Combinator).value, '+');
  assert.strictEqual(sel2.items[1].type, 'compound-selector');
});

test('SelectorParser rejects relative selectors when allowRelative is false', () => {
  const tokens = tokenize('> .foo');
  const parser = new SelectorParser(new Parser(tokens).parseComponentValues());
  assert.throws(() => {
    parser.parse();
  }, (err: unknown) => (err as { name?: string }).name === 'SyntaxError' && (err as Error).message.includes('Relative selector not allowed'));
});
