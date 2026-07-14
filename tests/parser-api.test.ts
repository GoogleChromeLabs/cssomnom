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
import { CSS } from '../src/index.ts';
import { CSSParserAtRule, CSSParserDeclaration, CSSParserQualifiedRule, CSSParserFunction, CSSParserToken } from '../src/parser-api.ts';

describe('CSS Parser API', () => {
    test('CSS.parseStylesheet', async () => {
        const css = '@media all { div { color: red; } }';
        const rules = await CSS.parseStylesheet(css);
        
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.strictEqual(atRule.name, 'media');
        assert.ok(atRule.prelude.map(v => v.toString()).join('').includes('all'));
        assert.strictEqual(atRule.body?.length, 1);
        assert.ok(atRule.body?.[0] instanceof CSSParserQualifiedRule);
    });

    test('CSS.parseStylesheet (Async)', async () => {
        const css = 'div { color: blue; }';
        const rules = await CSS.parseStylesheet(css);
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserQualifiedRule);
    });

    test('CSS.parseRule', () => {
        const css = 'div { color: green; }';
        const rule = CSS.parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('CSS.parseRule with leading whitespace', () => {
        const css = '  div { color: green; }';
        const rule = CSS.parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('CSS.parseRule with leading whitespace and at-rule', () => {
        const css = '  @media all { div { color: red; } }';
        const rule = CSS.parseRule(css);
        assert.ok(rule instanceof CSSParserAtRule);
        assert.strictEqual((rule as CSSParserAtRule).name, 'media');
    });

    test('CSS.parseRule with trailing garbage throws SyntaxError', () => {
        const css = 'div { color: green; } trailing garbage';
        assert.throws(() => {
            CSS.parseRule(css);
        }, (err: unknown) => err instanceof Error && err.name === 'SyntaxError');
    });



    test('CSS.parseDeclaration', () => {
        const css = 'color: red';
        const decl = CSS.parseDeclaration(css);
        assert.ok(decl instanceof CSSParserDeclaration);
        assert.strictEqual(decl?.name, 'color');
    });

    test('CSS.parseValue', () => {
        const css = 'red';
        const value = CSS.parseValue(css);
        assert.strictEqual(value.toString(), 'red');
    });

    test('CSS.parseValue with function', () => {
        const css = 'calc(10px + 20px)';
        const value = CSS.parseValue(css);
        assert.ok(value instanceof CSSParserFunction);
        const fn = value as CSSParserFunction;
        assert.strictEqual(fn.name, 'calc');
    });

    test('CSS.parseComponentValue', () => {
        const css = 'red';
        const value = CSS.parseComponentValue(css);
        assert.ok(value);
        assert.strictEqual(value.toString(), 'red');
    });

    test('CSS.parseComponentValue with function', () => {
        const css = 'calc(10px + 20px)';
        const value = CSS.parseComponentValue(css);
        assert.ok(value);
        assert.ok(value instanceof CSSParserFunction);
        const fn = value as CSSParserFunction;
        assert.strictEqual(fn.name, 'calc');
    });

    test('CSS.parseComponentValue with extra tokens throws SyntaxError', () => {
        const css = 'red blue';
        assert.throws(() => {
            CSS.parseComponentValue(css);
        }, (err: unknown) => err instanceof Error && err.name === 'SyntaxError');
    });


    test('CSS.parseCommaValueList', () => {
        const css = 'red, green, blue';
        const list = CSS.parseCommaValueList(css);
        assert.strictEqual(list.length, 3);
        assert.strictEqual(list[0][0].toString(), 'red');
        assert.strictEqual(list[1][0].toString(), 'green');
        assert.strictEqual(list[2][0].toString(), 'blue');
    });
    
    test('CSS unit factories are still available', () => {
        const px = CSS.px(10);
        assert.strictEqual(px.value, 10);
        assert.strictEqual(px.unit, 'px');
        assert.strictEqual(px.toString(), '10px');
    });

    test('parseRule is synchronous', () => {
        const css = 'div { color: green; }';
        const rule = CSS.parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('parseDeclaration is synchronous', () => {
        const css = 'color: red';
        const decl = CSS.parseDeclaration(css);
        assert.ok(decl instanceof CSSParserDeclaration);
    });

    test('parseValue is synchronous', () => {
        const css = 'red';
        const value = CSS.parseValue(css);
        assert.ok(value instanceof CSSParserToken);
        assert.strictEqual(value.toString(), 'red');
    });

    test('parseValueList is synchronous', () => {
        const css = 'red blue';
        const list = CSS.parseValueList(css);
        assert.strictEqual(list.length, 3);
    });

    test('parseCommaValueList is synchronous', () => {
        const css = 'red, blue';
        const list = CSS.parseCommaValueList(css);
        assert.strictEqual(list.length, 2);
    });

    test('Extra proprietary *Sync methods are removed from CSS object', () => {
        // @ts-expect-error - testing removal of proprietary API
        assert.strictEqual(CSS.parseRuleSync, undefined);
        // @ts-expect-error
        assert.strictEqual(CSS.parseDeclarationSync, undefined);
        // @ts-expect-error
        assert.strictEqual(CSS.parseValueSync, undefined);
    });

    test('parseStylesheet still returns a Promise', () => {
        const css = 'div { color: blue; }';
        const result = CSS.parseStylesheet(css);
        assert.ok(result instanceof Promise);
    });

    test('parseRuleList still returns a Promise', () => {
        const css = 'div { color: blue; }';
        const result = CSS.parseRuleList(css);
        assert.ok(result instanceof Promise);
    });

    test('parseStylesheet supports ReadableStream', async () => {
        const css = 'div { color: blue; }';
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(css));
                controller.close();
            }
        });
        const rules = await CSS.parseStylesheet(stream);
        assert.strictEqual(rules.length, 1);
    });

    test('atRules option works for declaration block', async () => {
        const css = '@foo { color: red; }';
        const rules = await CSS.parseStylesheet(css, {
            atRules: { 'foo': 'declaration' }
        });
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.ok(atRule.body?.[0] instanceof CSSParserDeclaration);
    });

    test('atRules option works for rule block', async () => {
        const css = '@foo { div { color: red; } }';
        const rules = await CSS.parseStylesheet(css, {
            atRules: { 'foo': 'rule' }
        });
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.ok(atRule.body?.[0] instanceof CSSParserQualifiedRule);
    });
});
