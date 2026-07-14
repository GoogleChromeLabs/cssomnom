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
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSTransformValue, CSSTranslate, CSSUnitValue, CSSNumericArray, CSSUnparsedValue, CSSVariableReferenceValue } from '../src/typed-om.ts';

test('CSSTransformValue iterators', () => {
  const components = [
    new CSSTranslate(new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px')),
    new CSSTranslate(new CSSUnitValue(30, 'px'), new CSSUnitValue(40, 'px')),
  ];
  const transform = new CSSTransformValue(components);

  assert.strictEqual(transform.length, 2);
  
  // [Symbol.iterator]
  const iterResults = [...transform];
  assert.strictEqual(iterResults.length, 2);
  assert.strictEqual(iterResults[0], components[0]);

  // forEach
  let count = 0;
  transform.forEach((val, idx) => {
    assert.strictEqual(val, components[idx]);
    count++;
  });
  assert.strictEqual(count, 2);

  // entries, keys, values
  assert.strictEqual([...transform.keys()].length, 2);
  assert.strictEqual([...transform.values()].length, 2);
  assert.strictEqual([...transform.entries()].length, 2);
});

test('CSSNumericArray iterators', () => {
  const values = [new CSSUnitValue(10, 'px'), new CSSUnitValue(20, 'px')];
  const array = new CSSNumericArray(values);

  assert.strictEqual(array.length, 2);

  // [Symbol.iterator]
  const iterResults = [...array];
  assert.strictEqual(iterResults.length, 2);
  assert.strictEqual(iterResults[0], values[0]);

  // forEach
  let count = 0;
  array.forEach((val, idx) => {
    assert.strictEqual(val, values[idx]);
    count++;
  });
  assert.strictEqual(count, 2);
});

test('CSSUnparsedValue iterators', () => {
  const varRef = new CSSVariableReferenceValue('--foo');
  const values = ['bar', varRef];
  const unparsed = new CSSUnparsedValue(values);

  assert.strictEqual(unparsed.length, 2);

  // [Symbol.iterator]
  const iterResults = [...unparsed];
  assert.strictEqual(iterResults.length, 2);
  assert.strictEqual(iterResults[0], 'bar');
  assert.strictEqual(iterResults[1], varRef);

  // forEach
  let count = 0;
  unparsed.forEach((val, idx) => {
    assert.strictEqual(val, values[idx]);
    count++;
  });
  assert.strictEqual(count, 2);
});
