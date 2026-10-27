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
import { MediaList, CSSStyleDeclaration, CSSPropertyRule } from '../src/index.ts';
import { Parser, validateDeclarationValue, assembleUnicodeRanges } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { serializeToken } from '../src/serializer.ts';
import { getElementLanguage } from '../src/matcher.ts';
import type { Token, UnicodeRangeToken } from '../src/types.ts';

describe('Phase 158.2 Compliance Verification', () => {
  // BC-01: MediaList.deleteMedium early return on failure
  describe('BC-01: MediaList.prototype.deleteMedium', () => {
    it('returns early when medium parses to 0 or multiple queries instead of throwing', () => {
      const list = new MediaList('screen, print');
      assert.equal(list.length, 2);

      // Empty string parses to 0 queries -> should return early without throwing
      assert.doesNotThrow(() => {
        list.deleteMedium('');
      });
      assert.equal(list.length, 2);

      // Comma-separated medium parses to 2 queries -> should return early without throwing
      assert.doesNotThrow(() => {
        list.deleteMedium('screen, print');
      });
      assert.equal(list.length, 2);

      // Single non-existent medium throws NotFoundError
      assert.throws(() => {
        list.deleteMedium('speech');
      }, (err: unknown) => (err as DOMException).name === 'NotFoundError');

      // Valid single medium deletes cleanly
      list.deleteMedium('screen');
      assert.equal(list.length, 1);
      assert.equal(list.mediaText, 'print');
    });
  });

  // BC-02: CSSStyleDeclaration.setProperty undefined handling
  describe('BC-02: CSSStyleDeclaration.prototype.setProperty with undefined', () => {
    it('does not remove declaration when value is undefined', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('color', 'red');
      assert.equal(style.getPropertyValue('color'), 'red');

      // undefined stringifies to "undefined" which fails parsing for 'color', leaving existing value intact
      style.setProperty('color', undefined as unknown as string);
      assert.equal(style.getPropertyValue('color'), 'red');

      // null converts to "" under [LegacyNullToEmptyString] and removes property
      style.setProperty('color', null as unknown as string);
      assert.equal(style.getPropertyValue('color'), '');
    });
  });

  // BC-04: CSSPropertyRule.prototype.type === 0
  describe('BC-04: CSSPropertyRule.prototype.type', () => {
    it('returns 0 per cssom-1 #dom-cssrule-type', () => {
      const rule = new CSSPropertyRule('--my-color', '*', false, null);
      assert.equal(rule.type, 0);
    });
  });

  // BC-05: CSSStyleDeclaration.removeProperty returns getPropertyValue
  describe('BC-05: CSSStyleDeclaration.prototype.removeProperty', () => {
    it('returns canonical getPropertyValue before removal', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('color', 'red');
      style.setProperty('--custom', '42px');

      const oldColor = style.removeProperty('color');
      assert.equal(oldColor, 'red');
      assert.equal(style.getPropertyValue('color'), '');

      const oldCustom = style.removeProperty('--custom');
      assert.equal(oldCustom, '42px');
      assert.equal(style.getPropertyValue('--custom'), '');

      // Removing non-existent property returns empty string
      const nonExistent = style.removeProperty('margin');
      assert.equal(nonExistent, '');
    });
  });

  // BC-07: consumeUnicodeRangeToken and unicode-range descriptor validation
  describe('BC-07: unicode-range tokenization vs validation', () => {
    it('emits unicode-range token even when end < start in tokenizer', () => {
      const tokens = tokenize('U+500-100', true);
      assert.equal(tokens[0].type, 'unicode-range');
      assert.equal((tokens[0] as UnicodeRangeToken).unicodeRangeStart, 0x500);
      assert.equal((tokens[0] as UnicodeRangeToken).unicodeRangeEnd, 0x100);
    });

    it('rejects invalid unicode-range in descriptor validation (assembleUnicodeRanges)', () => {
      const validTokens = tokenize('U+100-500', true).filter(t => t.type !== 'EOF');
      const valid = assembleUnicodeRanges(validTokens);
      assert.ok(valid);
      assert.equal(valid.length, 1);

      const invalidTokens = tokenize('U+500-100', true).filter(t => t.type !== 'EOF');
      const invalid = assembleUnicodeRanges(invalidTokens);
      assert.equal(invalid, null);

      const outOfRangeTokens = tokenize('U+FFFFFF', true).filter(t => t.type !== 'EOF');
      const outOfRange = assembleUnicodeRanges(outOfRangeTokens);
      assert.equal(outOfRange, null);
    });
  });

  // BC-08: validateDeclarationValue unmatched brackets and top-level semicolon / exclamation
  describe('BC-08: validateDeclarationValue', () => {
    it('rejects unmatched closing brackets at any depth', () => {
      // Unmatched ')'
      const tokens1 = tokenize('red )');
      assert.equal(validateDeclarationValue(tokens1), false);

      // Unmatched ']'
      const tokens2 = tokenize('red ]');
      assert.equal(validateDeclarationValue(tokens2), false);

      // Unmatched '}'
      const tokens3 = tokenize('red }');
      assert.equal(validateDeclarationValue(tokens3), false);
    });

    it('rejects top-level semicolon and top-level exclamation', () => {
      const tokensSemi = tokenize('red ; blue');
      assert.equal(validateDeclarationValue(tokensSemi), false);

      const tokensExcl = tokenize('red !');
      assert.equal(validateDeclarationValue(tokensExcl), false);

      // Semicolon or exclamation inside a block is valid
      const tokensInBlock = new Parser(tokenize('var(--x, !)')).parseComponentValues();
      assert.equal(validateDeclarationValue(tokensInBlock), true);
    });
  });

  // BC-09: Parser.prototype.parseDeclaration trailing tokens check
  describe('BC-09: Parser.prototype.parseDeclaration', () => {
    it('returns null when trailing non-whitespace tokens remain after declaration', () => {
      const parserValid = new Parser(tokenize('color: red;'));
      const declValid = parserValid.parseDeclaration();
      assert.ok(declValid);
      assert.equal(declValid.name, 'color');

      const parserTrailing = new Parser(tokenize('color: red; extra'));
      const declTrailing = parserTrailing.parseDeclaration();
      assert.equal(declTrailing, null);
    });
  });

  // BC-10: serializeToken delim backslash serialization
  describe('BC-10: serializeToken delim backslash', () => {
    it('serializes delim backslash as \\\\\\n per css-syntax-3', () => {
      const token: Token = { type: 'delim', value: '\\' };
      const serialized = serializeToken(token);
      assert.equal(serialized, '\\\n');
    });

    it('serializes other delims without newline', () => {
      const token: Token = { type: 'delim', value: '+' };
      assert.equal(serializeToken(token), '+');
    });
  });

  // BC-12: getElementLanguage XML un-namespaced lang gating
  describe('BC-12: getElementLanguage XML gating', () => {
    it('ignores un-namespaced lang on non-HTML, non-SVG elements in XML documents', () => {
      const xmlDoc = {
        constructor: { name: 'XMLDocument' },
        nodeType: 9,
      };

      const customXmlEl = {
        nodeType: 1,
        ownerDocument: xmlDoc,
        namespaceURI: 'http://example.com/ns',
        hasAttribute(attr: string) {
          return attr === 'lang';
        },
        getAttribute(attr: string) {
          return attr === 'lang' ? 'en' : null;
        },
        hasAttributeNS() {
          return false;
        },
        getAttributeNS() {
          return null;
        },
      };

      // In XML doc, custom non-HTML, non-SVG element's un-namespaced lang is ignored
      assert.equal(getElementLanguage(customXmlEl as unknown as HTMLElement), null);

      const htmlInXmlEl = {
        ...customXmlEl,
        namespaceURI: 'http://www.w3.org/1999/xhtml',
      };
      // HTML element in XML doc respects un-namespaced lang
      assert.equal(getElementLanguage(htmlInXmlEl as unknown as HTMLElement), 'en');

      const svgInXmlEl = {
        ...customXmlEl,
        namespaceURI: 'http://www.w3.org/2000/svg',
      };
      // SVG element in XML doc respects un-namespaced lang
      assert.equal(getElementLanguage(svgInXmlEl as unknown as HTMLElement), 'en');
    });
  });
});
