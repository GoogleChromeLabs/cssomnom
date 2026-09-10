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

import * as fs from 'node:fs';
import { collectLiveCssCoverage } from './live-coverage-collector.ts';

async function main() {
  const arg = process.argv[2];

  let target: { html: string } | { url: string };

  if (!arg) {
    // Default demo HTML matching Puppeteer's involved.html test case
    console.log('No URL or HTML file provided. Using default demo page with components & at-rules...\n');
    const demoHtml = `
<!DOCTYPE html>
<style>
  :root {
    --primary: #0066cc;
    --unused-color: #ff0000;
  }
  @layer base, components, utilities;

  @layer base {
    body { font-family: sans-serif; margin: 0; }
  }

  @layer components {
    .btn {
      background: var(--primary);
      color: white;
      padding: 8px 16px;
    }
    .btn:hover {
      background: #004499;
    }
    .btn:focus-visible {
      outline: 2px solid orange;
    }
    .unused-modal {
      display: none;
      position: fixed;
      inset: 0;
    }
    .unused-card:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }

  @keyframes unused-spin {
    to { transform: rotate(360deg); }
  }

  .loading-badge {
    animation: pulse 2s infinite;
  }

  @media print {
    body { font-size: 10pt; }
  }
</style>
<div class="content">
  <button class="btn">Click me</button>
  <span class="loading-badge">Loading...</span>
</div>
`;
    target = { html: demoHtml };
  } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
    target = { url: arg };
  } else if (fs.existsSync(arg)) {
    target = { html: fs.readFileSync(arg, 'utf-8') };
  } else {
    target = { html: arg };
  }

  console.log('[Live CSS Coverage] Launching headless Chrome and tracking rule usage...');
  const results = await collectLiveCssCoverage(target);

  console.log(`\nFound ${results.length} stylesheet(s).\n`);

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    console.log(`================================================================================`);
    console.log(`Stylesheet #${i + 1}: ${res.url}`);
    console.log(`Original Length : ${res.originalCss.length} bytes`);
    console.log(`Pruned Length   : ${res.pruneResult.prunedCss.length} bytes`);
    console.log(`Coverage Ranges : ${res.ranges.length} active interval(s) reported by Chrome`);
    console.log(`Rules Retained  : ${res.pruneResult.retainedRules.length}`);
    console.log(`Rules Pruned    : ${res.pruneResult.removedRules.length}`);
    console.log(`Review Queue    : ${res.pruneResult.reviewQueue.length} rule(s) requiring review`);
    console.log(`================================================================================`);

    if (res.pruneResult.retainedRules.length > 0) {
      console.log('\nRetained Rules:');
      for (const r of res.pruneResult.retainedRules) {
        console.log(`  ✓ ${r}`);
      }
    }

    if (res.pruneResult.removedRules.length > 0) {
      console.log('\nPruned Rules:');
      for (const r of res.pruneResult.removedRules) {
        console.log(`  ✗ ${r}`);
      }
    }

    if (res.pruneResult.reviewQueue.length > 0) {
      console.log('\nTier 3 Review Queue:');
      for (const q of res.pruneResult.reviewQueue) {
        console.log(`  ? [${q.reason}] ${q.header} (${q.description})`);
      }
    }

    console.log('\nPruned Output CSS:\n------------------------------------------------------------');
    console.log(res.pruneResult.prunedCss);
    console.log('------------------------------------------------------------\n');
  }
}

main().catch((err) => {
  console.error('Error running coverage pruning:', err);
  process.exit(1);
});
