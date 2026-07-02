/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MediaParser, serializeMediaQuery } from '../src/MediaParser.ts';

describe('Media Queries', () => {
    test('non-negative feature validation', () => {
        const queries = MediaParser.parse('(min-width: -10px), (width: 100px)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries, ['(min-width: -10px)', '(width: 100px)']);
    });

    test('reject negative values in aspect ratios', () => {
        const queries = MediaParser.parse('(aspect-ratio: -1/1), (aspect-ratio: 1/-1), (aspect-ratio: -1/-1)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries, ['not all', 'not all', 'not all']);
        
        const queriesValid = MediaParser.parse('(aspect-ratio: 16/9)').map(serializeMediaQuery);
        assert.strictEqual(queriesValid[0], '(aspect-ratio: 16/9)');
    });

    test('allow negative lengths in range to parse successfully', () => {
        const queries = MediaParser.parse('(width >= -10px)').map(serializeMediaQuery);
        assert.strictEqual(queries[0], '(width >= -10px)');
    });

    test('invalid operator in range', () => {
        const queries = MediaParser.parse('(width = 100px)').map(serializeMediaQuery);
        assert.strictEqual(queries[0], '(width = 100px)');
        
        const queries2 = MediaParser.parse('(100px = width)').map(serializeMediaQuery);
        assert.strictEqual(queries2[0], '(100px = width)');
    });

    test('support math functions in media features', () => {
        const queries = MediaParser.parse('(width: calc(100px + 50px))').map(serializeMediaQuery);
        assert.strictEqual(queries[0], '(width: calc(100px + 50px))');
        
        const queries2 = MediaParser.parse('(width: min(100px, 200px))').map(serializeMediaQuery);
        assert.strictEqual(queries2[0], '(width: min(100px, 200px))');
        
        const queries3 = MediaParser.parse('(width: max(100px, 50px))').map(serializeMediaQuery);
        assert.strictEqual(queries3[0], '(width: max(100px, 50px))');
        
        const queries4 = MediaParser.parse('(width: clamp(50px, 100px, 150px))').map(serializeMediaQuery);
        assert.strictEqual(queries4[0], '(width: clamp(50px, 100px, 150px))');
    });

    test('ratio validation enforces structure and consumes entire sequence', () => {
        const queries = MediaParser.parse('(aspect-ratio: calc(16) / calc(9))').map(serializeMediaQuery);
        assert.strictEqual(queries[0], '(aspect-ratio: calc(16) /calc(9))');
        const queries2 = MediaParser.parse('(aspect-ratio: calc(16) / calc(9) foo)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries2, ['not all']);
    });

    test('whitespace sensitivity in operators', () => {
        // Space between < and = is invalid operator! So it should be 'not all'!
        const queries = MediaParser.parse('(width < = 100px)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries, ['not all']);
        
        const queries2 = MediaParser.parse('(width >= 100px)').map(serializeMediaQuery);
        assert.strictEqual(queries2[0], '(width >= 100px)');
        
        const queries3 = MediaParser.parse('(width > = 100px)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries3, ['not all']);
        
        const queries4 = MediaParser.parse('(width <= 100px)').map(serializeMediaQuery);
        assert.strictEqual(queries4[0], '(width <= 100px)');
    });

    test('reject trailing garbage in feature values', () => {
        const queries = MediaParser.parse('(width: 100px foo)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries, ['not all']);
        
        const queries2 = MediaParser.parse('(orientation: portrait landscape)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries2, ['not all']);
        
        const queries3 = MediaParser.parse('(grid: 1 2)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries3, ['not all']);
    });

    test('lowercase coercion for units in media queries', () => {
        const queries = MediaParser.parse('(width: 100PX)').map(serializeMediaQuery);
        assert.strictEqual(queries[0], '(width: 100px)');
    });

    test('reject discrete features in range contexts', () => {
        // pointer is discrete, so (pointer = fine) is invalid! -> 'not all'
        const queries = MediaParser.parse('(pointer = fine)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries, ['not all']);
        
        const queries2 = MediaParser.parse('(hover < hover)').map(serializeMediaQuery);
        assert.deepStrictEqual(queries2, ['not all']);
    });
});
