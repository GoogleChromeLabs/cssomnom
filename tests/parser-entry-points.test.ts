/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import type { Token } from '../src/types.ts';

describe('Parser Entry Points', () => {
    test('Parser.parseComponentValue', () => {
        const tokens = tokenize('red');
        const parser = new Parser(tokens);
        const value = parser.parseComponentValue();
        assert.ok(value);
        assert.strictEqual(value.type, 'ident');
        assert.strictEqual((value as Token).value, 'red');
    });

    test('Parser.parseComponentValue with whitespace', () => {
        const tokens = tokenize('  red  ');
        const parser = new Parser(tokens);
        const value = parser.parseComponentValue();
        assert.ok(value);
        assert.strictEqual(value.type, 'ident');
    });

    test('Parser.parseComponentValue with extra tokens returns null', () => {
        const tokens = tokenize('red blue');
        const parser = new Parser(tokens);
        const value = parser.parseComponentValue();
        assert.strictEqual(value, null);
    });

    test('Parser.parseDeclaration', () => {
        const tokens = tokenize('color: red');
        const parser = new Parser(tokens);
        const decl = parser.parseDeclaration();
        assert.ok(decl);
        assert.strictEqual(decl.name, 'color');
    });

    test('Parser.parseDeclaration with whitespace', () => {
        const tokens = tokenize('  color : red  ');
        const parser = new Parser(tokens);
        const decl = parser.parseDeclaration();
        assert.ok(decl);
        assert.strictEqual(decl.name, 'color');
    });

    test('Parser.parseDeclaration invalid returns null', () => {
        const tokens = tokenize('color');
        const parser = new Parser(tokens);
        const decl = parser.parseDeclaration();
        assert.strictEqual(decl, null);
    });

    test('Parser.parseStyleSheetContents', () => {
        const tokens = tokenize('div { color: red; }');
        const parser = new Parser(tokens);
        const rules = parser.parseStyleSheetContents();
        assert.strictEqual(rules.length, 1);
    });

    test('Parser.parseBlockContents', () => {
        const tokens = tokenize('color: red; margin: 0;');
        const parser = new Parser(tokens);
        const rules = parser.parseBlockContents();
        assert.ok(rules.length > 0);
    });
});
