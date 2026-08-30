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
import assert from 'node:assert/strict';
import {
  parse,
  CSSStyleSheet,
  CSSRuleList,
  CSSRule,
  CSSGroupingRule,
  CSSStyleRule,
  CSSMediaRule,
  CSSSupportsRule,
  CSSPageRule,
  CSSMarginRule,
  CSSNamespaceRule,
  CSSImportRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSCounterStyleRule,
  CSSFontFaceRule,
  CSSFontFeatureValuesRule,
  CSSContainerRule,
  CSSScopeRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSStartingStyleRule,
  CSSPropertyRule,
  CSSViewTransitionRule,
  CSSNestedDeclarations,
  MediaList,
  StyleSheetList,
} from '../src/index.ts';

test('CSSRuleList indexing, length, iteration, and boundaries', () => {
  const css = `
    .a { color: red; }
    .b { color: blue; }
    .c { color: green; }
  `;
  const sheet = parse(css);
  const rules = sheet.cssRules;

  assert.equal(rules instanceof CSSRuleList, true);
  assert.equal(rules.length, 3);

  // Array index access
  assert.equal((rules[0] as CSSStyleRule).selectorText, '.a');
  assert.equal((rules[1] as CSSStyleRule).selectorText, '.b');
  assert.equal((rules[2] as CSSStyleRule).selectorText, '.c');

  // .item() method access
  assert.equal((rules.item(0) as CSSStyleRule).selectorText, '.a');
  assert.equal((rules.item(1) as CSSStyleRule).selectorText, '.b');
  assert.equal((rules.item(2) as CSSStyleRule).selectorText, '.c');

  // Out of bounds
  assert.equal(rules[99], undefined);
  assert.equal(rules.item(99), null);
  assert.equal(rules.item(-1), null);

  // Symbol.iterator
  const selectors: string[] = [];
  for (const r of rules) {
    if (r instanceof CSSStyleRule) {
      selectors.push(r.selectorText);
    }
  }
  assert.deepEqual(selectors, ['.a', '.b', '.c']);
});

test('CSSStyleSheet insertRule and deleteRule invariants', () => {
  const sheet = new CSSStyleSheet();
  assert.equal(sheet.cssRules.length, 0);

  // insertRule at index 0
  const idx0 = sheet.insertRule('.first { color: black; }', 0);
  assert.equal(idx0, 0);
  assert.equal(sheet.cssRules.length, 1);
  const rule0 = sheet.cssRules[0] as CSSStyleRule;
  assert.equal(rule0.selectorText, '.first');
  assert.equal(rule0.parentStyleSheet, sheet);
  assert.equal(rule0.parentRule, null);

  // insertRule at end (index 1)
  const idx1 = sheet.insertRule('.second { color: white; }', 1);
  assert.equal(idx1, 1);
  assert.equal(sheet.cssRules.length, 2);

  // insertRule in middle (index 1)
  const idxMid = sheet.insertRule('.mid { color: gray; }', 1);
  assert.equal(idxMid, 1);
  assert.equal(sheet.cssRules.length, 3);
  assert.equal((sheet.cssRules[0] as CSSStyleRule).selectorText, '.first');
  assert.equal((sheet.cssRules[1] as CSSStyleRule).selectorText, '.mid');
  assert.equal((sheet.cssRules[2] as CSSStyleRule).selectorText, '.second');

  // deleteRule in middle
  sheet.deleteRule(1);
  assert.equal(sheet.cssRules.length, 2);
  assert.equal((sheet.cssRules[0] as CSSStyleRule).selectorText, '.first');
  assert.equal((sheet.cssRules[1] as CSSStyleRule).selectorText, '.second');

  // deleteRule out of bounds
  assert.throws(() => sheet.deleteRule(99), { name: 'IndexSizeError' });
  assert.throws(() => sheet.deleteRule(-1), { name: 'IndexSizeError' });

  // insertRule out of bounds
  assert.throws(() => sheet.insertRule('.fail {}', 99), { name: 'IndexSizeError' });
  assert.throws(() => sheet.insertRule('.fail {}', -1), { name: 'IndexSizeError' });

  // insertRule syntax error
  assert.throws(() => sheet.insertRule('invalid rule syntax', 0), { name: 'SyntaxError' });
});

