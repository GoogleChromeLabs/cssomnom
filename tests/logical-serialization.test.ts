/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

// https://drafts.csswg.org/css-logical-1/#margin-properties
test('logical shorthand serialization: margin-inline', () => {
  const css = 'margin-inline-start: 10px; margin-inline-end: 10px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'margin-inline: 10px;');
});

// https://drafts.csswg.org/css-logical-1/#margin-properties
test('logical shorthand serialization: margin-inline different values', () => {
  const css = 'margin-inline-start: 10px; margin-inline-end: 20px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'margin-inline: 10px 20px;');
});

// https://drafts.csswg.org/css-logical-1/#padding-properties
test('logical shorthand serialization: padding-block', () => {
  const css = 'padding-block-start: 5px; padding-block-end: 5px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'padding-block: 5px;');
});

// https://drafts.csswg.org/css-logical-1/#padding-properties
test('logical shorthand serialization: padding-inline', () => {
  const css = 'padding-inline-start: 2px; padding-inline-end: 4px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'padding-inline: 2px 4px;');
});

// https://drafts.csswg.org/css-logical-1/#position-properties
test('logical shorthand serialization: inset', () => {
  const css = 'inset-block-start: 0px; inset-block-end: 0px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'inset-block: 0px;');
});

// https://drafts.csswg.org/css-logical-1/#border-width
test('logical shorthand serialization: border-block-width', () => {
  const css = 'border-block-start-width: 1px; border-block-end-width: 1px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-block-width: 1px;');
});

// https://drafts.csswg.org/css-logical-1/#border-shorthands
// Skipping these tests because border-block-start/end now expand to longhands,
// and we need to implement border-block in SHORTHANDS or update serializer to combine them.
// Tracked by task: "Cleanup Serializer Debt: Remove `border-block` from `genericShorthands`."
test('logical shorthand serialization: border-block (single value only)', () => {
  const css = 'border-block-start: 1px solid black; border-block-end: 1px solid black;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-block: 1px solid black;');
});

test('logical shorthand serialization: border-block different values (should not combine)', () => {
  const css = 'border-block-start: 1px solid black; border-block-end: 2px dashed red;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-block-start: 1px solid black; border-block-end: 2px dashed red;');
});

test('logical shorthand serialization: border-inline (single value only)', () => {
  const css = 'border-inline-start: 1px solid black; border-inline-end: 1px solid black;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-inline: 1px solid black;');
});

test('logical shorthand serialization: border-inline different values (should not combine)', () => {
  const css = 'border-inline-start: 1px solid black; border-inline-end: 2px dashed red;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-inline-start: 1px solid black; border-inline-end: 2px dashed red;');
});

// https://drafts.csswg.org/css-logical-1/#border-style
test('logical shorthand serialization: border-block-style', () => {
  const css = 'border-block-start-style: solid; border-block-end-style: solid;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-block-style: solid;');
});

// https://drafts.csswg.org/css-logical-1/#border-style
test('logical shorthand serialization: border-block-style different values', () => {
  const css = 'border-block-start-style: solid; border-block-end-style: dashed;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-block-style: solid dashed;');
});

// https://drafts.csswg.org/css-logical-1/#border-color
test('logical shorthand serialization: border-inline-color', () => {
  const css = 'border-inline-start-color: red; border-inline-end-color: blue;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.cssText, 'border-inline-color: red blue;');
});

// https://drafts.csswg.org/cssom-1/#serialize-a-css-declaration-block
test('logical shorthand serialization: intervening declaration prevents combination', () => {
  const css = 'margin-inline-start: 10px; margin-left: 20px; margin-inline-end: 10px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  // Should NOT combine because margin-left is between them and belongs to same group but different mapping logic.
  assert.strictEqual(style.cssText, 'margin-inline-start: 10px; margin-left: 20px; margin-inline-end: 10px;');
});

test('logical shorthand serialization: intervening logical declaration on different axis prevents combination', () => {
  const css = 'margin-inline-start: 10px; margin-block-start: 20px; margin-inline-end: 10px;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  // Should NOT combine margin-inline because margin-block-start is intervening and we removed the isOrthogonal hack.
  assert.strictEqual(style.cssText, 'margin-inline-start: 10px; margin-block-start: 20px; margin-inline-end: 10px;');
});

