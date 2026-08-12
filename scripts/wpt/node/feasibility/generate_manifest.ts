/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface FailureSample {
  file: string;
  testName: string;
  errorMessage: string;
}

interface FailureClusterItem {
  clusterId: string;
  spec: string;
  category: string;
  pattern: string;
  totalFailures: number;
  affectedFileCount: number;
  affectedFiles: string[];
  samples: FailureSample[];
}

interface EvaluatorVote {
  clusterId: string;
  spec: string;
  verdict: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'BORDERLINE';
  rationale: string;
  estimated_infeasible_instances?: number;
}

interface ManifestEntry {
  file: string;
  category: string;
  clusterId: string;
  description: string;
}

const datasetPath = path.resolve(process.cwd(), 'scratch/wpt_failure_dataset.json');
const dataset: FailureClusterItem[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

const scrutineerVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_scrutineer.json'), 'utf8')
);
const grizzVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_grizz.json'), 'utf8')
);
const architectVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_architect.json'), 'utf8')
);

function makeKey(spec: string, clusterId: string): string {
  return `${spec}::${clusterId}`;
}

const sMap = new Map(scrutineerVotes.map(v => [makeKey(v.spec, v.clusterId), v]));
const gMap = new Map(grizzVotes.map(v => [makeKey(v.spec, v.clusterId), v]));
const aMap = new Map(architectVotes.map(v => [makeKey(v.spec, v.clusterId), v]));

// Explicit patterns in contested clusters that are genuinely browser-only
function isBrowserOnlyContestedFile(spec: string, clusterId: string, filePath: string): boolean {
  if (spec === 'selectors') {
    // Files requiring WebDriver hardware action sequences or top layer dialogs
    if (filePath.includes('active-observable') || filePath.includes('focus-visible-024') || filePath.includes('has-with-nesting-parent-containing-hover')) {
      return true;
    }
  }
  if (spec === 'css-variables') {
    // Files requiring live Web Animations / CSS Transitions frame interpolation
    if (filePath.includes('animation') || filePath.includes('transition') || filePath.includes('keyframes')) {
      return true;
    }
  }
  if (spec === 'cssom') {
    // Files requiring resolved px layout insets or network load events
    if (filePath.includes('insets') || filePath.includes('load-event-002') || filePath.includes('min-size-auto') || filePath.includes('line-height-computed')) {
      return true;
    }
  }
  return false;
}

const manifest: Record<string, ManifestEntry[]> = {};
let totalFiles = 0;

for (const c of dataset) {
  const key = makeKey(c.spec, c.clusterId);
  const sv = sMap.get(key)?.verdict ?? 'IN_SCOPE';
  const gv = gMap.get(key)?.verdict ?? 'IN_SCOPE';
  const av = aMap.get(key)?.verdict ?? 'IN_SCOPE';

  const isUnanimousOut = sv === 'OUT_OF_SCOPE' && gv === 'OUT_OF_SCOPE' && av === 'OUT_OF_SCOPE';
  const isMajorityOut = (sv === 'OUT_OF_SCOPE' ? 1 : 0) + (gv === 'OUT_OF_SCOPE' ? 1 : 0) + (av === 'OUT_OF_SCOPE' ? 1 : 0) >= 2;

  if (isUnanimousOut || isMajorityOut) {
    if (!manifest[c.spec]) manifest[c.spec] = [];
    for (const f of c.affectedFiles) {
      const relPath = f.replace(/^submodules\/web-platform-tests\//, '');
      manifest[c.spec].push({
        file: relPath,
        category: c.category,
        clusterId: c.clusterId,
        description: c.pattern,
      });
      totalFiles++;
    }
  } else if (sv === 'BORDERLINE' || gv === 'BORDERLINE' || av === 'BORDERLINE') {
    // Filter specific browser-only files in borderline clusters
    for (const f of c.affectedFiles) {
      const relPath = f.replace(/^submodules\/web-platform-tests\//, '');
      if (isBrowserOnlyContestedFile(c.spec, c.clusterId, relPath)) {
        if (!manifest[c.spec]) manifest[c.spec] = [];
        manifest[c.spec].push({
          file: relPath,
          category: 'CONTESTED_BROWSER_ONLY',
          clusterId: c.clusterId,
          description: `Browser-dependent subresource or interaction: ${c.pattern}`,
        });
        totalFiles++;
      }
    }
  }
}

const outputPath = path.resolve(process.cwd(), 'tests/fixtures/wpt-browser-only-manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\n✅ Generated consensus-driven manifest at: ${outputPath}`);
console.log(`Specs: ${Object.keys(manifest).length}, Total browser-only test files: ${totalFiles}`);
for (const [spec, entries] of Object.entries(manifest)) {
  console.log(`  - ${spec}: ${entries.length} files`);
}
