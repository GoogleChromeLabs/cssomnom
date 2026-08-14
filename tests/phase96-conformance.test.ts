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
import { CSSStyleSheet, CSSKeyframesRule, CSSMediaRule } from '../src/CSSOM.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { getCascadedStyle, substituteVariables } from '../src/cascade.ts';
import { calculateSpecificity } from '../src/specificity.ts';

describe('Phase 96 Conformance - CSS Variables in Shorthands & env()', () => {
  it('substitutes custom properties inside margin shorthand and expands to longhands', () => {
    const el = {
      tagName: 'div',
      nodeType: 1,
      style: new CSSStyleDeclaration(),
      ownerDocument: { defaultView: null },
      parentElement: null,
      parentNode: null,
      getAttribute(attr: string) {
        if (attr === 'style') return this.style.cssText;
        return null;
      }
    };

    const sheet = new CSSStyleSheet();
    sheet.insertRule('div { --m: 20px; margin: 10px var(--m) 30px 40px; }', 0);

    const style = getCascadedStyle(el, sheet.cssRules as unknown as import('../src/types.ts').Rule[]);
    assert.equal(style.getPropertyValue('--m'), '20px');
    assert.equal(style.getPropertyValue('margin-top'), '10px');
    assert.equal(style.getPropertyValue('margin-right'), '20px');
    assert.equal(style.getPropertyValue('margin-bottom'), '30px');
    assert.equal(style.getPropertyValue('margin-left'), '40px');
  });

  it('substitutes custom properties inside border shorthand and expands to side longhands', () => {
    const el = {
      tagName: 'div',
      nodeType: 1,
      style: new CSSStyleDeclaration(),
      ownerDocument: { defaultView: null },
      parentElement: null,
      parentNode: null,
      getAttribute(attr: string) {
        if (attr === 'style') return this.style.cssText;
        return null;
      }
    };

    const sheet = new CSSStyleSheet();
    sheet.insertRule('div { --c: rgb(255, 0, 0); border: 2px solid var(--c); }', 0);

    const style = getCascadedStyle(el, sheet.cssRules as unknown as import('../src/types.ts').Rule[]);
    assert.equal(style.getPropertyValue('border-top-width'), '2px');
    assert.equal(style.getPropertyValue('border-top-style'), 'solid');
    assert.equal(style.getPropertyValue('border-top-color'), 'rgb(255, 0, 0)');
    assert.equal(style.getPropertyValue('border-left-color'), 'rgb(255, 0, 0)');
  });

  it('handles revert keyword in variable fallback for shorthand properties', () => {
    const el = {
      tagName: 'body',
      nodeType: 1,
      style: new CSSStyleDeclaration(),
      ownerDocument: { defaultView: null },
      parentElement: null,
      parentNode: null,
      getAttribute(attr: string) {
        if (attr === 'style') return this.style.cssText;
        return null;
      }
    };

    const sheet = new CSSStyleSheet();
    sheet.insertRule('body { margin: -1px; }', 0);
    sheet.insertRule('body { margin: var(--unknown, revert); }', 1);

    const style = getCascadedStyle(el, sheet.cssRules as unknown as import('../src/types.ts').Rule[]);
    // UA default margin for body is 8px
    assert.equal(style.getPropertyValue('margin-top'), '8px');
    assert.equal(style.getPropertyValue('margin-left'), '8px');
    assert.equal(style.getPropertyValue('margin'), '8px');
  });

  it('handles standard user-agent env() variables and custom fallbacks', () => {
    const customProps = new Map<string, string>();
    
    // Standard UA env vars default to 0px
    const safeTop = substituteVariables('env(safe-area-inset-top)', customProps);
    assert.equal(safeTop, '0px');

    const safeRight = substituteVariables('env(safe-area-inset-right, 10px)', customProps);
    assert.equal(safeRight, '0px');

    // Unknown env with fallback
    const fallbackVal = substituteVariables('env(custom-unknown-var, 25px)', customProps);
    assert.equal(fallbackVal, '25px');

    // Unknown env without fallback is invalid at computed-value time (null)
    const invalidVal = substituteVariables('env(custom-unknown-var)', customProps);
    assert.equal(invalidVal, null);
  });

  it('preserves strict case-sensitivity for custom property lookups', () => {
    const el = {
      tagName: 'div',
      nodeType: 1,
      style: new CSSStyleDeclaration(),
      ownerDocument: { defaultView: null },
      parentElement: null,
      parentNode: null,
      getAttribute(attr: string) {
        if (attr === 'style') return this.style.cssText;
        return null;
      }
    };

    const sheet = new CSSStyleSheet();
    sheet.insertRule('div { --myColor: rgb(255, 0, 0); --MYCOLOR: rgb(0, 0, 255); color: var(--myColor); background-color: var(--MYCOLOR); }', 0);

    const style = getCascadedStyle(el, sheet.cssRules as unknown as import('../src/types.ts').Rule[]);
    assert.equal(style.getPropertyValue('color'), 'rgb(255, 0, 0)');
    assert.equal(style.getPropertyValue('background-color'), 'rgb(0, 0, 255)');
    assert.equal(style.getPropertyValue('--myColor'), 'rgb(255, 0, 0)');
    assert.equal(style.getPropertyValue('--MYCOLOR'), 'rgb(0, 0, 255)');
  });
});

