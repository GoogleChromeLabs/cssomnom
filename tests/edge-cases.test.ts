/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';

import { CSSStyleDeclaration, CSSStyleSheet, CSSStyleRule, CSSNestedDeclarations } from '../src/index.ts';
import type { Token, SimpleBlock } from '../src/types.ts';

interface TestParser {
  consumeComponentValue(): Token | SimpleBlock;
  consumeRule(): unknown;
  tokens: { index: number; tokens: Token[] };
}

test('Tokenizer: Escaped EOF', () => {
  // Reaching EOF immediately after \\ should turn into U+FFFD
  const tokens1 = tokenize('foo\\');
  assert.strictEqual(tokens1.length, 2); // ident, EOF
  assert.strictEqual(tokens1[0].type, 'ident');
  assert.strictEqual(tokens1[0].value, 'foo\uFFFD');
});

test('Tokenizer: Comments acting as separators', () => {
  // foo/*comment*/() should produce ident, (, ), EOF
  const tokens = tokenize('foo/*comment*/()');
  assert.strictEqual(tokens.length, 4);
  assert.strictEqual(tokens[0].type, 'ident');
  assert.strictEqual(tokens[0].value, 'foo');
  assert.strictEqual(tokens[1].type, '(');
  assert.strictEqual(tokens[2].type, ')');
});

test('Tokenizer: Null character replacement', () => {
  // \\0 should be replaced with U+FFFD
  const tokens = tokenize('foo\0bar');
  assert.strictEqual(tokens.length, 2); // ident, EOF
  assert.strictEqual(tokens[0].type, 'ident');
  assert.strictEqual(tokens[0].value, 'foo\uFFFDbar');
});

test('Tokenizer: Preserved error tokens', () => {
  // Newline in string creates a bad-string token
  const tokens = tokenize(`"foo
bar"`);
  assert.strictEqual(tokens.length, 5); // bad-string, whitespace, ident, string, EOF
  assert.strictEqual(tokens[0].type, 'bad-string');
});

test('Parser: Custom property vs. rule ambiguity', () => {
  const css = `div { --x:hover { } .b { } }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.type, 1); // STYLE_RULE
  
  // It should be parsed as a custom property --x
  const style = rule.style;
  assert.ok(style.getPropertyValue('--x'));
});

// https://drafts.csswg.org/css-nesting-1/#nested-declarations
test('Parser: At-rules inside declaration lists', () => {
  const css = `div { @at {}; color: green; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  
  // Declarations after at-rules should be in cssRules as CSSNestedDeclarations
  assert.strictEqual(rule.cssRules.length, 2);
  assert.strictEqual(rule.cssRules.item(1)!.type, 0); // NESTED_DECLARATIONS_RULE
  
  const nestedDeclRule = rule.cssRules.item(1) as CSSNestedDeclarations;
  assert.strictEqual(nestedDeclRule.style.getPropertyValue('color'), 'green');
  
  // style attribute should be empty for declarations appearing after rules
  assert.strictEqual(rule.style.getPropertyValue('color'), '');
});

test('Parser: Autoclosing EOF', () => {
  const css = `.foo { transform: translate(50px`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.selectorText, '.foo');
});

test('Parser: Variables and {} blocks in declarations', () => {
  // Standard properties allow lone {} blocks
  const css1 = `div { color: { var(--x) }; }`;
  const stylesheet1 = new Parser(tokenize(css1)).parseStyleSheet();
  const rule1 = stylesheet1.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule1.style.getPropertyValue('color'), '{ var(--x) }');
  
  // Custom properties accept any token stream
  const css2 = `div { --y: { var(--x) }; }`;
  const stylesheet2 = new Parser(tokenize(css2)).parseStyleSheet();
  const rule2 = stylesheet2.cssRules[0] as CSSStyleRule;
  assert.ok(rule2.style.getPropertyValue('--y'));
});

test('Parser: !important flag whitespace and absorbed comments', () => {
  const css = `div { color: green ! /* comment */ important; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('color'), 'green');
  assert.strictEqual(rule.style.getPropertyPriority('color'), 'important');
});

test('Parser: !important flag preserves preceding whitespace', () => {
  const css = `div { color: green !important; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('color'), 'green');
  assert.strictEqual(rule.style.getPropertyPriority('color'), 'important');
});

test('CSSOM: null in setProperty()', () => {
  const style = new CSSStyleDeclaration([]);
  
  style.setProperty('color', 'green');
  assert.strictEqual(style.getPropertyValue('color'), 'green');
  style.setProperty('color', null as unknown as string);
  assert.strictEqual(style.getPropertyValue('color'), '');
});

test('CSSOM: Trailing garbage in insertRule', () => {

  const sheet = CSSStyleSheet.createInternal([], Parser.parseRuleText);
  
  assert.throws(() => {
    sheet.insertRule("@import url(...); html { }", 0);
  }, (e: unknown) => e instanceof Error && e.name === 'SyntaxError');
});

test('CSSOM: Serialization of cssText final delimiter', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('left', '10px');
  assert.strictEqual(style.cssText, 'left: 10px;');
});

