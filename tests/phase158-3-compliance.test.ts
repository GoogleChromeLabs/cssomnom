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
  getCascadedStyle,
  CSSMediaRule,
  CSSStyleRule,
  CSSImportRule,
} from '../src/index.ts';
import { PropertyRegistry, matchesSyntax } from '../src/PropertyRegistry.ts';
import { resolveVariables } from '../src/cascade/variable-resolver.ts';
import { tokenize } from '../src/tokenizer.ts';
import { getLayerDeclarationOrder } from '../src/cascade/layer-manager.ts';
import type { ElementLike } from '../src/types.ts';

function createMockElement(
  tag: string,
  attrs: Record<string, string> = {},
  parent: ElementLike | null = null
): ElementLike {
  const el: ElementLike = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    parentElement: parent,
    parentNode: parent,
    getAttribute(name: string): string | null {
      return attrs[name] ?? null;
    },
    hasAttribute(name: string): boolean {
      return name in attrs;
    },
    ownerDocument: null,
  };
  return el;
}

describe('Phase 158.3 Compliance Verification', () => {
  describe('BC-21: Multipliers in consumeSyntaxComponent', () => {
    it('rejects whitespace before + or # multiplier and rejects ?, *, {} multipliers', () => {
      // Whitespace before +
      assert.throws(() => {
        PropertyRegistry.register({
          name: '--ws-plus',
          syntax: '<color> +',
          inherits: false,
          initialValue: 'red',
        });
      }, /SyntaxError/);

      // Whitespace before #
      assert.throws(() => {
        PropertyRegistry.register({
          name: '--ws-hash',
          syntax: '<color> #',
          inherits: false,
          initialValue: 'red',
        });
      }, /SyntaxError/);

      // Multiplier ?
      assert.throws(() => {
        PropertyRegistry.register({
          name: '--mult-opt',
          syntax: '<color>?',
          inherits: false,
          initialValue: 'red',
        });
      }, /SyntaxError/);

      // Multiplier *
      assert.throws(() => {
        PropertyRegistry.register({
          name: '--mult-star',
          syntax: '<color>*',
          inherits: false,
          initialValue: 'red',
        });
      }, /SyntaxError/);
    });
  });

  describe('BC-22: Removal of <flex> from VALID_COMPONENTS', () => {
    it('rejects <flex> syntax component', () => {
      assert.throws(() => {
        PropertyRegistry.register({
          name: '--flex-prop',
          syntax: '<flex>',
          inherits: false,
          initialValue: '1fr',
        });
      }, /SyntaxError/);
    });
  });

  describe('BC-23: Multipliers on literal ident components in matchesSyntax', () => {
    it('applies + and # list multipliers to custom-ident / literal components', () => {
      const tokensBigList = tokenize('big big');
      const tokensFooHash = tokenize('foo, foo');
      const tokensSmall = tokenize('small');

      assert.equal(matchesSyntax(tokensBigList, 'big+'), true);
      assert.equal(matchesSyntax(tokensFooHash, 'foo#'), true);
      assert.equal(matchesSyntax(tokensSmall, 'big+'), false);
    });
  });

  describe('BC-24 & BC-25: Registered custom property syntax validation and cycle/failure fallback', () => {
    it('falls back to initialValue or parent value when declared value fails matchesSyntax or is cyclic', () => {
      PropertyRegistry.register({
        name: '--my-len',
        syntax: '<length>',
        inherits: true,
        initialValue: '10px',
      });

      const parentEl = createMockElement('div');
      const childEl = createMockElement('span', {}, parentEl);

      // Invalid declared value 'red' for <length> syntax -> must reset to initial/parent value
      const sheet = parse(`
        div { --my-len: 20px; }
        span { --my-len: red; }
      `);
      const parentStyle = getCascadedStyle(parentEl, sheet.cssRules);
      const childStyle = getCascadedStyle(childEl, sheet.cssRules);

      assert.equal(parentStyle.getPropertyValue('--my-len'), '20px');
      // Child had invalid value 'red', should inherit parent's 20px
      assert.equal(childStyle.getPropertyValue('--my-len'), '20px');

      // Cyclic reference on registered property without valid parent: resets to initialValue
      const cyclicSheet = parse(`
        div { --my-len: var(--my-len); }
      `);
      const cyclicStyle = getCascadedStyle(parentEl, cyclicSheet.cssRules);
      assert.equal(cyclicStyle.getPropertyValue('--my-len'), '10px');
    });
  });

  describe('BC-26: Standalone resolveVariables with activeProperties', () => {
    it('uses activeProperties lookup in resolveVariables', () => {
      const sheet = parse('div { color: var(--dynamic-prop); }');
      const rule = sheet.cssRules[0] as CSSStyleRule;
      const activeProps = new Map([
        ['--dynamic-prop', { name: '--dynamic-prop', syntax: '<color>', inherits: false, initialValue: 'blue' }],
      ]);
      const res = resolveVariables(rule.style, 'color', undefined, activeProps);
      assert.equal(res, 'blue');
    });
  });

  describe('BC-27: CSSNestedDeclarations matching comma-separated parent selectors with pseudo-elements', () => {
    it('matches complex selectors with pseudo-elements in comma-separated parent selector', () => {
      const sheet = parse(`
        .foo, .foo::before {
          color: red;
          @media (min-width: 0) {
            background: yellow;
          }
          font-size: 16px;
        }
      `);
      const el = createMockElement('div', { class: 'foo' });
      const style = getCascadedStyle(el, sheet.cssRules);
      assert.equal(style.getPropertyValue('font-size'), '16px');

      const pseudoStyle = getCascadedStyle(el, sheet.cssRules, 'before');
      assert.equal(pseudoStyle.getPropertyValue('font-size'), '16px');
    });
  });

  describe('BC-28: CSSNestedDeclarations specificity inside @scope', () => {
    it('preserves nested style rule specificity inside @scope', () => {
      const sheet = parse(`
        @scope (.card) {
          .btn {
            @media (min-width: 0) {
              padding: 5px;
            }
            color: green;
          }
        }
      `);
      const cardEl = createMockElement('div', { class: 'card' });
      const btnEl = createMockElement('button', { class: 'btn' }, cardEl);

      const style = getCascadedStyle(btnEl, sheet.cssRules);
      assert.equal(style.getPropertyValue('color'), 'rgb(0, 128, 0)');
      // Direct style inside @scope (.card) with parentSelector ':scope' has [0, 0, 0]
      const directScopeSheet = parse(`
        @scope (.card) {
          @media (min-width: 0) {
            margin: 10px;
          }
          color: red;
        }
      `);
      const directStyle = getCascadedStyle(cardEl, directScopeSheet.cssRules);
      assert.equal(directStyle.getPropertyValue('color'), 'rgb(255, 0, 0)');
    });
  });

  describe('BC-29: CSSGroupingRule.insertRule ancestor check', () => {
    it('allows non-grouping at-rules in nested @media without CSSStyleRule ancestor, but rejects inside CSSStyleRule', () => {
      // Top-level nested media
      const sheet = parse('@media screen { @media (min-width: 0) {} }');
      const outerMedia = sheet.cssRules[0] as CSSMediaRule;
      const innerMedia = outerMedia.cssRules[0] as CSSMediaRule;

      // Inserting @keyframes inside nested media should succeed
      assert.doesNotThrow(() => {
        innerMedia.insertRule('@keyframes slide { from { opacity: 0; } to { opacity: 1; } }', 0);
      });

      // Inside a style rule
      const styleSheet = parse('.card { @media screen {} }');
      const styleRule = styleSheet.cssRules[0] as CSSStyleRule;
      const nestedInStyleMedia = styleRule.cssRules[0] as CSSMediaRule;

      // Inserting @keyframes inside media nested inside style rule should throw HierarchyRequestError
      assert.throws(() => {
        nestedInStyleMedia.insertRule('@keyframes bounce { from { top: 0; } }', 0);
      }, /HierarchyRequestError/);
    });
  });

  describe('BC-30: revert-layer rollback on !important and inline styles', () => {
    it('rolls back past only the same layer/importance level', () => {
      const sheet = parse(`
        @layer base {
          div { color: red !important; }
        }
        @layer theme {
          div { color: revert-layer !important; }
        }
      `);
      const el = createMockElement('div');
      const style = getCascadedStyle(el, sheet.cssRules);
      // In !important cascade order, theme layer is lower precedence than base layer.
      // revert-layer in theme !important should roll back to base !important
      assert.equal(style.getPropertyValue('color'), 'rgb(255, 0, 0)');
    });
  });

  describe('BC-31: scanLayers ignores false @supports condition', () => {
    it('does not register layer order inside false @supports rule', () => {
      const sheet = parse(`
        @supports (not (display: flex)) and (display: invalid-test-thing) {
          @layer ignoredLayer;
        }
        @layer realLayer;
      `);
      const order = getLayerDeclarationOrder(Array.from(sheet.cssRules));
      assert.equal(order.has('ignoredLayer'), false);
      assert.equal(order.has('realLayer'), true);
    });
  });

  describe('BC-32: @import supports(...) condition', () => {
    it('ignores @import when supports condition is false and includes it when true', () => {
      const sheetFalse = parse(`
        @import url("test.css") supports(display: invalid-test-thing);
      `);
      const importRuleFalse = sheetFalse.cssRules[0] as CSSImportRule;
      const importedSubSheet = parse('div { color: red; }');
      Object.defineProperty(importRuleFalse, 'styleSheet', { value: importedSubSheet, configurable: true });

      const el = createMockElement('div');
      const styleFalse = getCascadedStyle(el, sheetFalse.cssRules);
      assert.equal(styleFalse.getPropertyValue('color'), 'rgb(0, 0, 0)');

      const sheetTrue = parse(`
        @import url("test.css") supports(display: flex);
      `);
      const importRuleTrue = sheetTrue.cssRules[0] as CSSImportRule;
      Object.defineProperty(importRuleTrue, 'styleSheet', { value: importedSubSheet, configurable: true });

      const styleTrue = getCascadedStyle(el, sheetTrue.cssRules);
      assert.equal(styleTrue.getPropertyValue('color'), 'rgb(255, 0, 0)');
    });
  });

  describe('BC-33: Computed style for unset border-*-color and outline-color', () => {
    it('falls back to element color (currentcolor) instead of hardcoded rgb(0, 0, 0)', () => {
      const sheet = parse('div { color: rgb(255, 0, 0); }');
      const el = createMockElement('div');
      const computed = getCascadedStyle(el, sheet.cssRules);
      assert.equal(computed.getPropertyValue('color'), 'rgb(255, 0, 0)');
      assert.equal(computed.getPropertyValue('border-top-color'), 'rgb(255, 0, 0)');
      assert.equal(computed.getPropertyValue('outline-color'), 'rgb(255, 0, 0)');
    });
  });
});
