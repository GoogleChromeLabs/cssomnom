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
import { CSS } from '../src/typed-om.ts';
import { PropertyRegistry } from '../src/PropertyRegistry.ts';

test('CSS.registerProperty: calc() in initialValue', () => {
  PropertyRegistry.clear();

  // <length> with calc()
  CSS.registerProperty({
    name: '--calc-length',
    syntax: '<length>',
    inherits: false,
    initialValue: 'calc(10px)'
  });
  
  const defLength = PropertyRegistry.get('--calc-length');
  assert.ok(defLength);
  assert.strictEqual(defLength.initialValue, 'calc(10px)');

  // <number> with calc()
  CSS.registerProperty({
    name: '--calc-number',
    syntax: '<number>',
    inherits: false,
    initialValue: 'calc(10)'
  });
  
  const defNumber = PropertyRegistry.get('--calc-number');
  assert.ok(defNumber);
  assert.strictEqual(defNumber.initialValue, 'calc(10)');

  // <percentage> with calc()
  CSS.registerProperty({
    name: '--calc-percentage',
    syntax: '<percentage>',
    inherits: false,
    initialValue: 'calc(10%)'
  });
  
  const defPercentage = PropertyRegistry.get('--calc-percentage');
  assert.ok(defPercentage);
  assert.strictEqual(defPercentage.initialValue, 'calc(10%)');

  // <length-percentage> with calc()
  CSS.registerProperty({
    name: '--calc-length-percentage',
    syntax: '<length-percentage>',
    inherits: false,
    initialValue: 'calc(10px + 10%)'
  });
  
  const defLengthPercentage = PropertyRegistry.get('--calc-length-percentage');
  assert.ok(defLengthPercentage);
  assert.strictEqual(defLengthPercentage.initialValue, 'calc(10px + 10%)');
});
