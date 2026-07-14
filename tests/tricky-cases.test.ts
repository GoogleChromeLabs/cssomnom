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
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSLayerBlockRule, CSSSupportsRule } from '../src/index.ts';

interface TestRule {
  type: string | number;
  cssText: string;
}

interface TestStyleRule extends TestRule {
  selectorText: string;
  style: { getPropertyValue(property: string): string };
  styleMap?: unknown;
  cssRules?: { length: number; item(index: number): unknown };
}


interface TestMediaRule extends TestRule {
  media: {
    mediaText: string;
  };
}

// Removed unused TestParser interface

test('Case 1: Feature Detection via @supports', () => {
  const css = `
    @supports (display: grid) {
      .container { display: grid; }
    }
    @supports not (display: grid) and (color: rebeccapurple) {
      .container { display: flex; }
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  // Find all @supports rules
  const supportsRules = Array.from(stylesheet.cssRules as unknown as ArrayLike<unknown>).filter((rule): rule is CSSSupportsRule => (rule as { constructor: { name: string } }).constructor.name === 'CSSSupportsRule' || (rule as { type: number }).type === 12);
  assert.strictEqual(supportsRules.length, 2);

  // Inspect condition text
  assert.strictEqual((supportsRules[0] as CSSSupportsRule).conditionText.trim(), '(display: grid)');
  assert.strictEqual((supportsRules[1] as CSSSupportsRule).conditionText.trim(), 'not (display: grid) and (color: rebeccapurple)');

  // Verify property/value pair inside
  const childRules = (supportsRules[0] as CSSSupportsRule).cssRules;
  assert.ok(childRules, 'Expected childRules to exist');
  assert.strictEqual(childRules.length, 1);
  const childRule = childRules[0] as CSSStyleRule;
  assert.strictEqual(childRule.type, 1);
  assert.strictEqual(childRule.selectorText.trim(), '.container');
  assert.strictEqual(childRule.style.getPropertyValue('display').trim(), 'grid');
});

// https://drafts.csswg.org/css-nesting-1/#nesting
test('Case 2: Native CSS Nesting', () => {
  const css = `
    .card {
      background: white;
      color: black;

      &.is-active {
        background: blue;
      }

      & .title {
        font-weight: bold;
      }

      @media (max-width: 400px) {
        padding: 10px;
      }
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  assert.strictEqual(stylesheet.cssRules.length, 1);
  const cardRule = stylesheet.cssRules[0] as unknown as TestStyleRule;
  assert.strictEqual(cardRule.selectorText.trim(), '.card');
  
  const cssRules = cardRule.cssRules;
  if (!cssRules) throw new Error('Expected cssRules to exist');
  assert.strictEqual(cssRules.length, 3);
  
  const rule1 = cssRules.item(0) as TestStyleRule;
  assert.strictEqual(rule1.selectorText.trim(), '&.is-active');
  
  const rule2 = cssRules.item(1) as TestStyleRule;
  assert.strictEqual(rule2.selectorText.trim(), '& .title');
  
  const rule3 = cssRules.item(2) as TestMediaRule;
  assert.strictEqual(rule3.type, 4);
  assert.strictEqual(rule3.media.mediaText, '(max-width: 400px)');
});

// https://drafts.csswg.org/css-variables-1/#using-variables
test('Case 3: CSS Variables with Fallbacks and Complex Values', () => {
  const css = `
    :root {
      --main-bg: #fff;
    }

    .button {
      /* Simple fallback */
      color: var(--text-color, #333);
      
      /* Nested var with fallback */
      background-color: var(--button-bg, var(--fallback-bg, #007bff));
      
      /* Complex value using Calc and Var */
      width: calc(100% - var(--spacing, 20px) * 2);
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  const buttonRule = Array.from(stylesheet.cssRules as unknown as TestRule[]).find((rule: TestRule): rule is TestStyleRule => rule.type === 1 && (rule as TestStyleRule).selectorText.trim() === '.button');
  assert.ok(buttonRule);

  // Verify that color uses a variable
  const colorValue = buttonRule.style.getPropertyValue('color');
  assert.match(colorValue, /var\(--text-color/);

  // Extract the fallback value of color (#333)
  assert.match(colorValue, /#333/);

  // For background-color, trace the fallback chain
  const bgValue = buttonRule.style.getPropertyValue('background-color');
  assert.match(bgValue, /var\(--button-bg/);
  assert.match(bgValue, /var\(--fallback-bg/);
  assert.match(bgValue, /#007bff/);

  // Identify that --spacing is used inside a calc() function
  const widthValue = buttonRule.style.getPropertyValue('width');
  assert.match(widthValue, /calc\(/);
  assert.match(widthValue, /var\(--spacing/);
});

test('Case 4: Modern Media Query Range Syntax', () => {
  const css = `
    @media (width >= 600px) and (width <= 1200px) {
      .content { font-size: 1.2rem; }
    }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();

  const mediaRule = stylesheet.cssRules[0] as unknown as TestMediaRule;
  assert.strictEqual(mediaRule.type, 4);
  
  // Parse conditions width >= 600px and width <= 1200px rather than just treating them as opaque strings.
  const mediaText = mediaRule.media.mediaText;
  assert.strictEqual(mediaText.trim(), '(width >= 600px) and (width <= 1200px)');
});

test('Case 5: CSS Layer Block Rule', () => {
  const css = '@layer components.card {}';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const rules = parser.parseStyleSheet().cssRules;
  const layerRule = Array.from(rules as unknown as ArrayLike<unknown>).find(r => (r as { constructor: { name: string } }).constructor.name === 'CSSLayerBlockRule' && (r as CSSLayerBlockRule).name === 'components.card') as CSSLayerBlockRule | undefined;
  assert.ok(layerRule);
});
