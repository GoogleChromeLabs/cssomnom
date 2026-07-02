/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleSheet, CSSStyleRule, CSSMediaRule, CSSKeyframesRule, CSSKeyframeRule, parse } from '../src/index.ts';

test('CSSStyleSheet.insertRule and deleteRule', () => {
  const parser = new Parser([]);
  const sheet = parser.parseStyleSheet();
  
  assert.strictEqual(sheet.cssRules.length, 0);
  
  const index = sheet.insertRule('.foo { color: red; }', 0);
  assert.strictEqual(index, 0);
  assert.strictEqual(sheet.cssRules.length, 1);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), '.foo');
  
  sheet.insertRule('.bar { color: blue; }', 0);
  assert.strictEqual(sheet.cssRules.length, 2);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), '.bar');
  assert.strictEqual((sheet.cssRules[1] as CSSStyleRule).selectorText.trim(), '.foo');
  
  sheet.deleteRule(0);
  assert.strictEqual(sheet.cssRules.length, 1);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), '.foo');
});

test('CSSStyleSheet.insertRule hierarchy constraints', () => {
  const parser = new Parser([]);
  const sheet = parser.parseStyleSheet();
  
  // Should allow @import in empty sheet
  sheet.insertRule('@import "foo.css";', 0);
  assert.strictEqual(sheet.cssRules.length, 1);
  
  // Should allow @namespace after @import
  sheet.insertRule('@namespace url(http://www.w3.org/1999/xhtml);', 1);
  assert.strictEqual(sheet.cssRules.length, 2);
  
  // Should allow regular rule at the end
  sheet.insertRule('.style { color: red; }', 2);
  assert.strictEqual(sheet.cssRules.length, 3);
  
  // Inserting @import after regular rule should fail
  assert.throws(() => {
    sheet.insertRule('@import "bar.css";', 3);
  }, /HierarchyRequestError/);
  
  // Inserting @import before regular rule should succeed if inserted at index 0
  sheet.insertRule('@import "bar.css";', 0);
  assert.strictEqual(sheet.cssRules.length, 4);

  
  // Inserting @namespace after regular rule should fail
  assert.throws(() => {
    sheet.insertRule('@namespace "ns";', 3);
  }, /InvalidStateError/);
  
  // Inserting @namespace before @import should fail
  assert.throws(() => {
    sheet.insertRule('@namespace "ns";', 0);
  }, /InvalidStateError|HierarchyRequestError/);
});


