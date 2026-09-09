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
import { parseStyleSheet } from '../src/parser.ts';
import { CSSScopeRule, CSSGroupingRule } from '../src/CSSOM.ts';
import { CSSImportRule } from '../src/rules/at-rules.ts';
import { matches } from '../src/matcher.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { getCascadedStyle } from '../src/cascade.ts';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';

describe('Phase 118: :scope, @scope & Complex Relative Selectors', () => {
  describe('CSSScopeRule WebIDL and Serialization', () => {
    it('serializes start, end, and cssText correctly for implicit and explicit scopes', () => {
      const css = `
        @scope {}
        @scope (.a) {}
        @scope (.a) to (.b) {
          div {
            display: block;
          }
        }
        @scope to (.b) {}
      `;
      const rules = parseStyleSheet(css);
      assert.equal(rules.length, 4);

      const r0 = rules[0] as CSSScopeRule;
      const r1 = rules[1] as CSSScopeRule;
      const r2 = rules[2] as CSSScopeRule;
      const r3 = rules[3] as CSSScopeRule;

      assert.ok(r0 instanceof CSSScopeRule);
      assert.ok(r0 instanceof CSSGroupingRule);

      // .start and .end getters
      assert.equal(r0.start, null);
      assert.equal(r0.end, null);

      assert.equal(r1.start, '.a');
      assert.equal(r1.end, null);

      assert.equal(r2.start, '.a');
      assert.equal(r2.end, '.b');

      assert.equal(r3.start, null);
      assert.equal(r3.end, '.b');

      // .cssText serialization
      assert.equal(r0.cssText, '@scope {\n}');
      assert.equal(r1.cssText, '@scope (.a) {\n}');
      assert.equal(r2.cssText, '@scope (.a) to (.b) {\n  div { display: block; }\n}');
      assert.equal(r3.cssText, '@scope to (.b) {\n}');
    });
  });

  describe('Relative Selector Matching & :scope in matcher.ts', () => {
    it('matches complex relative selectors with leading combinators against scope', () => {
      const { document } = parseHTML(`
        <div class="root">
          <div class="direct-child">
            <span class="nested">Hello</span>
          </div>
          <div class="sibling-one"></div>
          <div class="sibling-two"></div>
        </div>
      `);

      const root = document.querySelector('.root')!;
      const directChild = document.querySelector('.direct-child')!;
      const nested = document.querySelector('.nested')!;
      const s1 = document.querySelector('.sibling-one')!;
      const s2 = document.querySelector('.sibling-two')!;

      // Leading child combinator
      assert.ok(matches(directChild, '> .direct-child', root));
      assert.ok(!matches(nested, '> .nested', root));

      // Leading child combinator with chained descendant
      assert.ok(matches(nested, '> .direct-child .nested', root));
      assert.ok(matches(nested, '> .direct-child > span', root));

      // Sibling combinators relative to directChild
      assert.ok(matches(s1, '+ .sibling-one', directChild));
      assert.ok(matches(s2, '~ .sibling-two', directChild));

      // :scope matching
      assert.ok(matches(root, ':scope', root));
      assert.ok(!matches(directChild, ':scope', root));
      assert.ok(matches(directChild, ':scope > .direct-child', root));
    });
  });

  describe('Cascaded Style Evaluation under @scope', () => {
    it('evaluates @scope with scoping limits and proximity', () => {
      const { document } = parseHTML(`
        <div class="light" id="scopeLight">
          <div class="target" id="item1">
            <div class="limit" id="limitNode">
              <div class="target" id="item2"></div>
            </div>
          </div>
        </div>
      `);

      const sheet = parseStyleSheet(`
        @scope (.light) to (.limit) {
          .target {
            z-index: 1;
          }
        }
      `);

      const item1 = document.querySelector('#item1')!;
      const item2 = document.querySelector('#item2')!;

      const style1 = getCascadedStyle(item1, sheet);
      assert.equal(style1.getPropertyValue('z-index'), '1');

      // item2 is inside .limit, so it should be out of scope
      const style2 = getCascadedStyle(item2, sheet);
      assert.equal(style2.getPropertyValue('z-index'), '');
    });

    it('prioritizes proximate scoping root over appearance order', () => {
      const { document } = parseHTML(`
        <div class="a" id="rootA">
          <div class="b" id="rootB">
            <span id="target"></span>
          </div>
        </div>
      `);

      const sheet = parseStyleSheet(`
        @scope (.b) {
          #target { color: green; }
        }
        @scope (.a) {
          #target { color: red; }
        }
      `);

      const target = document.querySelector('#target')!;
      const style = getCascadedStyle(target, sheet);
      // .b is closer (1 hop) than .a (2 hops), so green should win despite red being declared later
      assert.equal(style.getPropertyValue('color'), 'rgb(0, 128, 0)');
    });
  });

  describe('CSSStyleDeclaration number coercion', () => {
    it('coerces numeric values to string in setProperty and property assignment', () => {
      const decl = new CSSStyleDeclaration();
      decl.setProperty('opacity', 0.75 as unknown as string);
      assert.equal(decl.getPropertyValue('opacity'), '0.75');

      decl.opacity = 0.5 as unknown as string;
      assert.equal(decl.getPropertyValue('opacity'), '0.5');
    });
  });

  describe('CSSImportRule scope serialization', () => {
    it('serializes bare scope keyword when no start or end selector is specified', () => {
      const rules = parseStyleSheet('@import url("test.css") scope;');
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSImportRule;
      assert.equal(rule.isScoped, true);
      assert.equal(rule.scopeStart, null);
      assert.equal(rule.scopeEnd, null);
      assert.equal(rule.cssText, '@import url("test.css") scope;');
    });

    it('serializes scope with start and end selectors', () => {
      const rules = parseStyleSheet('@import url("test.css") scope((.a) to (.b));');
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSImportRule;
      assert.equal(rule.isScoped, true);
      assert.equal(rule.scopeStart, '.a');
      assert.equal(rule.scopeEnd, '.b');
      assert.equal(rule.cssText, '@import url("test.css") scope((.a) to (.b));');
    });

    it('serializes scope with only start selector', () => {
      const rules = parseStyleSheet('@import url("test.css") scope((.a));');
      assert.equal(rules.length, 1);
      const rule = rules[0] as CSSImportRule;
      assert.equal(rule.isScoped, true);
      assert.equal(rule.scopeStart, '.a');
      assert.equal(rule.scopeEnd, null);
      assert.equal(rule.cssText, '@import url("test.css") scope((.a));');
    });
  });
  describe('CSSScopeRule Prelude Validation & Pseudo-Element Rejection', () => {
    // css-cascade-6 § 3.1 #scope-syntax
    it('rejects pseudo-elements in scoping root and limit preludes', () => {
      assert.equal(parseStyleSheet('@scope (div::before) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (div::after) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (div:before) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) to (div::before) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) to (div::after) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) to (div:after) {}').length, 0);
    });

    it('rejects malformed preludes with trailing garbage or missing to-blocks', () => {
      assert.equal(parseStyleSheet('@scope div {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) unknown (.c) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) to unknown (.c) {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) 1px (.c) {}').length, 0);
      assert.equal(parseStyleSheet('@scope to {}').length, 0);
      assert.equal(parseStyleSheet('@scope (.a) from (.c) {}').length, 0);
    });
  });

  describe('Scope Root Exclusion without :scope', () => {
    // css-cascade-6 § 3 #scoped-styles
    it('does not match scope root element unless :scope is explicitly in selector', () => {
      const { document } = parseHTML(`
        <div class="a">
          <span>nested text</span>
        </div>
      `);

      const sheetNoScope = parseStyleSheet(`
        @scope (.a) {
          .a { color: green; }
        }
      `);

      const rootEl = document.querySelector('.a')!;
      const styleNoScope = getCascadedStyle(rootEl, sheetNoScope);
      assert.equal(styleNoScope.getPropertyValue('color'), 'rgb(0, 0, 0)');

      const sheetWithScope = parseStyleSheet(`
        @scope (.a) {
          :scope { color: green; }
        }
      `);

      const styleWithScope = getCascadedStyle(rootEl, sheetWithScope);
      assert.equal(styleWithScope.getPropertyValue('color'), 'rgb(0, 128, 0)');
    });
  });

  describe('DOM Shim Named Element Access on Window', () => {
    // html § 7.3.3 #named-access-on-the-window-object
    it('exposes element IDs directly on window and updates on DOM mutation', () => {
      const dom = parseHTML(`
        <div id="item1"></div>
        <div id="item2"></div>
      `);
      const win = dom.window;
      const doc = dom.document;
      patchWindowForTypedOM(win);

      const winObj = win as unknown as Record<string, unknown>;
      assert.equal(winObj.item1, doc.getElementById('item1'));
      assert.equal(winObj.item2, doc.getElementById('item2'));

      // Dynamic element addition
      const div3 = doc.createElement('div');
      div3.id = 'item3';
      doc.body.appendChild(div3);
      assert.equal(winObj.item3, div3);

      // Dynamic element removal
      div3.remove();
      assert.equal(winObj.item3, undefined);
    });
  });
});

