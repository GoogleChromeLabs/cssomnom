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
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSMediaRule } from '../src/CSSOM.ts';
import { CSS } from '../src/parser-api.ts';
import type { ComplexSelector, CompoundSelector, PseudoClassSelector } from '../src/types.ts';

test('Phase 81 - Forgiving selector parsing (:is, :where)', () => {
  // :is(::before) should parse as forgiving, not throw, and serialize back as :is(::before)
  const sheet = new Parser(tokenize(':is(::before) { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet.cssRules.length, 1);
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule.selectorText, ':is(::before)');

  // :where(:has(*)) inside :has()
  const sheet2 = new Parser(tokenize(':has(:where(:has(*))) { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet2.cssRules.length, 1);
  const rule2 = sheet2.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule2.selectorText, ':has(:where(:has(*)))');

  // :is(.a, 123) should preserve invalid items for CSSOM serialization
  const sheet3 = new Parser(tokenize(':is(.a, 123) { color: blue; }')).parseStyleSheet();
  assert.strictEqual(sheet3.cssRules.length, 1);
  const rule3 = sheet3.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule3.selectorText, ':is(.a, 123)');

  // CSS.supports reports false for invalid forgiving selectors
  assert.strictEqual(CSS.supports('selector(:is(::before))'), false);
  assert.strictEqual(CSS.supports('selector(:where(::after))'), false);
  assert.strictEqual(CSS.supports('selector(:is(div))'), true);
});

test('Phase 81 - An+B parser and validation', () => {
  const validAnPlusB = [
    [':nth-child(1n+0)', ':nth-child(n)'],
    [':nth-child(n+0)', ':nth-child(n)'],
    [':nth-child(n)', ':nth-child(n)'],
    [':nth-child(-n+0)', ':nth-child(-n)'],
    [':nth-child(-n)', ':nth-child(-n)'],
    [':nth-child(N)', ':nth-child(n)'],
    [':nth-child(+n+3)', ':nth-child(n+3)'],
    [':nth-child( +n + 7 )', ':nth-child(n+7)'],
    [':nth-child(  N- 123)', ':nth-child(n-123)'],
    [':nth-child(n- 10)', ':nth-child(n-10)'],
    [':nth-child(-n\n- 1)', ':nth-child(-n-1)'],
    [':nth-child( 23n\n\n+\n\n123 )', ':nth-child(23n+123)'],
    [':nth-child(odd)', ':nth-child(2n+1)'],
    [':nth-child(even)', ':nth-child(2n)'],
    [':nth-child(5)', ':nth-child(5)'],
    [':nth-child(-3)', ':nth-child(-3)'],
  ];

  for (const [input, expected] of validAnPlusB) {
    const sheet = new Parser(tokenize(`${input} { color: red; }`)).parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 1, `Failed to parse ${input}`);
    const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
    assert.strictEqual(rule.selectorText, expected, `Mismatch for ${input}`);
  }

  const invalidAnPlusB = [
    ':nth-child(n- 1 2)',
    ':nth-child(n-b1)',
    ':nth-child(n-+1)',
    ':nth-child(n-1n)',
    ':nth-child(-n -b1)',
    ':nth-child(-1n- b1)',
    ':nth-child(-n-13b1)',
    ':nth-child(-n-+1)',
    ':nth-child(-n+n)',
    ':nth-child(+ 1n)',
    ':nth-child(  n +12 3)',
    ':nth-child(  12 n )',
    ':nth-child(+12n-0+1)',
    ':nth-child(+12N -- 1)',
    ':nth-child(+12 N )',
    ':nth-child(+ n + 7)',
  ];

  for (const input of invalidAnPlusB) {
    assert.strictEqual(Parser.parseSelectorAST(input), null, `Should be invalid: ${input}`);
  }
});

