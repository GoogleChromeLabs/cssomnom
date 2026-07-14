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
