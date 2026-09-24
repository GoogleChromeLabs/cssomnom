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
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { Parser, parseStyleSheet } from '../src/parser.ts';

describe('Phase 149: HTML UA Stylesheet as a Real Cascade Origin', () => {
  it('applies UA stylesheet defaults to elements in the cascade without author rules', () => {
    const { document } = parseHTML('<html><body><p id="p">Hello</p><b id="b">Bold</b></body></html>');
    const p = document.getElementById('p');
    const b = document.getElementById('b');

    const pStyle = Parser.getCascadedStyle(p);
    assert.equal(pStyle.getPropertyValue('display'), 'block');
    assert.equal(pStyle.getPropertyValue('margin-block'), '1em');

    const bStyle = Parser.getCascadedStyle(b);
    assert.equal(bStyle.getPropertyValue('font-weight'), 'bolder');
  });

  it('allows author rules to override normal UA rules regardless of specificity', () => {
    const css = `
      p { display: inline; }
    `;
    const rules = parseStyleSheet(css);
    const { document } = parseHTML('<html><body><p id="p">Hello</p></body></html>');
    const p = document.getElementById('p');

    const style = Parser.getCascadedStyle(p, rules);
    assert.equal(style.getPropertyValue('display'), 'inline');
  });

  it('revert rolls back author declarations to the UA stylesheet value', () => {
    const css = `
      p { display: inline; }
      p.reverted { display: revert; }
    `;
    const rules = parseStyleSheet(css);
    const { document } = parseHTML('<html><body><p id="p" class="reverted">Hello</p></body></html>');
    const p = document.getElementById('p');

    const style = Parser.getCascadedStyle(p, rules);
    assert.equal(style.getPropertyValue('display'), 'block');
  });

  it('revert-layer rolls back to the UA stylesheet when no prior layers exist', () => {
    const css = `
      @layer base {
        p { display: inline; }
      }
      @layer overrides {
        p { display: revert-layer; }
      }
    `;
    const rules = parseStyleSheet(css);
    const { document } = parseHTML('<html><body><p id="p">Hello</p></body></html>');
    const p = document.getElementById('p');

    const style = Parser.getCascadedStyle(p, rules);
    // Overrides reverts to layer base, which is inline
    assert.equal(style.getPropertyValue('display'), 'inline');
  });

  it('important UA declarations override author declarations', () => {
    // In WHATWG HTML UA stylesheet, marquee has `overflow: hidden !important;`
    // which expands to overflow-x: hidden !important; overflow-y: hidden !important;
    const css = `
      marquee { overflow-x: visible; }
    `;
    const rules = parseStyleSheet(css);
    const { document } = parseHTML('<html><body><marquee id="m">Scrolling</marquee></body></html>');
    const m = document.getElementById('m');

    const style = Parser.getCascadedStyle(m, rules);
    assert.equal(style.getPropertyValue('overflow-x'), 'hidden');
  });
});
