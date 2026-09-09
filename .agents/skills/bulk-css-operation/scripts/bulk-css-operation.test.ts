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
import { verifyStylesheetParity } from './verify-parity.ts';
import { verifyCascadeOrder } from './verify-cascade.ts';
import { sampleDomParity } from './sample-dom.ts';
import type { DOMElement } from '../../../../src/matcher.ts';

describe('bulk-css-operation: verification scripts', () => {
  describe('Level 1: verifyStylesheetParity', () => {
    it('passes on identical stylesheets regardless of rule reordering or whitespace', () => {
      const before = `
        /* Monolithic original */
        .btn {
          color: red;
          padding: 8px 16px;
        }
        @media (min-width: 768px) {
          .container { max-width: 720px; }
        }
        h1 { font-size: 2rem; margin: 0; }
      `;

      // Split into 2 modular files, different order
      const file1 = `
        h1 { font-size: 2rem; margin: 0; }
        @media (min-width: 768px) {
          .container { max-width: 720px; }
        }
      `;
      const file2 = `
        .btn {
          color: red;
          padding: 8px 16px;
        }
      `;

      const result = verifyStylesheetParity(before, [file1, file2]);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
      assert.equal(result.beforeCount, 3);
      assert.equal(result.afterCount, 3);
    });

    it('detects dropped rules during refactor', () => {
      const before = `
        .card { border: 1px solid #ccc; }
        .card-header { font-weight: bold; }
      `;
      const after = `
        .card { border: 1px solid #ccc; }
      `;

      const result = verifyStylesheetParity(before, after);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('MISSING RULE') && e.includes('.card-header')));
    });

    it('detects altered declaration values and priority flags', () => {
      const before = `
        .alert { color: red !important; display: block; }
      `;
      const after = `
        .alert { color: red; display: flex; }
      `;

      const result = verifyStylesheetParity(before, after);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes("property 'color'") && e.includes('important')));
      assert.ok(result.errors.some(e => e.includes("property 'display'") && e.includes('block') && e.includes('flex')));
    });

    it('detects extra unexpected rules added to refactored CSS', () => {
      const before = `.a { color: red; }`;
      const after = `.a { color: red; } .b { color: blue; }`;

      const result = verifyStylesheetParity(before, after);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('UNEXPECTED RULE') && e.includes('.b')));
    });
  });

  describe('Level 2: verifyCascadeOrder', () => {
    it('passes when rule order between competing selectors is preserved', () => {
      const before = `
        .btn { color: blue; }
        .btn-primary { color: red; }
      `;
      const after = `
        .btn { color: blue; }
        .btn-primary { color: red; }
      `;

      const result = verifyCascadeOrder(before, after);
      assert.equal(result.valid, true);
      assert.equal(result.conflicts.length, 0);
    });

    it('flags cascade inversion when competing rules with same specificity swap order', () => {
      const before = `
        .btn { color: blue; }
        .btn-primary { color: red; }
      `;
      // Inverted order in modular split!
      const after = `
        .btn-primary { color: red; }
        .btn { color: blue; }
      `;

      const result = verifyCascadeOrder(before, after);
      assert.equal(result.valid, false);
      assert.equal(result.conflicts.length, 1);
      assert.equal(result.conflicts[0].selectorA, '.btn');
      assert.equal(result.conflicts[0].selectorB, '.btn-primary');
      assert.ok(result.conflicts[0].description.includes('Cascade inversion'));
    });

    it('does not flag reordering when rules do not share properties or have different specificity', () => {
      const before = `
        .btn { color: blue; }
        #main-button { color: red; }
        .nav { padding: 10px; }
      `;
      // Swapped .nav and #main-button (different specificity, no shared props with .btn)
      const after = `
        .nav { padding: 10px; }
        .btn { color: blue; }
        #main-button { color: red; }
      `;

      const result = verifyCascadeOrder(before, after);
      assert.equal(result.valid, true);
    });
  });

  describe('Level 3: sampleDomParity', () => {
    it('verifies computed style parity on synthetic DOM elements', () => {
      const before = `
        button { background: white; }
        .btn { color: blue; padding-top: 10px; }
        .btn-danger { color: red; }
      `;
      const after = `
        button { background: white; }
        .btn { color: blue; padding-top: 10px; }
        .btn-danger { color: red; }
      `;

      const element: DOMElement = {
        nodeType: 1,
        tagName: 'BUTTON',
        localName: 'button',
        className: 'btn btn-danger',
        classList: { contains: (c: string) => ['btn', 'btn-danger'].includes(c) },
        getAttribute: (attr: string) => (attr === 'class' ? 'btn btn-danger' : null),
        hasAttribute: (attr: string) => attr === 'class',
        ownerDocument: { contentType: 'text/html' } as unknown as Document,
      };

      const result = sampleDomParity([element], before, after);
      assert.equal(result.valid, true);
      assert.equal(result.differences.length, 0);
      assert.equal(result.totalElementsTested, 1);
    });

    it('detects computed style discrepancy when refactored CSS alters element style', () => {
      const before = `
        .btn { color: blue; font-size: 14px; }
      `;
      const after = `
        .btn { color: green; font-size: 14px; }
      `;

      const element: DOMElement = {
        nodeType: 1,
        tagName: 'BUTTON',
        localName: 'button',
        className: 'btn',
        classList: { contains: (c: string) => c === 'btn' },
        getAttribute: (attr: string) => (attr === 'class' ? 'btn' : null),
        hasAttribute: (attr: string) => attr === 'class',
        ownerDocument: { contentType: 'text/html' } as unknown as Document,
      };

      const result = sampleDomParity([element], before, after);
      assert.equal(result.valid, false);
      assert.equal(result.differences.length, 1);
      assert.equal(result.differences[0].property, 'color');
      assert.equal(result.differences[0].beforeValue, 'rgb(0, 0, 255)');
      assert.equal(result.differences[0].afterValue, 'rgb(0, 128, 0)');
    });
  });
});
