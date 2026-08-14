/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { loadWptConfig, validateSpecName, VALID_SPECS } from '../core/config.ts';
import { crawlSpecFiles } from '../core/crawler.ts';
import { executeWptTests } from '../core/executor.ts';
import { loadDatasetFromCache, saveDatasetToCache } from '../core/cache.ts';
import { extractExpectationDiffs } from '../core/parser.ts';
import type { TestRunDataset, ExpectationDiffItem } from '../core/types.ts';

export interface DiffCommandOptions {
  filterBySpec?: string;
  filterByPath?: string;
  limit?: number;
  live?: boolean;
  concurrency?: number;
}

export async function diffCommand(options: DiffCommandOptions = {}): Promise<void> {
  if (options.filterBySpec && !validateSpecName(options.filterBySpec)) {
    throw new Error(`Invalid spec "${options.filterBySpec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  let dataset: TestRunDataset | null = null;

  if (options.live) {
    console.log('▶ Running live WPT execution for expectation diffs...');
    const config = loadWptConfig();
    const files = crawlSpecFiles(config, { filterBySpec: options.filterBySpec, filterByPath: options.filterByPath });
    dataset = await executeWptTests(files, { concurrency: options.concurrency });
    saveDatasetToCache(dataset);
  } else {
    dataset = loadDatasetFromCache();
    if (!dataset) {
      console.error('❌ No cached test run found (.wpt-cache/last-run.json).');
      console.error('👉 Run "pnpm run wpt" to generate a run, or pass "--live" (e.g. "pnpm run wpt:diff --live").');
      process.exit(1);
    }
  }

  let fileResults = dataset.fileResults;
  if (options.filterBySpec) {
    fileResults = fileResults.filter(r => r.spec === options.filterBySpec);
  }
  if (options.filterByPath) {
    const filterNorm = options.filterByPath.replace(/\\/g, '/');
    fileResults = fileResults.filter(r => r.file.replace(/\\/g, '/').includes(filterNorm));
  }

  const diffs = extractExpectationDiffs(fileResults);
  const limit = options.limit ?? 20;

  console.log('\n================================================================================');
  console.log(`🔍 WPT Expectation Diff Analyzer${options.filterBySpec ? ` [${options.filterBySpec}]` : ''}`);
  console.log(`   Found ${diffs.length} near-miss assertion failures`);
  console.log('================================================================================');

  if (diffs.length === 0) {
    console.log('🎉 No expectation diffs found in selected scope!');
    return;
  }

  const byCategory = new Map<string, ExpectationDiffItem[]>();
  for (const d of diffs) {
    const list = byCategory.get(d.category) || [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  for (const [category, list] of byCategory) {
    const uniqueFiles = new Set(list.map(l => l.file)).size;
    console.log(`\n📌 ${category}: ${list.length} assertions across ${uniqueFiles} files`);
    console.log('--------------------------------------------------------------------------------');
    const displayCount = Math.min(limit, list.length);
    for (let i = 0; i < displayCount; i++) {
      const sample = list[i];
      console.log(`  • [${sample.file}] ${sample.testName}`);
      console.log(`    Expected: ${sample.expected}`);
      console.log(`    Actual:   ${sample.actual}\n`);
    }
  }
  console.log('================================================================================\n');
}