test('Phase 81 - :nth-child(An+B of <selector-list>)', () => {
  const input = ':nth-child(2n + 1 of .foo, .bar)';
  const ast = Parser.parseSelectorAST(input);
  assert.ok(ast, 'Failed to parse :nth-child(... of ...)');

  const compound = (ast.selectors[0] as ComplexSelector).items[0] as CompoundSelector;
  const pseudo = compound.selectors[0] as PseudoClassSelector;
  assert.strictEqual(pseudo.type, 'pseudo-class-selector');
  assert.strictEqual(pseudo.name, 'nth-child');
  assert.ok(pseudo.nth, 'Missing nth formula');
  assert.ok(pseudo.argument, 'Missing argument');

  const sheet = new Parser(tokenize(`${input} { color: red; }`)).parseStyleSheet();
  assert.strictEqual(sheet.cssRules.length, 1);
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule.selectorText, ':nth-child(2n+1 of .foo, .bar)');

  // :nth-last-child with 'of'
  const sheetLast = new Parser(tokenize(':nth-last-child(odd of a > b) { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheetLast.cssRules.length, 1);
  const ruleLast = sheetLast.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(ruleLast.selectorText, ':nth-last-child(2n+1 of a > b)');

  // Disallow 'of' in nth-of-type and nth-last-of-type
  assert.strictEqual(Parser.parseSelectorAST(':nth-of-type(1 of .foo)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':nth-last-of-type(1 of .foo)'), null);

  // Disallow pseudo-elements in 'of' clause
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(1 of div::before)'), null);

  // Disallow relative selectors in 'of' clause
  assert.strictEqual(Parser.parseSelectorAST(':nth-child(1 of > div)'), null);
});

test('Phase 81 - Relative selectors in :has() and serialization', () => {
  const selectors = [
    ':has(a)',
    ':has(#a)',
    ':has(.a)',
    ':has([a])',
    ':has([a="b"])',
    ':has(:hover)',
    '.a:has(.b)',
    '.a:has(> .b)',
    '.a:has(~ .b)',
    '.a:has(+ .b)',
    '.a:has(> .foo, + .bar)',
    '.a:has(.b:is(.c .d))',
  ];

  for (const sel of selectors) {
    const sheet = new Parser(tokenize(`${sel} { color: red; }`)).parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 1, `Failed to parse ${sel}`);
    const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
    assert.strictEqual(rule.selectorText, sel, `Serialization mismatch for ${sel}`);
  }

  // :has() cannot be nested
  assert.strictEqual(Parser.parseSelectorAST(':has(:has(a))'), null);
  assert.strictEqual(Parser.parseSelectorAST('.a:has(.b:has(.c))'), null);

  // Pseudo-elements cannot be inside :has()
  assert.strictEqual(Parser.parseSelectorAST(':has(::before)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':has(.a::after)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':has(:before)'), null);
});

test('Phase 81 - Attribute selector null namespace [|att] serialization', () => {
  const sheet = new Parser(tokenize('[|att] { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet.cssRules.length, 1);
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule.selectorText, '[att]');
});

test('Phase 81 - Top-level @media inserting style rules does not prepend &', () => {
  const sheet = new Parser(tokenize('@media all {}')).parseStyleSheet();
  assert.strictEqual(sheet.cssRules.length, 1);
  const mediaRule = sheet.cssRules[0] as unknown as CSSMediaRule;
  mediaRule.insertRule('[foo="bar"] {}', 0);
  assert.strictEqual(mediaRule.cssRules.length, 1);
  const styleRule = mediaRule.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(styleRule.selectorText, '[foo="bar"]');
});

test('Phase 81 - :dir(auto) support', () => {
  const sheet = new Parser(tokenize(':dir(auto) { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet.cssRules.length, 1);
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule.selectorText, ':dir(auto)');
});

test('Phase 81 - :heading support', () => {
  const sheet1 = new Parser(tokenize(':heading { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet1.cssRules.length, 1);
  const rule1 = sheet1.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule1.selectorText, ':heading');

  const sheet2 = new Parser(tokenize(':heading(1, 2) { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet2.cssRules.length, 1);
  const rule2 = sheet2.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(rule2.selectorText, ':heading(1, 2)');

  // Invalid :heading arguments
  assert.strictEqual(Parser.parseSelectorAST(':heading()'), null);
  assert.strictEqual(Parser.parseSelectorAST(':heading(1.5)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':heading(2n)'), null);
});
