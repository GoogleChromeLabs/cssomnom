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
import { test } from 'node:test';
import assert from 'node:assert';
import { serialize } from '../src/serializer.ts';
import type { ComponentValue } from '../src/types.ts';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';

test('serialize identifier', () => {
  const cases: [string, string][] = [
    ['foo', 'foo'],
    ['123', '\\31 23'],
    ['-123', '-\\31 23'],
    ['-', '\\-'],
    ['_bar', '_bar'],
    ['foo bar', 'foo\\ bar'],
    ['NULL\0', 'NULL\uFFFD'],
  ];

  for (const [input, expected] of cases) {
    const nodes: ComponentValue[] = [{ type: 'ident', value: input }];
    assert.strictEqual(serialize(nodes), expected, `Failed for identifier: ${input}`);
  }
});

test('serialize string', () => {
  const cases: [string, string][] = [
    ['foo', '"foo"'],
    ['foo "bar"', '"foo \\"bar\\""'],
    ['foo \\ bar', '"foo \\\\ bar"'],
    ['newline\n', '"newline\\a "'],
  ];

  for (const [input, expected] of cases) {
    const nodes: ComponentValue[] = [{ type: 'string', value: input }];
    assert.strictEqual(serialize(nodes), expected, `Failed for string: ${input}`);
  }
});

test('serialize function', () => {
  const nodes: ComponentValue[] = [{
    type: 'function',
    name: 'FOO',
    value: [{ type: 'ident', value: 'bar' }]
  }];
  assert.strictEqual(serialize(nodes), 'foo(bar)');
});

test('serialize function preserving case', () => {
  const nodes: ComponentValue[] = [{
    type: 'function',
    name: 'URL',
    value: [{ type: 'string', value: 'https://example.com' }]
  }];
  assert.strictEqual(serialize(nodes, true), 'URL("https://example.com")');
});

test('serialize grouping rule (media)', () => {
  const css = '@media (min-width: 600px) { .bar { color: green; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  const rule = sheet.cssRules[0];
  
  const expected = '@media (min-width: 600px) {\n  .bar { color: green; }\n}';
  assert.strictEqual(rule.cssText, expected);
});

test('serialize keyframes rule', () => {
  const css = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  const rule = sheet.cssRules[0];
  
  const expected = '@keyframes spin {\n  0% { transform: rotate(0deg); }\n  100% { transform: rotate(360deg); }\n}';
  assert.strictEqual(rule.cssText, expected);
});

test('serialize nested grouping rules', () => {
  const css = '@media screen { @supports (display: flex) { .flex { display: flex; } } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  const rule = sheet.cssRules[0];
  
  const expected = '@media screen {\n  @supports (display: flex) {\n    .flex { display: flex; }\n  }\n}';
  assert.strictEqual(rule.cssText, expected);
});

test('serialize nested style rules', () => {
  const css = '.foo { color: red; .bar { color: blue; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const sheet = parser.parseStyleSheet();
  const rule = sheet.cssRules[0];
  
  const expected = '.foo {\n  color: red;\n  & .bar { color: blue; }\n}';
  assert.strictEqual(rule.cssText, expected);
});


