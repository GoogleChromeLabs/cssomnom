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
import { CSSStyleDeclaration } from '../src/index.ts';
import { StylePropertyMap } from '../src/typed-om.ts';
import { CSS } from '../src/typed-om.ts';

describe('StylePropertyMap', () => {
  test('set() and get()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('margin-top', CSS.px(10));
    assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
    
    const val = map.get('margin-top');
    assert.strictEqual(val?.toString(), '10px');
  });

  test('append()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('background-image', 'url("a.png")');
    map.append('background-image', 'url("b.png")');
    assert.strictEqual(style.getPropertyValue('background-image'), 'url("a.png"), url("b.png")');
  });

  test('delete() and has()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('color', 'red');
    assert.strictEqual(map.has('color'), true);
    
    map.delete('color');
    assert.strictEqual(map.has('color'), false);
    assert.strictEqual(style.getPropertyValue('color'), '');
  });

  test('clear()', () => {
    const style = new CSSStyleDeclaration([]);
    const map = new StylePropertyMap(style);
    
    map.set('color', 'red');
    map.set('margin', '10px');
    assert.strictEqual(style.length, 5); // color + 4 margins
    
    map.clear();
    assert.strictEqual(style.length, 0);
  });
});
