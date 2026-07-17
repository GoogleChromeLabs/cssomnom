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
import type { CompoundSelector, PseudoClassSelector, ClassSelector, ComplexSelector, InvalidSelector, Combinator } from '../src/types.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/index.ts';

test('parseSelector with :has() and :popover-open', () => {
  // selectors-4 #has-pseudo
  const s1 = 'div:has(> .foo)';
  assert.strictEqual(Parser.parseSelector(s1), 'div:has(> .foo)');
  
  // html #pseudo-popover-open
  const s2 = ':popover-open';
  assert.strictEqual(Parser.parseSelector(s2), ':popover-open');
  
  const s4 = 'div:has(> .foo, + .bar)';
  assert.strictEqual(Parser.parseSelector(s4), 'div:has(> .foo, + .bar)');
  
  const s5 = 'section:has(h1, h2):has(p)';
  assert.strictEqual(Parser.parseSelector(s5), 'section:has(h1, h2):has(p)');

  // Nested :has()
  const s6 = 'article:has(section:has(h1))';
  assert.strictEqual(Parser.parseSelector(s6), 'article:has(section:has(h1))');
});

test('Support :has() and :popover-open in Style Rules', () => {
  const css = `
    div:has(> .foo) { color: red; }
    :popover-open { display: block; }
    [popover]:popover-open { border: 2px solid blue; }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  
  assert.strictEqual((stylesheet.cssRules[0] as unknown as CSSStyleRule).selectorText, 'div:has(> .foo)');
  assert.strictEqual((stylesheet.cssRules[1] as unknown as CSSStyleRule).selectorText, ':popover-open');
  assert.strictEqual((stylesheet.cssRules[2] as unknown as CSSStyleRule).selectorText, '[popover]:popover-open');
});

test('Restrict leading combinators to :has() contexts', () => {
  // Leading combinators should be invalid in top-level selectors
  assert.strictEqual(Parser.parseSelectorAST('> .foo'), null);
  assert.strictEqual(Parser.parseSelectorAST('+ .bar'), null);
  assert.strictEqual(Parser.parseSelectorAST('~ .baz'), null);

  // Leading combinators are invalid in :is(), but :is() is forgiving, so it ignores it instead of failing the whole selector.
  assert.ok(Parser.parseSelectorAST('div:is(> .foo)'));

  // Leading combinators should be VALID in :has()
  assert.ok(Parser.parseSelectorAST('div:has(> .foo)'));
});

test('Forgiving selector list in :is()', () => {
  // div:is(.foo, > .bar) should be valid because .foo is valid, even though > .bar is not.
  assert.ok(Parser.parseSelectorAST('div:is(.foo, > .bar)'));
});

test('Forgiving selector list in :where()', () => {
  // div:where(.foo, > .bar) should be valid because .foo is valid, even though > .bar is not.
  assert.ok(Parser.parseSelectorAST('div:where(.foo, > .bar)'));
});

test('Forgiving selector list in :is() drops invalid complex selectors with trailing garbage', () => {
  const ast = Parser.parseSelectorAST('div:is(.foo, .bar @invalid)');
  assert.ok(ast);
  const compound = (ast.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo = compound.selectors[1] as PseudoClassSelector;
  const isArg = pseudo.argument as unknown as { selectors: unknown[] };
  assert.strictEqual(isArg.selectors.length, 1);
  const subComplex = isArg.selectors[0] as { items: unknown[] };
  const subCompound = subComplex.items[0] as CompoundSelector;
  const classSel = subCompound.selectors[0] as ClassSelector;
  assert.strictEqual(classSel.name, 'foo');
});

test('Forgiving selector list in :is() drops invalid complex selectors that throw during parsing', () => {
  const ast = Parser.parseSelectorAST('div:is(.foo, .bar ++ .baz)');
  assert.ok(ast);
  const compound = (ast.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo = compound.selectors[1] as PseudoClassSelector;
  const isArg = pseudo.argument as unknown as { selectors: unknown[] };
  assert.strictEqual(isArg.selectors.length, 1);
  const subComplex = isArg.selectors[0] as { items: unknown[] };
  const subCompound = subComplex.items[0] as CompoundSelector;
  const classSel = subCompound.selectors[0] as ClassSelector;
  assert.strictEqual(classSel.name, 'foo');
});

test('Harden :has() implementation', () => {
  // Nested :has() should be invalid
  assert.strictEqual(Parser.parseSelectorAST('div:has(:has(.foo))'), null);
  assert.strictEqual(Parser.parseSelectorAST('div:has(.bar:has(.foo))'), null);
  
  // Pseudo-elements inside :has() should be invalid
  assert.strictEqual(Parser.parseSelectorAST('div:has(::before)'), null);
  assert.strictEqual(Parser.parseSelectorAST('div:has(.foo::after)'), null);
  assert.strictEqual(Parser.parseSelectorAST('div:has(:before)'), null); // legacy
});

test(':has() prepends implicit descendant combinator', () => {
  const ast1 = Parser.parseSelectorAST('div:has(p)');
  assert.ok(ast1);
  const compound1 = (ast1.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo1 = compound1.selectors[1] as PseudoClassSelector;
  const hasArg1 = pseudo1.argument as unknown as { selectors: ComplexSelector[] };
  const firstSelector1 = hasArg1.selectors[0];
  assert.strictEqual(firstSelector1.items[0].type, 'combinator');
  assert.strictEqual((firstSelector1.items[0] as Combinator).value, ' ');

  const ast2 = Parser.parseSelectorAST('div:has(> p)');
  assert.ok(ast2);
  const compound2 = (ast2.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo2 = compound2.selectors[1] as PseudoClassSelector;
  const hasArg2 = pseudo2.argument as unknown as { selectors: ComplexSelector[] };
  const firstSelector2 = hasArg2.selectors[0];
  assert.strictEqual(firstSelector2.items[0].type, 'combinator');
  assert.strictEqual((firstSelector2.items[0] as Combinator).value, '>');
});


test('Allow any pseudo-elements and pseudo-classes after ::slotted() and ::part()', () => {
  // Tree-abiding pseudo-elements after ::slotted()
  assert.ok(Parser.parseSelectorAST('::slotted(div)::before'));
  assert.ok(Parser.parseSelectorAST('::slotted(div)::after'));
  assert.ok(Parser.parseSelectorAST('::slotted(div)::marker'));
  
  // Tree-abiding pseudo-elements after ::part()
  assert.ok(Parser.parseSelectorAST('::part(button)::before'));
  assert.ok(Parser.parseSelectorAST('::part(button)::after'));
  
  // Non-tree-abiding pseudo-elements after ::slotted() are also allowed under relaxed rules
  assert.ok(Parser.parseSelectorAST('::slotted(div)::slotted(span)'));
  assert.ok(Parser.parseSelectorAST('::slotted(div)::part(inner)'));
});

test('Recursive argument parsing for :host, :host-context, and ::slotted', () => {
  // Valid compound selectors
  assert.ok(Parser.parseSelectorAST(':host(.foo)'));
  assert.ok(Parser.parseSelectorAST(':host(div.foo)'));
  assert.ok(Parser.parseSelectorAST(':host-context(.foo)'));
  assert.ok(Parser.parseSelectorAST('::slotted(.foo)'));
  assert.ok(Parser.parseSelectorAST('::slotted(div.foo)'));

  // Invalid complex selectors (should fail because they take compound selectors)
  assert.strictEqual(Parser.parseSelectorAST(':host(div .foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':host-context(div span)'), null);
  assert.strictEqual(Parser.parseSelectorAST('::slotted(div > span)'), null);
});

test('Forgiving selector list preserves invalid items containing & in CSS Nesting', () => {
  const ast = Parser.parseSelectorAST('div:is(.foo, .bar ++ &)');
  assert.ok(ast);
  const compound = (ast.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo = compound.selectors[1] as PseudoClassSelector;
  const isArg = pseudo.argument as unknown as { selectors: (ComplexSelector | InvalidSelector)[] };
  
  assert.strictEqual(isArg.selectors.length, 2);
  assert.strictEqual(isArg.selectors[1].type, 'invalid-selector');
});

