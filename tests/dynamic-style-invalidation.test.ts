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
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { patchWindowInstance } from './dom-shim/src/dom-stubs.ts';

test('dynamic mutation of element.style.cssText updates getCascadedStyle live', () => {
  const html = '<div id="outer"><div id="inner"></div></div>';
  const dom = parseHTML(html);
  patchWindowInstance(dom.window, (w) => patchWindowInstance(w, () => {}));
  const { document, getComputedStyle } = dom.window;

  const outer = document.getElementById('outer')!;
  const inner = document.getElementById('inner')!;

  // 1. Initial state without style
  outer.style.cssText = '--x: red';
  inner.style.cssText = 'color: var(--x)';
  assert.strictEqual(getComputedStyle(inner).getPropertyValue('color'), 'rgb(255, 0, 0)');

  // 2. Mutate outer style to blue
  outer.style.cssText = '--x: blue';
  assert.strictEqual(getComputedStyle(inner).getPropertyValue('color'), 'rgb(0, 0, 255)');

  // 3. Clear outer style
  outer.style.cssText = '';
  assert.strictEqual(getComputedStyle(inner).getPropertyValue('color'), 'rgb(0, 0, 0)');

  // 4. Set custom property via setProperty
  outer.style.setProperty('--x', 'green');
  assert.strictEqual(getComputedStyle(inner).getPropertyValue('color'), 'rgb(0, 128, 0)');

  // 5. Remove custom property
  outer.style.removeProperty('--x');
  assert.strictEqual(getComputedStyle(inner).getPropertyValue('color'), 'rgb(0, 0, 0)');
});

test('revert fallback in custom property var(--unknown, revert) rolls back declaration', () => {
  const html = '<!DOCTYPE html><html><body><div id="target"></div></body></html>';
  const dom = parseHTML(html);
  patchWindowInstance(dom.window, (w) => patchWindowInstance(w, () => {}));
  const { document, getComputedStyle } = dom.window;

  const style = document.createElement('style');
  style.textContent = `
    body.revert-test {
      --x: FAIL;
      margin: -1px;
      display: grid;

      --x: var(--unknown, revert);
      margin: var(--unknown, revert);
      display: var(--unknown, revert);
    }
  `;
  document.head.appendChild(style);

  const initialDisplay = getComputedStyle(document.body).getPropertyValue('display');
  const initialMargin = getComputedStyle(document.body).getPropertyValue('margin');
  assert.strictEqual(initialDisplay, 'block');
  assert.strictEqual(initialMargin, '8px');

  document.body.classList.add('revert-test');

  // Custom property rolls back to empty (no parent declaration)
  assert.strictEqual(getComputedStyle(document.body).getPropertyValue('--x'), '');

  // Shorthand margin rolls back to UA default 8px
  assert.strictEqual(getComputedStyle(document.body).getPropertyValue('margin'), initialMargin);
  assert.strictEqual(getComputedStyle(document.body).getPropertyValue('margin-left'), initialMargin);

  // Longhand display rolls back to UA default block
  assert.strictEqual(getComputedStyle(document.body).getPropertyValue('display'), initialDisplay);
});

test('revert fallback in custom property inherits from parent when parent has value', () => {
  const html = '<div id="parent"><div id="child"></div></div>';
  const dom = parseHTML(html);
  patchWindowInstance(dom.window, (w) => patchWindowInstance(w, () => {}));
  const { document, getComputedStyle } = dom.window;

  const parent = document.getElementById('parent')!;
  const child = document.getElementById('child')!;

  parent.style.cssText = '--color: purple';
  child.style.cssText = '--color: red; color: var(--color); --color: var(--missing, revert)';

  // Child --color rolls back to parent value "purple"
  assert.strictEqual(getComputedStyle(child).getPropertyValue('--color'), 'purple');
  assert.strictEqual(getComputedStyle(child).getPropertyValue('color'), 'rgb(128, 0, 128)');
});
