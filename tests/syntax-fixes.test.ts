/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSStyleRule, CSSStyleDeclaration } from '../src/index.ts';

test('Tokenizer absorbs comments', () => {
  const css = 'a { color: /* comment */ red; } /* another comment */';
  const tokens = tokenize(css);

  // Check that no 'comment' tokens are present
  assert.ok(!tokens.some(t => t.type === 'comment'));

  // Verify basic structure is still there
  const types = tokens.map(t => t.type);
  assert.ok(types.includes('ident'));
  assert.ok(types.includes('{'));
  assert.ok(types.includes('colon'));
  assert.ok(types.includes('}'));
});

test('unicode-range token numeric values', () => {
  // Test single value
  let tokens = tokenize('U+26', true);
  let token = tokens.find(t => t.type === 'unicode-range');
  assert.strictEqual(token?.unicodeRangeStart, 0x26);
  assert.strictEqual(token?.unicodeRangeEnd, 0x26);

  // Test range
  tokens = tokenize('U+0025-00FF', true);
  token = tokens.find(t => t.type === 'unicode-range');
  assert.strictEqual(token?.unicodeRangeStart, 0x25);
  assert.strictEqual(token?.unicodeRangeEnd, 0xFF);

  // Test question marks
  tokens = tokenize('U+4??', true);
  token = tokens.find(t => t.type === 'unicode-range');
  assert.strictEqual(token?.unicodeRangeStart, 0x400);
  assert.strictEqual(token?.unicodeRangeEnd, 0x4FF);
});

test('CDO/CDC in nested blocks', () => {
  const css = 'a { <!-- color: red; --> }';
  const tokens = tokenize(css);
  const types = tokens.map(t => t.type);

  assert.ok(types.includes('CDO'));
  assert.ok(types.includes('CDC'));
});

test('CDO/CDC in blocks are treated as regular tokens (not ignored)', () => {
  const css = 'a { <!-- color: red; width: 10px; }';
  const parser = new Parser(tokenize(css));
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;

  // If CDO is ignored, color: red will be parsed, and width: 10px will be parsed.
  // So length would be 2.
  // If CDO is treated as regular token, it fails declaration and rule parsing,
  // and skipToNextSemicolonOrBlock skips until the first semicolon.
  // So '<!-- color: red;' is skipped.
  // Only 'width: 10px;' should be parsed.
  // So length should be 1.

  assert.strictEqual(rule.style.length, 1);
  assert.strictEqual(rule.style.getPropertyValue('width'), '10px');
  assert.strictEqual(rule.style.getPropertyValue('color'), '');
});

test('Lone block in declaration is allowed', () => {
  const css = 'a { color: { red: green }; width: 10px; }';
  const parser = new Parser(tokenize(css));
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;

  assert.strictEqual(rule.style.length, 2);
  assert.strictEqual(rule.style.getPropertyValue('width'), '10px');
});

test('Non-lone block in declaration is rejected', () => {
  const css = 'a { color: red { red: green }; width: 10px; }';
  const parser = new Parser(tokenize(css));
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;

  assert.strictEqual(rule.style.length, 1);
  assert.strictEqual(rule.style.getPropertyValue('width'), '10px');
});

test('Strip trailing whitespace after !important', () => {
  const css = 'a { color: red !important; }';
  const parser = new Parser(tokenize(css));
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;

  const decl = rule.style.declarations.find(d => d.name === 'color');
  assert.ok(decl);
  const lastToken = decl.value[decl.value.length - 1];
  assert.notStrictEqual(lastToken?.type, 'whitespace', 'Last token should not be whitespace');
});

test('CSSStyleDeclaration: setProperty rejects bad-string', () => {
  const style = new CSSStyleDeclaration([]);
  
  // Unclosed string with newline is a bad-string token!
  style.setProperty('content', '"foo\nbar"');
  assert.strictEqual(style.getPropertyValue('content'), '');
});

test('CSSStyleDeclaration: setProperty rejects bad-url', () => {
  const style = new CSSStyleDeclaration([]);
  
  // url(http://example.com/ "bad") is a bad-url token!
  style.setProperty('background-image', 'url(http://example.com/ "bad")');
  assert.strictEqual(style.getPropertyValue('background-image'), '');
});
