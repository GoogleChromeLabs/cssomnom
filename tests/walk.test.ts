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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  CSSStyleRule,
  CSSMediaRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSNestedDeclarations,
  walkRules,
  walkStyleRules,
  getDeclaredProperties,
} from '../src/index.ts';

describe('src/walk.ts: Static Analysis Traversal and Property Queries', () => {
  it('walks rules in depth-first pre-order tracking parentRule, ancestors, and parentAtRule', () => {
    const css = [
      '@media (min-width: 600px) {',
      '  .card {',
      '    color: red;',
      '    & .title {',
      '      font-size: 16px;',
      '    }',
      '  }',
      '}',
      '@keyframes fade {',
      '  from { opacity: 0; }',
      '  to { opacity: 1; }',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const entries = Array.from(walkRules(sheet));

    // Order:
    // 0: CSSMediaRule
    // 1: CSSStyleRule (.card)
    // 2: CSSStyleRule (& .title)
    // 3: CSSKeyframesRule
    // 4: CSSKeyframeRule (from)
    // 5: CSSKeyframeRule (to)
    assert.equal(entries.length, 6);

    const [mediaEntry, cardEntry, titleEntry, kfEntry, fromEntry, toEntry] = entries;

    // Media rule
    assert.ok(mediaEntry.rule instanceof CSSMediaRule);
    assert.equal(mediaEntry.parentRule, null);
    assert.equal(mediaEntry.parentAtRule, null);
    assert.deepEqual(mediaEntry.ancestors, []);

    // .card inside @media
    assert.ok(cardEntry.rule instanceof CSSStyleRule);
    assert.equal(cardEntry.parentRule, mediaEntry.rule);
    assert.equal(cardEntry.parentAtRule, '@media (min-width: 600px)');
    assert.deepEqual(cardEntry.ancestors, [mediaEntry.rule]);
    assert.equal(cardEntry.selectorText, '.card');
    assert.equal(cardEntry.rawSelectorText, '.card');

    // & .title inside .card inside @media
    assert.ok(titleEntry.rule instanceof CSSStyleRule);
    assert.equal(titleEntry.parentRule, cardEntry.rule);
    assert.equal(titleEntry.parentAtRule, '@media (min-width: 600px)');
    assert.deepEqual(titleEntry.ancestors, [mediaEntry.rule, cardEntry.rule]);
    assert.equal(titleEntry.selectorText, ':is(.card) .title');
    assert.equal(titleEntry.rawSelectorText, '& .title');

    // @keyframes rule
    assert.ok(kfEntry.rule instanceof CSSKeyframesRule);
    assert.equal(kfEntry.parentRule, null);
    assert.equal(kfEntry.parentAtRule, null);

    // keyframe from
    assert.ok(fromEntry.rule instanceof CSSKeyframeRule);
    assert.equal(fromEntry.parentRule, kfEntry.rule);
    assert.equal(fromEntry.parentAtRule, '@keyframes fade');
    assert.equal(fromEntry.selectorText, '0%');
    assert.equal(fromEntry.rawSelectorText, '0%');
    assert.equal(fromEntry.getPropertyValue('opacity'), '0');

    // keyframe to
    assert.ok(toEntry.rule instanceof CSSKeyframeRule);
    assert.equal(toEntry.parentRule, kfEntry.rule);
    assert.equal(toEntry.parentAtRule, '@keyframes fade');
    assert.equal(toEntry.selectorText, '100%');
    assert.equal(toEntry.rawSelectorText, '100%');
    assert.equal(toEntry.getPropertyValue('opacity'), '1');
  });

  it('formats parentAtRule for diverse at-rules (@supports, @container, @starting-style, @layer, @scope)', () => {
    const css = [
      '@supports (display: grid) {',
      '  .grid { display: grid; }',
      '}',
      '@container (min-width: 400px) {',
      '  .box { padding: 8px; }',
      '}',
      '@starting-style {',
      '  .dialog { opacity: 0; }',
      '}',
      '@layer utilities {',
      '  .u-flex { display: flex; }',
      '}',
      '@scope (.card) to (.content) {',
      '  .header { color: blue; }',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const styleEntries = Array.from(walkStyleRules(sheet));
    assert.equal(styleEntries.length, 5);

    assert.equal(styleEntries[0].parentAtRule, '@supports (display: grid)');
    assert.equal(styleEntries[1].parentAtRule, '@container (min-width: 400px)');
    assert.equal(styleEntries[2].parentAtRule, '@starting-style');
    assert.equal(styleEntries[3].parentAtRule, '@layer utilities');
    assert.equal(styleEntries[4].parentAtRule, '@scope (.card) to (.content)');
  });

  it('resolves selectors correctly for CSSNestedDeclarations and relative nested rules', () => {
    const css = [
      '.card {',
      '  padding: 10px;',
      '  @media (min-width: 600px) {',
      '    color: red;',
      '    span { font-weight: bold; }',
      '  }',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const styleEntries = Array.from(walkStyleRules(sheet));

    // 0: .card (CSSStyleRule)
    // 1: CSSNestedDeclarations inside @media (color: red)
    // 2: span inside @media inside .card (CSSStyleRule)
    assert.equal(styleEntries.length, 3);

    // .card
    assert.equal(styleEntries[0].selectorText, '.card');
    assert.equal(styleEntries[0].rawSelectorText, '.card');

    // CSSNestedDeclarations inside @media inherits .card selector
    assert.ok(styleEntries[1].rule instanceof CSSNestedDeclarations);
    assert.equal(styleEntries[1].selectorText, '.card');
    assert.equal(styleEntries[1].rawSelectorText, '.card');
    assert.equal(styleEntries[1].parentAtRule, '@media (min-width: 600px)');
    assert.equal(styleEntries[1].getPropertyValue('color'), 'red');

    // span inside .card resolves relative/nested selector to :is(.card) span
    assert.equal(styleEntries[2].selectorText, ':is(.card) span');
    assert.equal(styleEntries[2].rawSelectorText, '& span');
    assert.equal(styleEntries[2].parentAtRule, '@media (min-width: 600px)');
  });

  it('inherits :scope selector for CSSNestedDeclarations inside @scope without enclosing style rule', () => {
    const css = [
      '@scope (.article) {',
      '  color: black;',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const styleEntries = Array.from(walkStyleRules(sheet));
    assert.equal(styleEntries.length, 1);
    assert.ok(styleEntries[0].rule instanceof CSSNestedDeclarations);
    assert.equal(styleEntries[0].selectorText, ':scope');
    assert.equal(styleEntries[0].rawSelectorText, ':scope');
  });

  it('provides shorthand contraction and presence checks on walk entries', () => {
    const css = '.box { border: 1px solid red; outline: 2px dashed blue; }';
    const sheet = parse(css);
    const [entry] = Array.from(walkStyleRules(sheet));
    assert.ok(entry);

    // Direct and shorthand getPropertyValue
    assert.equal(entry.getPropertyValue('border-width'), '1px');
    assert.equal(entry.getPropertyValue('border-color'), 'red');
    assert.equal(entry.getPropertyValue('border'), '1px solid red');
    assert.equal(entry.getPropertyValue('outline'), 'blue dashed 2px');
    assert.equal(entry.getPropertyValue('nonexistent'), null);

    // hasProperty checks both longhands and parent shorthands
    assert.equal(entry.hasProperty('border'), true);
    assert.equal(entry.hasProperty('border-color'), true);
    assert.equal(entry.hasProperty('outline'), true);
    assert.equal(entry.hasProperty('outline-style'), true);
    assert.equal(entry.hasProperty('margin'), false);
    assert.equal(entry.hasProperty('padding'), false);

    // declarations extraction
    assert.ok(entry.declarations.length >= 2);
    const props = entry.declarations.map(d => d.property);
    assert.ok(props.some(p => p.startsWith('border-')));
  });

  it('getDeclaredProperties indexes longhands, parent shorthands, and @supports features', () => {
    const css = [
      '.card {',
      '  border: 1px solid black;',
      '  padding: 12px 16px;',
      '  --custom-accent: #336699;',
      '}',
      '@supports (interpolate-size: allow-keywords) {',
      '  .anim { interpolate-size: allow-keywords; }',
      '}',
      '@supports not (backdrop-filter: blur(5px)) {',
      '  .fallback { opacity: 0.9; }',
      '}',
    ].join('\n');

    const sheet = parse(css);

    // Default: includeSupports = true
    const props = getDeclaredProperties(sheet);
    assert.ok(props.has('border'));
    assert.ok(props.has('border-width'));
    assert.ok(props.has('border-style'));
    assert.ok(props.has('border-color'));
    assert.ok(props.has('padding'));
    assert.ok(props.has('padding-top'));
    assert.ok(props.has('--custom-accent'));
    assert.ok(props.has('interpolate-size'));
    assert.ok(props.has('backdrop-filter'));
    assert.ok(props.has('opacity'));

    // Option: includeSupports = false
    const withoutSupports = getDeclaredProperties(sheet, { includeSupports: false });
    assert.ok(withoutSupports.has('border'));
    assert.ok(withoutSupports.has('interpolate-size')); // because declared in .anim
    assert.equal(withoutSupports.has('backdrop-filter'), false); // only in @supports condition
  });
});
