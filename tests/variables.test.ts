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
import { CSSStyleDeclaration, Parser } from '../src/index.ts';
import { CSS } from '../src/parser-api.ts';

describe('Properties & Variables', () => {
    test('harden var() validation', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('--foo', 'red');
        style.setProperty('color', 'var(red, blue)'); // Invalid first arg
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '');
        
        style.setProperty('color', 'var(--, blue)'); // Invalid first arg (not a dashed-ident)
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '', 'var(--) should be invalid');

        style.setProperty('color', 'var(--foo, blue)'); // Valid
        assert.strictEqual(Parser.resolveVariables(style, 'color'), 'red');

        style.setProperty('color', 'var(--foo --bar, blue)'); // Invalid multiple tokens before comma
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '', 'var() with multiple tokens before comma should be invalid');

        style.setProperty('color', 'var(--foo --bar)'); // Invalid multiple tokens
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '', 'var() with multiple tokens should be invalid');
    });

    test('CSS.registerProperty', () => {
        CSS.registerProperty({
            name: '--my-prop',
            syntax: '<color>',
            inherits: false,
            initialValue: 'green'
        });
        // Verification is limited for now as we haven't integrated it into cascade yet
    });

    test('var() fallback behavior', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('color', 'var(--missing) red');
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '', 'var() without fallback should make property invalid');
        
        style.setProperty('color', 'var(--missing,) red');
        assert.strictEqual(Parser.resolveVariables(style, 'color'), ' red', 'var() with empty fallback should substitute to empty');
    });

    test('var() fallback constraints should be lenient at parse time', () => {
        const style = new CSSStyleDeclaration([]);
        
        style.setProperty('--foo', 'var(--missing, red; blue)');
        assert.strictEqual(style.getPropertyValue('--foo'), 'var(--missing, red; blue)', 'Should allow semicolon in fallback at parse time');
        
        style.setProperty('--foo', 'var(--missing, red !)');
        assert.strictEqual(style.getPropertyValue('--foo'), 'var(--missing, red !)', 'Should allow ! in fallback at parse time');
        
        // Fallback can contain semicolon inside blocks
        style.setProperty('--foo', 'var(--missing, red (blue;))');
        assert.strictEqual(style.getPropertyValue('--foo'), 'var(--missing, red (blue;))', 'Should accept semicolon inside block in fallback');
    });

    test('var() cycle detection', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('--a', 'var(--a)');
        style.setProperty('color', 'var(--a) green');
        assert.strictEqual(Parser.resolveVariables(style, 'color'), '', 'Cycle should make the whole property invalid');
        
        style.setProperty('--b', 'var(--c)');
        style.setProperty('--c', 'var(--b)');
        style.setProperty('background', 'var(--b) blue');
        assert.strictEqual(Parser.resolveVariables(style, 'background'), '', 'Indirect cycle should make the whole property invalid');
    });
});