describe('Phase 96 Conformance - CSSOM Rule Indexing & Hierarchy Exceptions', () => {
  it('throws IndexSizeError on CSSStyleSheet.insertRule for out-of-bounds indices', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { color: red; }', 0);

    // Negative index
    assert.throws(() => {
      sheet.insertRule('.b { color: blue; }', -1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    // Index > length
    assert.throws(() => {
      sheet.insertRule('.b { color: blue; }', 5);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });
  });

  it('throws HierarchyRequestError when inserting @import after style rules in non-constructed stylesheets', () => {
    const sheet = new CSSStyleSheet();
    (sheet as unknown as { _constructedFlag: boolean })._constructedFlag = false;
    sheet.insertRule('.a { color: red; }', 0);

    assert.throws(() => {
      sheet.insertRule('@import url("test.css");', 1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'HierarchyRequestError';
    });
  });

  it('throws SyntaxError when inserting @import into constructed stylesheets', () => {
    const sheet = new CSSStyleSheet();
    assert.throws(() => {
      sheet.insertRule('@import url("test.css");', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'SyntaxError';
    });
  });

  it('throws HierarchyRequestError when inserting @import or @namespace inside CSSGroupingRule', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('@media screen {}', 0);
    const mediaRule = sheet.cssRules[0] as CSSMediaRule;

    assert.throws(() => {
      mediaRule.insertRule('@import url("nested.css");', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'HierarchyRequestError';
    });

    assert.throws(() => {
      mediaRule.insertRule('@namespace prefix "http://example.com";', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'HierarchyRequestError';
    });
  });

  it('supports CSSKeyframesRule rule indexing: appendRule, findRule, deleteRule, and indexed getters', () => {
    const keyframes = new CSSKeyframesRule('slide', []);
    keyframes.appendRule('from { opacity: 0; }');
    keyframes.appendRule('50% { opacity: 0.5; }');
    keyframes.appendRule('to { opacity: 1; }');

    assert.equal(keyframes.length, 3);
    assert.equal(keyframes[0]?.keyText, '0%');
    assert.equal(keyframes[1]?.keyText, '50%');
    assert.equal(keyframes[2]?.keyText, '100%');

    // findRule with normalized percentages
    const rule0 = keyframes.findRule('0%');
    assert.ok(rule0);
    assert.equal(rule0?.keyText, '0%');

    const ruleFrom = keyframes.findRule('from');
    assert.ok(ruleFrom);
    assert.equal(ruleFrom?.keyText, '0%');

    const ruleTo = keyframes.findRule('to');
    assert.ok(ruleTo);
    assert.equal(ruleTo?.keyText, '100%');

    // deleteRule
    keyframes.deleteRule('50%');
    assert.equal(keyframes.length, 2);
    assert.equal(keyframes.findRule('50%'), null);
  });

  it('provides numeric indexed item access on CSSStyleDeclaration with exact property names', () => {
    const style = new CSSStyleDeclaration();
    style.setProperty('color', 'red');
    style.setProperty('--custom-prop', '42px');
    style.setProperty('margin-top', '10px');

    assert.equal(style.length, 3);
    assert.equal(style[0], 'color');
    assert.equal(style[1], '--custom-prop');
    assert.equal(style[2], 'margin-top');
    assert.equal(style[3], undefined);
  });
});

describe('Phase 96 Conformance - Selectors 4 Specificity (:is, :where, :has, :not)', () => {
  it('computes max specificity for :is() and :has()', () => {
    // :is(#id, .class) -> max([1,0,0], [0,1,0]) = [1,0,0]
    const specIs = calculateSpecificity(':is(#id, .class)');
    assert.deepEqual(specIs, [[1, 0, 0]]);

    // :has(div, .class) -> max([0,0,1], [0,1,0]) = [0,1,0]
    const specHas = calculateSpecificity(':has(div, .class)');
    assert.deepEqual(specHas, [[0, 1, 0]]);
  });

  it('computes [0, 0, 0] specificity for :where() regardless of argument complexity', () => {
    const specWhere = calculateSpecificity(':where(#id.class[attr], div > p)');
    assert.deepEqual(specWhere, [[0, 0, 0]]);
  });

  it('computes max specificity for comma-separated :not() argument lists', () => {
    // :not(#id, .class, p) -> max([1,0,0], [0,1,0], [0,0,1]) = [1,0,0]
    const specNot = calculateSpecificity(':not(#id, .class, p)');
    assert.deepEqual(specNot, [[1, 0, 0]]);
  });
});
