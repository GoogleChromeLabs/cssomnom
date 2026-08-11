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
import { getCascadedStyle } from '../src/cascade.ts';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import type { Rule } from '../src/types.ts';

test('getCascadedStyle retains logical properties in output', () => {
  const css = '.test { margin-inline-start: 10px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  const element = { matches: (sel: string) => sel === '.test' };
  const style = getCascadedStyle(element, stylesheet.cssRules as unknown as Rule[]);
  
  assert.strictEqual(style.getPropertyValue('margin-left'), '10px');
  // This is the expected behavior from Phase 57 task 2
  assert.strictEqual(style.getPropertyValue('margin-inline-start'), '10px');
});

test('getCascadedStyle resolves logical properties based on writing-mode', () => {
  const css = '.test { writing-mode: vertical-rl; margin-inline-start: 10px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  const element = { matches: (sel: string) => sel === '.test' };
  const style = getCascadedStyle(element, stylesheet.cssRules as unknown as Rule[]);
  
  // In vertical-rl, inline-start is top.
  assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
  assert.strictEqual(style.getPropertyValue('margin-inline-start'), '10px');
  assert.strictEqual(style.getPropertyValue('margin-left'), '');
});

test('text-orientation: upright forces direction to ltr in vertical writing modes', () => {
  const css = '.test { writing-mode: vertical-rl; text-orientation: upright; direction: rtl; margin-inline-start: 10px; }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  const element = { matches: (sel: string) => sel === '.test' };
  const style = getCascadedStyle(element, stylesheet.cssRules as unknown as Rule[]);
  
  // vertical-rl + ltr (forced by text-orientation: upright) -> inline-start is top.
  assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
  assert.strictEqual(style.getPropertyValue('margin-bottom'), '');
});

test('getCascadedStyle inherits writing-mode and direction from parent element', () => {
  const css = `
    .parent { writing-mode: vertical-rl; direction: ltr; }
    .child { margin-inline-start: 10px; }
  `;
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  interface MockElement {
    matches: (sel: string) => boolean;
    parentElement: MockElement | null;
  }
  const parentEl: MockElement = {
    matches: (sel: string) => sel === '.parent',
    parentElement: null
  };
  const childEl: MockElement = {
    matches: (sel: string) => sel === '.child',
    parentElement: parentEl
  };
  
  const rules = stylesheet.cssRules as unknown as Rule[];
  const childStyle = getCascadedStyle(childEl, rules);
  
  // child should inherit writing-mode: vertical-rl from parentEl, mapping inline-start to margin-top
  assert.strictEqual(childStyle.getPropertyValue('margin-top'), '10px');
  assert.strictEqual(childStyle.getPropertyValue('margin-left'), '');
});

