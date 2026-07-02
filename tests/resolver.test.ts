/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/index.ts';


test('resolveValue with var() fallbacks', () => {
  const css = `
    .foo {
      --bg: green;
      --text: white;
      background: var(--bg);
      color: var(--text, black);
      border-color: var(--missing, red);
      outline-color: var(--missing);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;
  
  assert.strictEqual(Parser.resolveVariables(style, 'background').trim(), 'green');
  assert.strictEqual(Parser.resolveVariables(style, 'color').trim(), 'white');
  assert.strictEqual(Parser.resolveVariables(style, 'border-color').trim(), 'red');
  assert.strictEqual(Parser.resolveVariables(style, 'outline-color').trim(), ''); // or 'unset'/'initial'?
});

test('resolveValue nested var()', () => {
  const css = `
    .bar {
      --a: var(--b, red);
      --b: blue;
      color: var(--a);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;
  
  assert.strictEqual(Parser.resolveVariables(style, 'color').trim(), 'blue');
});

test('resolveVariables with env()', () => {
  const css = `
    .env-test {
      margin-top: env(safe-area-inset-top);
      margin-bottom: env(safe-area-inset-bottom, 20px);
      padding: env(missing-var, 10px);
      width: env(viewport-segment-width 0 0, 100vw);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;
  
  const envMap = {
    'safe-area-inset-top': '10px',
    'safe-area-inset-bottom': '15px',
    'viewport-segment-width 0 0': '300px'
  };

  assert.strictEqual(Parser.resolveVariables(style, 'margin-top', envMap).trim(), '10px');
  assert.strictEqual(Parser.resolveVariables(style, 'margin-bottom', envMap).trim(), '15px');
  assert.strictEqual(Parser.resolveVariables(style, 'padding', envMap).trim(), '10px');
  assert.strictEqual(Parser.resolveVariables(style, 'width', envMap).trim(), '300px');
});

test('resolveVariables with mixed var() and env()', () => {
  const css = `
    .mixed {
      --padding: env(safe-area-inset-top, 5px);
      margin: var(--padding);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;
  
  const envMap = {
    'safe-area-inset-top': '12px'
  };

  assert.strictEqual(Parser.resolveVariables(style, 'margin', envMap).trim(), '12px');
});

test('resolveVariables with cached custom properties', () => {
  const css = `
    .cached {
      --color: blue;
      color: var(--color);
      background-color: var(--color);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;

  assert.strictEqual(Parser.resolveVariables(style, 'color').trim(), 'blue');
  assert.strictEqual(Parser.resolveVariables(style, 'background-color').trim(), 'blue');
});

test('resolveValue with var() cyclic dependencies and fallbacks', () => {
  const css = `
    .foo {
      --a: var(--b, fallback-a);
      --b: var(--a, fallback-b);
      color: var(--a);
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const style = rule.style;
  
  assert.strictEqual(Parser.resolveVariables(style, 'color').trim(), '');
});


