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
  CSSStyleValue,
  CSSKeywordValue,
  CSSUnitValue,
  CSSUnparsedValue,
  CSSVariableReferenceValue,
  StylePropertyMap,
  CSSStyleDeclaration
} from '../src/index.ts';
import { STANDARD_PROPERTIES_SYNTAX } from '../src/standard-syntax.ts';
import { GENERATED_PROPERTIES_SYNTAX } from '../src/data/gen/standard-syntax.ts';

describe('Typed OM Standard Property Syntax & Validation (Phase 85)', () => {
  it('GENERATED_PROPERTIES_SYNTAX contains over 800 standard CSS properties', () => {
    const keys = Object.keys(GENERATED_PROPERTIES_SYNTAX);
    assert.ok(keys.length >= 800, `Expected at least 800 properties, found ${keys.length}`);
    assert.ok(STANDARD_PROPERTIES_SYNTAX['accent-color'], 'accent-color should exist in STANDARD_PROPERTIES_SYNTAX');
    assert.ok(STANDARD_PROPERTIES_SYNTAX['animation-duration'], 'animation-duration should exist in STANDARD_PROPERTIES_SYNTAX');
    assert.ok(STANDARD_PROPERTIES_SYNTAX['opacity'], 'opacity should exist in STANDARD_PROPERTIES_SYNTAX');
    assert.ok(STANDARD_PROPERTIES_SYNTAX['z-index'], 'z-index should exist in STANDARD_PROPERTIES_SYNTAX');
    assert.ok(STANDARD_PROPERTIES_SYNTAX['width'], 'width should exist in STANDARD_PROPERTIES_SYNTAX');
  });

  describe('CSSStyleValue.parse() & parseAll() syntax validation', () => {
    // css-typed-om § 2.2 #dom-cssstylevalue-parse
    it('parses valid syntax for standard properties', () => {
      const autoVal = CSSStyleValue.parse('accent-color', 'auto');
      assert.ok(autoVal instanceof CSSKeywordValue);
      assert.equal((autoVal as CSSKeywordValue).value, 'auto');

      const colorVal = CSSStyleValue.parse('accent-color', 'red');
      assert.ok(colorVal instanceof CSSKeywordValue);
      assert.equal((colorVal as CSSKeywordValue).value, 'red');

      const durVal = CSSStyleValue.parse('animation-duration', '5s');
      assert.ok(durVal instanceof CSSUnitValue);
      assert.equal((durVal as CSSUnitValue).value, 5);
      assert.equal((durVal as CSSUnitValue).unit, 's');

      const widthVal = CSSStyleValue.parse('width', '50%');
      assert.ok(widthVal instanceof CSSUnitValue);
      assert.equal((widthVal as CSSUnitValue).value, 50);
      assert.equal((widthVal as CSSUnitValue).unit, 'percent');

      const opVal = CSSStyleValue.parse('opacity', '0.75');
      assert.ok(opVal instanceof CSSUnitValue);
      assert.equal((opVal as CSSUnitValue).value, 0.75);
      assert.equal((opVal as CSSUnitValue).unit, 'number');
    });

    it('rejects invalid syntax for standard properties by throwing TypeError', () => {
      // Color property rejecting length/percentage
      assert.throws(() => CSSStyleValue.parse('accent-color', '100px'), TypeError);
      assert.throws(() => CSSStyleValue.parse('accent-color', '50%'), TypeError);

      // Time property rejecting length
      assert.throws(() => CSSStyleValue.parse('animation-duration', '100px'), TypeError);

      // Length property rejecting color
      assert.throws(() => CSSStyleValue.parse('width', 'red'), TypeError);

      // Opacity property rejecting length
      assert.throws(() => CSSStyleValue.parse('opacity', '100px'), TypeError);

      // Angle property rejecting length
      assert.throws(() => CSSStyleValue.parse('rotate', '100px'), TypeError);
    });

    it('parses list-valued property strings in parseAll()', () => {
      const values = CSSStyleValue.parseAll('transition-duration', '1s, 2s');
      assert.equal(values.length, 2);
      assert.equal((values[0] as CSSUnitValue).value, 1);
      assert.equal((values[1] as CSSUnitValue).value, 2);
    });
  });

  describe('StylePropertyMap.set() value validation', () => {
    // css-typed-om § 3.2 #the-stylepropertymap
    function createMap() {
      const decl = new CSSStyleDeclaration();
      return new StylePropertyMap(decl);
    }

    it('allows valid CSSStyleValue assignments matching property syntax', () => {
      const map = createMap();

      // Keyword on color property
      map.set('accent-color', new CSSKeywordValue('auto'));
      assert.equal(map.get('accent-color')?.toString(), 'auto');

      map.set('accent-color', new CSSKeywordValue('currentcolor'));
      assert.equal(map.get('accent-color')?.toString(), 'currentcolor');

      // Time on animation-delay
      map.set('animation-delay', new CSSUnitValue(3, 's'));
      assert.equal(map.get('animation-delay')?.toString(), '3s');

      // Length/Percent on width
      map.set('width', new CSSUnitValue(100, 'px'));
      assert.equal(map.get('width')?.toString(), '100px');

      map.set('width', new CSSUnitValue(50, 'percent'));
      assert.equal(map.get('width')?.toString(), '50%');

      // Number on opacity
      map.set('opacity', new CSSUnitValue(0.5, 'number'));
      assert.equal(map.get('opacity')?.toString(), '0.5');

      // CSS-wide keywords on any property
      map.set('accent-color', new CSSKeywordValue('initial'));
      assert.equal(map.get('accent-color')?.toString(), 'initial');

      map.set('width', new CSSKeywordValue('inherit'));
      assert.equal(map.get('width')?.toString(), 'inherit');

      // CSSUnparsedValue with var() on any property
      const unparsed = new CSSUnparsedValue([' ', new CSSVariableReferenceValue('--my-color')]);
      map.set('accent-color', unparsed);
      assert.ok(map.get('accent-color') instanceof CSSUnparsedValue);
    });

    it('rejects incompatible CSSStyleValue assignments by throwing TypeError', () => {
      const map = createMap();

      // Setting percent on accent-color (syntax: auto | <color>)
      assert.throws(() => {
        map.set('accent-color', new CSSUnitValue(-3.14, 'percent'));
      }, TypeError);

      // Setting deg on accent-color
      assert.throws(() => {
        map.set('accent-color', new CSSUnitValue(0, 'deg'));
      }, TypeError);

      // Setting px on animation-delay (syntax: <time>)
      assert.throws(() => {
        map.set('animation-delay', new CSSUnitValue(0, 'px'));
      }, TypeError);

      // Setting percent on animation-delay
      assert.throws(() => {
        map.set('animation-delay', new CSSUnitValue(0, 'percent'));
      }, TypeError);

      // Setting deg on width (syntax: <length-percentage> | ...)
      assert.throws(() => {
        map.set('width', new CSSUnitValue(0, 'deg'));
      }, TypeError);

      // Setting seconds on width
      assert.throws(() => {
        map.set('width', new CSSUnitValue(1, 's'));
      }, TypeError);

      // Setting deg on opacity (syntax: <number> | <percentage>)
      assert.throws(() => {
        map.set('opacity', new CSSUnitValue(0, 'deg'));
      }, TypeError);

      // Setting px on opacity
      assert.throws(() => {
        map.set('opacity', new CSSUnitValue(10, 'px'));
      }, TypeError);

      // Setting px on z-index (syntax: auto | <integer>)
      assert.throws(() => {
        map.set('z-index', new CSSUnitValue(10, 'px'));
      }, TypeError);

      // Setting percent on z-index
      assert.throws(() => {
        map.set('z-index', new CSSUnitValue(10, 'percent'));
      }, TypeError);
    });

    it('rejects CSSStyleValue associated with a different property', () => {
      const map = createMap();
      const val = CSSStyleValue.parse('width', '100px');
      assert.equal(val._associatedProperty, 'width');

      // Attempting to assign a width-associated value to height throws TypeError
      assert.throws(() => {
        map.set('height', val);
      }, TypeError);

      // Assigning to width succeeds
      map.set('width', val);
      assert.equal(map.get('width')?.toString(), '100px');
    });
  });

  describe('StylePropertyMap.append() value validation', () => {
    // css-typed-om § 3.2 #the-stylepropertymap
    function createMap() {
      const decl = new CSSStyleDeclaration();
      return new StylePropertyMap(decl);
    }

    it('appends valid values for list-valued properties', () => {
      const decl = new CSSStyleDeclaration();
      const map = new StylePropertyMap(decl);
      map.append('transition-duration', new CSSUnitValue(1, 's'));
      map.append('transition-duration', new CSSUnitValue(2, 's'));
      assert.equal(decl.getPropertyValue('transition-duration'), '1s, 2s');
      assert.equal(map.get('transition-duration')?.toString(), '1s');
      const all = map.getAll('transition-duration');
      assert.equal(all.length, 2);
      assert.equal(all[0].toString(), '1s');
      assert.equal(all[1].toString(), '2s');
    });

    it('rejects append on single-valued properties', () => {
      const map = createMap();
      assert.throws(() => {
        map.append('width', new CSSUnitValue(100, 'px'));
      }, TypeError);
    });

    it('rejects invalid value types on list-valued properties', () => {
      const map = createMap();
      assert.throws(() => {
        map.append('transition-duration', new CSSUnitValue(100, 'px'));
      }, TypeError);
    });
  });
});
