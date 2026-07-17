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

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './wpt-shim.ts';
import {
  CSSStyleRule,
  CSSMathMin,
  CSSMathClamp,
  CSSStyleValue
} from '../src/index.ts';

describe('Linkedom Integration Tests', () => {
  test('Custom Properties Case-Preservation', () => {
    const { window, document } = parseHTML(
      '<html><body><div id="el" style="--FooBar: green;"></div></body></html>'
    );
    patchWindowForTypedOM(window);

    const el = document.getElementById('el') as unknown as HTMLElement & {
      attributeStyleMap: {
        get(property: string): { toString(): string } | undefined;
        set(property: string, value: string): void;
      };
    };

    // Assert that custom property set in HTML style string preserves its case
    const val = el.attributeStyleMap.get('--FooBar');
    assert.ok(val, 'Should retrieve --FooBar');
    assert.strictEqual(val.toString(), 'green');

    // Case-insensitivity check (should return null for mismatched case of custom properties in Typed OM style map)
    const valLower = el.attributeStyleMap.get('--foobar');
    assert.strictEqual(valLower, undefined, 'Custom properties must preserve case exactly');

    // Set custom property with case-preservation
    el.attributeStyleMap.set('--MyNewVar', 'blue');
    assert.strictEqual(el.style.getPropertyValue('--MyNewVar'), 'blue');

    // Verify case preservation in serialized style attribute
    const styleAttr = el.getAttribute('style');
    assert.ok(styleAttr);
    assert.ok(styleAttr.includes('--FooBar: green'));
    assert.ok(styleAttr.includes('--MyNewVar: blue'));
  });

  test('Dynamic Sheet Mutation on HTMLStyleElement', () => {
    const { window, document } = parseHTML(
      '<html><head><style id="style-el">div { color: blue; }</style></head><body></body></html>'
    );
    patchWindowForTypedOM(window);

    const styleEl = document.getElementById('style-el') as unknown as HTMLStyleElement & {
      sheet: {
        cssRules: CSSStyleRule[];
      };
    };

    // Verify initial rules
    assert.strictEqual(styleEl.sheet.cssRules.length, 1);
    const rule1 = styleEl.sheet.cssRules[0];
    assert.strictEqual(rule1.selectorText, 'div');
    assert.strictEqual(rule1.style.color, 'blue');

    // Mutate textContent dynamically
    styleEl.textContent = 'span { color: red; font-size: 14px; }';

    // Verify rules are re-parsed and cache is invalidated correctly
    assert.strictEqual(styleEl.sheet.cssRules.length, 1);
    const rule2 = styleEl.sheet.cssRules[0];
    assert.strictEqual(rule2.selectorText, 'span');
    assert.strictEqual(rule2.style.color, 'red');
    assert.strictEqual(rule2.style.fontSize, '14px');
  });

  test('Level 4 CSS Value Reification', () => {
    const { window, document } = parseHTML(
      '<html><head><style id="style-el">div { width: min(10px, 20px); height: clamp(10px, 5vw, 100px); }</style></head><body></body></html>'
    );
    patchWindowForTypedOM(window);

    const styleEl = document.getElementById('style-el') as unknown as HTMLStyleElement & {
      sheet: {
        cssRules: CSSStyleRule[];
      };
    };

    assert.strictEqual(styleEl.sheet.cssRules.length, 1);
    const rule = styleEl.sheet.cssRules[0];

    // Verify property values parse successfully without crashing or ignoring
    assert.strictEqual(rule.style.width, 'min(10px, 20px)');
    assert.strictEqual(rule.style.height, 'clamp(10px, 5vw, 100px)');

    // Reify values using CSSStyleValue.parse
    const widthVal = CSSStyleValue.parse('width', rule.style.width);
    assert.ok(widthVal instanceof CSSMathMin, 'min() should reify to CSSMathMin');

    const heightVal = CSSStyleValue.parse('height', rule.style.height);
    assert.ok(heightVal instanceof CSSMathClamp, 'clamp() should reify to CSSMathClamp');
  });
});
