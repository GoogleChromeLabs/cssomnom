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
import { CSSPageRule, CSSImportRule, CSSNamespaceRule, CSSMarginRule, CSSFontFaceRule, CSSCounterStyleRule, CSSFontFeatureValuesRule } from '../src/index.ts';
import { tokenize } from '../src/tokenizer.ts';
import {
  CSSRuleList,
  CSSRule,
  CSSGroupingRule,
  CSSStyleRule,
  CSSMediaRule,
  CSSStyleDeclaration,
  CSSStyleSheet,
  StylePropertyMap
} from '../src/index.ts';
import { CSSStyleProperties } from '../src/data/gen/properties.ts';
import type { StyleSheet } from '../src/types.ts';

test('CSSRule interface and inheritance', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssrule-interface
  const css = `.foo { color: red; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;

  // Inheritance
  assert.ok(rule instanceof CSSStyleRule, 'Rule should be a CSSStyleRule');
  assert.ok(rule instanceof CSSGroupingRule, 'CSSStyleRule should inherit from CSSGroupingRule');
  assert.ok(rule instanceof CSSRule, 'CSSGroupingRule should inherit from CSSRule');

  // cssText
  assert.strictEqual(typeof rule.cssText, 'string');
  const originalCssText = rule.cssText;
  
  // "On setting the cssText attribute must do nothing."
  // https://drafts.csswg.org/cssom-1/#dom-cssrule-csstext
  rule.cssText = 'invalid css';
  assert.strictEqual(rule.cssText, originalCssText, 'Setting CSSRule.cssText must do nothing');

  // parentRule and parentStyleSheet
  assert.strictEqual(rule.parentRule, null);
  assert.ok('parentStyleSheet' in rule);

  // Constants
  assert.strictEqual(CSSRule.STYLE_RULE, 1);
  assert.strictEqual(rule.STYLE_RULE, 1);
  assert.strictEqual(rule.type, 1);
  assert.strictEqual(CSSRule.SUPPORTS_RULE, 12);
  assert.strictEqual(rule.SUPPORTS_RULE, 12);
  assert.strictEqual(CSSRule.COUNTER_STYLE_RULE, 11);
  assert.strictEqual(rule.COUNTER_STYLE_RULE, 11);
  assert.strictEqual(CSSRule.FONT_FEATURE_VALUES_RULE, 14);
  assert.strictEqual(rule.FONT_FEATURE_VALUES_RULE, 14);

  // Modern constants should be removed
  assert.strictEqual((CSSRule as unknown as Record<string, unknown>).CONTAINER_RULE, undefined, 'CSSRule.CONTAINER_RULE should be removed');
  assert.strictEqual((rule as unknown as Record<string, unknown>).CONTAINER_RULE, undefined, 'rule.CONTAINER_RULE should be removed');
});

test('CSSRuleList interface', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssrulelist-interface
  const css = `.a {} .b {} .c {}`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const ruleList = sheet.cssRules;

  assert.ok(ruleList instanceof CSSRuleList);
  
  // length attribute
  assert.strictEqual(ruleList.length, 3);
  
  // item() method
  assert.ok(ruleList.item(0) instanceof CSSRule);
  assert.strictEqual(ruleList.item(3), null, 'item() out of bounds should return null');
  
  // indexed properties (supported property indices)
  assert.ok(ruleList[0] instanceof CSSRule);
  assert.strictEqual(ruleList[3], undefined, 'indexed property out of bounds should be undefined');
});

test('CSSGroupingRule interface', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssgroupingrule-interface
  const css = `@media all { .a {} }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSMediaRule;

  assert.ok(rule instanceof CSSGroupingRule);
  
  // cssRules attribute
  assert.ok(rule.cssRules instanceof CSSRuleList);
  assert.strictEqual(rule.cssRules.length, 1);
  
  // insertRule
  const index = rule.insertRule('.b {}', 1);
  assert.strictEqual(index, 1);
  assert.strictEqual(rule.cssRules.length, 2);
  
  // deleteRule
  rule.deleteRule(0);
  assert.strictEqual(rule.cssRules.length, 1);
  // Based on current implementation .b becomes & .b inside the AST
  assert.match((rule.cssRules[0] as CSSStyleRule).selectorText, /\.b/);

  // deleteRule out of bounds should throw IndexSizeError
  assert.throws(() => {
    rule.deleteRule(5);
  }, /IndexSizeError/);
});

