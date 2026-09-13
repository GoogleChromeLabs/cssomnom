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
  it('collects live coverage from Chrome and executes 3-Tier pruning on complex modern CSS', async () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --brand: #1a73e8;
    --accent: #e37400;
    --unused-color: #d93025;
  }

  @layer reset, layout, components, utilities;

  @font-face {
    font-family: "BrandFont";
    src: local("Arial");
  }

  @font-face {
    font-family: "OrphanFont";
    src: local("Comic Sans");
  }

  @layer components {
    /* Modern CSS Nesting */
    .card {
      padding: 16px;
      font-family: "BrandFont", sans-serif;
      border: 1px solid #ccc;

      .card-title {
        font-size: 20px;
        font-weight: bold;
      }

      .unused-card-footer {
        color: gray;
      }

      &:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
    }

    /* Container Queries */
    .container-box {
      container-type: inline-size;
    }

    @container (min-width: 250px) {
      .responsive-badge {
        display: inline-block;
        background: var(--accent);
        color: white;
      }
      .unused-container-child {
        display: none;
      }
    }

    /* Interactive & Dynamic States */
    button.action-btn {
      background: var(--brand);
      color: white;
    }
    button.action-btn:hover {
      background: #1557b0;
    }
    button.action-btn:focus-visible {
      outline: 2px solid orange;
    }

    /* Unreferenced dynamic states & orphaned hover */
    input.toggle:checked + label {
      font-weight: bold;
    }
    .completely-unused-modal:hover {
      opacity: 0.9;
    }
    .completely-unused-modal {
      display: none;
    }
  }

  /* Keyframe animations: referenced vs orphan */
  @keyframes active-pulse {
    from { opacity: 1; }
    to { opacity: 0.5; }
  }

  @keyframes orphan-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animated-spinner {
    animation: active-pulse 1.5s infinite;
  }

  /* Transitions & Starting Style */
  @starting-style {
    .fade-widget {
      opacity: 0;
    }
  }

  /* Environmental queries */
  @media print {
    body { color: black; font-size: 10pt; }
  }

  @media (prefers-color-scheme: dark) {
    :root { --brand: #8ab4f8; }
  }
</style>
</head>
<body>
  <div class="card container-box">
    <h2 class="card-title">Card Header</h2>
    <span class="responsive-badge">Active</span>
    <button class="action-btn">Action</button>
    <div class="animated-spinner"></div>
    <div class="fade-widget">Fading</div>
    <input type="checkbox" class="toggle" id="t1"><label for="t1">Toggle</label>
  </div>
</body>
</html>
`;

    // Note: Called with ZERO options to verify canonical baked-in defaults!
    const results = await collectLiveCssCoverage({ html });

    assert.equal(results.length, 1, 'Extracted 1 live stylesheet from Chrome');
    const { pruneResult, originalCss, ranges } = results[0];

    // Assert live ranges were collected by Chrome
    assert.ok(ranges.length > 0, 'Chrome reported non-empty coverage ranges');

    // Assert Tier 1: unused rules were pruned
    assert.ok(pruneResult.removedRules.includes('& .unused-card-footer'), 'nested .unused-card-footer was stripped');
    assert.ok(pruneResult.removedRules.includes('.unused-container-child'), 'unused container child was stripped');
    assert.ok(pruneResult.removedRules.includes('.completely-unused-modal'), 'unused modal was stripped');
    assert.ok(!pruneResult.prunedCss.includes('.unused-card-footer'), 'pruned CSS does not contain unused card footer');
    assert.ok(!pruneResult.prunedCss.includes('.unused-container-child'), 'pruned CSS does not contain unused container child');

    // Assert Tier 2: guaranteed preserves
    assert.ok(pruneResult.retainedRules.includes(':root'), ':root tokens retained');
    assert.ok(pruneResult.retainedRules.includes('@layer reset, layout, components, utilities'), '@layer statement rule retained');
    assert.ok(pruneResult.retainedRules.includes('@font-face'), '@font-face for BrandFont retained');
    assert.ok(pruneResult.retainedRules.includes('.card'), 'active .card retained');
    assert.ok(pruneResult.retainedRules.includes('& .card-title'), 'active nested .card-title retained');
    assert.ok(pruneResult.retainedRules.includes('&:hover'), 'nested &:hover retained via active base');
    assert.ok(pruneResult.retainedRules.includes('.responsive-badge'), 'active @container child retained');
    assert.ok(pruneResult.retainedRules.includes('button.action-btn'), 'active button retained');
    assert.ok(pruneResult.retainedRules.includes('button.action-btn:hover'), 'active button :hover retained');
    assert.ok(pruneResult.retainedRules.includes('button.action-btn:focus-visible'), 'active button :focus-visible retained');
    assert.ok(pruneResult.retainedRules.includes('@keyframes active-pulse'), 'referenced keyframes active-pulse retained');
    assert.ok(pruneResult.retainedRules.includes('@starting-style'), '@starting-style block retained');
    assert.ok(pruneResult.retainedRules.includes('@media print'), 'environmental @media print retained');
    assert.ok(pruneResult.retainedRules.includes('@media (prefers-color-scheme: dark)'), 'environmental dark mode retained');

    // Assert Tier 3: ambiguous unreferenced assets and orphaned pseudo routed to review queue
    const unrefKeyframe = pruneResult.reviewQueue.find((q) => q.reason === 'UNREFERENCED_KEYFRAMES');
    assert.ok(unrefKeyframe, 'orphan-spin queued in review queue');
    assert.equal(unrefKeyframe?.header, '@keyframes orphan-spin');

    const unrefFont = pruneResult.reviewQueue.find((q) => q.reason === 'UNREFERENCED_FONT_FACE');
    assert.ok(unrefFont, 'OrphanFont queued in review queue');

    const orphanedHover = pruneResult.reviewQueue.find((q) => q.reason === 'INTERACTIVE_WITHOUT_BASE');
    assert.ok(orphanedHover, 'completely-unused-modal:hover queued as orphaned pseudo');

    // Assert annotated review rules in output CSS (default annotateReviewRules: true)
    assert.ok(pruneResult.prunedCss.includes('@cssom-review: INTERACTIVE_WITHOUT_BASE'), 'annotated orphaned :hover rule');
    assert.ok(pruneResult.prunedCss.includes('.completely-unused-modal:hover'), 'kept commented-out review rule in CSS');

    // Verification Pipeline Stage 1: AST fidelity on pruned CSS
    const astDiff = diffCssAst(pruneResult.prunedCss, pruneResult.prunedCss);
    assert.equal(astDiff.valid, true, 'Pruned CSS parses cleanly with zero AST errors');

    // Verification Pipeline Stage 2: Cascade order preservation
    const cascadeCheck = checkCascadeConflicts(originalCss, pruneResult.prunedCss);
    assert.equal(cascadeCheck.valid, true, 'Cascade conflict check passed on pruned output');
  });
});