test('CSSOM: The all shorthand', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('width', '50px');
  style.setProperty('color', 'green');
  style.setProperty('direction', 'rtl');
  
  style.removeProperty('all');
  assert.strictEqual(style.getPropertyValue('direction'), 'rtl');
  assert.strictEqual(style.getPropertyValue('width'), '');
  assert.strictEqual(style.getPropertyValue('color'), '');
});

test('CSSOM: The all shorthand and logical properties tie-breaker', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('all', 'initial');
  
  const margin = style.getPropertyValue('margin');
  assert.strictEqual(margin, 'initial', 'Physical should win when both are set by all');
});

test('CSSOM: Shorthand serialization with logical properties', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('margin-inline-start', '10px');
  style.setProperty('margin-inline-end', '10px');
  
  // Spec says it should be combined into margin-inline
  // but we don't support shorthand serialization yet.
  assert.strictEqual(style.cssText, 'margin-inline: 10px;');
});

test('Tokenizer: EOF in comment', () => {
  const tokens = tokenize('foo/*comment');
  assert.strictEqual(tokens.length, 2); // ident, EOF
  assert.strictEqual(tokens[0].type, 'ident');
  assert.strictEqual(tokens[0].value, 'foo');
});

test('Tokenizer: EOF in string', () => {
  const tokens = tokenize('"string');
  assert.strictEqual(tokens.length, 2); // string, EOF
  assert.strictEqual(tokens[0].type, 'string');
  assert.strictEqual(tokens[0].value, 'string');
});

test('Tokenizer: EOF in URL', () => {
  const tokens = tokenize('url(http://example.com');
  assert.strictEqual(tokens.length, 2); // url, EOF
  assert.strictEqual(tokens[0].type, 'url');
  assert.strictEqual(tokens[0].value, 'http://example.com');
});

test('Tokenizer: Invalid character in URL', () => {
  const tokens = tokenize('url(http://example.com")');
  assert.strictEqual(tokens.length, 2); // bad-url, EOF
  assert.strictEqual(tokens[0].type, 'bad-url');
});

test('Parser: Unclosed constructs in selectors', () => {
  const parser = new Parser(tokenize('div[foo'));
  const val1 = (parser as unknown as TestParser).consumeComponentValue();
  const val2 = (parser as unknown as TestParser).consumeComponentValue();
  
  assert.strictEqual(val1.type, 'ident');
  assert.strictEqual(val1.value, 'div');
  
  assert.strictEqual(val2.type, 'simple-block');
  assert.strictEqual((val2 as SimpleBlock).associatedToken.type, '[');
  
  const parser2 = new Parser(tokenize(':nth-child(1'));
  const val3 = (parser2 as unknown as TestParser).consumeComponentValue(); // :
  const val4 = (parser2 as unknown as TestParser).consumeComponentValue(); // nth-child(1
  
  assert.strictEqual(val3.type, 'colon');
  assert.strictEqual(val4.type, 'function');
  assert.strictEqual((val4 as unknown as { name: string }).name, 'nth-child');
});

test('Tokenizer: More Escaped EOF cases', () => {
  const tokens2 = tokenize(`"string\\`);
  assert.strictEqual(tokens2.length, 2); // string, EOF
  assert.strictEqual(tokens2[0].type, 'string');
  assert.strictEqual(tokens2[0].value, 'string'); // ignored in string
  
  const tokens3 = tokenize(`url(http://example.com\\`);
  assert.strictEqual(tokens3.length, 2); // url, EOF
  assert.strictEqual(tokens3[0].type, 'url');
  assert.strictEqual(tokens3[0].value, 'http://example.com\ufffd');
});

test('Parser: unicode-range descriptor', () => {
  const css = `.foo { unicode-range: U+0025-00FF; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('unicode-range'), 'U+0025-00FF');
});

test('Parser: Comments are absorbed even in custom properties', () => {
  const css = `div { --x: /* comment */ green; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('--x'), 'green');
});

test('Parser: Reject invalid top-level tokens in custom properties', () => {
  const css = `div { --unmatched-paren: ); --unmatched-bracket: ]; --exclamation: !; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('--unmatched-paren'), '');
  assert.strictEqual(rule.style.getPropertyValue('--unmatched-bracket'), '');
  assert.strictEqual(rule.style.getPropertyValue('--exclamation'), '');
});

// https://drafts.csswg.org/css-variables-1/#serializing-custom-props
test('Parser: Serialize empty custom properties as a single space', () => {
  const css = `div { --empty:; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('--empty'), ' ');
  assert.strictEqual(rule.style.cssText, '--empty: ;');
});

// https://drafts.csswg.org/css-variables-1/#syntax
// https://drafts.csswg.org/css-variables-1/#serializing-custom-props
test('Parser: Custom property names and values are case-sensitive', () => {
  const css = `div { --CamelCase: UpperCaseText; --camelCase: lowerCaseText; }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  
  assert.strictEqual(rule.style.getPropertyValue('--CamelCase'), 'UpperCaseText');
  assert.strictEqual(rule.style.getPropertyValue('--camelCase'), 'lowerCaseText');
  assert.strictEqual(rule.style.cssText, '--CamelCase: UpperCaseText; --camelCase: lowerCaseText;');
});
