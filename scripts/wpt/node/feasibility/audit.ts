/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SpecFeasibility {
  spec: string;
  totalTests: number;
  outOfScopeTests: number;
  feasibleTests: number;
  passingTests: number;
  rawPassRate: string;
  normalizedPassRate: string;
}

export interface ManifestEntry {
  file: string;
  category: string;
  clusterId: string;
  description: string;
}

const manifestPath = path.resolve(process.cwd(), 'tests/fixtures/wpt-browser-only-manifest.json');
export const BROWSER_ONLY_MANIFEST: Record<string, ManifestEntry[]> = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : {};

export function getBrowserOnlyFileCount(spec: string): number {
  return BROWSER_ONLY_MANIFEST[spec]?.length ?? 0;
}

export function isBrowserOnlyFile(spec: string, relativeFilePath: string): boolean {
  const entries = BROWSER_ONLY_MANIFEST[spec];
  if (!entries) return false;
  const normalized = relativeFilePath.replace(/^submodules\/web-platform-tests\//, '');
  return entries.some(e => e.file === normalized);
}

export function calculateFeasibility(currentResults: Record<string, { passing: number; total: number }>): {
  specs: SpecFeasibility[];
  overall: SpecFeasibility;
} {
  const specs: SpecFeasibility[] = [];
  let totalAll = 0;
  let outOfScopeAll = 0;
  let feasibleAll = 0;
  let passingAll = 0;

  for (const [spec, counts] of Object.entries(currentResults)) {
    const outOfScope = getBrowserOnlyFileCount(spec);
    const feasible = Math.max(counts.passing, counts.total - outOfScope);
    const rawRate = counts.total > 0 ? ((counts.passing / counts.total) * 100).toFixed(2) + '%' : '0.00%';
    const normalizedRate = feasible > 0 ? Math.min(100, (counts.passing / feasible) * 100).toFixed(2) + '%' : '0.00%';

    totalAll += counts.total;
    outOfScopeAll += (counts.total - feasible);
    feasibleAll += feasible;
    passingAll += counts.passing;

    specs.push({
      spec,
      totalTests: counts.total,
      outOfScopeTests: counts.total - feasible,
      feasibleTests: feasible,
      passingTests: counts.passing,
      rawPassRate: rawRate,
      normalizedPassRate: normalizedRate,
    });
  }

  const overall: SpecFeasibility = {
    spec: 'OVERALL',
    totalTests: totalAll,
    outOfScopeTests: outOfScopeAll,
    feasibleTests: feasibleAll,
    passingTests: passingAll,
    rawPassRate: totalAll > 0 ? ((passingAll / totalAll) * 100).toFixed(2) + '%' : '0.00%',
    normalizedPassRate: feasibleAll > 0 ? Math.min(100, (passingAll / feasibleAll) * 100).toFixed(2) + '%' : '0.00%',
  };

  return { specs, overall };
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('audit.ts') || process.argv[1].endsWith('wpt_feasibility_audit.ts'))) {
  const currentResults: Record<string, { passing: number; total: number }> = {
    'css-typed-om': { passing: 5677, total: 10682 },
    'cssom': { passing: 340, total: 814 },
    'css-syntax': { passing: 207, total: 404 },
    'css-nesting': { passing: 47, total: 117 },
    'css-variables': { passing: 57, total: 468 },
    'selectors': { passing: 501, total: 3086 },
    'mediaqueries': { passing: 102, total: 384 },
  };

  const { specs, overall } = calculateFeasibility(currentResults);

  console.log('================================================================================');
  console.log('📊 NORMALIZED WPT CONFORMANCE FEASIBILITY REPORT (FILE-LEVEL MANIFEST)');
  console.log('================================================================================');
  console.log('| Spec Domain     | Total Tests (N) | Browser-Only (E) | Feasible Target (M) | Passing (P) | Raw Score (P/N) | Normalized Conformance (P/M) |');
  console.log('| :-------------- | :-------------: | :--------------: | :-----------------: | :---------: | :-------------: | :--------------------------: |');
  for (const s of specs) {
    console.log(
      `| ${s.spec.padEnd(15)} | ${s.totalTests.toString().padStart(15)} | ${s.outOfScopeTests.toString().padStart(16)} | ${s.feasibleTests.toString().padStart(19)} | ${s.passingTests.toString().padStart(11)} | ${s.rawPassRate.padStart(15)} | ${s.normalizedPassRate.padStart(28)} |`
    );
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `| ${overall.spec.padEnd(15)} | ${overall.totalTests.toString().padStart(15)} | ${overall.outOfScopeTests.toString().padStart(16)} | ${overall.feasibleTests.toString().padStart(19)} | ${overall.passingTests.toString().padStart(11)} | ${overall.rawPassRate.padStart(15)} | ${overall.normalizedPassRate.padStart(28)} |`
  );
  console.log('================================================================================');
}