test('CSSStyleRule.insertRule and deleteRule', () => {
  const css = `.card { background: white; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  const cardRule = sheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(cardRule.cssRules.length, 0);
  
  cardRule.insertRule('&.is-active { background: blue; }', 0);
  assert.strictEqual(cardRule.cssRules.length, 1);
  assert.strictEqual((cardRule.cssRules.item(0) as unknown as CSSStyleRule).selectorText.trim(), '&.is-active');
  
  cardRule.insertRule('z-index: 3;', 0);
  assert.strictEqual(cardRule.cssRules.length, 2);
  // The inserted declaration should be wrapped in CSSNestedDeclarations (type 0)
  assert.strictEqual(cardRule.cssRules.item(0)?.type, 0);
  
  cardRule.deleteRule(0);
  assert.strictEqual(cardRule.cssRules.length, 1);
  assert.strictEqual((cardRule.cssRules.item(0) as unknown as CSSStyleRule).selectorText.trim(), '&.is-active');
});


test('CSSStyleRule.selectorText setter', () => {
  const css = `.foo { color: red; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  
  assert.strictEqual(rule.selectorText, '.foo');
  
  rule.selectorText = '.bar';
  assert.strictEqual(rule.selectorText, '.bar');
  assert.strictEqual(rule.cssText.trim(), '.bar { color: red; }');
  
  // Invalid selector should be ignored (do nothing)
  rule.selectorText = '.baz { color: green; }'; // This is a whole rule, not a selector
  assert.strictEqual(rule.selectorText, '.bar');
  
  rule.selectorText = '@media';
  assert.strictEqual(rule.selectorText, '.bar');
});

test('CSSStyleDeclaration.setProperty and removeProperty', () => {
  const css = `.card { background: white; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  const cardRule = sheet.cssRules[0] as CSSStyleRule;
  const style = cardRule.style;
  
  assert.strictEqual(style.getPropertyValue('background').trim(), 'white');
  
  style.setProperty('color', 'black');
  assert.strictEqual(style.getPropertyValue('color').trim(), 'black');
  
  style.setProperty('background', 'blue', 'important');
  assert.strictEqual(style.getPropertyValue('background').trim(), 'blue');
  assert.strictEqual(style.getPropertyPriority('background'), 'important');
  
  const removed = style.removeProperty('color');
  assert.strictEqual(removed.trim(), 'black');
  assert.strictEqual(style.getPropertyValue('color'), '');
});

test('cssText serialization', () => {
  const css = `.card { background: white; color: black; }`;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  
  const cardRule = sheet.cssRules[0] as CSSStyleRule;
  
  assert.strictEqual(cardRule.style.cssText.trim(), 'background: white; color: black;');
  assert.strictEqual(cardRule.cssText.trim(), '.card { background: white; color: black; }');
  
  // Test with nested rules
  cardRule.insertRule('&.is-active { background: blue; }', 0);
  const expected = `.card {
  background: white; color: black;
  &.is-active { background: blue; }
}`;
  assert.strictEqual(cardRule.cssText.trim(), expected);

  // Test with deeply nested rules to verify cumulative indentation
  cardRule.insertRule('& .title { font-weight: bold; & .subtitle { color: blue; } }', 1);
  const expectedDeep = `.card {
  background: white; color: black;
  &.is-active { background: blue; }
  & .title {
    font-weight: bold;
    & .subtitle { color: blue; }
  }
}`;
  assert.strictEqual(cardRule.cssText.trim(), expectedDeep);
});

test('parseStyleAttribute mutation and cssText', () => {
  const css = 'color: red; background: blue;';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const style = parser.parseStyleAttribute();
  
  assert.strictEqual(style.getPropertyValue('color').trim(), 'red');
  assert.strictEqual(style.cssText.trim(), 'color: red; background: blue;');
  
  style.setProperty('color', 'black');
  assert.strictEqual(style.getPropertyValue('color').trim(), 'black');
  
  const removed = style.removeProperty('background');
  assert.strictEqual(removed.trim(), 'blue');
  assert.strictEqual(style.getPropertyValue('background'), '');
  assert.strictEqual(style.cssText.trim(), 'color: black;');
});

test('CSSStyleSheet.replaceSync', () => {
  const sheet = new CSSStyleSheet();
  
  sheet.replaceSync('.bar { color: blue; }');
  assert.strictEqual(sheet.cssRules.length, 1);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), '.bar');
});

test('CSSStyleSheet.replace', async () => {
  const sheet = new CSSStyleSheet();
  
  const resolvedSheet = await sheet.replace('.bar { color: blue; }');
  assert.strictEqual(resolvedSheet, sheet);
  assert.strictEqual(sheet.cssRules.length, 1);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), '.bar');
});

test('instanceof checks', () => {
  const css = `
    .foo { color: red; }
    @media (min-width: 600px) { .bar { color: green; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();

  assert.ok(sheet instanceof CSSStyleSheet, 'sheet should be CSSStyleSheet');
  
  const rules = sheet.cssRules;
  
  let styleRuleIndex = -1;
  let mediaRuleIndex = -1;
  let keyframesRuleIndex = -1;
  
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.type === 1) styleRuleIndex = i;
    if (r.type === 4) mediaRuleIndex = i;
    if (r.type === 7) keyframesRuleIndex = i;
  }
  
  assert.ok(styleRuleIndex !== -1, 'should find style rule');
  assert.ok(mediaRuleIndex !== -1, 'should find media rule');
  assert.ok(keyframesRuleIndex !== -1, 'should find keyframes rule');
  
  const styleRule = rules[styleRuleIndex] as CSSStyleRule;
  assert.ok(styleRule instanceof CSSStyleRule, 'style rule should be CSSStyleRule');
  
  const mediaRule = rules[mediaRuleIndex] as CSSMediaRule;
  assert.ok(mediaRule instanceof CSSMediaRule, 'media rule should be CSSMediaRule');
  
  const keyframesRule = rules[keyframesRuleIndex] as CSSKeyframesRule;
  assert.ok(keyframesRule instanceof CSSKeyframesRule, 'keyframes rule should be CSSKeyframesRule');
  
  const keyframeRule = keyframesRule.cssRules[0];
  assert.ok(keyframeRule instanceof CSSKeyframeRule, 'keyframe rule should be CSSKeyframeRule');
});

test('High-level parse() function', () => {
  const css = 'body { color: red; }';
  const sheet = parse(css);
  
  assert.ok(sheet instanceof CSSStyleSheet);
  assert.strictEqual(sheet.cssRules.length, 1);
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText.trim(), 'body');
  assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).style.getPropertyValue('color').trim(), 'red');
});
