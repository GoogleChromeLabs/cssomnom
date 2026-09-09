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
import { readFileSync } from 'node:fs';
import { pruneUnusedCss } from './coverage-prune.ts';
import { diffCssAst } from './ast-diff.ts';
import { checkCascadeInversions } from './cascade-diff.ts';

describe('coverage-prune: Coverage-guided CSS dead-code pruner', () => {
  describe('Simple Case: Puppeteer golden-chrome csscoverage-involved.txt', () => {
    const goldenPath = '/usr/local/google/home/paulirish/code/puppeteer/test/golden-chrome/csscoverage-involved.txt';
    const goldenJson = JSON.parse(readFileSync(goldenPath, 'utf8'));
    const originalText: string = goldenJson[0].text;
    const goldenRanges = goldenJson[0].ranges;

    it('retains all rules when coverage spans every rule in stylesheet', () => {
      const result = pruneUnusedCss(originalText, goldenRanges);
      assert.ok(result.retainedRules.includes('#fluffy'));
      assert.ok(result.retainedRules.includes('span'));
      assert.ok(result.retainedRules.includes('@media (min-width: 1px)'));
      assert.ok(result.retainedRules.includes('@font-face'));
      assert.equal(result.removedRules.length, 0);

      // Verify AST fidelity against original
      const astDiff = diffCssAst(originalText, result.prunedCss);
      assert.equal(astDiff.valid, true);
      assert.equal(astDiff.errors.length, 0);

      // Cascade preservation
      const cascadeCheck = checkCascadeInversions(originalText, result.prunedCss);
      assert.equal(cascadeCheck.valid, true);
    });

    it('strips unused classes while preserving covered rules and @font-face', () => {
      let extendedText = originalText;
      extendedText += '\n.unused-button { color: red; }\n';
      extendedText += '.another-unused { background: green; }\n';

      const result = pruneUnusedCss(extendedText, goldenRanges);
      assert.ok(result.removedRules.includes('.unused-button'));
      assert.ok(result.removedRules.includes('.another-unused'));
      assert.ok(result.retainedRules.includes('#fluffy'));
      assert.ok(result.retainedRules.includes('span'));

      // AST verification: pruned CSS should not contain unused rules
      const astDiff = diffCssAst(result.prunedCss, originalText);
      assert.equal(astDiff.valid, true);
      assert.equal(astDiff.errors.length, 0);
    });

    it('prunes empty grouping rules when all their children are unused', () => {
      let extendedText = originalText;
      extendedText += '\n@media (max-width: 480px) {\n  .phone-only { font-size: 10px; }\n}\n';

      const result = pruneUnusedCss(extendedText, goldenRanges);
      assert.ok(result.removedRules.includes('.phone-only'));
      assert.ok(result.removedRules.includes('@media (max-width: 480px)'));
      assert.ok(!result.prunedCss.includes('@media (max-width: 480px)'));
    });

    it('respects preserveFontFaces=false option', () => {
      // Golden ranges cover #fluffy (149-297) and @media (306-323, 327-433) but NOT @font-face (67-147)
      const result = pruneUnusedCss(originalText, goldenRanges, { preserveFontFaces: false });
      assert.ok(result.removedRules.includes('@font-face'));
      assert.ok(!result.prunedCss.includes('@font-face'));
      assert.ok(result.retainedRules.includes('#fluffy'));
    });
  });

  describe('Complex Case: modern.css (container queries, nested rules, @layer, :root)', () => {
    const fixtureUrl = new URL('../../../tests/fixtures/modern.css', import.meta.url);
    const modernCss = readFileSync(fixtureUrl, 'utf8');

    it('prunes unused rules while preserving covered component and :root custom properties', () => {
      // Target .card rule at top level
      const cardStart = modernCss.indexOf('.card {');
      const cardEnd = modernCss.indexOf('}', cardStart) + 1;

      // Also target second .card inside @layer components.card
      const layerIdx = modernCss.indexOf('@layer components.card');
      const layerCardStart = modernCss.indexOf('.card {', layerIdx + 20);
      const layerCardEnd = modernCss.indexOf('}', layerCardStart) + 1;

      const coverageRanges = [
        { start: cardStart, end: cardEnd },
        { start: layerCardStart, end: layerCardEnd },
      ];

      const result = pruneUnusedCss(modernCss, coverageRanges, {
        preserveRootCustomProperties: true,
        preserveKeyframes: true,
      });

      // Retained rules include .card, :root custom properties, @property, @keyframes
      assert.ok(result.retainedRules.includes('.card'));
      assert.ok(result.retainedRules.includes(':root'));
      assert.ok(result.retainedRules.includes('@layer components.card'));
      assert.ok(result.retainedRules.includes('@keyframes fade-in'));

      // Unused components should be pruned
      assert.ok(result.removedRules.includes('.vibrant'));
      assert.ok(result.removedRules.includes('.gradient'));
      assert.ok(result.removedRules.includes('h1'));
      assert.ok(result.removedRules.includes('p'));
      assert.ok(result.removedRules.includes('.heading'));

      // Pruned CSS must parse cleanly into AST
      const astDiff = diffCssAst(result.prunedCss, result.prunedCss);
      assert.equal(astDiff.valid, true);
      assert.equal(astDiff.errors.length, 0);

      // Verify cascade order preservation
      const cascadeCheck = checkCascadeInversions(modernCss, result.prunedCss);
      assert.equal(cascadeCheck.valid, true);
      assert.equal(cascadeCheck.conflicts.length, 0);
    });

    it('strictly removes :root custom properties and keyframes when preservation options are disabled', () => {
      const cardStart = modernCss.indexOf('.card {');
      const cardEnd = modernCss.indexOf('}', cardStart) + 1;

      const result = pruneUnusedCss(modernCss, [{ start: cardStart, end: cardEnd }], {
        preserveRootCustomProperties: false,
        preserveKeyframes: false,
        preserveFontFaces: false,
      });

      // With preservation disabled, :root and @keyframes should be pruned
      assert.ok(!result.prunedCss.includes(':root'));
      assert.ok(!result.prunedCss.includes('@keyframes'));
      assert.ok(result.prunedCss.includes('.card'));

      // Clean AST
      const astDiff = diffCssAst(result.prunedCss, result.prunedCss);
      assert.equal(astDiff.valid, true);
    });

    it('preserves comments and syntax structure cleanly', () => {
      const snippet = `
/* Theme header */
:root {
  --primary: #123456;
}

/* Important component */
.active-widget {
  color: var(--primary);
  display: flex;
}

/* Deprecated legacy widget */
.dead-widget {
  color: gray;
}
`;
      const activeIdx = snippet.indexOf('.active-widget {');
      const activeEnd = snippet.indexOf('}', activeIdx) + 1;

      const result = pruneUnusedCss(snippet, [{ start: activeIdx, end: activeEnd }]);
      assert.ok(result.prunedCss.includes('/* Theme header */'));
      assert.ok(result.prunedCss.includes('/* Important component */'));
      assert.ok(result.prunedCss.includes('.active-widget'));
      assert.ok(!result.prunedCss.includes('.dead-widget'));
      assert.ok(result.removedRules.includes('.dead-widget'));
    });
  });
});
