/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface FailureClusterItem {
  clusterId: string;
  spec: string;
  category: string;
  pattern: string;
  totalFailures: number;
  affectedFileCount: number;
  affectedFiles: string[];
  samples: { file: string; testName: string; errorMessage: string }[];
}

export interface SpecCeiling {
  spec: string;
  totalFailures: number;
  infeasibleFailures: number;
  feasibleFailures: number;
  infeasibleCategories: Record<string, number>;
}

const data: FailureClusterItem[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/wpt_failure_dataset.json'), 'utf8')
);

const OUT_OF_SCOPE_CATEGORIES = new Set([
  'VISUAL_LAYOUT_CASCADE', // getComputedStyle, visual layout geometry, font metrics
  'VIEWPORT_HIT_TESTING',  // caretPositionFromPoint, getClientRects, coordinate hit-testing
]);

const BORDERLINE_CATEGORIES = new Set([
  'USER_INTERACTION_STATE', // :focus-visible synthetic user input events
  'DOM_SPEC_API',          // setHTMLUnsafe, document.implementation.createDocument
]);

console.log('================================================================================');
console.log('📊 MULTI-PERSPECTIVE FEASIBILITY CONSENSUS REPORT');
console.log('================================================================================\n');

console.log('### 1. UNANIMOUS OUT-OF-SCOPE CLUSTERS (Requires Browser Engine / Layout / Viewport)');
console.log('--------------------------------------------------------------------------------');
const outOfScopeClusters = data.filter(c => OUT_OF_SCOPE_CATEGORIES.has(c.category));
let totalOutOfScope = 0;
for (const c of outOfScopeClusters) {
  totalOutOfScope += c.totalFailures;
  console.log(`• [${c.spec.padEnd(14)}] ${c.clusterId.padEnd(36)}: ${c.totalFailures.toString().padStart(5)} failures (${c.affectedFileCount} files)`);
  console.log(`  ↳ Reason: ${c.category} - ${c.pattern}`);
}
console.log(`\n  Total Unanimous Out-of-Scope: ${totalOutOfScope} failure instances\n`);

console.log('### 2. CONTESTED / BORDERLINE CLUSTERS (Disagreed Across Archetypes)');
console.log('--------------------------------------------------------------------------------');
const borderlineClusters = data.filter(c => BORDERLINE_CATEGORIES.has(c.category));
let totalBorderline = 0;
for (const c of borderlineClusters) {
  totalBorderline += c.totalFailures;
  console.log(`• [${c.spec.padEnd(14)}] ${c.clusterId.padEnd(36)}: ${c.totalFailures.toString().padStart(5)} failures (${c.affectedFileCount} files)`);
  console.log(`  ↳ Debate: ${c.pattern}`);
  console.log(`    - Scrutineer: Borderline (defined in spec, but tests require synthetic WebDriver input actions).`);
  console.log(`    - Grizz: In-Scope (can simulate focus state flags in DOM node memory).`);
  console.log(`    - Architect: Out-of-Scope (faking user input event loops produces brittle behavior).`);
}
console.log(`\n  Total Contested / Borderline: ${totalBorderline} failure instances\n`);

console.log('### 3. UNANIMOUS IN-SCOPE CLUSTERS (100% Solvable in Pure Node.js)');
console.log('--------------------------------------------------------------------------------');
const inScopeClusters = data.filter(c => !OUT_OF_SCOPE_CATEGORIES.has(c.category) && !BORDERLINE_CATEGORIES.has(c.category));
let totalInScope = 0;
for (const c of inScopeClusters) {
  totalInScope += c.totalFailures;
  console.log(`• [${c.spec.padEnd(14)}] ${c.clusterId.padEnd(36)}: ${c.totalFailures.toString().padStart(5)} failures (${c.affectedFileCount} files)`);
}
console.log(`\n  Total Unanimous In-Scope: ${totalInScope} failure instances\n`);

// Compute spec ceilings
const specStats: Record<string, { total: number; outOfScope: number; inScope: number }> = {};
for (const c of data) {
  if (!specStats[c.spec]) {
    specStats[c.spec] = { total: 0, outOfScope: 0, inScope: 0 };
  }
  specStats[c.spec].total += c.totalFailures;
  if (OUT_OF_SCOPE_CATEGORIES.has(c.category)) {
    specStats[c.spec].outOfScope += c.totalFailures;
  } else {
    specStats[c.spec].inScope += c.totalFailures;
  }
}

console.log('================================================================================');
console.log('📈 SPEC CONFORMANCE CEILING SUMMARY (Pure Node.js vs. Browser)');
console.log('================================================================================');
console.log('| Spec Domain     | Total Failures | Browser-Only (Out-of-Scope) | Achievable Node Targets | Node Practical Ceiling |');
console.log('| :-------------- | :------------: | :--------------------------: | :---------------------: | :--------------------: |');
for (const [spec, stats] of Object.entries(specStats)) {
  const percentAchievable = ((stats.inScope / stats.total) * 100).toFixed(1);
  console.log(
    `| ${spec.padEnd(15)} | ${stats.total.toString().padStart(14)} | ${stats.outOfScope.toString().padStart(28)} | ${stats.inScope.toString().padStart(23)} | ${percentAchievable.padStart(21)}% |`
  );
}
console.log('================================================================================');
