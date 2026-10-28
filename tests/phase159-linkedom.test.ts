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
  matches,
  isXmlDocument,
  selectorCache,
  clearSelectorCache,
  SELECTOR_CACHE_MAX_SIZE,
  getElementLanguage,
  type DOMElement,
} from '../src/matcher.ts';

import {
  parse,
  walkRules,
  resolveNestedSelector,
  CSSStyleDeclaration,
  CSSStyleSheet,
  CSSStyleRule,
} from '../src/parse-entry.ts';
import * as ParseEntry from '../src/parse-entry.ts';
import { parseRule, parseStyleSheet } from '../src/parser.ts';

describe('Phase 159: linkedom Integration & Tree-Shakeable Bundle Readiness', () => {

  describe('159.1: Tree-shakeable parse entry point', () => {
    it('parses stylesheets and rules via src/parse-entry.ts', () => {
      const sheet = parse('h1 { color: red; margin: 10px; } @media (max-width: 600px) { h1 { font-size: 14px; } }');
      assert.ok(sheet instanceof CSSStyleSheet);
      assert.equal(sheet.cssRules.length, 2);

      const rule = parseRule('div.test { padding: 5px; }');
      assert.ok(rule);
      assert.equal(rule.type, 1); // CSSRule.STYLE_RULE

      const rules = parseStyleSheet('a { color: blue; } b { color: green; }');
      assert.equal(rules.length, 2);
    });

    it('parses and operates via parse-entry', () => {
      const sheet = ParseEntry.parse('p { font-weight: bold; }');
      assert.ok(sheet);
      assert.equal(sheet.cssRules.length, 1);
      const rule = sheet.cssRules.item(0) as CSSStyleRule;
      assert.equal(rule.selectorText, 'p');
      assert.equal(rule.style.fontWeight, 'bold');
    });

    it('parse-entry does not leak cascade module', () => {
      assert.equal('getCascadedStyle' in ParseEntry, false);
    });

    it('throws informative error when accessing CSSStyleRule.styleMap without typed-om module', () => {
      const sheet = parse('span { display: inline; }');
      const rule = sheet.cssRules.item(0) as CSSStyleRule;
      assert.throws(
        () => rule.styleMap,
        /createStylePropertyMap not injected \(import cssomnom\/typed-om\)/
      );
    });

    it('walkRules and resolveNestedSelector work without cascade engine', () => {
      const sheet = parse('article { color: black; & h2 { color: blue; } }');
      const entries = Array.from(walkRules(sheet));
      assert.equal(entries.length, 2);
      assert.equal(entries[0].selectorText, 'article');
      assert.equal(entries[1].selectorText, ':is(article) h2');

      const resolved = resolveNestedSelector('& > span', '.card');
      assert.equal(resolved, ':is(.card) > span');
    });
  });

  describe('159.2: CSSStyleDeclaration onChange, setCssTextSilent, and linkedom integration', () => {
    it('supports (parentRule, onChange) constructor parameters and onChange getter/setter', () => {
      let callCount = 0;
      let lastForce: boolean | undefined = undefined;
      const onChange = (force?: boolean) => {
        callCount++;
        lastForce = force;
      };

      const style = new CSSStyleDeclaration(null, onChange);
      assert.equal(style.onChange, onChange);

      // Property assignment invokes onChange
      style.color = 'red';
      assert.equal(callCount, 1);
      assert.equal(lastForce, undefined);
      assert.equal(style.color, 'red');

      // setProperty invokes onChange
      style.setProperty('font-size', '16px');
      assert.equal(callCount, 2);
      assert.equal(style.fontSize, '16px');

      // Updating onChange handler
      let newHandlerCalled = false;
      style.onChange = () => { newHandlerCalled = true; };
      style.margin = '10px';
      assert.equal(newHandlerCalled, true);
      assert.equal(callCount, 2); // original handler not called

      // Clearing onChange handler
      style.onChange = null;
      assert.equal(style.onChange, null);
      style.padding = '5px'; // should not throw
    });

    it('preserves backwards compatibility with (declarations, readonly) constructor', () => {
      const decls = [{
        type: 'declaration' as const,
        name: 'display',
        value: [{ type: 'ident' as const, value: 'flex' }],
        important: false,
      }];
      const readonlyStyle = new CSSStyleDeclaration(decls, true);
      assert.equal(readonlyStyle.display, 'flex');
      assert.throws(
        () => { readonlyStyle.display = 'block'; },
        /Modification is disallowed/
      );
    });

    it('removes property and calls onChange when setting value to empty string (linkedom#327)', () => {
      let callCount = 0;
      const style = new CSSStyleDeclaration(null, () => { callCount++; });

      style.color = 'blue';
      assert.equal(callCount, 1);
      assert.equal(style.color, 'blue');

      // Setting to empty string removes property and calls onChange
      style.color = '';
      assert.equal(callCount, 2);
      assert.equal(style.color, '');
      assert.equal(style.getPropertyValue('color'), '');
      assert.equal(style.length, 0);

      // setProperty with empty string
      style.setProperty('background-color', 'green');
      assert.equal(callCount, 3);
      style.setProperty('background-color', '');
      assert.equal(callCount, 4);
      assert.equal(style.backgroundColor, '');
    });

    it('removeProperty calls onChange', () => {
      let callCount = 0;
      const style = new CSSStyleDeclaration(null, () => { callCount++; });

      style.setProperty('z-index', '10');
      assert.equal(callCount, 1);

      const removed = style.removeProperty('z-index');
      assert.equal(removed, '10');
      assert.equal(callCount, 2);
      assert.equal(style.getPropertyValue('z-index'), '');
    });

    it('cssText setter notifies onChange with force: true', () => {
      let callCount = 0;
      let forceArg: boolean | undefined = undefined;
      const style = new CSSStyleDeclaration(null, (force) => {
        callCount++;
        forceArg = force;
      });

      style.cssText = 'color: purple; margin-top: 20px;';
      assert.equal(callCount, 1);
      assert.equal(forceArg, true);
      assert.equal(style.color, 'purple');
      assert.equal(style.marginTop, '20px');
    });

    it('suppressing onChange hydrates declarations without invoking callback', () => {
      let callCount = 0;
      const cb = () => { callCount++; };
      const style = new CSSStyleDeclaration(null, cb);

      style.onChange = null;
      style.cssText = 'border: 1px solid black; opacity: 0.5;';
      style.onChange = cb;
      assert.equal(callCount, 0, 'onChange must not be called when suppressed');
      assert.equal(style.borderTopWidth, '1px');
      assert.equal(style.borderTopStyle, 'solid');
      assert.equal(style.borderTopColor, 'black');
      assert.equal(style.opacity, '0.5');

      // Subsequent normal setProperty does notify
      style.opacity = '1';
      assert.equal(callCount, 1);
    });

    it('handles cssFloat alias properly', () => {
      const style = new CSSStyleDeclaration();
      style.cssFloat = 'right';
      assert.equal(style.cssFloat, 'right');
      assert.equal(style.float, 'right');
      assert.equal(style.getPropertyValue('float'), 'right');

      style.float = 'left';
      assert.equal(style.cssFloat, 'left');
      assert.equal(style.float, 'left');
    });

    it('preserves case sensitivity for custom properties', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('--myCustomColor', '#123456');
      assert.equal(style.getPropertyValue('--myCustomColor'), '#123456');
      assert.equal(style['--myCustomColor'], '#123456');

      // Proxy setter with camel/mixed case dashed ident
      style['--accentThemeVar'] = 'orange';
      assert.equal(style.getPropertyValue('--accentThemeVar'), 'orange');
      assert.equal(style['--accentThemeVar'], 'orange');

      // Case distinction
      style.setProperty('--accentthemevar', 'purple');
      assert.equal(style.getPropertyValue('--accentThemeVar'), 'orange');
      assert.equal(style.getPropertyValue('--accentthemevar'), 'purple');
    });
  });

  describe('159.3: XML/SVG document case sensitivity and isXmlDocument', () => {
    it('detects XML documents based on contentType', () => {
      const htmlEl = { ownerDocument: { contentType: 'text/html' } };
      assert.equal(isXmlDocument(htmlEl as unknown as DOMElement), false);

      const xhtmlEl = { ownerDocument: { contentType: 'application/xhtml+xml' } };
      assert.equal(isXmlDocument(xhtmlEl as unknown as DOMElement), true);

      const xmlEl = { ownerDocument: { contentType: 'text/xml' } };
      assert.equal(isXmlDocument(xmlEl as unknown as DOMElement), true);

      const svgEl = { ownerDocument: { contentType: 'image/svg+xml' } };
      assert.equal(isXmlDocument(svgEl as unknown as DOMElement), true);
    });

    it('detects linkedom XMLDocument and SVGDocument when contentType is undefined', () => {
      class XMLDocument {}
      class SVGDocument {}
      class HTMLDocument {}
      class Document {}

      const xmlEl = { ownerDocument: new XMLDocument() };
      assert.equal(isXmlDocument(xmlEl as unknown as DOMElement), true);

      const svgEl = { ownerDocument: new SVGDocument() };
      assert.equal(isXmlDocument(svgEl as unknown as DOMElement), true);

      const htmlEl = { ownerDocument: new HTMLDocument() };
      assert.equal(isXmlDocument(htmlEl as unknown as DOMElement), false);

      const docEl = { ownerDocument: new Document() };
      assert.equal(isXmlDocument(docEl as unknown as DOMElement), false);

      const noDocEl = { ownerDocument: null };
      assert.equal(isXmlDocument(noDocEl as unknown as DOMElement), false);
    });

    it('matches type selectors case-sensitively in XML documents with undefined contentType', () => {
      class XMLDocument {}
      const xmlDoc = new XMLDocument();

      const mixedEl = {
        nodeType: 1,
        tagName: 'MyCustomElement',
        localName: 'MyCustomElement',
        ownerDocument: xmlDoc,
        attributes: [],
        getAttribute: () => null,
        hasAttribute: () => false,
      };

      // In XML, type selector must match exact case
      assert.equal(matches(mixedEl, 'MyCustomElement'), true);
      assert.equal(matches(mixedEl, 'mycustomelement'), false);
      assert.equal(matches(mixedEl, 'MYCUSTOMELEMENT'), false);
    });

    it('matches type selectors case-insensitively in HTML documents', () => {
      const htmlDoc = { contentType: 'text/html' };
      const el = {
        nodeType: 1,
        tagName: 'DIV',
        localName: 'div',
        ownerDocument: htmlDoc,
        attributes: [],
        getAttribute: () => null,
        hasAttribute: () => false,
      };

      assert.equal(matches(el, 'div'), true);
      assert.equal(matches(el, 'DIV'), true);
      assert.equal(matches(el, 'DiV'), true);
    });

    it('matches attribute selectors case-sensitively in XML documents', () => {
      class XMLDocument {}
      const xmlDoc = new XMLDocument();

      const el = {
        nodeType: 1,
        tagName: 'item',
        localName: 'item',
        ownerDocument: xmlDoc,
        attributes: [{ name: 'type', value: 'TEXT' }],
        getAttribute: (attr: string) => attr === 'type' ? 'TEXT' : null,
        hasAttribute: (attr: string) => attr === 'type',
      };

      // In HTML, [type=text] is case-insensitive. In XML, it must be case-sensitive.
      assert.equal(matches(el, '[type="TEXT"]'), true);
      assert.equal(matches(el, '[type="text"]'), false);
    });

    it('determines element language according to XML rules when document is XMLDocument without contentType', () => {
      class XMLDocument {}
      const xmlDoc = new XMLDocument();

      const el = {
        nodeType: 1,
        tagName: 'catalog',
        localName: 'catalog',
        ownerDocument: xmlDoc,
        parentNode: null,
        hasAttribute: (name: string) => name === 'xml:lang',
        getAttribute: (name: string) => name === 'xml:lang' ? 'fr' : null,
        hasAttributeNS: () => false,
        getAttributeNS: () => null,
      };

      assert.equal(getElementLanguage(el as unknown as DOMElement), 'fr');
    });
  });

  describe('159.4: Bounded Selector AST Cache in matcher.ts', () => {
    it('caches parsed SelectorList ASTs and retrieves from cache on repeat matches', () => {
      clearSelectorCache();
      assert.equal(selectorCache.size, 0);

      const el = {
        nodeType: 1,
        tagName: 'div',
        localName: 'div',
        ownerDocument: { contentType: 'text/html' },
        attributes: [{ name: 'class', value: 'main' }],
        getAttribute: (attr: string) => attr === 'class' ? 'main' : null,
        hasAttribute: (attr: string) => attr === 'class',
        classList: { contains: (cls: string) => cls === 'main' },
      };

      const sel = 'div.main';
      assert.equal(matches(el, sel), true);
      assert.equal(selectorCache.has(sel), true);
      const cachedAst = selectorCache.get(sel);
      assert.ok(cachedAst);

      // Second match should reuse exact same cached AST reference
      assert.equal(matches(el, sel), true);
      assert.equal(selectorCache.get(sel), cachedAst);
    });

    it('enforces maximum cache size of 1000 with LRU eviction', () => {
      clearSelectorCache();
      assert.equal(SELECTOR_CACHE_MAX_SIZE, 1000);

      const dummyEl = {
        nodeType: 1,
        tagName: 'span',
        localName: 'span',
        ownerDocument: { contentType: 'text/html' },
        attributes: [],
        getAttribute: () => null,
        hasAttribute: () => false,
      };

      // Fill cache to capacity (1000)
      for (let i = 0; i < 1000; i++) {
        matches(dummyEl, `.c-${i}`);
      }
      assert.equal(selectorCache.size, 1000);
      assert.equal(selectorCache.has('.c-0'), true);
      assert.equal(selectorCache.has('.c-999'), true);

      // Access .c-0 so it becomes most recently used
      matches(dummyEl, '.c-0');

      // Now add a new selector (.c-1000) -> should evict the oldest (.c-1, since .c-0 was refreshed)
      matches(dummyEl, '.c-1000');
      assert.equal(selectorCache.size, 1000);
      assert.equal(selectorCache.has('.c-1000'), true);
      assert.equal(selectorCache.has('.c-0'), true, '.c-0 was refreshed and should not be evicted');
      assert.equal(selectorCache.has('.c-1'), false, '.c-1 should be evicted as the oldest');

      // Clear cache works
      clearSelectorCache();
      assert.equal(selectorCache.size, 0);
    });
  });

});
