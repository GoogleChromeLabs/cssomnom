/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as path from 'node:path';
import { loadWptConfig, validateSpecName, VALID_SPECS } from '../core/config.ts';
import { crawlSpecFiles } from '../core/crawler.ts';
import { executeWptTests } from '../core/executor.ts';
import { loadDatasetFromCache, saveDatasetToCache } from '../core/cache.ts';
import { clusterFailures } from '../core/parser.ts';
import type { TestRunDataset } from '../core/types.ts';

export interface ClusterCommandOptions {
  filterBySpec?: string;
  limit?: number;
  live?: boolean;
  concurrency?: number;
}

export async function clusterCommand(options: ClusterCommandOptions = {}): Promise<void> {
  if (options.filterBySpec && !validateSpecName(options.filterBySpec)) {
    throw new Error(`Invalid spec "${options.filterBySpec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  let dataset: TestRunDataset | null = null;

  if (options.live) {
    console.log('▶ Running live WPT execution for failure clustering...');
    const config = loadWptConfig();
    const files = crawlSpecFiles(config, { filterBySpec: options.filterBySpec });
    dataset = await executeWptTests(files, { concurrency: options.concurrency });
    saveDatasetToCache(dataset);
  } else {
    dataset = loadDatasetFromCache();
    if (!dataset) {
      console.error('❌ No cached test run found (.wpt-cache/last-run.json).');
      console.error('👉 Run "pnpm run wpt" to generate a run, or pass "--live" (e.g. "pnpm run wpt:cluster --live").');
      process.exit(1);
    }
  }

  let fileResults = dataset.fileResults;
  if (options.filterBySpec) {
    fileResults = fileResults.filter(r => r.spec === options.filterBySpec);
  }

  const clusters = clusterFailures(fileResults);
  const totalFailures = clusters.reduce((acc, c) => acc + c.count, 0);
  const limit = options.limit ?? 20;

  console.log('\n================================================================================');
  console.log(`📊 WPT Failure Pattern Clusters${options.filterBySpec ? ` for [${options.filterBySpec}]` : ''}`);
  console.log(`   Total Failures: ${totalFailures} across ${clusters.length} distinct signatures`);
  console.log('================================================================================');

  if (clusters.length === 0) {
    console.log('🎉 No failures detected! 100% of tested assertions are passing.');
    return;
  }

  const displayCount = Math.min(limit, clusters.length);
  for (let i = 0; i < displayCount; i++) {
    const c = clusters[i];
    const pct = totalFailures > 0 ? ((c.count / totalFailures) * 100).toFixed(1) : '0.0';
    console.log(`\n#${i + 1} [${c.count} failures | ${pct}%] ${c.title}`);
    console.log(`    📁 Affected files (${c.affectedFiles.length}): ${c.affectedFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${c.affectedFiles.length > 3 ? '...' : ''}`);
    console.log('    🔍 Samples:');
    for (const sample of c.samples) {
      console.log(`       • [${path.basename(sample.file)}] ${sample.testName.substring(0, 75)}`);
      console.log(`         ↳ ${sample.error}`);
    }
  }
  console.log('\n================================================================================\n');
}