test('CSSGroupingRule nested hierarchy and parent linkages', () => {
  const css = `
    @media screen {
      .nested { color: red; }
    }
  `;
  const sheet = parse(css);
  const mediaRule = sheet.cssRules[0] as CSSMediaRule;

  assert.equal(mediaRule instanceof CSSGroupingRule, true);
  assert.equal(mediaRule instanceof CSSRule, true);
  assert.equal(mediaRule.parentStyleSheet, sheet);
  assert.equal(mediaRule.parentRule, null);
  assert.equal(mediaRule.cssRules.length, 1);

  const nestedRule = mediaRule.cssRules[0] as CSSStyleRule;
  assert.equal(nestedRule.parentStyleSheet, sheet);
  assert.equal(nestedRule.parentRule, mediaRule);

  // insertRule into grouping rule
  const newIdx = mediaRule.insertRule('.inner2 { color: blue; }', 1);
  assert.equal(newIdx, 1);
  assert.equal(mediaRule.cssRules.length, 2);
  const inner2 = mediaRule.cssRules[1] as CSSStyleRule;
  assert.equal(inner2.parentRule, mediaRule);
  assert.equal(inner2.parentStyleSheet, sheet);

  // deleteRule from grouping rule
  mediaRule.deleteRule(0);
  assert.equal(mediaRule.cssRules.length, 1);
  assert.equal((mediaRule.cssRules[0] as CSSStyleRule).selectorText, '.inner2');
});

test('MediaList mutations, serialization, and argument validation', () => {
  const sheet = parse('@media screen, print { .box { margin: 0; } }');
  const mediaRule = sheet.cssRules[0] as CSSMediaRule;
  const media = mediaRule.media;

  assert.equal(media instanceof MediaList, true);
  assert.equal(media.length, 2);
  assert.equal(media.item(0), 'screen');
  assert.equal(media.item(1), 'print');
  assert.equal(media.mediaText, 'screen, print');

  // appendMedium
  media.appendMedium('speech');
  assert.equal(media.length, 3);
  assert.equal(media.mediaText, 'screen, print, speech');

  // duplicate appendMedium should be ignored or deduplicated
  media.appendMedium('screen');
  assert.equal(media.length, 3);

  // deleteMedium
  media.deleteMedium('print');
  assert.equal(media.length, 2);
  assert.equal(media.mediaText, 'screen, speech');

  // deleteMedium non-existent throws NotFoundError
  assert.throws(() => media.deleteMedium('unknown-medium'), { name: 'NotFoundError' });

  // deleteMedium with 0 arguments throws TypeError per WebIDL
  // @ts-expect-error Testing 0-arg call
  assert.throws(() => media.deleteMedium(), TypeError);

  // mediaText setter
  media.mediaText = 'all and (min-width: 500px)';
  assert.equal(media.length, 1);
  assert.equal(media.item(0), '(min-width: 500px)');
});

