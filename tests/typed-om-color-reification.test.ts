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
import { CSSStyleValue, CSSKeywordValue, CSSColorValue, CSSRGB, StylePropertyMap } from '../src/typed-om.ts';

// css-typed-om-1 § 7.2 #reify-property
// css-typed-om-1 § 7.1 #reify-failure
describe('Typed OM color property reification', () => {
  test("attributeStyleMap.get('color') returns base CSSStyleValue for colors and CSSKeywordValue for currentcolor", () => {
    const { window, document } = parseHTML('<html><body><div id="test"></div></body></html>');
    patchWindowForTypedOM(window);
    const div = document.getElementById('test') as unknown as HTMLElement & {
      style: { color: string };
      attributeStyleMap: StylePropertyMap;
    };

    // 1. currentcolor reifies as CSSKeywordValue per css-typed-om-1 § 7.2 (line 4108)
    div.style.color = 'currentcolor';
    const currentVal = div.attributeStyleMap.get('color');
    assert.ok(currentVal instanceof CSSKeywordValue, 'currentcolor must be CSSKeywordValue');
    assert.strictEqual((currentVal as CSSKeywordValue).value, 'currentcolor');

    // 2. Named color 'red' must reify as a base CSSStyleValue (not CSSKeywordValue, not CSSColorValue)
    // per css-typed-om-1 § 7.2 line 4112: "Otherwise, reify as a CSSStyleValue"
    div.style.color = 'red';
    const redVal = div.attributeStyleMap.get('color');
    assert.ok(redVal !== null && redVal !== undefined, 'redVal must not be null');
    assert.strictEqual(redVal.constructor, CSSStyleValue, 'red must be base CSSStyleValue, not a subclass');
    assert.strictEqual(redVal instanceof CSSColorValue, false, 'red must not be a CSSColorValue');
    assert.strictEqual(redVal instanceof CSSKeywordValue, false, 'red must not be a CSSKeywordValue');

    // 3. Hex color '#bbff00' must reify as a base CSSStyleValue
    div.style.color = '#bbff00';
    const hexVal = div.attributeStyleMap.get('color');
    assert.strictEqual(hexVal?.constructor, CSSStyleValue, '#bbff00 must be base CSSStyleValue');
    assert.strictEqual(hexVal instanceof CSSColorValue, false, '#bbff00 must not be a CSSColorValue');

    // 4. Function color 'rgb(255, 255, 128)' must reify as a base CSSStyleValue
    div.style.color = 'rgb(255, 255, 128)';
    const rgbVal = div.attributeStyleMap.get('color');
    assert.strictEqual(rgbVal?.constructor, CSSStyleValue, 'rgb(...) must be base CSSStyleValue');
    assert.strictEqual(rgbVal instanceof CSSColorValue, false, 'rgb(...) must not be a CSSColorValue');

    // 5. 'transparent' must reify as a base CSSStyleValue
    div.style.color = 'transparent';
    const transparentVal = div.attributeStyleMap.get('color');
    assert.strictEqual(transparentVal?.constructor, CSSStyleValue, 'transparent must be base CSSStyleValue');
    assert.strictEqual(transparentVal instanceof CSSKeywordValue, false, 'transparent must not be a CSSKeywordValue');

    // 6. Round-trip setting base CSSStyleValue on attributeStyleMap
    div.attributeStyleMap.set('color', redVal);
    assert.strictEqual(div.style.color, 'red');

    // 7. Static CSSColorValue.parse must still return CSSColorValue / CSSRGB
    // per css-typed-om-1 § 6.1 (lines 3085-3098)
    const parsedColor = CSSColorValue.parse('rgb(1 2 3)');
    assert.ok(parsedColor instanceof CSSRGB, 'CSSColorValue.parse must still return CSSRGB');
  });
});
