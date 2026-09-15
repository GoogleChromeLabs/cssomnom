/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert';
import { StylePropertyMap, StylePropertyMapReadOnly, CSSStyleValue } from '../src/typed-om.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { getDummyStyle } from '../src/typed-om/style-map/style-validation.ts';

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

test('getDummyStyle() dynamically resolves document and does not cache inert stub across realms', () => {
  // In pure Node (without document), getDummyStyle() returns a functional CSSStyleDeclaration probe
  const probe1 = getDummyStyle();
  assert.ok(probe1);
  probe1.setProperty('width', '20px');
  assert.strictEqual(probe1.getPropertyValue('width'), '20px');

  // When globalThis.document is introduced/swapped, getDummyStyle() dynamically tracks it
  const origDoc = globalThis.document;
  try {
    let createCount = 0;
    const fakeDoc1 = {
      createElement(_tag: string) {
        createCount++;
        return { style: { cssText: '', getPropertyValue: () => 'from-doc1', setProperty() {} } };
      }
    };
    (globalThis as unknown as { document: unknown }).document = fakeDoc1;
    const probeDoc1 = getDummyStyle();
    assert.strictEqual(probeDoc1.getPropertyValue('color'), 'from-doc1');
    assert.strictEqual(createCount, 1);

    // Same doc reuses cached style
    getDummyStyle();
    assert.strictEqual(createCount, 1);

    // Swapping document to another realm creates a fresh style probe
    const fakeDoc2 = {
      createElement(_tag: string) {
        return { style: { cssText: '', getPropertyValue: () => 'from-doc2', setProperty() {} } };
      }
    };
    (globalThis as unknown as { document: unknown }).document = fakeDoc2;
    const probeDoc2 = getDummyStyle();
    assert.strictEqual(probeDoc2.getPropertyValue('color'), 'from-doc2');
  } finally {
    (globalThis as unknown as { document: unknown }).document = origDoc;
  }
});