test('CSSStyleRule interface', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssstylerule-interface
  const css = `.foo { color: red; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;

  assert.ok(rule instanceof CSSStyleRule);
  
  // selectorText
  assert.strictEqual(rule.selectorText, '.foo');
  rule.selectorText = '.bar';
  assert.strictEqual(rule.selectorText, '.bar');
  
  // style attribute
  assert.ok(rule.style instanceof CSSStyleDeclaration);
  
  // "PutForwards=cssText"
  (rule as unknown as { style: string }).style = 'color: blue;';
  assert.strictEqual(rule.style.getPropertyValue('color').trim(), 'blue');

  // styleMap
  assert.ok(rule.styleMap instanceof StylePropertyMap);
  rule.styleMap.set('color', 'green');
  assert.strictEqual(rule.style.getPropertyValue('color').trim(), 'green');
});

test('CSSStyleDeclaration interface', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssstyledeclaration-interface
  const css = `.foo { color: red; margin: 10px !important; }`;
  const sheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = sheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.ok(style instanceof CSSStyleDeclaration);

  // length (color + margin-top/right/bottom/left)
  assert.strictEqual(style.length, 5);

  // item()
  assert.strictEqual(style.item(0), 'color');
  assert.strictEqual(style.item(1), 'margin-top');
  assert.strictEqual(style.item(2), 'margin-right');
  assert.strictEqual(style.item(3), 'margin-bottom');
  assert.strictEqual(style.item(4), 'margin-left');
  assert.strictEqual(style.item(5), '');

  // getPropertyValue
  assert.strictEqual(style.getPropertyValue('color').trim(), 'red');
  assert.strictEqual(style.getPropertyValue('padding'), '');

  // getPropertyPriority
  assert.strictEqual(style.getPropertyPriority('margin'), 'important');
  assert.strictEqual(style.getPropertyPriority('color'), '');

  // setProperty
  style.setProperty('padding', '5px');
  assert.strictEqual(style.getPropertyValue('padding').trim(), '5px');
  assert.strictEqual(style.length, 9);
  
  // setProperty with important
  style.setProperty('padding', '10px', 'important');
  assert.strictEqual(style.getPropertyPriority('padding'), 'important');

  // removeProperty
  const removed = style.removeProperty('color');
  assert.strictEqual(removed.trim(), 'red');
  assert.strictEqual(style.getPropertyValue('color'), '');
  assert.strictEqual(style.length, 8);

  // parentRule
  assert.strictEqual(style.parentRule, rule);

  // camelCase property access (CSSStyleProperties)
  assert.ok('fontSize' in style, 'fontSize should be in style');
  style.fontSize = '14px';
  assert.strictEqual(style.getPropertyValue('font-size').trim(), '14px');

  // https://drafts.csswg.org/cssom-1/#the-cssstyleproperties-interface
  // cssFloat
  style.cssFloat = 'left';
  assert.strictEqual(style.getPropertyValue('float').trim(), 'left');
  assert.strictEqual(style.cssFloat.trim(), 'left');

  // Inheritance check
  assert.ok(style instanceof CSSStyleProperties, 'CSSStyleDeclaration should inherit from CSSStyleProperties');
});

test('CSSStyleDeclaration read-only', () => {
  const style = new CSSStyleDeclaration([], true);
  
  assert.throws(() => {
    style.cssText = 'color: red';
  }, (err: unknown) => {
    return err instanceof DOMException && err.name === 'NoModificationAllowedError';
  });

  assert.throws(() => {
    style.setProperty('color', 'red');
  }, (err: unknown) => {
    return err instanceof DOMException && err.name === 'NoModificationAllowedError';
  });

  assert.throws(() => {
    style.removeProperty('color');
  }, (err: unknown) => {
    return err instanceof DOMException && err.name === 'NoModificationAllowedError';
  });
});

test('CSSStyleSheet interface', () => {
  // https://drafts.csswg.org/cssom-1/#the-cssstylesheet-interface
  const parser = new Parser([]);
  const sheet = parser.parseStyleSheet();

  assert.ok(sheet instanceof CSSStyleSheet);
  
  // Inherited from StyleSheet
  // https://drafts.csswg.org/cssom-1/#the-stylesheet-interface
  assert.strictEqual(sheet.type, 'text/css');
  assert.strictEqual(sheet.href, null);
  assert.strictEqual(sheet.ownerNode, null);
  assert.strictEqual(sheet.parentStyleSheet, null);
  assert.strictEqual(sheet.title, null);
  assert.strictEqual(sheet.disabled, false);
  
  // CSSStyleSheet properties
  assert.strictEqual(sheet.ownerRule, null);
  assert.ok(sheet.cssRules instanceof CSSRuleList);
  
  // Methods
  const index = sheet.insertRule('.a { color: red; }', 0);
  assert.strictEqual(index, 0);
  assert.strictEqual(sheet.cssRules.length, 1);
  
  sheet.deleteRule(0);
  assert.strictEqual(sheet.cssRules.length, 0);

  // replaceSync (only on constructed sheets)
  const constructableSheet = new CSSStyleSheet();
  constructableSheet.replaceSync('.b { color: blue; }');
  assert.strictEqual(constructableSheet.cssRules.length, 1);

  // replace
  const promise = constructableSheet.replace('.c { color: green; }');
  assert.ok(promise instanceof Promise);
});

test('StyleSheet interface type safety', () => {
  const sheet = new CSSStyleSheet();
  const styleSheet: StyleSheet = sheet;
  const mediaText: string = styleSheet.media.mediaText;
  assert.ok(mediaText !== undefined);
});

test('CSSPageRule interface and CSSMarginRule', () => {
  const ast = Parser.parseStyleSheetText('@page :first { margin:0; @top-left { content:"foo"; } }');
  const rule = ast[0] as unknown as CSSPageRule;
  assert.equal(rule.type, 6);
  assert.equal(rule.selectorText, ':first');
  assert.equal(rule.style.getPropertyValue('margin'), '0');
  
  // It should extend CSSGroupingRule, so it has cssRules
  assert.ok(rule.cssRules);
  assert.equal(rule.cssRules.length, 1);
  const marginRule = rule.cssRules[0] as unknown as CSSMarginRule;
  assert.equal(marginRule.type, 9); // MARGIN_RULE
  assert.equal(marginRule.name, 'top-left');
  assert.equal(marginRule.style.getPropertyValue('content'), '"foo"');
});

test('CSSPageRule.style PutForwards=cssText', () => {
  const ast = Parser.parseStyleSheetText('@page :first { margin:0; }');
  const rule = ast[0] as unknown as CSSPageRule;
  
  // PutForwards=cssText
  (rule as unknown as { style: string }).style = 'margin: 10px;';
  assert.strictEqual(rule.style.getPropertyValue('margin').trim(), '10px');
});

test('CSSPageRule.selectorText getter, setter and normalization', () => {
  const ast = Parser.parseStyleSheetText('@page :first { margin:0; }');
  const rule = ast[0] as unknown as CSSPageRule;

  assert.strictEqual(rule.selectorText, ':first');

  // Set valid
  rule.selectorText = '  foo:first, :left ';
  assert.strictEqual(rule.selectorText, 'foo:first, :left');
  assert.ok(rule.cssText.includes('@page foo:first, :left {'));

  // Set invalid
  rule.selectorText = 'foo:bar'; // :bar is not a valid pseudo-page
  assert.strictEqual(rule.selectorText, 'foo:first, :left'); // should remain unchanged

  // Set empty
  rule.selectorText = '   ';
  assert.strictEqual(rule.selectorText, '');
  assert.ok(rule.cssText.startsWith('@page {'));
});

test('CSSMarginRule.style PutForwards=cssText', () => {
  const ast = Parser.parseStyleSheetText('@page :first { @top-left { content: "foo"; } }');
  const pageRule = ast[0] as unknown as CSSPageRule;
  const marginRule = pageRule.cssRules[0] as unknown as CSSMarginRule;
  
  // PutForwards=cssText
  (marginRule as unknown as { style: string }).style = 'content: "bar";';
  assert.strictEqual(marginRule.style.getPropertyValue('content').trim(), '"bar"');
});

test('CSSFontFaceRule.style PutForwards=cssText', () => {
  const ast = Parser.parseStyleSheetText('@font-face { src: url("foo.woff"); }');
  const rule = ast[0] as unknown as CSSFontFaceRule;
  
  // PutForwards=cssText
  (rule as unknown as { style: string }).style = 'src: url("bar.woff");';
  assert.strictEqual(rule.style.getPropertyValue('src').trim(), 'url("bar.woff")');
});

test('CSSImportRule interface', () => {
  const ast = Parser.parseStyleSheetText('@import url("foo.css") print;');
  const rule = ast[0] as unknown as CSSImportRule;
  assert.equal(rule.type, 3);
  assert.equal(rule.href, 'foo.css');
  assert.equal(rule.media.mediaText, 'print');
});

test('CSSImportRule cssText serialization', () => {
  const ast = Parser.parseStyleSheetText('@import url("foo.css") print;');
  const rule = ast[0] as unknown as CSSImportRule;
  // Spec requires url() wrapper for serialized URL in @import
  assert.equal(rule.cssText, '@import url("foo.css") print;');
  
  const rule2 = new CSSImportRule('foo"bar.css');
  assert.equal(rule2.cssText, '@import url("foo\\"bar.css");');
});

test('CSSImportRule with layer and supports', () => {
  const ast1 = Parser.parseStyleSheetText('@import url("foo.css") layer;');
  const rule1 = ast1[0] as unknown as CSSImportRule;
  assert.equal(rule1.href, 'foo.css');
  assert.equal(rule1.layerName, '');

  const ast2 = Parser.parseStyleSheetText('@import url("foo.css") layer(bar);');
  const rule2 = ast2[0] as unknown as CSSImportRule;
  assert.equal(rule2.layerName, 'bar');

  const ast3 = Parser.parseStyleSheetText('@import url("foo.css") supports(display: flex);');
  const rule3 = ast3[0] as unknown as CSSImportRule;
  assert.equal(rule3.supportsText, 'display: flex');

  const ast4 = Parser.parseStyleSheetText('@import url("foo.css") layer(bar) supports(display: flex) print;');
  const rule4 = ast4[0] as unknown as CSSImportRule;
  assert.equal(rule4.layerName, 'bar');
  assert.equal(rule4.supportsText, 'display: flex');
  assert.equal(rule4.media.mediaText, 'print');
});

test('CSSNamespaceRule interface', () => {
  const ast = Parser.parseStyleSheetText('@namespace svg url("http://www.w3.org/2000/svg");');
  const rule = ast[0] as unknown as CSSNamespaceRule;
  assert.equal(rule.type, 10);
  assert.equal(rule.prefix, 'svg');
  assert.equal(rule.namespaceURI, 'http://www.w3.org/2000/svg');
});

test('CSSRuleList live after replaceSync', () => {
  const sheet = new CSSStyleSheet();
  const rules = sheet.cssRules;
  assert.strictEqual(rules.length, 0);
  sheet.replaceSync('.a { color: red; }');
  assert.strictEqual(rules.length, 1, 'CSSRuleList should be live after replaceSync');
  assert.strictEqual((rules[0] as CSSStyleRule).selectorText, '.a');
});

test('CSSCounterStyleRule and CSSFontFeatureValuesRule skeleton classes', () => {
  const counterStyle = new CSSCounterStyleRule('foo');
  assert.equal(counterStyle.type, 11);
  assert.equal(counterStyle.name, 'foo');
  assert.equal(counterStyle.cssText, '@counter-style foo {}');

  const fontFeatureValues = new CSSFontFeatureValuesRule('sans-serif');
  assert.equal(fontFeatureValues.type, 14);
  assert.equal(fontFeatureValues.fontFamily, 'sans-serif');
  assert.equal(fontFeatureValues.cssText, '@font-feature-values sans-serif {}');
});