test('At-rules inheritance, constructors, and specific descriptors', () => {
  const css = `
    @page :first { margin: 2cm; @top-left { content: "Header"; } }
    @keyframes slide { from { opacity: 0; } to { opacity: 1; } }
    @supports (display: grid) { .grid { display: grid; } }
    @namespace prefix url("https://example.com/ns");
    @counter-style thumbs { system: cyclic; symbols: "👍"; }
    @font-face { font-family: "CustomFont"; src: url("font.woff2"); }
    @font-feature-values "Font" { @styleset { alt-g: 1; } }
    @container card (min-width: 300px) { .child { width: 100%; } }
    @scope (.card) to (.content) { .title { font-weight: bold; } }
    @layer framework { .btn { padding: 4px; } }
    @layer reset, base, theme;
    @starting-style { .fade { opacity: 0; } }
    @property --accent-color { syntax: "<color>"; inherits: false; initial-value: black; }
  `;
  const sheet = parse(css);
  const rules = sheet.cssRules;

  // 1. CSSPageRule and nested CSSMarginRule
  const pageRule = rules[0] as CSSPageRule;
  assert.equal(pageRule instanceof CSSPageRule, true);
  assert.equal(pageRule.selectorText, ':first');
  assert.equal(pageRule.cssRules.length, 1);
  const marginRule = pageRule.cssRules[0] as CSSMarginRule;
  assert.equal(marginRule instanceof CSSMarginRule, true);
  assert.equal(marginRule.name, 'top-left');
  assert.equal(marginRule.style.getPropertyValue('content'), '"Header"');

  // 2. CSSKeyframesRule and CSSKeyframeRule
  const kfRule = rules[1] as CSSKeyframesRule;
  assert.equal(kfRule instanceof CSSKeyframesRule, true);
  assert.equal(kfRule.name, 'slide');
  assert.equal(kfRule.cssRules.length, 2);
  const kf0 = kfRule.cssRules[0] as CSSKeyframeRule;
  assert.equal(kf0 instanceof CSSKeyframeRule, true);
  assert.equal(kf0.keyText, '0%');
  assert.equal(kf0.style.getPropertyValue('opacity'), '0');

  // 3. CSSSupportsRule
  const supRule = rules[2] as CSSSupportsRule;
  assert.equal(supRule instanceof CSSSupportsRule, true);
  assert.equal(supRule.conditionText, '(display: grid)');

  // 4. CSSNamespaceRule
  const nsRule = rules[3] as CSSNamespaceRule;
  assert.equal(nsRule instanceof CSSNamespaceRule, true);
  assert.equal(nsRule.prefix, 'prefix');
  assert.equal(nsRule.namespaceURI, 'https://example.com/ns');

  // 5. CSSCounterStyleRule
  const csRule = rules[4] as CSSCounterStyleRule;
  assert.equal(csRule instanceof CSSCounterStyleRule, true);
  assert.equal(csRule.name, 'thumbs');

  // 6. CSSFontFaceRule
  const ffRule = rules[5] as CSSFontFaceRule;
  assert.equal(ffRule instanceof CSSFontFaceRule, true);
  assert.equal(ffRule.style.getPropertyValue('font-family'), 'CustomFont');

  // 7. CSSFontFeatureValuesRule
  const ffvRule = rules[6] as CSSFontFeatureValuesRule;
  assert.equal(ffvRule instanceof CSSFontFeatureValuesRule, true);
  assert.equal(ffvRule.fontFamily, '"Font"');

  // 8. CSSContainerRule
  const contRule = rules[7] as CSSContainerRule;
  assert.equal(contRule instanceof CSSContainerRule, true);
  assert.equal(contRule.containerName, 'card');
  assert.equal(contRule.containerQuery, '(min-width: 300px)');

  // 9. CSSScopeRule
  const scopeRule = rules[8] as CSSScopeRule;
  assert.equal(scopeRule instanceof CSSScopeRule, true);
  assert.equal(scopeRule.startSelector, '(.card)');
  assert.equal(scopeRule.endSelector, '(.content)');

  // 10. CSSLayerBlockRule & CSSLayerStatementRule
  const layerBlock = rules[9] as CSSLayerBlockRule;
  assert.equal(layerBlock instanceof CSSLayerBlockRule, true);
  assert.equal(layerBlock.name, 'framework');

  const layerStmt = rules[10] as CSSLayerStatementRule;
  assert.equal(layerStmt instanceof CSSLayerStatementRule, true);
  assert.deepEqual(layerStmt.nameList, ['reset', 'base', 'theme']);

  // 11. CSSStartingStyleRule
  const startRule = rules[11] as CSSStartingStyleRule;
  assert.equal(startRule instanceof CSSStartingStyleRule, true);

  // 12. CSSPropertyRule
  const propRule = rules[12] as CSSPropertyRule;
  assert.equal(propRule instanceof CSSPropertyRule, true);
  assert.equal(propRule.name, '--accent-color');
  assert.equal(propRule.syntax, '<color>');
  assert.equal(propRule.inherits, false);
  assert.equal(propRule.initialValue, 'black');

  // 13. CSSImportRule
  const importSheet = parse('@import url("base.css") screen;');
  const importRule = importSheet.cssRules[0] as CSSImportRule;
  assert.equal(importRule instanceof CSSImportRule, true);
  assert.equal(importRule.href, 'base.css');
  assert.equal(importRule.media.mediaText, 'screen');

  // 14. CSSViewTransitionRule
  const vtSheet = parse('@view-transition { navigation: auto; }');
  const vtRule = vtSheet.cssRules[0] as CSSViewTransitionRule;
  assert.equal(vtRule instanceof CSSViewTransitionRule, true);
  assert.equal(vtRule.navigation, 'auto');

  // 15. CSSNestedDeclarations
  const nestSheet = parse('div { color: red; .child { color: blue; } font-size: 14px; }');
  const parentStyle = nestSheet.cssRules[0] as CSSStyleRule;
  const nestedDecl = parentStyle.cssRules[1] as CSSNestedDeclarations;
  assert.equal(nestedDecl instanceof CSSNestedDeclarations, true);
  assert.equal(nestedDecl.style.getPropertyValue('font-size'), '14px');

  // 16. StyleSheetList
  const list = new StyleSheetList([constructedListSheet]);
  assert.equal(list instanceof StyleSheetList, true);
  assert.equal(list.length, 1);
  assert.equal(list.item(0), constructedListSheet);
  assert.deepEqual([...list], [constructedListSheet]);
});

const constructedListSheet = new CSSStyleSheet();

test('Constructable CSSStyleSheet lifecycle and CORS protection', () => {
  // Constructed sheet
  const constructed = new CSSStyleSheet({ baseURL: 'https://example.com/base/', media: 'screen' });
  assert.equal(constructed.href, null);
  assert.equal(constructed.media.mediaText, 'screen');
  constructed.replaceSync('body { color: blue; }');
  assert.equal(constructed.cssRules.length, 1);

  // Non-constructed sheet replaceSync rejection
  const regularSheet = parse('div { color: red; }');
  assert.throws(
    () => regularSheet.replaceSync('body { color: blue; }'),
    { name: 'NotAllowedError' }
  );

  // Style sheet disabled reflection
  assert.equal(constructed.disabled, false);
  constructed.disabled = true;
  assert.equal(constructed.disabled, true);
});
