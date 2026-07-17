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
import {
  CSSStyleValue,
  CSSPositionValue,
  CSSUnitValue,
  CSSKeywordValue,
  CSSNumericValue
} from '../src/typed-om.ts';

test('CSSPositionValue constructor validation', () => {
  const x = new CSSUnitValue(50, 'percent');
  const y = new CSSKeywordValue('center');
  const pos = new CSSPositionValue(x, y);
  assert.strictEqual(pos.x, x);
  assert.strictEqual(pos.y, y);

  const newX = new CSSUnitValue(10, 'px');
  pos.x = newX;
  assert.strictEqual(pos.x, newX);

  const newY = new CSSKeywordValue('top');
  pos.y = newY;
  assert.strictEqual(pos.y, newY);

  // Invalid types must throw TypeError
  assert.throws(() => {
    new CSSPositionValue(50 as unknown as CSSNumericValue, y);
  }, TypeError);

  assert.throws(() => {
    new CSSPositionValue(x, 'center' as unknown as CSSKeywordValue);
  }, TypeError);

  // Invalid units (not <length-percentage>) must throw TypeError
  assert.throws(() => {
    new CSSPositionValue(new CSSUnitValue(90, 'deg'), y);
  }, TypeError);

  assert.throws(() => {
    new CSSPositionValue(x, new CSSUnitValue(2, 's'));
  }, TypeError);

  // Setting invalid values must throw TypeError
  assert.throws(() => {
    pos.x = new CSSUnitValue(90, 'deg');
  }, TypeError);

  assert.throws(() => {
    pos.y = 'center' as unknown as CSSKeywordValue;
  }, TypeError);
});

test('CSSPositionValue parsing and reification', () => {
  // background-position
  const bgPos = CSSStyleValue.parse('background-position', '10px 20%');
  assert.ok(bgPos instanceof CSSPositionValue);
  assert.ok(bgPos.x instanceof CSSUnitValue);
  assert.strictEqual((bgPos.x as CSSUnitValue).value, 10);
  assert.strictEqual((bgPos.x as CSSUnitValue).unit, 'px');
  assert.ok(bgPos.y instanceof CSSUnitValue);
  assert.strictEqual((bgPos.y as CSSUnitValue).value, 20);
  assert.strictEqual((bgPos.y as CSSUnitValue).unit, 'percent');

  // Single value: background-position: left
  const bgPosSingle = CSSStyleValue.parse('background-position', 'left');
  assert.ok(bgPosSingle instanceof CSSPositionValue);
  assert.ok(bgPosSingle.x instanceof CSSKeywordValue);
  assert.strictEqual((bgPosSingle.x as CSSKeywordValue).value, 'left');
  assert.ok(bgPosSingle.y instanceof CSSKeywordValue);
  assert.strictEqual((bgPosSingle.y as CSSKeywordValue).value, 'center');

  // object-position
  const objPos = CSSStyleValue.parse('object-position', 'center top');
  assert.ok(objPos instanceof CSSPositionValue);
  assert.ok(objPos.x instanceof CSSKeywordValue);
  assert.strictEqual((objPos.x as CSSKeywordValue).value, 'center');
  assert.ok(objPos.y instanceof CSSKeywordValue);
  assert.strictEqual((objPos.y as CSSKeywordValue).value, 'top');
});

test('CSSPositionValue serialization', () => {
  const pos = new CSSPositionValue(new CSSUnitValue(10, 'px'), new CSSKeywordValue('bottom'));
  assert.strictEqual(pos.serialize(), '10px bottom');
  assert.strictEqual(pos.toString(), '10px bottom');
});

test('CSSPositionValue invalid position syntax fallback', () => {
  // Invalid 2-component position syntaxes must fall back to generic CSSStyleValue
  const val1 = CSSStyleValue.parse('background-position', 'top 10px');
  assert.ok(val1 instanceof CSSStyleValue);
  assert.ok(!(val1 instanceof CSSPositionValue));
  assert.strictEqual(val1.toString(), 'top 10px');

  const val2 = CSSStyleValue.parse('background-position', '10px left');
  assert.ok(val2 instanceof CSSStyleValue);
  assert.ok(!(val2 instanceof CSSPositionValue));
  assert.strictEqual(val2.toString(), '10px left');
});

