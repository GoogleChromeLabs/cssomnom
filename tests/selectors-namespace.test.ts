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
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleSheet, CSSStyleRule } from '../src/CSSOM.ts';


test('Selector namespace support (|)', () => {
  const cases = [
    ['ns|div', 'ns', 'div'],
    ['*|div', '*', 'div'],
    ['|div', '', 'div'],
    ['ns|*', 'ns', '*'],
    ['*|*', '*', '*'],
    ['|*', '', '*'],
  ];

  for (const [input, ns, name] of cases) {
    const ast = Parser.parseSelectorAST(input);
    assert.ok(ast, `Failed to parse: ${input}`);
    assert.strictEqual((ast.selectors[0] as import('../src/types.ts').ComplexSelector).items.length, 1, `Should have 1 item for ${input}`);
    const compound = (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector;
    assert.strictEqual(compound.type, 'compound-selector');
    const simple = compound.selectors[0] as import('../src/types.ts').TypeSelector;
    assert.strictEqual(simple.namespace, ns, `Namespace mismatch for ${input}`);
    if (name === '*') {
      assert.strictEqual(simple.type, 'universal-selector');
    } else {
      assert.strictEqual(simple.type, 'type-selector');
      assert.strictEqual(simple.name, name);
    }
  }
});

test('Attribute selector namespace support', () => {
    const ast = Parser.parseSelectorAST('[ns|attr]');
    assert.ok(ast);
    const simple = ((ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0];
    assert.strictEqual(simple.type, 'attribute-selector');
    assert.strictEqual(simple.namespace, 'ns');
    assert.strictEqual(simple.name, 'attr');

    const ast2 = Parser.parseSelectorAST('[*|attr]');
    assert.ok(ast2);
    const simple2 = ((ast2.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0] as import('../src/types.ts').UniversalSelector;
    assert.strictEqual(simple2.namespace, '*');

    const ast3 = Parser.parseSelectorAST('[|attr]');
    assert.ok(ast3);
    const simple3 = ((ast3.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0] as import('../src/types.ts').AttributeSelector;
    assert.strictEqual(simple3.namespace, '');
});

test('Undeclared namespace prefix: parseStyleSheet drops rule, insertRule throws DOMException', () => {
  // Stylesheet parsing should drop the rule (as per CSS error recovery)
  const sheet1 = new Parser(tokenize('ns|div { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet1.cssRules.length, 0);

  const sheet2 = new Parser(tokenize('[ns|attr] { color: red; }')).parseStyleSheet();
  assert.strictEqual(sheet2.cssRules.length, 0);

  // insertRule should throw a SyntaxError DOMException
  const sheet3 = new CSSStyleSheet();
  assert.throws(() => {
    sheet3.insertRule('ns|div { color: red; }', 0);
  }, (err: unknown) => {
    return err instanceof DOMException && err.name === 'SyntaxError';
  });

  assert.throws(() => {
    sheet3.insertRule('[ns|attr] { color: red; }', 0);
  }, (err: unknown) => {
    return err instanceof DOMException && err.name === 'SyntaxError';
  });

  // Valid if declared:
  const rules = new Parser(tokenize(`
    @namespace ns "http://www.w3.org/1999/xhtml";
    ns|div { color: red; }
    [ns|attr] { color: red; }
  `)).parseStyleSheet().cssRules;
  assert.strictEqual(rules.length, 3);
  assert.strictEqual(rules[1].type, 1); // STYLE_RULE
  assert.strictEqual(rules[2].type, 1); // STYLE_RULE
});

test('CSSStyleRule.selectorText setter with undeclared namespace prefix', () => {
  const sheet = new CSSStyleSheet();
  sheet.insertRule('@namespace ns "http://example.com";', 0);
  sheet.insertRule('div { color: red; }', 1);
  const rule = sheet.cssRules[1] as CSSStyleRule;
  
  // Setting declared namespace prefix works:
  rule.selectorText = 'ns|div';
  assert.strictEqual(rule.selectorText, 'ns|div');
  
  // Setting undeclared namespace prefix does not mutate (ignores):
  const originalSelector = rule.selectorText;
  rule.selectorText = 'other|div';
  assert.strictEqual(rule.selectorText, originalSelector);
});

