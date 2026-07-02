/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSStyleDeclaration } from '../src/index.ts';
import { SHORTHANDS, type ShorthandDefinition } from '../src/shorthands.ts';
import { serialize } from '../src/serializer.ts';

test('logical keyword in margin shorthand', () => {
  const css = '.test { margin: logical 1px 2px 3px 4px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('margin-block-start').trim(), '1px');
  assert.strictEqual(rule.style.getPropertyValue('margin-inline-start').trim(), '2px');
  assert.strictEqual(rule.style.getPropertyValue('margin-block-end').trim(), '3px');
  assert.strictEqual(rule.style.getPropertyValue('margin-inline-end').trim(), '4px');
  
  // Physical properties should NOT return values via aliasing in StyleDeclaration
  assert.strictEqual(rule.style.getPropertyValue('margin-top'), '');
});

test('logical keyword in padding shorthand (2 values)', () => {
  const css = '.test { padding: logical 10px 20px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('padding-block-start').trim(), '10px');
  assert.strictEqual(rule.style.getPropertyValue('padding-block-end').trim(), '10px');
  assert.strictEqual(rule.style.getPropertyValue('padding-inline-start').trim(), '20px');
  assert.strictEqual(rule.style.getPropertyValue('padding-inline-end').trim(), '20px');
});

test('serialization of logical shorthand', () => {
  const css = '.test { margin-block-start: 1px; margin-inline-start: 2px; margin-block-end: 3px; margin-inline-end: 4px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  // This should contract to logical margin because logical properties were set
  assert.strictEqual(rule.style.getPropertyValue('margin'), 'logical 1px 2px 3px 4px');
});

test('logical keyword in inset shorthand', () => {
  const css = '.test { inset: logical 1px 2px 3px 4px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('inset-block-start').trim(), '1px');
  assert.strictEqual(rule.style.getPropertyValue('inset-inline-start').trim(), '2px');
  assert.strictEqual(rule.style.getPropertyValue('inset-block-end').trim(), '3px');
  assert.strictEqual(rule.style.getPropertyValue('inset-inline-end').trim(), '4px');
});

test('precedence of physical vs logical in shorthand contraction (respect cascade order) - updated to expect empty string on conflict', () => {
  const css = '.test { margin-top: 10px; margin-right: 10px; margin-bottom: 10px; margin-left: 10px; margin-block-start: 20px; margin-inline-start: 20px; margin-block-end: 20px; margin-inline-end: 20px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;
  
  // Should return empty string because of conflict between physical and logical properties
  assert.strictEqual(rule.style.getPropertyValue('margin'), '');
  
  // Now test the reverse order
  const css2 = '.test { margin-block-start: 20px; margin-inline-start: 20px; margin-block-end: 20px; margin-inline-end: 20px; margin-top: 30px; margin-right: 30px; margin-bottom: 30px; margin-left: 30px; }';
  const tokens2 = tokenize(css2);
  const parser2 = new Parser(tokens2);
  const stylesheet2 = parser2.parseStyleSheet();
  const rule2 = stylesheet2.cssRules[0] as unknown as CSSStyleRule;
  
  // Should also return empty string because of conflict
  assert.strictEqual(rule2.style.getPropertyValue('margin'), '');
});

test('border-block-start shorthand', () => {
  const css = '.test { border-block-start: 1px solid red; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-block-start-width').trim(), '1px');
  assert.strictEqual(rule.style.getPropertyValue('border-block-start-style').trim(), 'solid');
  assert.strictEqual(rule.style.getPropertyValue('border-block-start-color').trim(), 'red');
});

test('border-block-start contraction', () => {
  const css = '.test { border-block-start-width: 1px; border-block-start-style: solid; border-block-start-color: red; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-block-start').trim(), '1px solid red');
});

test('border-block-end shorthand', () => {
  const css = '.test { border-block-end: 2px dashed blue; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-block-end-width').trim(), '2px');
  assert.strictEqual(rule.style.getPropertyValue('border-block-end-style').trim(), 'dashed');
  assert.strictEqual(rule.style.getPropertyValue('border-block-end-color').trim(), 'blue');
});

