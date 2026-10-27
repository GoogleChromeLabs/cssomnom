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
import { CSS, parse, CSSAtRule, CSSStyleRule } from '../src/index.ts';
import {
  parseStylesheet,
  parseRuleList,
  parseRule,
  parseDeclaration,
  parseComponentValue,
  parseValue,
  parseValueList,
  parseCommaValueList,
  CSSParserAtRule,
  CSSParserDeclaration,
  CSSParserQualifiedRule,
  CSSParserFunction,
  CSSParserToken,
} from '../src/parser-api.ts';

describe('CSS Parser API', () => {
    test('parseStylesheet', async () => {
        const css = '@media all { div { color: red; } }';
        const rules = await parseStylesheet(css);
        
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.strictEqual(atRule.name, 'media');
        assert.ok(atRule.prelude.map(v => v.toString()).join('').includes('all'));
        assert.strictEqual(atRule.body?.length, 1);
        assert.ok(atRule.body?.[0] instanceof CSSParserQualifiedRule);
    });

    test('parseStylesheet (Async)', async () => {
        const css = 'div { color: blue; }';
        const rules = await parseStylesheet(css);
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserQualifiedRule);
        const decl = (rules[0] as CSSParserQualifiedRule).body[0];
        assert.ok(decl instanceof CSSParserDeclaration);
        assert.strictEqual(decl.name, 'color');
        const [kf] = await parseStylesheet('@keyframes spin { to { opacity: 0; } }');
        assert.strictEqual((kf as CSSParserAtRule).name, 'keyframes');
    });

    test('parseRule', () => {
        const css = 'div { color: green; }';
        const rule = parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('parseRule with leading whitespace', () => {
        const css = '  div { color: green; }';
        const rule = parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('parseRule with leading whitespace and at-rule', () => {
        const css = '  @media all { div { color: red; } }';
        const rule = parseRule(css);
        assert.ok(rule instanceof CSSParserAtRule);
        assert.strictEqual((rule as CSSParserAtRule).name, 'media');
    });

    test('parseRule with trailing garbage throws SyntaxError', () => {
        const css = 'div { color: green; } trailing garbage';
        assert.throws(() => {
            parseRule(css);
        }, (err: unknown) => err instanceof Error && err.name === 'SyntaxError');
    });

    test('parseDeclaration', () => {
        const css = 'color: red';
        const decl = parseDeclaration(css);
        assert.ok(decl instanceof CSSParserDeclaration);
        assert.strictEqual(decl?.name, 'color');
    });

    test('parseValue', () => {
        const css = 'red';
        const value = parseValue(css);
        assert.strictEqual(value.toString(), 'red');
    });

    test('parseValue with function', () => {
        const css = 'calc(10px + 20px)';
        const value = parseValue(css);
        assert.ok(value instanceof CSSParserFunction);
        const fn = value as CSSParserFunction;
        assert.strictEqual(fn.name, 'calc');
    });

    test('parseComponentValue', () => {
        const css = 'red';
        const value = parseComponentValue(css);
        assert.ok(value);
        assert.strictEqual(value.toString(), 'red');
    });

    test('parseComponentValue with function', () => {
        const css = 'calc(10px + 20px)';
        const value = parseComponentValue(css);
        assert.ok(value);
        assert.ok(value instanceof CSSParserFunction);
        const fn = value as CSSParserFunction;
        assert.strictEqual(fn.name, 'calc');
    });

    test('parseComponentValue with extra tokens throws SyntaxError', () => {
        const css = 'red blue';
        assert.throws(() => {
            parseComponentValue(css);
        }, (err: unknown) => err instanceof Error && err.name === 'SyntaxError');
    });

    test('parseCommaValueList', () => {
        const css = 'red, green, blue';
        const list = parseCommaValueList(css);
        assert.strictEqual(list.length, 3);
        assert.strictEqual(list[0][0].toString(), 'red');
        assert.strictEqual(list[1][0].toString(), 'green');
        assert.strictEqual(list[2][0].toString(), 'blue');
    });
    
    test('CSS unit factories are still available on W3C CSS', () => {
        const px = CSS.px(10);
        assert.strictEqual(px.value, 10);
        assert.strictEqual(px.unit, 'px');
        assert.strictEqual(px.toString(), '10px');
    });

    test('WICG Parser methods are not on W3C CSS namespace', () => {
        assert.strictEqual('parseStylesheet' in CSS, false);
        assert.strictEqual('parseRule' in CSS, false);
        assert.strictEqual('parseDeclaration' in CSS, false);
        assert.strictEqual('parseValue' in CSS, false);
        assert.strictEqual('parseComponentValue' in CSS, false);
        assert.strictEqual('parseCommaValueList' in CSS, false);
    });

    test('parseRule is synchronous', () => {
        const css = 'div { color: green; }';
        const rule = parseRule(css);
        assert.ok(rule instanceof CSSParserQualifiedRule);
    });

    test('parseDeclaration is synchronous', () => {
        const css = 'color: red';
        const decl = parseDeclaration(css);
        assert.ok(decl instanceof CSSParserDeclaration);
    });

    test('parseValue is synchronous', () => {
        const css = 'red';
        const value = parseValue(css);
        assert.ok(value instanceof CSSParserToken);
        assert.strictEqual(value.toString(), 'red');
    });

    test('parseValueList is synchronous', () => {
        const css = 'red blue';
        const list = parseValueList(css);
        assert.strictEqual(list.length, 3);
    });

    test('parseCommaValueList is synchronous', () => {
        const css = 'red, blue';
        const list = parseCommaValueList(css);
        assert.strictEqual(list.length, 2);
    });

    test('parseStylesheet still returns a Promise', () => {
        const css = 'div { color: blue; }';
        const result = parseStylesheet(css);
        assert.ok(result instanceof Promise);
    });

    test('parseRuleList still returns a Promise', () => {
        const css = 'div { color: blue; }';
        const result = parseRuleList(css);
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
        const rules = await parseStylesheet(stream);
        assert.strictEqual(rules.length, 1);
    });

    test('atRules option works for declaration block', async () => {
        const css = '@foo { color: red; }';
        const rules = await parseStylesheet(css, {
            atRules: { 'foo': 'declaration' }
        });
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.ok(atRule.body?.[0] instanceof CSSParserDeclaration);
    });

    test('atRules option works for rule block', async () => {
        const css = '@foo { div { color: red; } }';
        const rules = await parseStylesheet(css, {
            atRules: { 'foo': 'rule' }
        });
        assert.strictEqual(rules.length, 1);
        assert.ok(rules[0] instanceof CSSParserAtRule);
        const atRule = rules[0] as CSSParserAtRule;
        assert.ok(atRule.body?.[0] instanceof CSSParserQualifiedRule);
    });

    test('parse with atRules option returns CSSAtRule instance', () => {
        const cssDecl = '@foo { color: red; }';
        const sheetDecl = parse(cssDecl, { atRules: { foo: 'declaration' } });
        assert.strictEqual(sheetDecl.cssRules.length, 1);
        assert.ok(sheetDecl.cssRules[0] instanceof CSSAtRule);
        const atRuleDecl = sheetDecl.cssRules[0] as CSSAtRule;
        assert.strictEqual(atRuleDecl.name, 'foo');
        assert.ok(atRuleDecl.declarations && atRuleDecl.declarations.length === 1);
        assert.strictEqual(atRuleDecl.declarations[0].name, 'color');
        assert.strictEqual(atRuleDecl.declarations[0].value.length > 0, true);
        assert.strictEqual(atRuleDecl.declarations[0].important, false);
        assert.strictEqual(atRuleDecl.cssText.trim(), '@foo {\n  color: red;\n}');

        const cssRule = '@bar { div { color: red; } }';
        const sheetRule = parse(cssRule, { atRules: { bar: 'rule' } });
        assert.strictEqual(sheetRule.cssRules.length, 1);
        assert.ok(sheetRule.cssRules[0] instanceof CSSAtRule);
        const atRuleRule = sheetRule.cssRules[0] as CSSAtRule;
        assert.strictEqual(atRuleRule.name, 'bar');
        assert.ok(atRuleRule.childRules && atRuleRule.childRules.length === 1);
        assert.ok(atRuleRule.childRules[0] instanceof CSSStyleRule);
        assert.strictEqual((atRuleRule.childRules[0] as CSSStyleRule).selectorText, 'div');
        assert.strictEqual(atRuleRule.cssText.trim(), '@bar {\n  div { color: red; }\n}');
    });
});
