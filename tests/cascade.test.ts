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
  assert.strictEqual(style.color, 'rgb(0, 128, 0)');
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
  assert.strictEqual(style.color, 'rgb(0, 0, 255)');
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
  assert.strictEqual(style.color, 'rgb(255, 0, 0)');
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
  assert.strictEqual(style.color, 'rgb(0, 0, 255)'); // div:has(p) (0,1,1) > div (0,0,1)
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
  assert.strictEqual(style.color, 'rgb(0, 0, 255)'); // :is(div, #id) (1,0,0) > .red (0,1,0)
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
  assert.strictEqual(style.color, 'rgb(255, 0, 0)');
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
  assert.strictEqual(style.color, 'rgb(0, 128, 0)');
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
  assert.strictEqual(style.color, 'rgb(0, 0, 255)');
  assert.strictEqual(style['background-color'], 'rgb(0, 128, 0)');
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
  assert.strictEqual(style.color, 'rgb(255, 0, 0)');
});

test('Cascade: Unparented & selector resolves to :where(:scope)', () => {
  const resolved = resolveNestedSelector('&', '');
  assert.strictEqual(resolved, ':where(:scope)');
});

test('Cascade: Cascade layers (@layer) normal order (later layer wins)', () => {
  const css = `
    @layer base, special;
    @layer special {
      div { color: green; }
    }
    @layer base {
      div { color: red; }
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(0, 128, 0)');
});

test('Cascade: Cascade layers (@layer) !important reverse layer order (earlier layer wins)', () => {
  const css = `
    @layer base, special;
    @layer special {
      div { color: green !important; }
    }
    @layer base {
      div { color: red !important; }
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(255, 0, 0)');
});

test('Cascade: Unlayered rules beat layered rules in normal cascade', () => {
  const css = `
    @layer special {
      div { color: green; }
    }
    div { color: blue; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div></div></body></html>');
  const el = document.querySelector('div')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(0, 0, 255)');
});

test('Cascade: Inline style overrides stylesheet rules', () => {
  const css = `
    #id.foo { color: blue; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div id="id" class="foo" style="color: pink;"></div></body></html>');
  const el = document.querySelector('div')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(255, 192, 203)');
});

test('Cascade: CSS Variables inheritance and var() substitution', () => {
  const css = `
    :root {
      --primary-color: orange;
      --font-size: 20px;
    }
    .child {
      color: var(--primary-color);
      font-size: var(--font-size);
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="parent"><span class="child"></span></div></body></html>');
  const child = document.querySelector('.child')!;

  const style = Parser.getCascadedStyle(child, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(255, 165, 0)');
  assert.strictEqual(style.getPropertyValue('font-size'), '20px');
  assert.strictEqual(style.getPropertyValue('--primary-color'), 'orange');
});

test('Cascade: CSS Variables fallback substitution', () => {
  const css = `
    .box {
      color: var(--undefined-var, purple);
      background-color: var(--undefined-1, var(--undefined-2, teal));
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="box"></div></body></html>');
  const el = document.querySelector('.box')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(128, 0, 128)');
  assert.strictEqual(style.getPropertyValue('background-color'), 'rgb(0, 128, 128)');
});

test('Cascade: CSS Variables circular reference is invalid at computed value time', () => {
  const css = `
    .circle {
      --a: var(--b);
      --b: var(--a);
      color: var(--a);
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="circle"></div></body></html>');
  const el = document.querySelector('.circle')!;

  const style = Parser.getCascadedStyle(el, rules);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(0, 0, 0)');
});

test('Cascade: Automatic stylesheet extraction from document.styleSheets', () => {
  const html = `
    <html>
      <head>
        <style>
          .auto-test { color: darkblue; }
        </style>
      </head>
      <body>
        <div class="auto-test"></div>
      </body>
    </html>
  `;
  const { document } = parseHTML(html);
  const el = document.querySelector('.auto-test')!;

  const style = Parser.getCascadedStyle(el);
  assert.strictEqual(style.getPropertyValue('color'), 'rgb(0, 0, 139)');
});
