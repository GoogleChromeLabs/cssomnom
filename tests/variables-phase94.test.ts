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
import { getCascadedStyle } from '../src/cascade.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';

describe('Phase 94: CSS Variables 1 Cascade, Cycle Detection & revert/revert-layer Fallbacks', () => {
  describe('1. revert, revert-layer, and revert-rule in var() fallbacks', () => {
    it('rolls back to UA default/inherited value when var() fallback is revert', () => {
      const html = `
        <html>
          <head>
            <style>
              body.revert {
                --x: FAIL;
                margin: -1px;
                display: grid;
                --x: var(--unknown, revert);
                margin: var(--unknown, revert);
                display: var(--unknown, revert);
              }
            </style>
          </head>
          <body class="revert"></body>
        </html>
      `;
      const dom = parseHTML(html);
      const body = dom.document.body;
      const cascaded = getCascadedStyle(body);

      // Custom property has no UA default, so rolls back to empty string
      assert.equal(cascaded.getPropertyValue('--x'), '');
      // margin rolls back to UA default (8px)
      assert.equal(cascaded.getPropertyValue('margin'), '8px');
      // display rolls back to UA default (block)
      assert.equal(cascaded.getPropertyValue('display'), 'block');
    });

    it('rolls back to previous layer when var() fallback is revert-layer', () => {
      const html = `
        <html>
          <head>
            <style>
              @layer a {
                #child {
                  --x: PASS;
                  margin: 1px;
                  padding-left: 1px;
                }
              }
              @layer b {
                #parent {
                  --x: FAIL;
                  margin: -1px;
                  padding-left: -1px;
                }
                #child {
                  --x: var(--unknown, revert-layer);
                  margin: var(--unknown, revert-layer);
                  padding-left: var(--unknown, revert-layer);
                }
              }
            </style>
          </head>
          <body>
            <div id="parent"><div id="child"></div></div>
          </body>
        </html>
      `;
      const dom = parseHTML(html);
      const child = dom.document.getElementById('child');
      const cascaded = getCascadedStyle(child);

      assert.equal(cascaded.getPropertyValue('--x'), 'PASS');
      assert.equal(cascaded.getPropertyValue('margin'), '1px');
      assert.equal(cascaded.getPropertyValue('padding-left'), '1px');
    });

    it('rolls back to earlier rule when var() fallback is revert-rule', () => {
      const html = `
        <html>
          <head>
            <style>
              #child {
                --x: PASS;
                margin: 1px;
                padding-left: 1px;
              }
              #parent {
                --x: FAIL;
                margin: -1px;
                padding-left: -1px;
              }
              #child {
                --x: var(--unknown, revert-rule);
                margin: var(--unknown, revert-rule);
                padding-left: var(--unknown, revert-rule);
              }
            </style>
          </head>
          <body>
            <div id="parent"><div id="child"></div></div>
          </body>
        </html>
      `;
      const dom = parseHTML(html);
      const child = dom.document.getElementById('child');
      const cascaded = getCascadedStyle(child);

      assert.equal(cascaded.getPropertyValue('--x'), 'PASS');
      assert.equal(cascaded.getPropertyValue('margin'), '1px');
      assert.equal(cascaded.getPropertyValue('padding-left'), '1px');
    });
  });

  describe('2. Empty custom property whitespace preservation', () => {
    it('preserves single space for empty custom properties in CSSStyleDeclaration', () => {
      const decl = new CSSStyleDeclaration();
      decl.cssText = '--var: ';
      assert.equal(decl.getPropertyValue('--var'), ' ');

      decl.cssText = '--var:  ';
      assert.equal(decl.getPropertyValue('--var'), ' ');

      decl.cssText = '--var:value; --var:;';
      assert.equal(decl.getPropertyValue('--var'), ' ');

      decl.cssText = '--var:value; --var: ;';
      assert.equal(decl.getPropertyValue('--var'), ' ');
    });

    it('ignores invalid custom property names with single dash', () => {
      const decl = new CSSStyleDeclaration();
      decl.cssText = '--:value; -var4:value3';
      assert.equal(decl.getPropertyValue('--'), '');
      assert.equal(decl.getPropertyValue('--var4'), '');
    });
  });

  describe('3. Reference graph cycle detection', () => {
    it('evaluates self-cycles to guaranteed-invalid', () => {
      const html = `<html><body><div id="target" style="--a: var(--a); --sanity: valid;"></div></body></html>`;
      const dom = parseHTML(html);
      const target = dom.document.getElementById('target');
      const cascaded = getCascadedStyle(target);

      assert.equal(cascaded.getPropertyValue('--a'), '');
      assert.equal(cascaded.getPropertyValue('--sanity'), 'valid');
    });

    it('evaluates 2-node cycles to guaranteed-invalid', () => {
      const html = `<html><body><div id="target" style="--a: var(--b); --b: var(--a); --sanity: valid;"></div></body></html>`;
      const dom = parseHTML(html);
      const target = dom.document.getElementById('target');
      const cascaded = getCascadedStyle(target);

      assert.equal(cascaded.getPropertyValue('--a'), '');
      assert.equal(cascaded.getPropertyValue('--b'), '');
      assert.equal(cascaded.getPropertyValue('--sanity'), 'valid');
    });

    it('evaluates 3-node cycles with fallbacks to guaranteed-invalid', () => {
      const html = `<html><body><div id="target" style="--a: var(--b, cycle); --b: var(--c, cycle); --c: var(--a, cycle); --sanity: valid;"></div></body></html>`;
      const dom = parseHTML(html);
      const target = dom.document.getElementById('target');
      const cascaded = getCascadedStyle(target);

      assert.equal(cascaded.getPropertyValue('--a'), '');
      assert.equal(cascaded.getPropertyValue('--b'), '');
      assert.equal(cascaded.getPropertyValue('--c'), '');
      assert.equal(cascaded.getPropertyValue('--sanity'), 'valid');
    });

    it('allows non-cyclic properties referencing cyclic properties to use fallbacks', () => {
      const html = `<html><body><div id="target" style="--x: var(--y, valid); --y: var(--a, valid); --a: var(--b, cycle); --b: var(--c, cycle); --c: var(--a, cycle); --sanity: valid;"></div></body></html>`;
      const dom = parseHTML(html);
      const target = dom.document.getElementById('target');
      const cascaded = getCascadedStyle(target);

      assert.equal(cascaded.getPropertyValue('--a'), '');
      assert.equal(cascaded.getPropertyValue('--b'), '');
      assert.equal(cascaded.getPropertyValue('--c'), '');
      assert.equal(cascaded.getPropertyValue('--x'), 'valid');
      assert.equal(cascaded.getPropertyValue('--y'), 'valid');
      assert.equal(cascaded.getPropertyValue('--sanity'), 'valid');
    });

    it('does not trigger cycles in unused fallbacks', () => {
      const html = `<html><body><div id="target" style="--x: var(--a, valid); --a: var(--y, var(--b, cycle)); --b: var(--y, var(--c, cycle)); --c: var(--y, var(--a, cycle)); --y: valid; --sanity: valid;"></div></body></html>`;
      const dom = parseHTML(html);
      const target = dom.document.getElementById('target');
      const cascaded = getCascadedStyle(target);

      assert.equal(cascaded.getPropertyValue('--a'), 'valid');
      assert.equal(cascaded.getPropertyValue('--b'), 'valid');
      assert.equal(cascaded.getPropertyValue('--c'), 'valid');
      assert.equal(cascaded.getPropertyValue('--x'), 'valid');
      assert.equal(cascaded.getPropertyValue('--y'), 'valid');
    });
  });

  describe('4. SVG presentation attribute variable substitution and cascade', () => {
    it('substitutes variables in SVG presentation attributes', () => {
      const html = `
        <html>
          <body style="--prop: 20px;">
            <svg id="svg" width="300px" height="100px">
              <rect id="box1" stroke-width="var(--stroke1)" style="--stroke1: 10px"></rect>
              <rect id="box2" stroke-width="var(--prop)"></rect>
            </svg>
          </body>
        </html>
      `;
      const dom = parseHTML(html);
      const box1 = dom.document.getElementById('box1');
      const box2 = dom.document.getElementById('box2');

      const cs1 = getCascadedStyle(box1);
      assert.equal(cs1.getPropertyValue('stroke-width'), '10px');

      const cs2 = getCascadedStyle(box2);
      assert.equal(cs2.getPropertyValue('stroke-width'), '20px');
    });

    it('returns standard default values for SVG presentation attributes when unassigned', () => {
      const html = `
        <html>
          <body>
            <svg id="svg">
              <rect id="rect"></rect>
            </svg>
          </body>
        </html>
      `;
      const dom = parseHTML(html);
      const rect = dom.document.getElementById('rect');
      const cs = getCascadedStyle(rect);

      assert.equal(cs.getPropertyValue('alignment-baseline'), 'baseline');
      assert.equal(cs.getPropertyValue('baseline-shift'), '0');
      assert.equal(cs.getPropertyValue('clip-rule'), 'nonzero');
      assert.equal(cs.getPropertyValue('fill'), 'black');
      assert.equal(cs.getPropertyValue('stroke-width'), '1px');
      assert.equal(cs.getPropertyValue('display'), 'inline');
    });
  });
});
