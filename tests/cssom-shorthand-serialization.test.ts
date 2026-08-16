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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../src/parser.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { serializeFontFamily } from '../src/serializer.ts';
import { tokenize } from '../src/tokenizer.ts';

describe('Phase 111: Composite Shorthand Canonical Serialization & Font Normalization', () => {
  describe('border shorthand canonical serialization & interference guard (CSSOM § 6.4.3)', () => {
    test('omits default/initial values when contracting border sides', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.cssText = 'border-top-style: solid; border-top-color: red; border-top-width: 1px; border-right-style: solid; border-right-color: red; border-right-width: 1px; border-bottom-style: solid; border-bottom-color: red; border-bottom-width: 1px; border-left-style: solid; border-left-color: red; border-left-width: 1px; border-image: none;';
      assert.strictEqual(decl.border, '1px solid red');
      assert.strictEqual(decl.cssText, 'border: 1px solid red;');
    });

    test('serializes as none when all border values are initial', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.cssText = 'border: none;';
      assert.strictEqual(decl.border, 'none');
    });

    test('enforces border-image interference guard', () => {
      // 12 border longhands without border-image: none do not contract to border:
      const decl = new CSSStyleDeclaration([]);
      decl.cssText = 'border-width: 1px; border-style: solid; border-color: red;';
      assert.strictEqual(decl.border, '');
      assert.strictEqual(decl.cssText, 'border-width: 1px; border-style: solid; border-color: red;');

      // With border-image: none (initial), contracts to border: 1px solid red
      decl.setProperty('border-image', 'none');
      assert.strictEqual(decl.border, '1px solid red');
      assert.strictEqual(decl.cssText, 'border: 1px solid red;');

      // With non-initial border-image-source, border shorthand cannot contract
      decl.setProperty('border-image-source', 'url("image.png")');
      assert.strictEqual(decl.border, '');
    });

    test('contracts individual border sides omitting defaults', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.borderTop = '1px red';
      assert.strictEqual(decl.borderTop, '1px red');
      assert.strictEqual(decl.borderTopWidth, '1px');
      assert.strictEqual(decl.borderTopColor, 'red');
      assert.strictEqual(decl.borderTopStyle, 'none');
    });
  });

  describe('outline shorthand canonical serialization', () => {
    test('omits default/initial values when contracting outline', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.outline = '1px solid red';
      assert.strictEqual(decl.outline, 'red solid 1px');
      assert.strictEqual(decl.outlineWidth, '1px');
      assert.strictEqual(decl.outlineStyle, 'solid');
      assert.strictEqual(decl.outlineColor, 'red');
    });

    test('serializes outline with single non-default component', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.outline = 'solid';
      assert.strictEqual(decl.outline, 'solid');
      assert.strictEqual(decl.outlineStyle, 'solid');
      assert.strictEqual(decl.outlineWidth, 'medium');
      assert.strictEqual(decl.outlineColor, 'currentcolor');
    });
  });

  describe('font-variant sub-property expansion and contraction (CSS Fonts 4 § 5)', () => {
    test('expands font-variant: normal to all subproperties', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.fontVariant = 'normal';
      assert.strictEqual(decl.fontVariantLigatures, 'normal');
      assert.strictEqual(decl.fontVariantCaps, 'normal');
      assert.strictEqual(decl.fontVariantNumeric, 'normal');
      assert.strictEqual(decl.fontVariantAlternates, 'normal');
      assert.strictEqual(decl.fontVariantEastAsian, 'normal');
      assert.strictEqual(decl.fontVariantPosition, 'normal');
      assert.strictEqual(decl.fontVariantEmoji, 'normal');
      assert.strictEqual(decl.fontVariant, 'normal');
    });

    test('expands font-variant: none to ligatures: none and others: normal', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.fontVariant = 'none';
      assert.strictEqual(decl.fontVariantLigatures, 'none');
      assert.strictEqual(decl.fontVariantCaps, 'normal');
      assert.strictEqual(decl.fontVariantNumeric, 'normal');
      assert.strictEqual(decl.fontVariant, 'none');
    });

    test('expands and contracts compound font-variant values', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.fontVariant = 'small-caps oldstyle-nums';
      assert.strictEqual(decl.fontVariantCaps, 'small-caps');
      assert.strictEqual(decl.fontVariantNumeric, 'oldstyle-nums');
      assert.strictEqual(decl.fontVariant, 'small-caps oldstyle-nums');
    });
  });

  describe('font-family quoting and unquoting normalization (CSSOM § 6.4.3 & CSS Fonts 4)', () => {
    test('unquotes valid identifier sequences', () => {
      assert.strictEqual(serializeFontFamily(tokenize("'Twisty Tie'")), 'Twisty Tie');
      assert.strictEqual(serializeFontFamily(tokenize("'Veronica'")), 'Veronica');
      assert.strictEqual(serializeFontFamily(tokenize("'Times New Roman'")), 'Times New Roman');
    });

    test('retains double quotes for names starting with a digit', () => {
      assert.strictEqual(serializeFontFamily(tokenize("'34J'")), '"34J"');
      assert.strictEqual(serializeFontFamily(tokenize("'1'")), '"1"');
    });

    test('retains double quotes for generic and CSS-wide keywords', () => {
      assert.strictEqual(serializeFontFamily(tokenize("'serif'")), '"serif"');
      assert.strictEqual(serializeFontFamily(tokenize("'sans-serif'")), '"sans-serif"');
      assert.strictEqual(serializeFontFamily(tokenize("'initial'")), '"initial"');
      assert.strictEqual(serializeFontFamily(tokenize("'inherit'")), '"inherit"');
      assert.strictEqual(serializeFontFamily(tokenize("'default'")), '"default"');
    });

    test('retains double quotes for multiple whitespace sequences and special punctuation', () => {
      assert.strictEqual(serializeFontFamily(tokenize("'A  B'")), '"A  B"');
      assert.strictEqual(serializeFontFamily(tokenize("'foo,bar'")), '"foo,bar"');
    });

    test('serializes mixed font-family lists', () => {
      const input = tokenize("'Twisty Tie', '34J', 'serif', 'Veronica', sans-serif");
      assert.strictEqual(serializeFontFamily(input), 'Twisty Tie, "34J", "serif", Veronica, sans-serif');
    });
  });

  describe('list-style, flex, and overflow canonical serialization', () => {
    test('contracts list-style omitting defaults', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.listStyle = 'square inside';
      assert.strictEqual(decl.listStyle, 'inside square');
      assert.strictEqual(decl.listStyleType, 'square');
      assert.strictEqual(decl.listStylePosition, 'inside');
      assert.strictEqual(decl.listStyleImage, 'none');
    });

    test('contracts 2-value overflow shorthand', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.overflowX = 'scroll';
      decl.overflowY = 'hidden';
      assert.strictEqual(decl.overflow, 'scroll hidden');
      assert.strictEqual(decl.cssText, 'overflow: scroll hidden;');

      decl.overflowX = 'auto';
      decl.overflowY = 'auto';
      assert.strictEqual(decl.overflow, 'auto');
    });

    test('contracts flex shorthand with 0px flex-basis', () => {
      const decl = new CSSStyleDeclaration([]);
      decl.flex = '2 0 auto';
      assert.strictEqual(decl.flex, '2 0 auto');
      assert.strictEqual(decl.flexGrow, '2');
      assert.strictEqual(decl.flexShrink, '0');
      assert.strictEqual(decl.flexBasis, 'auto');

      decl.flex = '1';
      assert.strictEqual(decl.flex, '1 1 0px');
      assert.strictEqual(decl.flexGrow, '1');
      assert.strictEqual(decl.flexShrink, '1');
      assert.strictEqual(decl.flexBasis, '0px');
    });
  });
});
