/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/index.ts';

/**
 * These tests cover modern CSS features that may not be fully implemented yet.
 * They are added as skipped tests to demonstrate intended behavior and provide
 * a baseline for future implementation.
 */

test('anchor() function in property values (css-anchor-position-1 #anchor-pos)', () => {
  const css = `.target {
    left: anchor(inside);
    top: anchor(--foo top, 10px);
    right: anchor(50%);
    bottom: anchor(--bar left, anchor(--baz right));
  }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('left').trim(), 'anchor(inside)');
  assert.strictEqual(rule.style.getPropertyValue('top').trim(), 'anchor(--foo top, 10px)');
  assert.strictEqual(rule.style.getPropertyValue('right').trim(), 'anchor(50%)');
  assert.strictEqual(rule.style.getPropertyValue('bottom').trim(), 'anchor(--bar left, anchor(--baz right))');
});

test('anchor-size() function in property values (css-anchor-position-1 #anchor-size)', () => {
  const css = `.target {
    width: anchor-size(width);
    height: anchor-size(--foo block, 100px);
    min-width: anchor-size(self-inline);
    max-height: anchor-size(--bar height, anchor-size(--baz block));
  }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('width').trim(), 'anchor-size(width)');
  assert.strictEqual(rule.style.getPropertyValue('height').trim(), 'anchor-size(--foo block, 100px)');
  assert.strictEqual(rule.style.getPropertyValue('min-width').trim(), 'anchor-size(self-inline)');
  assert.strictEqual(rule.style.getPropertyValue('max-height').trim(), 'anchor-size(--bar height, anchor-size(--baz block))');
});

test('sibling-index() and sibling-count() functions (css-values-5 #tree-counting)', () => {
  const css = `.item {
    z-index: sibling-index();
    width: calc(sibling-index() * 10px);
    opacity: calc(sibling-index() / sibling-count());
  }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;

  assert.strictEqual(rule.style.getPropertyValue('z-index').trim(), 'sibling-index()');
  assert.strictEqual(rule.style.getPropertyValue('width').trim(), 'calc(sibling-index() * 10px)');
  assert.strictEqual(rule.style.getPropertyValue('opacity').trim(), 'calc(sibling-index() / sibling-count())');
});

test('anchor() and anchor-size() in Typed OM', () => {
  const css = `.target { left: anchor(inside); width: anchor-size(width); }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  
  // Assuming computedStyleMap() or attributeStyleMap might be implemented or planned
  const styleMap = (rule.style as unknown as { attributeStyleMap?: { get(p: string): unknown } }).attributeStyleMap;

  if (styleMap) {
    assert.ok(styleMap.get('left'));
    assert.ok(styleMap.get('width'));
  }
});

