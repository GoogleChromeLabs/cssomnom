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

describe('Logical Properties', () => {
    test('border-radius logical properties mapping (no eager aliasing)', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('border-start-start-radius', '10px');
        assert.strictEqual(style.getPropertyValue('border-top-left-radius'), '');
        
        style.setProperty('border-top-right-radius', '20px');
        assert.strictEqual(style.getPropertyValue('border-start-end-radius'), '');
    });

    test('inset-block and inset-inline shorthands (no physical aliasing)', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('inset-block', '10px 20px');
        assert.strictEqual(style.getPropertyValue('inset-block-start'), '10px');
        assert.strictEqual(style.getPropertyValue('inset-block-end'), '20px');
        assert.strictEqual(style.getPropertyValue('top'), '');
        assert.strictEqual(style.getPropertyValue('bottom'), '');
    });

    test('border-block-width shorthand (no physical aliasing)', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('border-block-width', '1px 2px');
        assert.strictEqual(style.getPropertyValue('border-block-start-width'), '1px');
        assert.strictEqual(style.getPropertyValue('border-block-end-width'), '2px');
        assert.strictEqual(style.getPropertyValue('border-top-width'), '');
        assert.strictEqual(style.getPropertyValue('border-bottom-width'), '');
    });

    test('all property correctly resets other properties', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('color', 'red');
        style.setProperty('all', 'initial');
        assert.strictEqual(style.getPropertyValue('color'), 'initial');
        
        style.setProperty('color', 'blue');
        assert.strictEqual(style.getPropertyValue('color'), 'blue');
        
        style.setProperty('direction', 'rtl');
        style.setProperty('all', 'initial');
        assert.strictEqual(style.getPropertyValue('direction'), 'rtl'); // not covered by all
    });

    test('logical box shorthand serialization (margin)', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('margin-block-start', '10px');
        style.setProperty('margin-block-end', '10px');
        style.setProperty('margin-inline-start', '10px');
        style.setProperty('margin-inline-end', '10px');
        assert.strictEqual(style.cssText, 'margin: logical 10px;');
    });

    test('logical box shorthand serialization (border-radius)', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('border-start-start-radius', '10px');
        style.setProperty('border-start-end-radius', '10px');
        style.setProperty('border-end-end-radius', '10px');
        style.setProperty('border-end-start-radius', '10px');
        assert.strictEqual(style.cssText, 'border-start-start-radius: 10px; border-start-end-radius: 10px; border-end-end-radius: 10px; border-end-start-radius: 10px;');
    });

    test('border-radius removeProperty removes logical longhands', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('border-start-start-radius', '10px');
        assert.strictEqual(style.getPropertyValue('border-start-start-radius'), '10px');
        
        style.removeProperty('border-radius');
        assert.strictEqual(style.getPropertyValue('border-start-start-radius'), '');
    });

    test('logical shorthand serialization with mixed physical longhands', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('inset-block-start', '10px');
        style.setProperty('inset-block-end', '10px');
        style.setProperty('top', '20px');
        assert.strictEqual(style.getPropertyValue('inset-block'), '');
    });

    test('logical shorthand removeProperty does not remove physical longhands', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('margin-top', '10px');
        assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
        
        style.removeProperty('margin-block');
        assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
    });

    test('setProperty does not move logical property to end if not necessary', () => {
        const style = new CSSStyleDeclaration();
        style.setProperty('margin-inline-start', '10px');
        style.setProperty('color', 'red');
        
        style.setProperty('margin-inline-start', '20px');
        
        assert.strictEqual(style.item(0), 'margin-inline-start');
        assert.strictEqual(style.item(1), 'color');
    });
});
