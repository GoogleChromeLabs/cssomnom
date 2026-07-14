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
import { Parser, parseStyleSheet } from '../src/parser.ts';
import { CSSNestedDeclarations } from '../src/index.ts';
import type { Declaration, Rule } from '../src/types.ts';
import { resolveNestedSelector } from '../src/cascade.ts';

import { parseHTML } from 'linkedom';

test('Cascade: Basic specificity', () => {
  const css = `
    div { color: blue; }
    .red { color: red; }
    #id { color: green; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div id="id" class="red"></div></body></html>');
  const el = document.getElementById('id');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'green');
});


test('Cascade: !important', () => {
  const css = `
    div { color: blue !important; }
    .red { color: red; }
    #id { color: green; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div id="id" class="red"></div></body></html>');
  const el = document.getElementById('id');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'blue');
});

test('Cascade: Order of appearance', () => {
  const css = `
    div { color: blue; }
    div { color: red; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'red');
});

test('Cascade: :has() support', () => {
  const css = `
    div:has(p) { color: blue; }
    div { color: red; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div><p></p></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'blue'); // div:has(p) (0,1,1) > div (0,0,1)
});

test('Cascade: :is() and :not() specificity', () => {
  const css = `
    :is(div, #id) { color: blue; }
    .red { color: red; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="red"></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'blue'); // :is(div, #id) (1,0,0) > .red (0,1,0)
});

test('Cascade: Nesting', () => {
  const css = `
    div {
      color: blue;
      .red { color: red; }
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div><span class="red"></span></div></body></html>');
  const el = document.querySelector('.red');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'red');
});

test('Cascade: Nesting specificity with MAX parent specificity', () => {
  const css = `
    .a, #b {
      :is(&.foo) { color: green; }
    }
    .bar { color: red; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="a foo bar"></div></body></html>');
  const el = document.querySelector('.a');

  const style = Parser.getCascadedStyle(el, rules);
  // Specificity of :is(&.foo) should be (1,1,0) because #b is (1,0,0) and .foo is (0,1,0).
  // Specificity of .bar is (0,1,0).
  // So :is(&.foo) should win over .bar.
  assert.strictEqual(style.color, 'green');
});

test('Cascade: Logical properties mapping', () => {
  const css = `
    div { margin-inline-start: 10px; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style['margin-left'], '10px');
});

test('Cascade: Logical properties mapping with vertical writing mode', () => {
  const css = `
    div { 
      writing-mode: vertical-rl;
      margin-inline-start: 10px; 
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style['margin-top'], '10px');
});

test('Cascade: CSSNestedDeclarations', () => {
  const css = `
    div {
      color: blue;
      @media (min-width: 0px) {
        span { color: red; }
      }
      background-color: green;
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div');

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.color, 'blue');
  assert.strictEqual(style['background-color'], 'green');
});

test('Cascade: CSSNestedDeclarations without Parent', () => {
  const decls: Declaration[] = [{ type: 'declaration', name: 'color', value: [{ type: 'ident', value: 'red' }], important: false }];
  const nestedDecls = new CSSNestedDeclarations(decls);
  
  const element = {
    matches(sel: string) {
      return sel === ':scope';
    }
  };
  
  const style = Parser.getCascadedStyle(element, [nestedDecls as unknown as Rule]);
  assert.strictEqual(style.color, 'red');
});

test('Cascade: Unparented & selector resolves to :where(:scope)', () => {
  const resolved = resolveNestedSelector('&', '');
  assert.strictEqual(resolved, ':where(:scope)');
});



