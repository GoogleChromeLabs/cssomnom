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

// css-typed-om § 2.3 #declared-stylepropertymap-objects
// css-typed-om § 2.2 #computed-stylepropertymapreadonly-objects
// cssom-1 § 6.8 #the-elementcssinlinestyle-mixin
// WebIDL § 3.6 #es-attributes
// WebIDL § 3.7 #es-operations
// WebIDL § 3.6.3 #interface-prototype-object

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';
import { CSSStyleRule } from '../src/CSSOM.ts';
import { parse } from '../src/index.ts';

describe('WebIDL Typed OM Entry Points Conformance', () => {
  describe('3a. CSSStyleRule.prototype.styleMap interface attribute', () => {
    test('styleMap is defined on CSSStyleRule.prototype, not as an own instance property', () => {
      const sheet = parse('p { color: red; }');
      const rule = sheet.cssRules[0] as CSSStyleRule;

      // Must NOT be an own property of the instance
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(rule, 'styleMap'),
        false,
        'styleMap must not be an own property of CSSStyleRule instance'
      );

      // Must be an own property on the prototype
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(CSSStyleRule.prototype, 'styleMap'),
        true,
        'styleMap must be an own property of CSSStyleRule.prototype'
      );
    });

    test('CSSStyleRule.prototype.styleMap descriptor satisfies WebIDL attribute requirements', () => {
      const desc = Object.getOwnPropertyDescriptor(CSSStyleRule.prototype, 'styleMap');
      assert.ok(desc, 'Descriptor for CSSStyleRule.prototype.styleMap must exist');
      const getter = desc.get;
      assert.ok(getter, 'styleMap must have a getter function');
      assert.strictEqual(typeof getter, 'function', 'styleMap must have a getter function');
      assert.strictEqual(desc.set, undefined, 'styleMap must be readonly (no setter)');
      assert.strictEqual(desc.enumerable, true, 'styleMap must be enumerable per WebIDL');
      assert.strictEqual(desc.configurable, true, 'styleMap must be configurable per WebIDL');
      assert.strictEqual(getter.name, 'get styleMap', 'getter name must be "get styleMap"');
      assert.strictEqual(getter.length, 0, 'getter length must be 0');

      // Calling getter on non-instance must throw TypeError
      assert.throws(() => {
        getter.call({});
      }, TypeError);
    });

    test('CSSStyleRule.prototype.styleMap preserves [SameObject] identity and functionality', () => {
      const sheet = parse('div { font-size: 16px; }');
      const rule = sheet.cssRules[0] as CSSStyleRule;

      const map1 = rule.styleMap;
      const map2 = rule.styleMap;
      assert.ok(map1, 'styleMap must return a StylePropertyMap');
      assert.strictEqual(map1, map2, 'styleMap must return the identical object ([SameObject])');
      assert.strictEqual(map1.get('font-size')?.toString(), '16px');
    });
  });

  describe('3b. Element.prototype.computedStyleMap operation descriptor', () => {
    test('computedStyleMap operation satisfies WebIDL regular operation requirements', () => {
      const dom = parseHTML('<!DOCTYPE html><html><body><div id="target"></div></body></html>');
      patchWindowForTypedOM(dom.window);

      const proto = dom.window.Element.prototype;
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(proto, 'computedStyleMap'),
        true,
        'computedStyleMap must exist on Element.prototype'
      );

      const desc = Object.getOwnPropertyDescriptor(proto, 'computedStyleMap');
      assert.ok(desc, 'Descriptor for Element.prototype.computedStyleMap must exist');
      assert.strictEqual(typeof desc.value, 'function', 'computedStyleMap must be a function value');
      assert.strictEqual(desc.writable, true, 'computedStyleMap must be writable per WebIDL');
      assert.strictEqual(desc.enumerable, true, 'computedStyleMap must be enumerable per WebIDL');
      assert.strictEqual(desc.configurable, true, 'computedStyleMap must be configurable per WebIDL');
      assert.strictEqual(desc.value.name, 'computedStyleMap', 'operation name must be "computedStyleMap"');
      assert.strictEqual(desc.value.length, 0, 'operation length must be 0');

      // Brand checks: calling on non-Element must throw TypeError
      assert.throws(() => {
        desc.value.call({});
      }, TypeError);

      assert.throws(() => {
        desc.value.call(null);
      }, TypeError);
    });
  });

  describe('3c. attributeStyleMap on HTMLElement and SVGElement prototypes', () => {
    test('attributeStyleMap is defined on HTMLElement.prototype and SVGElement.prototype, not Element.prototype', () => {
      const dom = parseHTML('<!DOCTYPE html><html><body><div id="target"></div><svg id="svg"></svg></body></html>');
      patchWindowForTypedOM(dom.window);

      // Element.prototype must NOT have attributeStyleMap
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(dom.window.Element.prototype, 'attributeStyleMap'),
        false,
        'attributeStyleMap must NOT be on Element.prototype'
      );

      // HTMLElement.prototype must have attributeStyleMap
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(dom.window.HTMLElement.prototype, 'attributeStyleMap'),
        true,
        'attributeStyleMap must be on HTMLElement.prototype'
      );

      // SVGElement.prototype must have attributeStyleMap
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(dom.window.SVGElement.prototype, 'attributeStyleMap'),
        true,
        'attributeStyleMap must be on SVGElement.prototype'
      );

      // SVGElement.prototype.constructor must point to SVGElement
      assert.strictEqual(
        dom.window.SVGElement.prototype.constructor,
        dom.window.SVGElement,
        'SVGElement.prototype.constructor must be SVGElement per WebIDL'
      );
    });

    test('HTMLElement and SVGElement attributeStyleMap descriptors satisfy WebIDL requirements', () => {
      const dom = parseHTML('<!DOCTYPE html><html><body><div id="target"></div><svg id="svg"></svg></body></html>');
      patchWindowForTypedOM(dom.window);

      for (const [name, ctor] of [
        ['HTMLElement', dom.window.HTMLElement],
        ['SVGElement', dom.window.SVGElement]
      ] as const) {
        const proto = ctor.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'attributeStyleMap');
        assert.ok(desc, `Descriptor for ${name}.prototype.attributeStyleMap must exist`);
        const getter = desc.get;
        assert.ok(getter, `${name}.prototype.attributeStyleMap must have getter`);
        assert.strictEqual(typeof getter, 'function', `${name}.prototype.attributeStyleMap must have getter`);
        assert.strictEqual(desc.set, undefined, `${name}.prototype.attributeStyleMap must not have setter`);
        assert.strictEqual(desc.enumerable, true, `${name}.prototype.attributeStyleMap must be enumerable`);
        assert.strictEqual(desc.configurable, true, `${name}.prototype.attributeStyleMap must be configurable`);
        assert.strictEqual(getter.name, 'get attributeStyleMap', 'getter name must be "get attributeStyleMap"');
        assert.strictEqual(getter.length, 0, 'getter length must be 0');

        // Brand checks: calling getter on prototype or wrong this must throw TypeError
        assert.throws(() => {
          getter.call({});
        }, TypeError);

        assert.throws(() => {
          getter.call(proto);
        }, TypeError);
      }
    });

    test('attributeStyleMap returns live StylePropertyMap with [SameObject] semantics', () => {
      const dom = parseHTML('<!DOCTYPE html><html><body><div id="target" style="color: blue;"></div><svg id="svg" style="fill: green;"></svg></body></html>');
      patchWindowForTypedOM(dom.window);

      const div = dom.document.getElementById('target') as unknown as { attributeStyleMap: { get(p: string): unknown } };
      const svg = dom.document.getElementById('svg') as unknown as { attributeStyleMap: { get(p: string): unknown } };

      assert.strictEqual(div.attributeStyleMap, div.attributeStyleMap, 'HTMLElement attributeStyleMap is [SameObject]');
      assert.strictEqual(svg.attributeStyleMap, svg.attributeStyleMap, 'SVGElement attributeStyleMap is [SameObject]');

      assert.strictEqual(div.attributeStyleMap.get('color')?.toString(), 'blue');
      assert.strictEqual(svg.attributeStyleMap.get('fill')?.toString(), 'green');
    });
  });
});
