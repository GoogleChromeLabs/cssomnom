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
import {
  CSSStyleSheet,
  CSSConditionRule,
  CSSMediaRule,
  CSSSupportsRule,
  CSSContainerRule,
  CSSNamespaceRule,
  CSSStyleDeclaration,
  getCascadedStyle,
  parse
} from '../src/index.ts';

describe('Phase 90: CSSOM Core Rules, Constructable Sheets & SelectorText Invalidation', () => {
  describe('Rule Hierarchy & Inheritance', () => {
    test('CSSConditionRule is base class for media, supports, and container rules', () => {
      // css-conditional-3 § 3 #the-cssconditionrule-interface
      const mediaRule = new CSSMediaRule('screen and (min-width: 600px)', [], () => { throw new Error(); });
      assert.ok(mediaRule instanceof CSSConditionRule);
      assert.equal(mediaRule.conditionText, 'screen and (min-width: 600px)');

      const supportsRule = new CSSSupportsRule('(display: grid)', [], () => { throw new Error(); });
      assert.ok(supportsRule instanceof CSSConditionRule);
      assert.equal(supportsRule.conditionText, '(display: grid)');

      const containerRule = new CSSContainerRule('(min-width: 300px)', [], () => { throw new Error(); }, 'sidebar');
      assert.ok(containerRule instanceof CSSConditionRule);
      assert.equal(containerRule.conditionText, 'sidebar (min-width: 300px)');
      assert.equal(containerRule.containerName, 'sidebar');
      assert.equal(containerRule.containerQuery, '(min-width: 300px)');
    });

    test('CSSNamespaceRule exposes namespaceURI and prefix per cssom-1 § 6.4.5', () => {
      const nsRule = new CSSNamespaceRule('svg', 'http://www.w3.org/2000/svg');
      assert.equal(nsRule.type, 10);
      assert.equal(nsRule.namespaceURI, 'http://www.w3.org/2000/svg');
      assert.equal(nsRule.prefix, 'svg');
      assert.equal(nsRule.cssText, '@namespace svg url("http://www.w3.org/2000/svg");');

      const defaultNsRule = new CSSNamespaceRule('', 'http://www.w3.org/1999/xhtml');
      assert.equal(defaultNsRule.prefix, '');
      assert.equal(defaultNsRule.cssText, '@namespace url("http://www.w3.org/1999/xhtml");');
    });
  });

  describe('Specified Declaration Order (cssom-1 § 6.4.1)', () => {
    test('Winning declaration takes the position of the overriding declaration', () => {
      const style = new CSSStyleDeclaration();
      style.cssText = 'color: red; background-color: blue; color: green;';
      assert.equal(style.length, 2);
      assert.equal(style.item(0), 'background-color');
      assert.equal(style.item(1), 'color');
      assert.equal(style.getPropertyValue('color'), 'green');
    });

    test('Important declaration retains precedence and earlier position against normal override', () => {
      const style = new CSSStyleDeclaration();
      style.cssText = 'color: red !important; background-color: blue; color: green;';
      assert.equal(style.length, 2);
      assert.equal(style.item(0), 'color');
      assert.equal(style.item(1), 'background-color');
      assert.equal(style.getPropertyValue('color'), 'red');
      assert.equal(style.getPropertyPriority('color'), 'important');
    });
  });

  describe('Strict Shorthand getPropertyValue Completeness (cssom-1 § 6.6.2)', () => {
    test('Returns contracted value when all constituent longhands are present', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('margin-top', '10px');
      style.setProperty('margin-right', '10px');
      style.setProperty('margin-bottom', '10px');
      style.setProperty('margin-left', '10px');
      assert.equal(style.getPropertyValue('margin'), '10px');
    });

    test('Returns empty string when any constituent longhand is missing', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('margin-top', '10px');
      style.setProperty('margin-right', '10px');
      assert.equal(style.getPropertyValue('margin'), '');
    });

    test('Returns empty string when constituent longhands have conflicting priorities', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('margin-top', '10px', 'important');
      style.setProperty('margin-right', '10px');
      style.setProperty('margin-bottom', '10px');
      style.setProperty('margin-left', '10px');
      assert.equal(style.getPropertyValue('margin'), '');
    });
  });

  describe('Constructable Stylesheets & adoptedStyleSheets Invalidation', () => {
    test('Live mutation with replaceSync recalculates getCascadedStyle', () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('.target { color: red; }');

      const mockDoc = {
        adoptedStyleSheets: [sheet],
        styleSheets: []
      };

      const mockElement = {
        localName: 'div',
        tagName: 'div',
        className: 'target',
        ownerDocument: mockDoc,
        getRootNode: () => mockDoc,
        isConnected: true
      };

      const style1 = getCascadedStyle(mockElement);
      assert.equal(style1.getPropertyValue('color'), 'rgb(255, 0, 0)');

      // Live mutation
      sheet.replaceSync('.target { color: blue; }');
      const style2 = getCascadedStyle(mockElement);
      assert.equal(style2.getPropertyValue('color'), 'rgb(0, 0, 255)');
    });

    test('Adopted stylesheets have higher precedence than non-adopted author styles', () => {
      const authorSheet = parse('.target { color: red; }');
      const adoptedSheet = new CSSStyleSheet();
      adoptedSheet.replaceSync('.target { color: green; }');

      const mockDoc = {
        styleSheets: [authorSheet],
        adoptedStyleSheets: [adoptedSheet]
      };

      const mockElement = {
        localName: 'div',
        tagName: 'div',
        className: 'target',
        ownerDocument: mockDoc,
        getRootNode: () => mockDoc,
        isConnected: true
      };

      const cascaded = getCascadedStyle(mockElement);
      assert.equal(cascaded.getPropertyValue('color'), 'rgb(0, 128, 0)');
    });
  });
});
