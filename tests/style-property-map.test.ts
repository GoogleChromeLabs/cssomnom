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
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';
import { StylePropertyMap, StylePropertyMapReadOnly, CSSTranslate, CSSScale, CSSRotate, CSSTransformValue, CSS, CSSStyleValue, CSSUnparsedValue, CSSVariableReferenceValue, CSSUnitValue } from '../src/typed-om.ts';
import { tokenize } from '../src/tokenizer.ts';

describe('StylePropertyMap', () => {
  test('set() and get()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('margin-top', CSS.px(10));
    assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
    
    const val = map.get('margin-top');
    assert.strictEqual(val?.toString(), '10px');
  });

  test('append()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('background-image', 'url("a.png")');
    map.append('background-image', 'url("b.png")');
    assert.strictEqual(style.getPropertyValue('background-image'), 'url("a.png"), url("b.png")');
  });

  test('delete() and has()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('color', 'red');
    assert.strictEqual(map.has('color'), true);
    
    map.delete('color');
    assert.strictEqual(map.has('color'), false);
    assert.strictEqual(style.getPropertyValue('color'), '');
  });

  test('reification of transform, translate, rotate, scale properties', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    // 1. transform property
    map.set('transform', 'rotate(45deg) scale(2)');
    const transformVal = map.get('transform');
    assert.ok(transformVal instanceof CSSTransformValue, `Expected CSSTransformValue, got ${transformVal?.constructor.name}`);
    assert.strictEqual(transformVal.toString(), 'rotate(45deg) scale(2)');

    // 2. translate property
    map.set('translate', '10px 20px');
    const translateVal = map.get('translate');
    assert.ok(translateVal instanceof CSSTranslate, `Expected CSSTranslate, got ${translateVal?.constructor.name}`);
    assert.strictEqual(translateVal.toString(), 'translate(10px, 20px)');

    // 3. rotate property
    map.set('rotate', '45deg');
    const rotateVal = map.get('rotate');
    assert.ok(rotateVal instanceof CSSRotate, `Expected CSSRotate, got ${rotateVal?.constructor.name}`);
    assert.strictEqual(rotateVal.toString(), 'rotate(45deg)');

    // 4. scale property
    map.set('scale', '2 3');
    const scaleVal = map.get('scale');
    assert.ok(scaleVal instanceof CSSScale, `Expected CSSScale, got ${scaleVal?.constructor.name}`);
    assert.strictEqual(scaleVal.toString(), 'scale(2, 3)');
  });

  test('getAll() for list properties parses using parseAll()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    map.set('transition', 'margin-top 1s, color 2s');
    const results = map.getAll('transition');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].toString(), 'margin-top 1s');
    assert.strictEqual(results[1].toString(), 'color 2s');
  });

  test('clear()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('color', 'red');
    map.set('margin', '10px');
    assert.strictEqual(style.length, 5); // color + 4 margins
    
    map.clear();
    assert.strictEqual(style.length, 0);
  });

  test('_associatedProperty slot implementation', () => {
    // 1. Initialized to null in constructors
    const val = CSS.px(10);
    assert.strictEqual((val as unknown as { _associatedProperty: unknown })._associatedProperty, null);

    // 2. CSSStyleValue.parse() / parseAll() set it on returned instances
    const parsedVal = CSSStyleValue.parse('margin-top', '15px');
    assert.strictEqual((parsedVal as unknown as { _associatedProperty: unknown })._associatedProperty, 'margin-top');

    const parsedAllVals = CSSStyleValue.parseAll('margin-top', '15px');
    assert.strictEqual((parsedAllVals[0] as unknown as { _associatedProperty: unknown })._associatedProperty, 'margin-top');

    // 3. During declaration reification in property maps (get(), getAll()), set _associatedProperty
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    map.set('margin-bottom', '20px');

    const reifiedGet = map.get('margin-bottom');
    assert.ok(reifiedGet);
    assert.strictEqual((reifiedGet as unknown as { _associatedProperty: unknown })._associatedProperty, 'margin-bottom');

    const reifiedGetAll = map.getAll('margin-bottom');
    assert.strictEqual(reifiedGetAll.length, 1);
    assert.strictEqual((reifiedGetAll[0] as unknown as { _associatedProperty: unknown })._associatedProperty, 'margin-bottom');
  });

  test('iterable & size implementation', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    assert.strictEqual(map.size, 0);

    map.set('color', 'red');
    map.set('margin-top', '10px');
    map.set('margin-bottom', '15px');

    assert.strictEqual(map.size, 3);

    // 1. keys() iterator
    const keys = Array.from(map.keys());
    assert.deepStrictEqual(keys, ['color', 'margin-top', 'margin-bottom']);

    // 2. values() iterator
    const values = Array.from(map.values());
    assert.strictEqual(values.length, 3);
    assert.strictEqual(values[0][0].toString(), 'red');
    assert.strictEqual(values[1][0].toString(), '10px');
    assert.strictEqual(values[2][0].toString(), '15px');

    // 3. entries() iterator
    const entries = Array.from(map.entries());
    assert.strictEqual(entries.length, 3);
    assert.deepStrictEqual(entries[0][0], 'color');
    assert.strictEqual(entries[0][1][0].toString(), 'red');

    // 4. Symbol.iterator
    const iterableEntries = Array.from(map);
    assert.strictEqual(iterableEntries.length, 3);
    assert.deepStrictEqual(iterableEntries[0][0], 'color');
    assert.strictEqual(iterableEntries[0][1][0].toString(), 'red');

    // 5. forEach()
    const iterated: [string, string][] = [];
    map.forEach((vals, key) => {
      iterated.push([key, vals.map(v => v.toString()).join(', ')]);
    });
    assert.deepStrictEqual(iterated, [
      ['color', 'red'],
      ['margin-top', '10px'],
      ['margin-bottom', '15px']
    ]);
  });

  test('associatedProperty checks in write methods (set, append)', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    const mtVal = CSSStyleValue.parse('margin-top', '10px');
    const mbVal = CSSStyleValue.parse('margin-bottom', '15px');

    // Should succeed (correct associated property)
    map.set('margin-top', mtVal);
    assert.strictEqual(style.getPropertyValue('margin-top'), '10px');

    // Should throw TypeError (mismatched associated property)
    assert.throws(() => {
      map.set('margin-top', mbVal);
    }, TypeError);

    assert.throws(() => {
      map.append('margin-top', mbVal);
    }, TypeError);

    // Should succeed with null associated property
    const cleanVal = CSS.px(20);
    map.set('margin-top', cleanVal);
    assert.strictEqual(style.getPropertyValue('margin-top'), '20px');
  });

  test('property name validation in parse/parseAll', () => {
    // Should succeed for supported properties and custom properties
    assert.ok(CSSStyleValue.parse('margin-top', '10px'));
    assert.ok(CSSStyleValue.parse('--my-custom-prop', '20px'));
    assert.ok(CSSStyleValue.parseAll('margin-top', '10px'));
    assert.ok(CSSStyleValue.parseAll('--my-custom-prop', '20px'));

    // Should throw TypeError for unsupported properties
    assert.throws(() => {
      CSSStyleValue.parse('invalid-property-name', '10px');
    }, TypeError);

    assert.throws(() => {
      CSSStyleValue.parseAll('invalid-property-name', '10px');
    }, TypeError);
  });

  test('reject unparsed/variables in append', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    const unparsed = new CSSUnparsedValue(['url("a.png")']);
    const variable = new CSSVariableReferenceValue('--foo');

    // append should throw for both
    assert.throws(() => {
      map.append('background-image', unparsed);
    }, TypeError);

    assert.throws(() => {
      map.append('background-image', variable as unknown as CSSStyleValue);
    }, TypeError);

    // set should NOT throw for CSSUnparsedValue
    map.set('background-image', unparsed);
    assert.strictEqual(style.getPropertyValue('background-image'), 'url("a.png")');
  });

  test('unrepresentable values fallback to CSSStyleValue', () => {
    // 1. StylePropertyMapReadOnly
    const decls = [{
      type: 'declaration' as const,
      name: 'width',
      value: tokenize('calc(20px + 30s)'),
      important: false
    }];
    // We import StylePropertyMapReadOnly at the top
    const readOnlyMap = new StylePropertyMapReadOnly(decls);
    const val = readOnlyMap.get('width');
    assert.ok(val);
    assert.strictEqual(val.constructor, CSSStyleValue);
    assert.strictEqual(val.toString(), 'calc(20px + 30s)');

    // 2. StylePropertyMap
    const style = new CSSStyleDeclaration([]);
    // We bypass validation of style.setProperty by setting it directly on declarations or via setProperty
    style.setProperty('width', 'calc(20px + 30s)');
    const map = new StylePropertyMap(style);
    const val2 = map.get('width');
    assert.ok(val2);
    assert.strictEqual(val2.constructor, CSSStyleValue);
    assert.strictEqual(val2.toString(), 'calc(20px + 30s)');
  });

  test('get() returns undefined instead of null when missing', () => {
    const readOnlyMap = new StylePropertyMapReadOnly([]);
    assert.strictEqual(readOnlyMap.get('color'), undefined);

    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    assert.strictEqual(map.get('color'), undefined);
  });

  test('unitless 0 length reification', () => {
    // 1. Standard property expecting length/percentage (e.g. margin-top)
    const valMargin = CSSStyleValue.parse('margin-top', '0');
    assert.ok(valMargin instanceof CSSUnitValue);
    assert.strictEqual(valMargin.value, 0);
    assert.strictEqual(valMargin.unit, 'px');

    // 2. Standard property expecting non-length/dimension (e.g. z-index)
    const valZIndex = CSSStyleValue.parse('z-index', '0');
    assert.ok(valZIndex instanceof CSSUnitValue);
    assert.strictEqual(valZIndex.value, 0);
    assert.strictEqual(valZIndex.unit, 'number');

    // 3. Registered custom property expecting length
    CSS.registerProperty({
      name: '--my-len',
      syntax: '<length>',
      inherits: false,
      initialValue: '0px'
    });

    const valCustom = CSSStyleValue.parse('--my-len', '0');
    assert.ok(valCustom instanceof CSSUnitValue);
    assert.strictEqual(valCustom.value, 0);
    assert.strictEqual(valCustom.unit, 'px');
  });
});


