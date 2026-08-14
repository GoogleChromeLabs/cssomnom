/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadWptConfig, validateSpecName, getBaselinePath, VALID_SPECS } from '../core/config.ts';
import { crawlSpecFiles } from '../core/crawler.ts';
import { executeWptTests } from '../core/executor.ts';
import { saveDatasetToCache } from '../core/cache.ts';
import { clusterFailures, extractExpectationDiffs, auditBaseline } from '../core/parser.ts';
import { updateProgressLog } from '../core/progress.ts';
import type { TestRunDataset } from '../core/types.ts';

export interface RunCommandOptions {
  filterBySpec?: string;
  filterByPath?: string;
  verifyExactBaseline?: boolean;
  showFailureClusters?: boolean;
  showExpectationDiff?: boolean;
  writeProgressMarkdown?: boolean;
  writePassingSetBaseline?: boolean;
  json?: boolean;
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
}


export async function runCommand(options: RunCommandOptions = {}): Promise<TestRunDataset> {
  if (options.filterBySpec && !validateSpecName(options.filterBySpec)) {
    throw new Error(`Invalid spec "${options.filterBySpec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }
  const config = loadWptConfig();
  const files = crawlSpecFiles(config, { filterBySpec: options.filterBySpec, filterByPath: options.filterByPath });
  if (files.length === 0) {
    console.log('No test files found matching criteria.');
    return { timestamp: new Date().toISOString(), commitHash: '', isDirty: false, specSummaries: {}, totalPassing: 0, totalTests: 0, totalFiles: 0, fileResults: [] };
  }

  if (!options.json) {
    console.log(`▶ Executing WPT run across ${files.length} test files (concurrency: ${options.concurrency ?? 'auto'})...`);
  }

  const dataset = await executeWptTests(files, { concurrency: options.concurrency });
  saveDatasetToCache(dataset);

  if (options.json) {
    console.log(JSON.stringify(dataset, null, 2));
  } else {
    console.log('\n================================================================================');
    console.log('📊 WPT Multi-Spec Conformance Summary');
    console.log('================================================================================');
    console.log('| Spec Domain     | Passing / Total | Raw Pass Rate | Files |');
    console.log('| :-------------- | :-------------: | :-----------: | :---: |');
    for (const [spec, sum] of Object.entries(dataset.specSummaries)) {
      const rate = sum.total > 0 ? ((sum.passing / sum.total) * 100).toFixed(2) + '%' : '0.00%';
      console.log(`| ${spec.padEnd(15)} | ${(sum.passing + '/' + sum.total).padStart(15)} | ${rate.padStart(13)} | ${sum.files.toString().padStart(5)} |`);
    }
    console.log('--------------------------------------------------------------------------------');
    const grandRate = dataset.totalTests > 0 ? ((dataset.totalPassing / dataset.totalTests) * 100).toFixed(2) + '%' : '0.00%';
    console.log(`| OVERALL         | ${(dataset.totalPassing + '/' + dataset.totalTests).padStart(15)} | ${grandRate.padStart(13)} | ${dataset.totalFiles.toString().padStart(5)} |`);
    console.log('================================================================================\n');
  }

  const limit = options.limit ?? 20;
  if (options.showFailureClusters) {
    const clusters = clusterFailures(dataset.fileResults);
    console.log(`\n📊 Top Failure Clusters (showing ${Math.min(limit, clusters.length)} of ${clusters.length}):`);
    for (let i = 0; i < Math.min(limit, clusters.length); i++) {
      const c = clusters[i];
      console.log(`\n#${i + 1} [${c.count} failures] ${c.title}`);
      console.log(`   📁 Affected files: ${c.affectedFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${c.affectedFiles.length > 3 ? '...' : ''}`);
      for (const s of c.samples) console.log(`      • [${path.basename(s.file)}] ${s.testName.substring(0, 70)} -> ${s.error}`);
    }
  }

  if (options.showExpectationDiff) {
    const diffs = extractExpectationDiffs(dataset.fileResults);
    console.log(`\n🔍 Near-Miss Expectation Diffs (${diffs.length} assertions):`);
    const byCat = new Map<string, typeof diffs>();
    for (const d of diffs) { (byCat.get(d.category) ?? byCat.set(d.category, []).get(d.category)!).push(d); }
    for (const [cat, list] of byCat) {
      console.log(`\n📌 ${cat}: ${list.length} assertions`);
      for (const s of list.slice(0, 3)) console.log(`   • [${path.basename(s.file)}] ${s.testName} (Expected: ${s.expected} | Actual: ${s.actual})`);
    }
  }

  if (options.verifyExactBaseline) {
    const baselinePath = getBaselinePath();
    if (!fs.existsSync(baselinePath)) throw new Error(`Baseline not found at ${baselinePath}. Run with --write-passing-set-baseline first.`);
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Record<string, string[]>;
    const currentPassingMap: Record<string, string[]> = {};
    for (const r of dataset.fileResults) if (r.passingSubtests.length > 0) currentPassingMap[r.file] = r.passingSubtests;
    const audit = auditBaseline(baseline, currentPassingMap);
    console.log(`\n--- ZERO-REGRESSION AUDIT REPORT ---`);
    console.log(`Baseline: ${audit.baselineCount} | Current: ${audit.currentCount} | New: +${audit.newPasses.length} | Regressions: -${audit.regressions.length}`);
    if (audit.regressions.length > 0) {
      console.error('\n🔴 REGRESSIONS DETECTED:');
      for (const r of audit.regressions.slice(0, 20)) console.error(`  - ${r.file} -> ${r.test}`);
      process.exit(1);
    } else {
      console.log('\n🟢 ZERO REGRESSIONS: 100% of baseline passing tests continue to pass!');
    }
  }

  if (options.writePassingSetBaseline) {
    const baselinePath = getBaselinePath();
    const currentPassingMap: Record<string, string[]> = {};
    for (const r of dataset.fileResults) if (r.passingSubtests.length > 0) currentPassingMap[r.file] = [...r.passingSubtests].sort();
    const sortedMap = Object.fromEntries(Object.entries(currentPassingMap).sort((a, b) => a[0].localeCompare(b[0])));
    const newPassingCount = Object.values(sortedMap).reduce((acc, t) => acc + t.length, 0);
    if (fs.existsSync(baselinePath)) {
      const oldBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Record<string, string[]>;
      const oldPassingCount = Object.values(oldBaseline).reduce((acc, t) => acc + t.length, 0);
      if (newPassingCount < oldPassingCount) {
        throw new Error(`Monotonicity violation: New passing count (${newPassingCount}) < Baseline (${oldPassingCount}). Aborting.`);
      }
    }
    if (options.dryRun) {
      console.log(`[Dry Run] Would write ${newPassingCount} passing assertions across ${Object.keys(sortedMap).length} files.`);
    } else {
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.writeFileSync(baselinePath, JSON.stringify(sortedMap, null, 2) + '\n', 'utf-8');
      console.log(`\n✔ Baseline snapshot updated (${newPassingCount} passing assertions): ${baselinePath}`);
    }
  }

  if (options.writeProgressMarkdown) {
    if (options.filterBySpec || options.filterByPath) throw new Error('--write-progress-markdown cannot be run with partial filters.');
    if (dataset.totalTests < 16000) throw new Error(`Total tests (${dataset.totalTests}) below minimum sanity threshold (16000).`);
    updateProgressLog(dataset, options.dryRun);
  }

  return dataset;
}
