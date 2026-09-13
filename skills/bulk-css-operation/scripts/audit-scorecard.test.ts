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
import { pruneUnusedCss } from './coverage-prune.ts';

describe('REGRESSION TESTS: Coverage Pruning Edge Cases, Fixes, and Triage Queue', () => {

  it('FIX 1: Layer rule isolation - prunes unused child rules when accurate child coverage is provided', () => {
    const css = `
@layer components {
  .used { color: green; }
  .unused { color: red; }
}
`;
    // Accurate CDP rule ranges (not flattened):
    // .used: [23, 46], @layer: [1, 74]
    const ranges = [
      { start: 1, end: 74 },
      { start: 23, end: 46 },
    ];

    const result = pruneUnusedCss(css, ranges);

    // .used and @layer components are retained, .unused is pruned
    assert.ok(result.retainedRules.includes('.used'));
    assert.ok(result.retainedRules.includes('@layer components'));
    assert.ok(result.removedRules.includes('.unused'));
    assert.ok(!result.prunedCss.includes('.unused'));
    assert.ok(result.prunedCss.includes('.used'));
  });

  it('FIX 2: CSS Nesting isolation - Parent style rule range does not swallow nested children', () => {
    const css = `
.parent {
  color: black;
  .used { color: green; }
  .unused { color: red; }
}
`;
    // CDP emits parent span and used child span
    const parentRanges = [
      { start: 1, end: 80 },
      { start: 29, end: 52 },
    ];
    const result = pruneUnusedCss(css, parentRanges);

    assert.ok(result.retainedRules.includes('& .used'));
    assert.ok(result.retainedRules.includes('.parent'));
    assert.ok(result.removedRules.includes('& .unused'));
    assert.ok(!result.prunedCss.includes('.unused'));
    assert.ok(result.prunedCss.includes('.used'));
  });

  it('FIX 3: serializeKeptSlice preserves declarations between pruned child rules without data loss', () => {
    const css = `
.card {
  .unused-header { color: red; }
  padding: 20px;
  background: white;
  .unused-footer { color: blue; }
  border: 1px solid black;
}
`;
    // Only the .card header is covered
    const cardStart = css.indexOf('.card {');
    const cardBodyStart = css.indexOf('{', cardStart) + 1;
    const ranges = [{ start: cardStart, end: cardBodyStart }];

    const result = pruneUnusedCss(css, ranges);

    // Assert that declarations between pruned rules were NOT dropped
    assert.ok(result.prunedCss.includes('padding: 20px;'), 'padding: 20px was preserved');
    assert.ok(result.prunedCss.includes('background: white;'), 'background: white was preserved');
    assert.ok(result.prunedCss.includes('border: 1px solid black;'), 'border: 1px solid black was preserved');
    assert.ok(!result.prunedCss.includes('.unused-header'), 'unused header pruned');
    assert.ok(!result.prunedCss.includes('.unused-footer'), 'unused footer pruned');
  });

  it('FIX 4: Layer statement rule (@layer reset, base;) preserved to protect CSS Cascade 5 ordering', () => {
    const css = `
@layer reset, base, theme, components;

@layer base {
  .used { font-size: 16px; }
}
`;
    const baseCardIdx = css.indexOf('.used');
    const baseCardEnd = css.indexOf('}', baseCardIdx) + 1;
    const ranges = [{ start: baseCardIdx, end: baseCardEnd }];

    const result = pruneUnusedCss(css, ranges);

    // Guaranteed preserve: @layer statement rule
    assert.ok(
      result.retainedRules.includes('@layer reset, base, theme, components'),
      '@layer statement rule retained'
    );
    assert.ok(result.prunedCss.includes('@layer reset, base, theme, components;'));
    assert.ok(result.prunedCss.includes('.used'));
  });

  it('FIX 5: Keyframes AST cross-referencing - used animations retained; unreferenced queued for review', () => {
    const css = `
@keyframes used-pulse {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes unused-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animated {
  animation: used-pulse 1s infinite;
}
`;
    const animIdx = css.indexOf('.animated');
    const animEnd = css.indexOf('}', animIdx) + 1;
    const ranges = [{ start: animIdx, end: animEnd }];

    const result = pruneUnusedCss(css, ranges, { preserveKeyframes: true });

    // Active keyframe is retained directly
    assert.ok(result.retainedRules.includes('@keyframes used-pulse'));
    assert.ok(result.retainedRules.includes('.animated'));

    // Unreferenced keyframe is surfaced to reviewQueue
    const reviewItem = result.reviewQueue.find(q => q.header === '@keyframes unused-spin');
    assert.ok(reviewItem, 'unused-spin placed in review queue');
    assert.equal(reviewItem?.reason, 'UNREFERENCED_KEYFRAMES');
  });

  it('FIX 6: Font-face AST cross-referencing - used fonts retained; unreferenced queued for review', () => {
    const css = `
@font-face {
  font-family: "UsedFont";
  src: local("Arial");
}
@font-face {
  font-family: "UnusedFont";
  src: local("Comic Sans");
}
.text {
  font-family: "UsedFont";
}
`;
    const textIdx = css.indexOf('.text');
    const textEnd = css.indexOf('}', textIdx) + 1;
    const ranges = [{ start: textIdx, end: textEnd }];

    const result = pruneUnusedCss(css, ranges, { preserveFontFaces: true });

    assert.ok(result.retainedRules.includes('.text'));
    assert.ok(result.prunedCss.includes('UsedFont'));

    // Unreferenced font placed into reviewQueue
    const fontReview = result.reviewQueue.find(q => q.reason === 'UNREFERENCED_FONT_FACE');
    assert.ok(fontReview, 'unreferenced font placed into review queue');
  });

  it('Granularity limitation: multi-selector rules kept whole when any selector matches', () => {
    const css = `
.used, .unused {
  color: blue;
}
`;
    const ranges = [{ start: 1, end: 34 }];
    const result = pruneUnusedCss(css, ranges);

    assert.ok(result.retainedRules.includes('.used, .unused'));
    assert.ok(result.prunedCss.includes('.unused'));
  });

  it('FIX 8: Guaranteed Preserves for interactive pseudo-classes with active base and environmental queries', () => {
    const css = `
button { background: red; }
button:hover { background: yellow; }
button:focus-visible { outline: 2px solid blue; }
button:active { background: green; }
.card:hover { color: green; }
@media print { body { font-size: 10pt; } }
@media (prefers-color-scheme: dark) { body { background: black; } }
`;
    const btnIdx = css.indexOf('button {');
    const btnEnd = css.indexOf('}', btnIdx) + 1;
    const ranges = [{ start: btnIdx, end: btnEnd }];

    const result = pruneUnusedCss(css, ranges, {
      preserveInteractivePseudoClasses: true,
      preserveEnvironmentalMediaQueries: true,
      annotateReviewRules: true,
    });

    // Button states auto-preserved because base 'button' is active!
    assert.ok(result.retainedRules.includes('button'));
    assert.ok(result.retainedRules.includes('button:hover'));
    assert.ok(result.retainedRules.includes('button:focus-visible'));
    assert.ok(result.retainedRules.includes('button:active'));

    // Environmental media queries auto-preserved!
    assert.ok(result.retainedRules.includes('@media print'));
    assert.ok(result.retainedRules.includes('@media (prefers-color-scheme: dark)'));

    // .card:hover has no active base, so it was put in reviewQueue and annotated with @cssom-review!
    assert.ok(result.prunedCss.includes('@cssom-review: INTERACTIVE_WITHOUT_BASE'));
    assert.ok(result.prunedCss.includes('.card:hover'));
  });

  it('FIX 9: Robust selector matching for :root and html custom properties', () => {
    const css = `
input[data-info=":root"] {
  color: red;
}
html {
  --primary-color: blue;
}
:root {
  --font-size: 16px;
}
`;
    // Coverage is empty
    const result = pruneUnusedCss(css, [], { preserveRootCustomProperties: true });

    // html and :root custom properties are preserved
    assert.ok(result.retainedRules.includes('html'));
    assert.ok(result.retainedRules.includes(':root'));

    // Attribute selector containing ":root" is correctly pruned!
    assert.ok(result.removedRules.includes('input[data-info=":root"]'));
    assert.ok(!result.prunedCss.includes('input[data-info=":root"]'));
  });
});
