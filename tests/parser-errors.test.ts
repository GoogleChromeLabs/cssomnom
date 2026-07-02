/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import * as assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import type { ParseError, ComponentValue } from '../src/types.ts';
import { ArrayComponentValueStream } from '../src/TokenStream.ts';

test('Parser reports error on unexpected EOF in qualified rule', () => {
  const tokens = tokenize('a');
  const parser = new Parser(tokens);
  parser.consumeListOfRules(true);
  
  assert.ok(parser.errors);
  assert.strictEqual(parser.errors.length, 1);
  assert.strictEqual(parser.errors[0].message, 'Unexpected EOF in qualified rule');
});

test('Parser reports error on unexpected EOF in block', () => {
  const tokens = tokenize('a [');
  const parser = new Parser(tokens);
  parser.consumeListOfRules(true);
  
  assert.ok(parser.errors);
  assert.strictEqual(parser.errors.length, 2);
  assert.strictEqual(parser.errors[0].message, 'Unexpected EOF in block');
  assert.strictEqual(parser.errors[1].message, 'Unexpected EOF in qualified rule');
});

test('Parser reports error on unexpected EOF in function', () => {
  const tokens = tokenize('a func(');
  const parser = new Parser(tokens);
  parser.consumeListOfRules(true);
  
  assert.ok(parser.errors);
  assert.strictEqual(parser.errors.length, 2);
  assert.strictEqual(parser.errors[0].message, 'Unexpected EOF in function');
  assert.strictEqual(parser.errors[1].message, 'Unexpected EOF in qualified rule');
});

test('Tokenizer reports error on unclosed comment', () => {
  const errors: ParseError[] = [];
  tokenize('/* unclosed comment', false, errors);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].message, 'EOF reached before comment was closed');
});

test('Parser recovers from invalid rule in block and does not drop subsequent declarations', () => {
  const css = `
    .container {
      invalid-rule;
      valid-prop: blue;
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const rules = parser.consumeListOfRules(true);

  assert.strictEqual(rules.length, 1);
  const styleRule = rules[0] as unknown as { style: { getPropertyValue(name: string): string } };
  assert.ok(styleRule.style);
  assert.strictEqual(styleRule.style.getPropertyValue('valid-prop'), 'blue');
});

test('Parser breaks on } in consumeRemnantsOfABadDeclaration when nested is true', () => {
  const css = `
    .container {
      !invalid
    }
    .other {
      color: green;
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const rules = parser.consumeListOfRules(true);

  assert.strictEqual(rules.length, 2);
  const firstRule = rules[0] as unknown as { selectorText: string };
  assert.strictEqual(firstRule.selectorText, '.container');
  
  const secondRule = rules[1] as unknown as { selectorText: string };
  assert.strictEqual(secondRule.selectorText, '.other');
});

test('consumeRemnantsOfABadDeclaration breaks on } when nested is true (using ArrayComponentValueStream)', () => {
  const css = `!invalid } color: green;`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  
  const declarations = parser.consumeDeclarationsFromBlockContents(componentValues);

  assert.strictEqual(declarations.length, 0);
});

test('consumeRemnantsOfABadDeclaration continues on } when nested is false', () => {
  const css = `prop: { color: blue; } } .valid { color: green; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const rules = parser.consumeListOfRules(true);

  assert.strictEqual(rules.length, 0);
});

test('consumeBlockContents strictly uses true in fallback invocation of consumeRemnantsOfABadDeclaration', () => {
  const parser = new Parser([]);
  const values: ComponentValue[] = [
    { type: 'ident', value: 'invalid' },
    { type: '}', value: '}' },
    { type: 'ident', value: 'color' },
    { type: 'colon', value: ':' },
    { type: 'ident', value: 'blue' }
  ];
  const stream = new ArrayComponentValueStream(values);
  
  const rules = (parser as unknown as { consumeBlockContents: (stream: ArrayComponentValueStream, nested: boolean) => unknown[] }).consumeBlockContents(stream, false);

  assert.strictEqual(stream.peek().type, '}');
  assert.strictEqual(rules.length, 0);
});

test('Parser does not skip subsequent rules after qualified rule that looks like declaration with length 2', () => {
  const css = `foo: { color: red; } .valid { color: green; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const rules = parser.consumeListOfRules(true);

  assert.strictEqual(rules.length, 1);
  const rule = rules[0] as unknown as { selectorText: string };
  assert.strictEqual(rule.selectorText, '.valid');
});

test('Parser reports error on unexpected } in qualified rule', () => {
  const tokens = tokenize('a }');
  const parser = new Parser(tokens);
  parser.consumeListOfRules(true);
  
  assert.ok(parser.errors);
  assert.strictEqual(parser.errors.length, 2);
  assert.strictEqual(parser.errors[0].message, 'Unexpected } in qualified rule');
  assert.strictEqual(parser.errors[1].message, 'Unexpected EOF in qualified rule');
});

