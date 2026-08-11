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
import { ArrayComponentValueStream, LazyComponentValueStream } from '../src/TokenStream.ts';
import type { ComponentValue } from '../src/types.ts';

test('ArrayComponentValueStream', () => {
  const values: ComponentValue[] = [
    { type: 'ident', value: 'foo' },
    { type: 'colon', value: ':' },
    { type: 'ident', value: 'bar' }
  ];
  const stream = new ArrayComponentValueStream(values);

  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'foo' });
  assert.deepStrictEqual(stream.next(), { type: 'ident', value: 'foo' });
  assert.deepStrictEqual(stream.peek(), { type: 'colon', value: ':' });
  assert.deepStrictEqual(stream.next(), { type: 'colon', value: ':' });
  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'bar' });
  assert.deepStrictEqual(stream.next(), { type: 'ident', value: 'bar' });
  assert.deepStrictEqual(stream.peek(), { type: 'EOF', value: '' });
  assert.deepStrictEqual(stream.next(), { type: 'EOF', value: '' });
});

test('ArrayComponentValueStream position', () => {
  const values: ComponentValue[] = [
    { type: 'ident', value: 'foo' },
    { type: 'colon', value: ':' }
  ];
  const stream = new ArrayComponentValueStream(values);

  assert.strictEqual(stream.position, 0);
  stream.next();
  assert.strictEqual(stream.position, 1);
  stream.position = 0;
  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'foo' });
});

test('LazyComponentValueStream', () => {
  const values: ComponentValue[] = [
    { type: 'ident', value: 'foo' },
    { type: 'colon', value: ':' },
    { type: 'ident', value: 'bar' },
    { type: '}', value: '}' }
  ];
  let index = 0;
  const fetchNext = () => values[index++] || { type: 'EOF', value: '' };
  
  const stream = new LazyComponentValueStream(fetchNext, '}');

  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'foo' });
  assert.deepStrictEqual(stream.next(), { type: 'ident', value: 'foo' });
  assert.deepStrictEqual(stream.peek(), { type: 'colon', value: ':' });
  assert.deepStrictEqual(stream.next(), { type: 'colon', value: ':' });
  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'bar' });
  assert.deepStrictEqual(stream.next(), { type: 'ident', value: 'bar' });
  assert.deepStrictEqual(stream.peek(), { type: 'EOF', value: '' });
  assert.deepStrictEqual(stream.next(), { type: 'EOF', value: '' });
});

test('LazyComponentValueStream position', () => {
  const values: ComponentValue[] = [
    { type: 'ident', value: 'foo' },
    { type: 'colon', value: ':' },
    { type: '}', value: '}' }
  ];
  let index = 0;
  const fetchNext = () => values[index++] || { type: 'EOF', value: '' };
  
  const stream = new LazyComponentValueStream(fetchNext, '}');

  assert.strictEqual(stream.position, 0);
  stream.next();
  assert.strictEqual(stream.position, 1);
  stream.position = 0;
  assert.deepStrictEqual(stream.peek(), { type: 'ident', value: 'foo' });
});
