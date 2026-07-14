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
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSNestedDeclarations } from '../src/index.ts';

test('Nested @supports rule', () => {
  const css = `
    .foo {
      color: red;
      @supports (display: grid) {
        display: grid;
      }
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.selectorText, '.foo');
  
  // color: red is a leading declaration, so it goes to rule.style
  assert.strictEqual(rule.style.getPropertyValue('color').trim(), 'red');
  
  // Only the @supports rule is in cssRules
  assert.strictEqual(rule.cssRules.length, 1);
  const nestedSupports = rule.cssRules[0];
  assert.strictEqual(nestedSupports.constructor.name, 'CSSSupportsRule');
  assert.strictEqual((nestedSupports as CSSSupportsRule).conditionText, '(display: grid)');
});

test('Nested @container rule', () => {
  const css = `
    .main {
      container-type: inline-size;
      @container (min-width: 500px) {
        .card { padding: 2rem; }
      }
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  assert.strictEqual(rule.style.getPropertyValue('container-type').trim(), 'inline-size');
  
  assert.strictEqual(rule.cssRules.length, 1);
  const nestedContainer = rule.cssRules[0];
  assert.strictEqual(nestedContainer.constructor.name, 'CSSContainerRule');
  assert.strictEqual((nestedContainer as CSSContainerRule).containerQuery, '(min-width: 500px)');
});

test('Nested @layer rule', () => {
  const css = `
    .base {
      @layer utilities {
        .margin-top-10 { margin-top: 10px; }
      }
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  
  assert.strictEqual(rule.cssRules.length, 1); // color was not set, only @layer
  const nestedLayer = rule.cssRules[0];
  assert.strictEqual(nestedLayer.constructor.name, 'CSSLayerBlockRule');
  assert.strictEqual((nestedLayer as CSSLayerBlockRule).name, 'utilities');
});

test('Intermingled declarations and nested at-rules', () => {
  const css = `
    .mixed {
      color: blue;
      @media (min-width: 100px) { width: 100%; }
      background: green;
      @supports (display: grid) { display: grid; }
      border: 1px solid black;
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  
  assert.strictEqual(rule.style.getPropertyValue('color').trim(), 'blue');
  
  // cssRules should contain:
  // 1. @media
  // 2. CSSNestedDeclarations (background: green)
  // 3. @supports
  // 4. CSSNestedDeclarations (border: 1px solid black)
  assert.strictEqual(rule.cssRules.length, 4);
  
  assert.strictEqual(rule.cssRules[0].constructor.name, 'CSSMediaRule');
  assert.strictEqual(rule.cssRules[1].constructor.name, 'CSSNestedDeclarations');
  assert.strictEqual((rule.cssRules[1] as CSSNestedDeclarations).style.getPropertyValue('background').trim(), 'green');
  assert.strictEqual(rule.cssRules[2].constructor.name, 'CSSSupportsRule');
  assert.strictEqual(rule.cssRules[3].constructor.name, 'CSSNestedDeclarations');
  assert.strictEqual((rule.cssRules[3] as CSSNestedDeclarations).style.getPropertyValue('border').trim(), '1px solid black');
});
