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
import { CSSStyleRule, CSSStartingStyleRule, CSSViewTransitionRule } from '../src/index.ts';

test('Support @starting-style rule', () => {
  // css-transitions-2 #at-ruledef-starting-style
  const css = `
    .fade-in {
      opacity: 1;
      transition: opacity 1s;
      @starting-style {
        opacity: 0;
      }
    }
    
    @starting-style {
      .foo { color: red; }
      #bar { color: blue; }
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  
  // Rule 0: .fade-in
  const fadeInRule = stylesheet.cssRules[0] as unknown as CSSStyleRule;
  assert.strictEqual(fadeInRule.selectorText, '.fade-in');
  
  // @starting-style inside .fade-in
  const nestedStartingStyle = fadeInRule.cssRules[0] as unknown as CSSStartingStyleRule;
  assert.strictEqual(nestedStartingStyle.constructor.name, 'CSSStartingStyleRule');
  assert.strictEqual(nestedStartingStyle.cssRules.length, 1);
  assert.strictEqual((nestedStartingStyle.cssRules[0] as unknown as CSSStyleRule).style.getPropertyValue('opacity'), '0');
  
  // Top-level @starting-style
  const topLevelStartingStyle = stylesheet.cssRules[1] as unknown as CSSStartingStyleRule;
  assert.strictEqual(topLevelStartingStyle.constructor.name, 'CSSStartingStyleRule');
  assert.strictEqual(topLevelStartingStyle.cssRules.length, 2);
  assert.strictEqual((topLevelStartingStyle.cssRules[0] as unknown as CSSStyleRule).selectorText, '.foo');
  assert.strictEqual((topLevelStartingStyle.cssRules[1] as unknown as CSSStyleRule).selectorText, '#bar');
});

test('Support @view-transition rule', () => {
  // css-view-transitions-2 #at-view-transition-rule
  const css = `
    @view-transition {
      navigation: auto;
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  
  assert.strictEqual(stylesheet.cssRules.length, 1);
  const vtRule = stylesheet.cssRules[0];
  assert.strictEqual(vtRule.constructor.name, 'CSSViewTransitionRule');
  assert.strictEqual((vtRule as unknown as CSSViewTransitionRule).navigation, 'auto');
});

test('Support @view-transition with navigation: none', () => {
  // css-view-transitions-2 #at-view-transition-rule
  const css = `
    @view-transition {
      navigation: none;
    }
  `;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const vtRule = stylesheet.cssRules[0] as unknown as CSSViewTransitionRule;
  assert.strictEqual(vtRule.navigation, 'none');
});


