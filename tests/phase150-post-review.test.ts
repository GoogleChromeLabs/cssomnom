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
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { PropertyRegistry } from '../src/PropertyRegistry.ts';
import { getCascadedStyle } from '../src/cascade/index.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import '../src/parser.ts';

describe('Phase 150.1 post-review regressions', () => {
  it('multi-token registered custom property preserves whitespace on var() resolution', () => {
    PropertyRegistry.register({
      name: '--test-gap-star',
      syntax: '*',
      inherits: true,
      initialValue: '10px 20px',
    });

    PropertyRegistry.register({
      name: '--test-gap-len',
      syntax: '<length>+',
      inherits: true,
      initialValue: '10px 20px',
    });

    const { document } = parseHTML(`
      <style>
        #box {
          --res-star: var(--test-gap-star);
          --res-len: var(--test-gap-len);
          padding: var(--test-gap-star);
          margin: var(--test-gap-len);
        }
      </style>
      <div id="box"></div>
    `);
    const box = document.getElementById('box')!;
    const computed = getCascadedStyle(box);

    assert.strictEqual(computed.getPropertyValue('--res-star'), '10px 20px');
    assert.strictEqual(computed.getPropertyValue('--res-len'), '10px 20px');
    assert.strictEqual(computed.getPropertyValue('padding'), '10px 20px');
    assert.strictEqual(computed.getPropertyValue('margin'), '10px 20px');
  });

  it('CSSComputedStyleDeclaration shorthand getPropertyValue("margin") on margin: 0 returns "0px"', () => {
    const { document } = parseHTML(`
      <style>
        #zero { margin: 0; }
      </style>
      <div id="zero"></div>
    `);
    const zero = document.getElementById('zero')!;
    const computed = getCascadedStyle(zero);

    assert.strictEqual(computed.getPropertyValue('margin-top'), '0px');
    assert.strictEqual(computed.getPropertyValue('margin-right'), '0px');
    assert.strictEqual(computed.getPropertyValue('margin-bottom'), '0px');
    assert.strictEqual(computed.getPropertyValue('margin-left'), '0px');
    assert.strictEqual(computed.getPropertyValue('margin'), '0px');
  });

  it('CSSStyleDeclaration shorthand contraction with function values (calc, rgb)', () => {
    const style = new CSSStyleDeclaration();
    style.setProperty('margin-top', 'calc(10px + 5px)');
    style.setProperty('margin-right', 'calc(10px + 5px)');
    style.setProperty('margin-bottom', 'calc(10px + 5px)');
    style.setProperty('margin-left', 'calc(10px + 5px)');
    assert.strictEqual(style.getPropertyValue('margin'), 'calc(10px + 5px)');

    style.setProperty('border-top-color', 'rgb(255, 0, 0)');
    style.setProperty('border-right-color', 'rgb(255, 0, 0)');
    style.setProperty('border-bottom-color', 'rgb(255, 0, 0)');
    style.setProperty('border-left-color', 'rgb(255, 0, 0)');
    assert.strictEqual(style.getPropertyValue('border-color'), 'rgb(255, 0, 0)');
  });
});
