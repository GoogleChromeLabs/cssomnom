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
import { CSSNumericValue, CSSUnitValue, CSSStyleValue, StylePropertyMap } from '../src/typed-om.ts';

describe('Values & Typed OM', () => {
    test('math constants e and pi', () => {
        const val = CSSNumericValue.parse('calc(pi * 1rad)');
        assert.ok(val);
        // pi * 1rad = 3.14159...rad
        // Note: simplification might have converted it to 3.141592653589793rad
        assert.ok(val.toString().includes('3.14159'));
        
        const eVal = CSSNumericValue.parse('calc(e)');
        assert.ok(eVal);
        assert.ok(eVal.toString().includes('2.71828'));
    });

    test('CSSNumericValue.parse', () => {
        const val = CSSNumericValue.parse('10px');
        assert.ok(val instanceof CSSUnitValue);
        assert.strictEqual((val as CSSUnitValue).value, 10);
        assert.strictEqual((val as CSSUnitValue).unit, 'px');
        
        const calcVal = CSSNumericValue.parse('calc(10px + 20px)');
        assert.ok(calcVal);
        assert.strictEqual(calcVal.toString(), 'calc(10px + 20px)');
    });

    test('multi-argument math functions (atan2)', () => {
        const val = CSSNumericValue.parse('calc(atan2(10px, 20px))');
        assert.ok(val);
        assert.strictEqual(val.toString(), 'calc(atan2(10px, 20px))');

        const validVal = CSSNumericValue.parse('calc(atan2(10px, 1em))');
        assert.ok(validVal);

        assert.throws(() => {
          CSSNumericValue.parse('calc(atan2(10px, 1s))');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
    });

    test('type() and to()', () => {
        const px = new CSSUnitValue(10, 'px');
        assert.deepStrictEqual(px.type(), { length: 1 });
        
        const deg = new CSSUnitValue(180, 'deg');
        const rad = deg.to('rad');
        assert.strictEqual(Math.round(rad.value * 1000) / 1000, Math.round(Math.PI * 1000) / 1000);
        
        const sum = CSSNumericValue.parse('calc(1in + 96px)');
        assert.ok(sum);
        const conv = sum.to('px');
        assert.strictEqual(conv.value, 192);

        // resolution unit x conversion to dppx
        const xVal = new CSSUnitValue(2, 'x' as unknown as 'dppx');
        const dppxVal = xVal.to('dppx');
        assert.strictEqual(dppxVal.value, 2);
        assert.strictEqual(dppxVal.unit, 'dppx');

        // invalid units should throw SyntaxError DOMException
        assert.throws(() => {
            px.to('invalid-unit');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');

        assert.throws(() => {
            sum.to('invalid-unit');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
    });

    test('CSSNumericValue.parse throws on invalid input', () => {
        assert.throws(() => {
            CSSNumericValue.parse('invalid');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
        
        assert.throws(() => {
            CSSNumericValue.parse('');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
        
        assert.throws(() => {
            CSSNumericValue.parse('10px + 20px'); // missing calc
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');

        assert.throws(() => {
            CSSNumericValue.parse('10bogus');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');

        assert.throws(() => {
            CSSNumericValue.parse('calc(10px + 2bogus)');
        }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
    });

    test('CSSStyleValue.parse throws on invalid input', () => {
        assert.throws(() => {
            CSSStyleValue.parse('color', '   ');
        }, TypeError);
    });

    test('CSSStyleValue.parse returns CSSUnparsedValue for unsupported valid values', () => {
        const val = CSSStyleValue.parse('transform', 'rotate(45deg)');
        assert.ok(val);
        assert.strictEqual(val.toString(), 'rotate(45deg)');
    });

    describe('CSSStyleValue.parseAll()', () => {
        test('should parse a single value into an array', () => {
            const results = CSSStyleValue.parseAll('width', '10px');
            assert.strictEqual(results.length, 1);
            assert.ok(results[0] instanceof CSSUnitValue);
            assert.strictEqual(results[0].toString(), '10px');
        });

        test('should parse multiple values for properties that support them (comma separated)', () => {
            const results = CSSStyleValue.parseAll('transition', 'margin 1s, color 2s');
            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].toString(), 'margin 1s');
            assert.strictEqual(results[1].toString(), 'color 2s');
        });

        test('should not subdivide space-separated values for non-list properties', () => {
            const results = CSSStyleValue.parseAll('margin', '10px 20px');
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].toString(), '10px 20px');
        });

        test('should return empty array for empty string', () => {
            const results = CSSStyleValue.parseAll('width', '');
            assert.deepStrictEqual(results, []);
        });
    });

    describe('StylePropertyMap set/append validations', () => {
        test('should throw TypeError on set() with empty values', () => {
            const el = { style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => "" } };
            // @ts-expect-error - constructing with mock style
            const map = new StylePropertyMap(el.style);
            assert.throws(() => {
                map.set('width');
            }, TypeError);
        });

        test('should throw TypeError on append() with empty values', () => {
            const el = { style: { setProperty: () => {}, removeProperty: () => {}, getPropertyValue: () => "" } };
            // @ts-expect-error - constructing with mock style
            const map = new StylePropertyMap(el.style);
            assert.throws(() => {
                map.append('background-image');
            }, TypeError);
        });
    });
});

