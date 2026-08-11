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
import { parseHTML } from 'linkedom';
import { parseStyleSheet } from '../src/parser.ts';
import { getCascadedStyle, normalizeComputedColor } from '../src/cascade.ts';

test('normalizeComputedColor: named colors and transparent', () => {
  // css-color-4 § 15 #named-colors
  assert.strictEqual(normalizeComputedColor('lime'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('lime '), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('blue'), 'rgb(0, 0, 255)');
  assert.strictEqual(normalizeComputedColor('red'), 'rgb(255, 0, 0)');
  assert.strictEqual(normalizeComputedColor('green'), 'rgb(0, 128, 0)');
  assert.strictEqual(normalizeComputedColor('white'), 'rgb(255, 255, 255)');
  assert.strictEqual(normalizeComputedColor('black'), 'rgb(0, 0, 0)');
  assert.strictEqual(normalizeComputedColor('coral'), 'rgb(255, 127, 80)');
  assert.strictEqual(normalizeComputedColor('rebeccapurple'), 'rgb(102, 51, 153)');
  assert.strictEqual(normalizeComputedColor('transparent'), 'rgba(0, 0, 0, 0)');
});

test('normalizeComputedColor: hex colors', () => {
  // css-color-4 § 4.2 #hex-notation
  assert.strictEqual(normalizeComputedColor('#fff'), 'rgb(255, 255, 255)');
  assert.strictEqual(normalizeComputedColor('#0f0'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('#00ff00'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('#0000'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(normalizeComputedColor('#00000000'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(normalizeComputedColor('#f00f'), 'rgb(255, 0, 0)');
  assert.strictEqual(normalizeComputedColor('#00ff00ff'), 'rgb(0, 255, 0)');
});

test('normalizeComputedColor: functional rgb, rgba, hsl, hsla colors', () => {
  // css-color-4 § 4.1 & § 4.3
  assert.strictEqual(normalizeComputedColor('rgb( 0 , 255 , 0 )'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('rgb(0 255 0)'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('rgba(0, 0, 0, 0)'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(normalizeComputedColor('hsl(120, 100%, 50%)'), 'rgb(0, 255, 0)');
  assert.strictEqual(normalizeComputedColor('hsl(0, 0%, 100%)'), 'rgb(255, 255, 255)');
});

test('getCascadedStyle normalizes colors and resolves defaults', () => {
  // cssom-1 § 6.8 #resolved-values
  // css-cascade-5 § 7.2 #computed-values
  const css = `
    .box {
      color: lime;
      background-color: #0000;
      border-color: blue;
      --theme: coral;
    }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="box"></div><div class="empty"></div></body></html>');
  const box = document.querySelector('.box')!;
  const empty = document.querySelector('.empty')!;

  const boxStyle = getCascadedStyle(box, rules);
  assert.strictEqual(boxStyle.getPropertyValue('color'), 'rgb(0, 255, 0)');
  assert.strictEqual(boxStyle.color, 'rgb(0, 255, 0)');
  assert.strictEqual(boxStyle.getPropertyValue('background-color'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(boxStyle.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.strictEqual(boxStyle.getPropertyValue('backgroundColor'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(boxStyle.getPropertyValue('border-color'), 'rgb(0, 0, 255)');
  assert.strictEqual(boxStyle.getPropertyValue('--theme'), 'coral');

  // Empty element defaults
  const emptyStyle = getCascadedStyle(empty, rules);
  assert.strictEqual(emptyStyle.getPropertyValue('background-color'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(emptyStyle.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.strictEqual(emptyStyle.getPropertyValue('backgroundColor'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(emptyStyle.getPropertyValue('color'), 'rgb(0, 0, 0)');
  assert.strictEqual(emptyStyle.color, 'rgb(0, 0, 0)');
});

test('getCascadedStyle inherits color from parent', () => {
  const css = `
    .parent { color: lime; }
  `;
  const rules = parseStyleSheet(css);
  const { document } = parseHTML('<html><body><div class="parent"><span class="child"></span></div></body></html>');
  const child = document.querySelector('.child')!;

  const childStyle = getCascadedStyle(child, rules);
  assert.strictEqual(childStyle.getPropertyValue('color'), 'rgb(0, 255, 0)');
  assert.strictEqual(childStyle.color, 'rgb(0, 255, 0)');
  assert.strictEqual(childStyle.getPropertyValue('background-color'), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(childStyle.backgroundColor, 'rgba(0, 0, 0, 0)');
});
