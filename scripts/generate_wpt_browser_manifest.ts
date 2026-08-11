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
}

interface ManifestEntry {
  file: string;
  category: string;
  clusterId: string;
  description: string;
}

const OUT_OF_SCOPE_CATEGORIES = new Set(['VISUAL_LAYOUT_CASCADE', 'VIEWPORT_HIT_TESTING']);

const data: FailureClusterItem[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/wpt_failure_dataset.json'), 'utf8')
);

const manifest: Record<string, ManifestEntry[]> = {};
let totalFiles = 0;
let totalFailures = 0;

for (const c of data) {
  if (OUT_OF_SCOPE_CATEGORIES.has(c.category)) {
    if (!manifest[c.spec]) manifest[c.spec] = [];
    for (const f of c.affectedFiles) {
      manifest[c.spec].push({
        file: f.replace(/^submodules\/web-platform-tests\//, ''),
        category: c.category,
        clusterId: c.clusterId,
        description: c.pattern,
      });
      totalFiles++;
    }
    totalFailures += c.totalFailures;
  }
}

const outputPath = path.resolve(process.cwd(), 'tests/fixtures/wpt-browser-only-manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`Generated ${outputPath}`);
console.log(`Specs: ${Object.keys(manifest).length}, File entries: ${totalFiles}, Failure instances: ${totalFailures}`);
