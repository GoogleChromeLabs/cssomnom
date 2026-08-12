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
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { serialize } from '../src/serializer.ts';
import { StreamingTokenizer } from '../src/streaming-tokenizer.ts';
import { SelectorParser } from '../src/SelectorParser.ts';
import { CSSStyleRule, CSSPageRule, CSSFontFaceRule } from '../src/CSSOM.ts';
import type { ComponentValue } from '../src/types.ts';

describe('Phase 89: CSS Syntax & Tokenizer Conformance', () => {
  describe('CSS Syntax 3 § 8: Consecutive Token Serialization Separator Comments', () => {
    function testPair(t1: string, t2: string, expectedPattern: string | RegExp) {
      const tokens1 = tokenize(t1).filter(t => t.type !== 'EOF');
      const tokens2 = tokenize(t2).filter(t => t.type !== 'EOF');
      const combined: ComponentValue[] = [...tokens1, ...tokens2];
      const serialized = serialize(combined, true);
      if (typeof expectedPattern === 'string') {
        assert.equal(serialized, expectedPattern);
      } else {
        assert.match(serialized, expectedPattern);
      }
    }

    it('inserts /**/ between ident and ident/function/url/number/dimension/percentage/delim/CDC/open-paren', () => {
      testPair('foo', 'bar', 'foo/**/bar');
      testPair('foo', 'bar()', 'foo/**/bar()');
      testPair('foo', 'url(bar)', 'foo/**/url(bar)');
      testPair('foo', '-', 'foo/**/-');
      testPair('foo', '123', 'foo/**/123');
      testPair('foo', '123%', 'foo/**/123%');
      testPair('foo', '123em', 'foo/**/123em');
      testPair('foo', '-->', 'foo/**/-->');
      testPair('foo', '()', 'foo/**/()');
    });

    it('inserts /**/ for at-keyword combinations', () => {
      testPair('@foo', 'bar', '@foo/**/bar');
      testPair('@foo', 'bar()', '@foo/**/bar()');
      testPair('@foo', 'url(bar)', '@foo/**/url(bar)');
      testPair('@foo', '-', '@foo/**/-');
      testPair('@foo', '123', '@foo/**/123');
      testPair('@foo', '123%', '@foo/**/123%');
      testPair('@foo', '123em', '@foo/**/123em');
      testPair('@foo', '-->', '@foo/**/-->');
    });

    it('inserts /**/ for hash, dimension, delim #, delim - combinations', () => {
      testPair('#foo', 'bar', '#foo/**/bar');
      testPair('#foo', '123', '#foo/**/123');
      testPair('123foo', 'bar', '123foo/**/bar');
      testPair('123foo', '123', '123foo/**/123');
      testPair('#', 'bar', '#/**/bar');
      testPair('#', '123', '#/**/123');
      testPair('-', 'bar', '-/**/bar');
      testPair('-', '123', '-/**/123');
      testPair('-', '-', '-/**/-');
    });

    it('inserts /**/ for number combinations and delim %', () => {
      testPair('123', 'bar', '123/**/bar');
      testPair('123', 'bar()', '123/**/bar()');
      testPair('123', 'url(bar)', '123/**/url(bar)');
      testPair('123', '123', '123/**/123');
      testPair('123', '123%', '123/**/123%');
      testPair('123', '123em', '123/**/123em');
      testPair('123', '%', '123/**/%');
    });

    it('inserts /**/ for delim @, delim ., delim +, delim /', () => {
      testPair('@', 'bar', '@/**/bar');
      testPair('@', 'bar()', '@/**/bar()');
      testPair('@', 'url(bar)', '@/**/url(bar)');
      testPair('@', '-', '@/**/-');

      testPair('.', '123', './**/123');
      testPair('.', '123%', './**/123%');
      testPair('.', '123em', './**/123em');

      testPair('+', '123', '+/**/123');
      testPair('+', '123%', '+/**/123%');
      testPair('+', '123em', '+/**/123em');

      testPair('/', '*', '//**/*');
    });

    it('preserves existing comment tokens and inserts empty comments between stripped tokens', () => {
      // When tokens are stripped of comments during tokenization:
      const tokens = tokenize('a/* comment */b').filter(t => t.type !== 'EOF');
      const serialized = serialize(tokens);
      assert.equal(serialized, 'a/**/b');

      // When an explicit comment token is present:
      const explicitTokens: ComponentValue[] = [
        { type: 'ident', value: 'a' },
        { type: 'comment', value: '/* custom comment */' },
        { type: 'ident', value: 'b' },
      ];
      assert.equal(serialize(explicitTokens), 'a/* custom comment */b');
    });
  });

  describe('CSS Syntax 3 § 5.4.4 & CSS Nesting: Unrecognized At-Rule Rejection in Declaration Lists', () => {
    it('drops unrecognized at-rules with block inside style rule and retains declarations in rule.style', () => {
      const css = `div {
        @at {}
        color: green;
      }`;
      const parser = new Parser(tokenize(css));
      const rules = parser.consumeListOfRules(true);
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSStyleRule;
      assert.ok(rule instanceof CSSStyleRule);
      assert.equal(rule.style.getPropertyValue('color'), 'green');
    });

    it('drops unrecognized at-rules with semicolon inside style rule and retains declarations in rule.style', () => {
      const css = `div {
        @at at;
        color: green;
      }`;
      const parser = new Parser(tokenize(css));
      const rules = parser.consumeListOfRules(true);
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSStyleRule;
      assert.ok(rule instanceof CSSStyleRule);
      assert.equal(rule.style.getPropertyValue('color'), 'green');
    });

    it('drops unrecognized at-rules inside @page and retains declarations', () => {
      const css = `@page {
        @at {}
        margin-top: 20px;
      }`;
      const parser = new Parser(tokenize(css));
      const rules = parser.consumeListOfRules(true);
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSPageRule;
      assert.ok(rule instanceof CSSPageRule);
      assert.equal(rule.style.getPropertyValue('margin-top'), '20px');
    });

    it('drops unrecognized at-rules inside @font-face and retains descriptors', () => {
      const css = `@font-face {
        @at at;
        font-family: myfont;
      }`;
      const parser = new Parser(tokenize(css));
      const rules = parser.consumeListOfRules(true);
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSFontFaceRule;
      assert.ok(rule instanceof CSSFontFaceRule);
      assert.equal(rule.style.getPropertyValue('font-family'), 'myfont');
    });
  });

  describe('CSS Syntax 3 § 3.2: @charset Directive Exclusion from CSSOM', () => {
    it('omits @charset from CSSOM rules list', () => {
      const css = `@charset "utf-8";
@charset "utf-8";
foo { color: blue; }
@charset "utf-8";`;
      const parser = new Parser(tokenize(css));
      const rules = parser.consumeListOfRules(true);
      assert.equal(rules.length, 1);
      assert.equal((rules[0] as CSSStyleRule).selectorText, 'foo');
    });
  });

  describe('CSS Syntax 3 § 3.3: StreamingTokenizer Surrogate Sanitization', () => {
    it('replaces isolated surrogate code points with U+FFFD', () => {
      const tokenizer = new StreamingTokenizer();
      // High surrogate alone: \uD800
      tokenizer.appendChunk('a\uD800b');
      tokenizer.close();
      const tokens = tokenizer.getTokens();
      const identToken = tokens.find(t => t.type === 'ident');
      assert.ok(identToken);
      assert.equal(identToken.value, 'a\uFFFDb');
    });

    it('buffers high surrogate at chunk boundary and merges with low surrogate', () => {
      const tokenizer = new StreamingTokenizer();
      // Smiling face emoji U+1F600 is \uD83D\uDE00
      tokenizer.appendChunk('prefix-\uD83D');
      tokenizer.appendChunk('\uDE00-suffix');
      tokenizer.close();
      const tokens = tokenizer.getTokens();
      const identToken = tokens.find(t => t.type === 'ident');
      assert.ok(identToken);
      assert.equal(identToken.value, 'prefix-😀-suffix');
    });

    it('handles large chunk code points without stack overflow', () => {
      const tokenizer = new StreamingTokenizer();
      const largeString = 'a'.repeat(150000);
      tokenizer.appendChunk(largeString);
      tokenizer.close();
      const tokens = tokenizer.getTokens();
      assert.ok(tokens.length > 0);
    });
  });

  describe('Selectors 4 § 15 / DOM: Selector Error DOMException Alignment', () => {
    it('throws DOMException with name SyntaxError on invalid selector syntax', () => {
      assert.throws(
        () => {
          const parser = new SelectorParser(tokenize('#123'));
          parser.parse();
        },
        (err: unknown) => {
          return err instanceof DOMException && err.name === 'SyntaxError';
        }
      );
    });
  });
});
