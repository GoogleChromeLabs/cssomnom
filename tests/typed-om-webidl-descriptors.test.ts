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

// WebIDL § 3.6 #es-attributes
// WebIDL § 3.7 #es-operations
// WebIDL § 3.6.3 #interface-prototype-object

import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as TypedOM from '../src/typed-om.ts';

describe('WebIDL Interface Prototype Member Descriptors in Typed OM', () => {
  const classes = [
    TypedOM.CSSStyleValue,
    TypedOM.CSSNumericValue,
    TypedOM.CSSUnitValue,
    TypedOM.CSSNumericArray,
    TypedOM.CSSMathValue,
    TypedOM.CSSMathNegate,
    TypedOM.CSSMathInvert,
    TypedOM.CSSMathSum,
    TypedOM.CSSMathProduct,
    TypedOM.CSSMathMin,
    TypedOM.CSSMathMax,
    TypedOM.CSSMathClamp,
    TypedOM.CSSMathRound,
    TypedOM.CSSMathFunction,
    TypedOM.CSSKeywordValue,
    TypedOM.CSSImageValue,
    TypedOM.CSSVariableReferenceValue,
    TypedOM.CSSUnparsedValue,
    TypedOM.CSSColorValue,
    TypedOM.CSSRGB,
    TypedOM.CSSHSL,
    TypedOM.CSSHWB,
    TypedOM.CSSLab,
    TypedOM.CSSLCH,
    TypedOM.CSSOKLab,
    TypedOM.CSSOKLCH,
    TypedOM.CSSColor,
    TypedOM.CSSTransformComponent,
    TypedOM.CSSTranslate,
    TypedOM.CSSScale,
    TypedOM.CSSRotate,
    TypedOM.CSSSkew,
    TypedOM.CSSSkewX,
    TypedOM.CSSSkewY,
    TypedOM.CSSPerspective,
    TypedOM.CSSMatrixComponent,
    TypedOM.CSSTransformValue,
    TypedOM.CSSPositionValue,
    TypedOM.StylePropertyMapReadOnly,
    TypedOM.StylePropertyMap
  ];

  test('prototype member attributes and operations are enumerable across Typed OM classes', () => {
    // WebIDL § 3.6 #es-attributes & WebIDL § 3.7 #es-operations:
    // Regular attributes and operations on the interface prototype object must have [[Enumerable]]: true.
    for (const ctor of classes) {
      const proto = ctor.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || name.startsWith('_')) continue;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        assert.ok(desc, `Descriptor for ${ctor.name}.prototype.${name} must exist`);
        assert.strictEqual(
          desc.enumerable,
          true,
          `${ctor.name}.prototype.${name} should be enumerable per WebIDL`
        );
      }
    }
  });

  test('constructor and symbol-keyed properties retain spec-mandated attributes', () => {
    // WebIDL § 3.6.3 #interface-prototype-object:
    // The "constructor" property must have [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true.
    for (const ctor of classes) {
      const proto = ctor.prototype;
      const ctorDesc = Object.getOwnPropertyDescriptor(proto, 'constructor');
      assert.ok(ctorDesc, `${ctor.name}.prototype.constructor must exist`);
      assert.strictEqual(ctorDesc.enumerable, false, `${ctor.name}.prototype.constructor must not be enumerable`);
      assert.strictEqual(ctorDesc.writable, true, `${ctor.name}.prototype.constructor must be writable`);
      assert.strictEqual(ctorDesc.configurable, true, `${ctor.name}.prototype.constructor must be configurable`);

      // Symbol properties must remain non-enumerable
      for (const sym of Object.getOwnPropertySymbols(proto)) {
        const symDesc = Object.getOwnPropertyDescriptor(proto, sym);
        assert.ok(symDesc, `${ctor.name}.prototype[${String(sym)}] must exist`);
        assert.strictEqual(
          symDesc.enumerable,
          false,
          `${ctor.name}.prototype[${String(sym)}] must remain non-enumerable`
        );
      }
    }
  });

  test('concrete property descriptor checks for sample Typed OM classes', () => {
    // CSSKeywordValue: value (accessor), toString (method)
    const kwValueDesc = Object.getOwnPropertyDescriptor(TypedOM.CSSKeywordValue.prototype, 'value')!;
    assert.strictEqual(kwValueDesc.enumerable, true);
    assert.strictEqual(kwValueDesc.configurable, true);
    assert.strictEqual(typeof kwValueDesc.get, 'function');
    assert.strictEqual(typeof kwValueDesc.set, 'function');

    const kwToStringDesc = Object.getOwnPropertyDescriptor(TypedOM.CSSKeywordValue.prototype, 'toString')!;
    assert.strictEqual(kwToStringDesc.enumerable, true);
    assert.strictEqual(kwToStringDesc.writable, true);
    assert.strictEqual(kwToStringDesc.configurable, true);

    // CSSUnitValue: to, type, serialize
    const uvToDesc = Object.getOwnPropertyDescriptor(TypedOM.CSSUnitValue.prototype, 'to')!;
    assert.strictEqual(uvToDesc.enumerable, true);
    assert.strictEqual(uvToDesc.writable, true);
    assert.strictEqual(uvToDesc.configurable, true);

    // CSSRGB: r, g, b, alpha accessors
    for (const ch of ['r', 'g', 'b', 'alpha']) {
      const chDesc = Object.getOwnPropertyDescriptor(TypedOM.CSSRGB.prototype, ch)!;
      assert.strictEqual(chDesc.enumerable, true);
      assert.strictEqual(chDesc.configurable, true);
      assert.strictEqual(typeof chDesc.get, 'function');
      assert.strictEqual(typeof chDesc.set, 'function');
    }

    // StylePropertyMapReadOnly: size (getter), get, getAll, has, entries, keys, values, forEach
    const sizeDesc = Object.getOwnPropertyDescriptor(TypedOM.StylePropertyMapReadOnly.prototype, 'size')!;
    assert.strictEqual(sizeDesc.enumerable, true);
    assert.strictEqual(sizeDesc.configurable, true);
    assert.strictEqual(typeof sizeDesc.get, 'function');
    assert.strictEqual(sizeDesc.set, undefined);

    for (const meth of ['get', 'getAll', 'has', 'entries', 'keys', 'values', 'forEach']) {
      const methDesc = Object.getOwnPropertyDescriptor(TypedOM.StylePropertyMapReadOnly.prototype, meth)!;
      assert.strictEqual(methDesc.enumerable, true);
      assert.strictEqual(methDesc.writable, true);
      assert.strictEqual(methDesc.configurable, true);
    }
  });

  test('instance own property and serialization behavior is preserved', () => {
    const kw = new TypedOM.CSSKeywordValue('initial');
    assert.deepStrictEqual(Object.keys(kw), ['_cssText', '_associatedProperty', '_value']);
    assert.strictEqual(kw.value, 'initial');
    assert.strictEqual(kw.toString(), 'initial');

    const uv = new TypedOM.CSSUnitValue(42, 'px');
    assert.strictEqual(uv.value, 42);
    assert.strictEqual(uv.unit, 'px');
    assert.strictEqual(uv.toString(), '42px');

    const rgb = new TypedOM.CSSRGB(1, 0.5, 0.25);
    assert.strictEqual(rgb.toString(), 'rgb(100%, 50%, 25%)');
  });
});
