/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CSSNumericValue, CSSUnitValue, CSSStyleValue } from '../src/typed-om.ts';

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
        // Simplification is performed eagerly now
        assert.strictEqual(calcVal.toString(), '30px');
    });

    test('multi-argument math functions (atan2)', () => {
        const val = CSSNumericValue.parse('calc(atan2(10px, 20px))');
        assert.ok(val);
        // Serialization should preserve atan2(10px, 20px)
        assert.strictEqual(val.toString(), 'atan2(10px, 20px)');
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
});

