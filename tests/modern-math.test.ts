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
import { parseMathFunction } from '../src/math-parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSMathClamp, CSSKeywordValue } from '../src/typed-om.ts';

describe('Modern Math Functions', () => {
  test('sin()', () => {
    const tokens = tokenize('45deg');
    const val = parseMathFunction('sin', tokens);
    assert.strictEqual(val?.toString(), 'sin(45deg)');
  });

  test('cos()', () => {
    const tokens = tokenize('0.5turn');
    const val = parseMathFunction('cos', tokens);
    assert.strictEqual(val?.toString(), 'cos(0.5turn)');
  });

  test('atan2()', () => {
    const tokens = tokenize('10px, 20px');
    const val = parseMathFunction('atan2', tokens);
    assert.strictEqual(val?.toString(), 'atan2(10px, 20px)');
  });

  test('complex trigonometric', () => {
    const parser = new Parser(tokenize('calc(45deg + 10deg)'));
    const values = parser.parseComponentValues();
    const val = parseMathFunction('sin', values);
    assert.ok(val?.toString().includes('sin'));
    assert.ok(val?.toString().includes('55deg') || val?.toString().includes('45deg'));
  });

  test('abs() preserves dimension type', () => {
    const tokens = tokenize('-10px');
    const val = parseMathFunction('abs', tokens);
    const type = val?.type();
    assert.deepStrictEqual(type, { length: 1 });
  });

  test('abs() simplifies when possible', () => {
    const tokens = tokenize('-10px');
    const val = parseMathFunction('abs', tokens);
    // Eager simplification is removed, so it should preserve abs()
    assert.strictEqual(val?.toString(), 'abs(-10px)');
  });

  test('hypot() preserves dimension type', () => {
    const tokens = tokenize('3px, 4px');
    const val = parseMathFunction('hypot', tokens);
    const type = val?.type();
    assert.deepStrictEqual(type, { length: 1 });
  });

  test('hypot() simplifies when possible', () => {
    const tokens = tokenize('3px, 4px');
    const val = parseMathFunction('hypot', tokens);
    // Eager simplification is removed, so it should preserve hypot()
    assert.strictEqual(val?.toString(), 'hypot(3px, 4px)');
  });

  test('sin() arity - too many arguments', () => {
    const tokens = tokenize('45deg, 10deg');
    const val = parseMathFunction('sin', tokens);
    assert.strictEqual(val, null);
  });

  test('atan2() arity - too few arguments', () => {
    const tokens = tokenize('10px');
    const val = parseMathFunction('atan2', tokens);
    assert.strictEqual(val, null);
  });

  test('atan2() arity - too many arguments', () => {
    const tokens = tokenize('10px, 20px, 30px');
    const val = parseMathFunction('atan2', tokens);
    assert.strictEqual(val, null);
  });

  test('calc(+infinity)', () => {
    const tokens = tokenize('+infinity');
    const val = parseMathFunction('calc', tokens);
    assert.strictEqual(val?.toString(), 'calc(infinity)');
  });

  test('calc(-infinity)', () => {
    const tokens = tokenize('-infinity');
    const val = parseMathFunction('calc', tokens);
    assert.strictEqual(val?.toString(), 'calc(-infinity)');
  });

  test('clamp() with none', () => {
    const tokens = tokenize('none, 10px, 20px');
    const val = parseMathFunction('clamp', tokens);
    assert.strictEqual(val?.toString(), 'clamp(none, 10px, 20px)');
  });

  test('clamp() with none as max', () => {
    const tokens = tokenize('10px, 20px, none');
    const val = parseMathFunction('clamp', tokens);
    assert.strictEqual(val?.toString(), 'clamp(10px, 20px, none)');
  });

  test('clamp() with both none', () => {
    const tokens = tokenize('none, 20px, none');
    const val = parseMathFunction('clamp', tokens);
    assert.strictEqual(val?.toString(), 'clamp(none, 20px, none)');
  });

  test('clamp() structure with both none', () => {
    const tokens = tokenize('none, 20px, none');
    const val = parseMathFunction('clamp', tokens);
    assert.ok(val instanceof CSSMathClamp);
    assert.ok(val.lower instanceof CSSKeywordValue);
    assert.strictEqual(val.lower.value, 'none');
    assert.ok(val.upper instanceof CSSKeywordValue);
    assert.strictEqual(val.upper.value, 'none');
  });
});