test('border-block shorthand', () => {
  const css = '.test { border-block: 1px solid red; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-block-start-width').trim(), '1px');
  assert.strictEqual(rule.style.getPropertyValue('border-block-start-style').trim(), 'solid');
  assert.strictEqual(rule.style.getPropertyValue('border-block-start-color').trim(), 'red');
  assert.strictEqual(rule.style.getPropertyValue('border-block-end-width').trim(), '1px');
  assert.strictEqual(rule.style.getPropertyValue('border-block-end-style').trim(), 'solid');
  assert.strictEqual(rule.style.getPropertyValue('border-block-end-color').trim(), 'red');
});

test('border-inline shorthand', () => {
  const css = '.test { border-inline: 2px dashed blue; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-inline-start-width').trim(), '2px');
  assert.strictEqual(rule.style.getPropertyValue('border-inline-start-style').trim(), 'dashed');
  assert.strictEqual(rule.style.getPropertyValue('border-inline-start-color').trim(), 'blue');
  assert.strictEqual(rule.style.getPropertyValue('border-inline-end-width').trim(), '2px');
  assert.strictEqual(rule.style.getPropertyValue('border-inline-end-style').trim(), 'dashed');
  assert.strictEqual(rule.style.getPropertyValue('border-inline-end-color').trim(), 'blue');
});

test('border-block contraction', () => {
  const css = '.test { border-block-start-width: 1px; border-block-start-style: solid; border-block-start-color: red; border-block-end-width: 1px; border-block-end-style: solid; border-block-end-color: red; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('border-block').trim(), '1px solid red');
});

test('mixed physical and logical overrides return empty string for shorthand', () => {
  const css = '.test { margin-top: 10px; margin-inline-start: 20px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  // Should return empty string because it's a mix that doesn't form a complete set of either physical or logical
  assert.strictEqual(rule.style.getPropertyValue('margin'), '');
});

test('all physical set but logical override returns empty string for shorthand', () => {
  const css = '.test { margin-top: 10px; margin-right: 10px; margin-bottom: 10px; margin-left: 10px; margin-inline-start: 20px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  // Should return empty string because margin-inline-start overrides one of the physical properties
  assert.strictEqual(rule.style.getPropertyValue('margin'), '');
});

test('getPropertyValue contracts to logical when logical keyword is present in definition but lengths differ', () => {
  // Mock a shorthand
  const mockShorthand: ShorthandDefinition = {
    longhands: ['x-top', 'x-right', 'x-bottom', 'x-left'],
    logicalLonghands: ['x-block-start', 'x-inline-start'],
    expand: () => null,
    contract: (values) => {
      const bs = values['x-block-start'];
      const is = values['x-inline-start'];
      if (bs && is) return `logical ${serialize(bs)} ${serialize(is)}`;
      return null;
    }
  };

  SHORTHANDS['x-mock'] = mockShorthand;

  const style = new CSSStyleDeclaration([
    { type: 'declaration', name: 'x-block-start', value: tokenize('10px'), important: false },
    { type: 'declaration', name: 'x-inline-start', value: tokenize('20px'), important: false }
  ]);

  assert.strictEqual(style.getPropertyValue('x-mock'), 'logical 10px 20px');

  // Clean up
  delete SHORTHANDS['x-mock'];
});

test('getPropertyPriority returns empty string when mixed physical and logical overrides make shorthand invalid', () => {
  const css = '.test { margin-top: 10px !important; margin-right: 10px !important; margin-bottom: 10px !important; margin-left: 10px !important; margin-inline-start: 20px !important; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const rule = stylesheet.cssRules[0] as unknown as CSSStyleRule;

  // getPropertyValue returns '' because of the mix
  assert.strictEqual(rule.style.getPropertyValue('margin'), '');
  // getPropertyPriority should also return ''
  assert.strictEqual(rule.style.getPropertyPriority('margin'), '');
});



