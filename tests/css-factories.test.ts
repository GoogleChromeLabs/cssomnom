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
import { CSS } from '../src/parser-api.ts';
import { CSSUnitValue } from '../src/typed-om.ts';

test('CSS factory methods exist for standard units', () => {
  assert.strictEqual(typeof CSS.px, 'function');
  const pxVal = CSS.px(10);
  assert.ok(pxVal instanceof CSSUnitValue);
  assert.strictEqual(pxVal.value, 10);
  assert.strictEqual(pxVal.unit, 'px');
});

test('CSS factory methods exist for auto-generated units', () => {
  // 'cap' is in UNITS but not hardcoded in parser-api.ts currently
  assert.strictEqual(typeof CSS.cap, 'function');
  const capVal = CSS.cap(5);
  assert.ok(capVal instanceof CSSUnitValue);
  assert.strictEqual(capVal.value, 5);
  assert.strictEqual(capVal.unit, 'cap');
});
