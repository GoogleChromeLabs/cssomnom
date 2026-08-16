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
import assert from 'node:assert/strict';
import {
  CSSUnparsedValue,
  CSSVariableReferenceValue,
  CSSStyleDeclaration,
  StylePropertyMap,
} from '../src/index.ts';

describe('CSSUnparsedValue String Serialization Roundtrip', () => {
  test('CSSUnparsedValue serializes string tokens verbatim with comment separators between idents', () => {
    const unparsed = new CSSUnparsedValue(['lem', 'on', 'ade']);
    assert.strictEqual(unparsed.toString(), 'lem/**/on/**/ade');
  });

  test('CSSUnparsedValue does not add comments when whitespace is present', () => {
    const unparsed = new CSSUnparsedValue(['foo', 'bar ']);
    assert.strictEqual(unparsed.toString(), 'foo/**/bar ');
  });

  test('CSSUnparsedValue serializes nested variable references correctly', () => {
    const unparsed = new CSSUnparsedValue([
      new CSSVariableReferenceValue('--A', new CSSUnparsedValue([new CSSVariableReferenceValue('--B')])),
      new CSSVariableReferenceValue('--C')
    ]);
    assert.strictEqual(unparsed.toString(), 'var(--A,var(--B))var(--C)');
  });

  test('CSSUnparsedValue containing mix of strings and nested variable references', () => {
    const unparsed = new CSSUnparsedValue([
      'foo',
      'bar ',
      new CSSVariableReferenceValue('--A', new CSSUnparsedValue([
        'baz ',
        new CSSVariableReferenceValue('--B'),
        'lemon'
      ])),
      new CSSVariableReferenceValue('--C', new CSSUnparsedValue(['ade']))
    ]);
    assert.strictEqual(unparsed.toString(), 'foo/**/bar var(--A,baz var(--B)lemon)var(--C,ade)');
  });

  test('CSSUnparsedValue with empty string fragment does not crash', () => {
    const empty = new CSSUnparsedValue(['']);
    assert.strictEqual(empty.toString(), '');
  });

  test('CSSVariableReferenceValue with escaped identifier roundtrips properly', () => {
    const varRef = new CSSVariableReferenceValue('--a,fail');
    assert.strictEqual(varRef.toString(), 'var(--a\\,fail)');

    const unparsed = new CSSUnparsedValue([varRef]);
    assert.strictEqual(unparsed.toString(), 'var(--a\\,fail)');

    const style = new CSSStyleDeclaration();
    style.cssText = '--a\\,fail: pass; --unparsed:var(--a\\,fail)';
    const map = new StylePropertyMap(style);
    const specified = map.get('--unparsed');
    assert.ok(specified instanceof CSSUnparsedValue);
    assert.strictEqual(specified.toString(), 'var(--a\\,fail)');

    style.setProperty('--unparsed', specified.toString());
    assert.strictEqual(style.getPropertyValue('--unparsed'), 'var(--a\\,fail)');
  });
});

describe('CSSUnparsedValue List Operations and WebIDL Conformance', () => {
  test('Iteration and spread work as expected', () => {
    const fragments = ['foo', new CSSVariableReferenceValue('--bar')];
    const unparsed = new CSSUnparsedValue(fragments);
    assert.strictEqual(unparsed.length, 2);
    assert.deepStrictEqual([...unparsed], fragments);

    const keys = [...unparsed.keys()];
    assert.deepStrictEqual(keys, [0, 1]);

    const values = [...unparsed.values()];
    assert.deepStrictEqual(values, fragments);

    const entries = [...unparsed.entries()];
    assert.deepStrictEqual(entries, [[0, fragments[0]], [1, fragments[1]]]);
  });

  test('Indexed getter and setter work as expected', () => {
    const unparsed = new CSSUnparsedValue(['hello']);
    assert.strictEqual(unparsed[0], 'hello');
    assert.strictEqual(unparsed[1], undefined);
    assert.strictEqual(unparsed[-1], undefined);

    // Update existing index
    unparsed[0] = 'world';
    assert.strictEqual(unparsed[0], 'world');
    assert.strictEqual(unparsed.length, 1);

    // Append to index === length
    unparsed[1] = new CSSVariableReferenceValue('--test');
    assert.strictEqual(unparsed.length, 2);
    assert.ok(unparsed[1] instanceof CSSVariableReferenceValue);

    // Out of bounds throws RangeError
    assert.throws(() => {
      unparsed[5] = 'out';
    }, RangeError);

    // Invalid value throws TypeError
    assert.throws(() => {
      // @ts-expect-error test invalid value
      unparsed[0] = 123;
    }, TypeError);
  });
});

describe('CSSVariableReferenceValue WebIDL Conformance', () => {
  test('Constructor and attribute validation', () => {
    // @ts-expect-error test insufficient args
    assert.throws(() => new CSSVariableReferenceValue(), TypeError);
    assert.throws(() => new CSSVariableReferenceValue(''), TypeError);
    assert.throws(() => new CSSVariableReferenceValue('foo'), TypeError);
    assert.throws(() => new CSSVariableReferenceValue('--'), TypeError);

    const v = new CSSVariableReferenceValue('--foo');
    assert.strictEqual(v.variable, '--foo');
    assert.strictEqual(v.fallback, null);

    v.variable = '--bar';
    assert.strictEqual(v.variable, '--bar');

    assert.throws(() => { v.variable = ''; }, TypeError);
    assert.throws(() => { v.variable = 'invalid'; }, TypeError);
    assert.throws(() => { v.variable = '--'; }, TypeError);
  });
});
