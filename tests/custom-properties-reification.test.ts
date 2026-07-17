/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';
import { StylePropertyMap, StylePropertyMapReadOnly, CSSUnparsedValue } from '../src/index.ts';

describe('Custom Properties Reification', () => {
  test('StylePropertyMapReadOnly.get() and getAll() for custom properties', () => {
    // We instantiate StylePropertyMapReadOnly directly using Declaration array
    const declarations = [
      { type: 'declaration' as const, name: '--unregistered-custom', value: [{ type: 'ident' as const, value: 'blue' }], important: false },
      { type: 'declaration' as const, name: '--registered-custom', value: [{ type: 'dimension' as const, value: 10, unit: 'px', numberType: 'integer' as const, sign: null }], important: false },
      { type: 'declaration' as const, name: 'color', value: [{ type: 'ident' as const, value: 'red' }], important: false }
    ];
    
    const map = new StylePropertyMapReadOnly(declarations);

    // 1. Unregistered custom property reifies to CSSUnparsedValue
    const valUnregistered = map.get('--unregistered-custom');
    assert.ok(valUnregistered instanceof CSSUnparsedValue);
    assert.strictEqual(valUnregistered.toString(), 'blue');
    assert.strictEqual(valUnregistered[0], 'blue');

    // 2. Registered custom property also reifies to CSSUnparsedValue when queried as specified value
    const valRegistered = map.get('--registered-custom');
    assert.ok(valRegistered instanceof CSSUnparsedValue);
    assert.strictEqual(valRegistered.toString(), '10px');
    assert.strictEqual(valRegistered[0], '10px');

    // 3. Normal property does NOT reify to CSSUnparsedValue
    const valNormal = map.get('color');
    assert.ok(!(valNormal instanceof CSSUnparsedValue));

    // 4. getAll() returns a list with a single CSSUnparsedValue representing the whole value
    const allUnregistered = map.getAll('--unregistered-custom');
    assert.strictEqual(allUnregistered.length, 1);
    assert.ok(allUnregistered[0] instanceof CSSUnparsedValue);
    assert.strictEqual(allUnregistered[0].toString(), 'blue');

    const allRegistered = map.getAll('--registered-custom');
    assert.strictEqual(allRegistered.length, 1);
    assert.ok(allRegistered[0] instanceof CSSUnparsedValue);
    assert.strictEqual(allRegistered[0].toString(), '10px');
  });

  test('StylePropertyMap.get() and getAll() for custom properties', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);

    // Set custom properties
    map.set('--my-color', 'red');
    map.set('--my-width', '20px');

    // 1. get() returns CSSUnparsedValue
    const valColor = map.get('--my-color');
    assert.ok(valColor instanceof CSSUnparsedValue);
    assert.strictEqual(valColor.toString(), 'red');
    assert.strictEqual(valColor[0], 'red');

    const valWidth = map.get('--my-width');
    assert.ok(valWidth instanceof CSSUnparsedValue);
    assert.strictEqual(valWidth.toString(), '20px');
    assert.strictEqual(valWidth[0], '20px');

    // 2. getAll() returns list containing single CSSUnparsedValue
    const allColor = map.getAll('--my-color');
    assert.strictEqual(allColor.length, 1);
    assert.ok(allColor[0] instanceof CSSUnparsedValue);
    assert.strictEqual(allColor[0].toString(), 'red');

    const allWidth = map.getAll('--my-width');
    assert.strictEqual(allWidth.length, 1);
    assert.ok(allWidth[0] instanceof CSSUnparsedValue);
    assert.strictEqual(allWidth[0].toString(), '20px');
  });
});
