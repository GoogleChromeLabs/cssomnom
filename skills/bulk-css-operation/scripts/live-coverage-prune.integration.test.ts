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
import { collectLiveCssCoverage } from './live-coverage-collector.ts';
import { diffCssAst } from './ast-diff.ts';
import { checkCascadeConflicts } from './cascade-diff.ts';

describe('Live CSS Coverage Integration: Headless Chrome CDP to cssomnom Pruning Pipeline', () => {
  it('collects live coverage from Chrome and executes 3-Tier pruning on live HTML', async () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --brand: #1a73e8;
    --unused: #d93025;
  }
  @layer reset, components;

  @layer components {
    .btn {
      background: var(--brand);
      color: white;
    }
    .btn:hover {
      background: #1557b0;
    }
    .btn:focus-visible {
      outline: 2px solid orange;
    }
    .unused-hero {
      font-size: 48px;
    }
    .unused-card:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
  }

  @keyframes pulse {
    from { opacity: 1; }
    to { opacity: 0.5; }
  }

  @keyframes unused-spin {
    to { transform: rotate(360deg); }
  }

  .spinner {
    animation: pulse 1s infinite;
  }

  @media print {
    body { color: black; }
  }
</style>
</head>
<body>
  <button class="btn">Click me</button>
  <div class="spinner"></div>
</body>
</html>
`;

    const results = await collectLiveCssCoverage({ html }, {
      pruneOptions: {
        preserveRootCustomProperties: true,
        preserveKeyframes: true,
        preserveFontFaces: true,
        preserveInteractivePseudoClasses: true,
        preserveEnvironmentalMediaQueries: true,
        annotateReviewRules: true,
      },
    });

    assert.equal(results.length, 1, 'Extracted 1 live stylesheet from Chrome');
    const { pruneResult, originalCss, ranges } = results[0];

    // Assert live ranges were collected by Chrome
    assert.ok(ranges.length > 0, 'Chrome reported non-empty coverage ranges');

    // Assert Tier 1: unused rules were pruned
    assert.ok(pruneResult.removedRules.includes('.unused-hero'), '.unused-hero was stripped');
    assert.ok(!pruneResult.prunedCss.includes('.unused-hero'), 'pruned CSS does not contain .unused-hero');

    // Assert Tier 2: guaranteed preserves
    assert.ok(pruneResult.retainedRules.includes(':root'), ':root tokens retained');
    assert.ok(pruneResult.retainedRules.includes('@layer reset, components'), '@layer statement rule retained');
    assert.ok(pruneResult.retainedRules.includes('.btn'), 'active .btn retained');
    assert.ok(pruneResult.retainedRules.includes('.btn:hover'), 'active button :hover retained via base selector');
    assert.ok(pruneResult.retainedRules.includes('.btn:focus-visible'), 'active button :focus-visible retained');
    assert.ok(pruneResult.retainedRules.includes('@keyframes pulse'), 'referenced @keyframes pulse retained');
    assert.ok(pruneResult.retainedRules.includes('@media print'), 'environmental @media print retained');

    // Assert Tier 3: ambiguous unreferenced keyframes and orphaned pseudo routed to review queue
    const unrefKeyframe = pruneResult.reviewQueue.find((q) => q.reason === 'UNREFERENCED_KEYFRAMES');
    assert.ok(unrefKeyframe, 'unused-spin queued in review queue');
    assert.equal(unrefKeyframe?.header, '@keyframes unused-spin');

    // Assert annotated review rule in CSS
    assert.ok(pruneResult.prunedCss.includes('@cssom-review: INTERACTIVE_WITHOUT_BASE'), 'annotated orphaned :hover rule');
    assert.ok(pruneResult.prunedCss.includes('.unused-card:hover'), 'kept commented-out review rule in CSS');

    // Verification Pipeline Stage 1: AST fidelity on pruned CSS
    const astDiff = diffCssAst(pruneResult.prunedCss, pruneResult.prunedCss);
    assert.equal(astDiff.valid, true, 'Pruned CSS parses cleanly with zero AST errors');

    // Verification Pipeline Stage 2: Cascade order preservation
    const cascadeCheck = checkCascadeConflicts(originalCss, pruneResult.prunedCss);
    assert.equal(cascadeCheck.valid, true, 'Cascade conflict check passed on pruned output');
  });
});
