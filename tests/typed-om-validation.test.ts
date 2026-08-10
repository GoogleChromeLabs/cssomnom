/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert';
import { StylePropertyMap, StylePropertyMapReadOnly, CSSStyleValue } from '../src/typed-om.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';

test('StylePropertyMap and StylePropertyMapReadOnly reject unsupported property names', () => {
  const decl = new CSSStyleDeclaration();
  const map = new StylePropertyMap(decl);
  const readOnlyMap = new StylePropertyMapReadOnly([]);

  // Unsupported properties throw TypeError
  assert.throws(() => map.get('invalid-property'), TypeError);
  assert.throws(() => readOnlyMap.get('invalid-property'), TypeError);
  
  assert.throws(() => map.getAll('invalid-property'), TypeError);
  assert.throws(() => readOnlyMap.getAll('invalid-property'), TypeError);

  assert.throws(() => map.has('invalid-property'), TypeError);
  assert.throws(() => readOnlyMap.has('invalid-property'), TypeError);

  assert.throws(() => map.set('invalid-property', '10px'), TypeError);
  assert.throws(() => map.append('invalid-property', '10px'), TypeError);
  assert.throws(() => map.delete('invalid-property'), TypeError);

  // Custom properties starting with -- are valid and do not throw
  assert.doesNotThrow(() => map.get('--custom-prop'));
  assert.doesNotThrow(() => readOnlyMap.get('--custom-prop'));
  assert.doesNotThrow(() => map.set('--custom-prop', '10px'));
});

test('CSSStyleValue.parse validates shorthand values', () => {
  // Valid shorthand values should parse successfully
  assert.ok(CSSStyleValue.parse('margin', '10px'));
  assert.ok(CSSStyleValue.parse('margin', '10px 20px'));
  assert.ok(CSSStyleValue.parse('margin', '10px 20px 30px 40px'));
  
  // Invalid shorthand values should throw TypeError
  assert.throws(() => CSSStyleValue.parse('margin', '10px 20px 30px 40px 50px'), TypeError);
  assert.throws(() => CSSStyleValue.parse('padding', '10px 20px 30px 40px 50px'), TypeError);
  assert.throws(() => CSSStyleValue.parse('border', '1px solid red blue'), TypeError);
});
