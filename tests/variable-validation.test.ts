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
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './wpt-shim.ts';
import { CSSVariableReferenceValue, CSSUnparsedValue, CSSStyleValue, StylePropertyMap } from '../src/typed-om.ts';

describe('CSSVariableReferenceValue validation', () => {
  test('constructor throws TypeError on invalid variable name', () => {
    // Variable name must start with '--' and not be empty (or just '--' itself or empty)
    assert.throws(() => {
      new CSSVariableReferenceValue('');
    }, TypeError);

    assert.throws(() => {
      new CSSVariableReferenceValue('--');
    }, TypeError);

    assert.throws(() => {
      new CSSVariableReferenceValue('not-a-var');
    }, TypeError);

    // Valid should not throw
    const ref = new CSSVariableReferenceValue('--foo');
    assert.strictEqual(ref.variable, '--foo');
  });

  test('setter throws TypeError on invalid variable name', () => {
    const ref = new CSSVariableReferenceValue('--foo');
    assert.throws(() => {
      ref.variable = '';
    }, TypeError);

    assert.throws(() => {
      ref.variable = '--';
    }, TypeError);

    assert.throws(() => {
      ref.variable = 'invalid';
    }, TypeError);

    ref.variable = '--bar';
    assert.strictEqual(ref.variable, '--bar');
  });

  test('constructor throws TypeError if fallback is not CSSUnparsedValue or null', () => {
    assert.throws(() => {
      // @ts-expect-error fallback type check
      new CSSVariableReferenceValue('--foo', 'not-unparsed-value');
    }, TypeError);

    // Valid fallbacks
    const fallback = new CSSUnparsedValue(['blue']);
    const ref1 = new CSSVariableReferenceValue('--foo', fallback);
    assert.strictEqual(ref1.fallback, fallback);

    const ref2 = new CSSVariableReferenceValue('--foo', null);
    assert.strictEqual(ref2.fallback, null);
  });
});

describe('var() Reference Normalization', () => {
  test('CSSStyleValue.parseAll/parse with var() returns CSSUnparsedValue with nested CSSVariableReferenceValue', () => {
    const val = CSSStyleValue.parse('color', 'var(--my-color)');
    assert.ok(val instanceof CSSUnparsedValue);
    assert.strictEqual(val.length, 1);
    const item = val.item(0);
    assert.ok(item instanceof CSSVariableReferenceValue);
    assert.strictEqual(item.variable, '--my-color');
    assert.strictEqual(item.fallback, null);
  });

  test('CSSStyleValue.parse with nested functions and var()', () => {
    const val = CSSStyleValue.parse('width', 'calc(var(--size) + 10px)');
    assert.ok(val instanceof CSSUnparsedValue);
    // It should be represented as a combination of string segments and CSSVariableReferenceValue
    // "calc(" , CSSVariableReferenceValue(--size) , " + 10px)"
    assert.strictEqual(val.length, 3);
    assert.strictEqual(val.item(0), 'calc(');
    const item1 = val.item(1);
    assert.ok(item1 instanceof CSSVariableReferenceValue);
    assert.strictEqual(item1.variable, '--size');
    assert.strictEqual(val.item(2), ' + 10px)');
  });

  test('CSSStyleValue.parse with var() fallback recursively parsed', () => {
    const val = CSSStyleValue.parse('color', 'var(--primary, var(--fallback-color, blue))');
    assert.ok(val instanceof CSSUnparsedValue);
    assert.strictEqual(val.length, 1);
    const varRef = val.item(0);
    assert.ok(varRef instanceof CSSVariableReferenceValue);
    assert.strictEqual(varRef.variable, '--primary');

    const fallback = varRef.fallback;
    assert.ok(fallback instanceof CSSUnparsedValue);
    assert.strictEqual(fallback.length, 2);
    const fallbackVarRef = fallback.item(1);
    assert.ok(fallbackVarRef instanceof CSSVariableReferenceValue);
    assert.strictEqual(fallbackVarRef.variable, '--fallback-color');

    const fallbackFallback = fallbackVarRef.fallback;
    assert.ok(fallbackFallback instanceof CSSUnparsedValue);
    assert.strictEqual(fallbackFallback.length, 1);
    assert.strictEqual(fallbackFallback.item(0), ' blue');
  });

  test('unregistered custom property returns CSSUnparsedValue with normalized segments', () => {
    const val = CSSStyleValue.parse('--unregistered', 'var(--a) + var(--b)');
    assert.ok(val instanceof CSSUnparsedValue);
    assert.strictEqual(val.length, 3);
    const item0 = val.item(0);
    assert.ok(item0 instanceof CSSVariableReferenceValue);
    assert.strictEqual(item0.variable, '--a');
    assert.strictEqual(val.item(1), ' + ');
    const item2 = val.item(2);
    assert.ok(item2 instanceof CSSVariableReferenceValue);
    assert.strictEqual(item2.variable, '--b');
  });

  test('unregistered custom property with no var() returns CSSUnparsedValue', () => {
    const val = CSSStyleValue.parse('--unregistered-no-var', '10px blue');
    assert.ok(val instanceof CSSUnparsedValue);
    assert.strictEqual(val.length, 1);
    assert.strictEqual(val.item(0), '10px blue');
  });

  test('CSSStyleValue.parseAll preserves leading/trailing whitespace for var() values', () => {
    const vals = CSSStyleValue.parseAll('color', '  var(--A)  ');
    assert.strictEqual(vals.length, 1);
    const val = vals[0];
    assert.ok(val instanceof CSSUnparsedValue);
    assert.strictEqual(val.length, 3);
    assert.strictEqual(val.item(0), ' ');
    const ref = val.item(1);
    assert.ok(ref instanceof CSSVariableReferenceValue);
    assert.strictEqual(ref.variable, '--A');
    assert.strictEqual(val.item(2), ' ');
  });

  test('element.attributeStyleMap set and get preserves leading/trailing whitespace for var() values', () => {
    const { window, document } = parseHTML('<html><body><div id="test"></div></body></html>');
    patchWindowForTypedOM(window);
    const div = document.getElementById('test') as unknown as HTMLElement & { attributeStyleMap: StylePropertyMap };
    
    const input = new CSSUnparsedValue([' ', new CSSVariableReferenceValue('--A')]);
    div.attributeStyleMap.set('accent-color', input);
    
    const result = div.attributeStyleMap.get('accent-color');
    assert.ok(result instanceof CSSUnparsedValue);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.item(0), ' ');
    const ref = result.item(1);
    assert.ok(ref instanceof CSSVariableReferenceValue);
    assert.strictEqual(ref.variable, '--A');
  });
});

