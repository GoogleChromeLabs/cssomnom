/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPEC_DISPLAY_NAMES, SPEC_ORDER, VALID_SPECS, validateSpecName } from '../node/core/config.ts';
import { loadDatasetFromCache } from '../node/core/cache.ts';
import type { TestRunDataset } from '../node/core/types.ts';

export type ParityTruthCategory =
  | 'VERIFIED_CONFORMANCE'
  | 'POLYFILL_IMPROVEMENT'
  | 'VERIFIED_SPEC_GAP'
  | 'FEASIBILITY_BOUNDARY'
  | 'OVER_MOCKING_FALSE_POSITIVE';

export interface ParitySubtestResult {
  file: string;
  subtest: string;
  spec: string;
  category: ParityTruthCategory;
  nodeStatus: 'PASS' | 'FAIL';
  browserStatus: 'PASS' | 'FAIL';
  upstreamStatus?: 'PASS' | 'FAIL';
  nodeError?: string;
  browserMessage?: string;
  upstreamMessage?: string;
}

export interface ParitySpecSummary {
  spec: string;
  displayName: string;
  verifiedConformance: number;
  polyfillImprovements: number;
  verifiedSpecGaps: number;
  feasibilityBoundaries: number;
  overMocking: number;
  totalCompared: number;
}

export interface ParityReport {
  timestamp: string;
  nodeCommit: string;
  browserName: string;
  upstreamName?: string;
  summaryBySpec: Record<string, ParitySpecSummary>;
  totals: {
    verifiedConformance: number;
    polyfillImprovements: number;
    verifiedSpecGaps: number;
    feasibilityBoundaries: number;
    overMocking: number;
    totalCompared: number;
  };
  discrepancies: {
    polyfillImprovements: ParitySubtestResult[];
    overMocking: ParitySubtestResult[];
    specGaps: ParitySubtestResult[];
    feasibilityBoundaries: ParitySubtestResult[];
  };
  allResults?: ParitySubtestResult[];
  isThreeWay?: boolean;
}

export interface ParityOptions {
  browserReportPath?: string;
  browserReportData?: WptReportJson;
  upstreamReportPath?: string;
  upstreamReportData?: WptReportJson;
  upstreamReport?: WptReportJson;
  nodeCachePath?: string;
  nodeDataset?: TestRunDataset;
  filterBySpec?: string;
  limit?: number;
  includeAllResults?: boolean;
}

export interface WptReportSubtest {
  name: string;
  status: string;
  message?: string | null;
}

export interface WptReportResult {
  test: string;
  status: string;
  subtests?: WptReportSubtest[];
  message?: string | null;
}

export interface WptReportJson {
  results: WptReportResult[];
  time?: number;
  browser?: string;
}

/**
 * Normalizes a WPT file path for cross-environment key matching.
 */
export function normalizeWptPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^.*submodules\/web-platform-tests\//, '')
    .replace(/^\/+/, '');
}

/**
 * Resolves spec domain identifier from a normalized file path.
 */
export function resolveSpecFromPath(normPath: string): string {
  const clean = normPath.replace(/^css\//, '');
  for (const spec of VALID_SPECS) {
    if (clean.startsWith(spec) || normPath.startsWith(spec)) {
      return spec;
    }
  }
  const firstSegment = clean.split('/')[0];
  return firstSegment || 'unknown';
}

/**
 * Compares Node.js WPT test dataset against Injected Browser WPT report JSON
 * and optional Upstream Vanilla WPT report JSON (3-Way Differential Comparison).
 */
export function compareParity(options: ParityOptions = {}): ParityReport {
  if (options.filterBySpec && !validateSpecName(options.filterBySpec)) {
    throw new Error(`Invalid spec filter "${options.filterBySpec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  // 1. Load Node dataset
  let nodeDataset: TestRunDataset | null = options.nodeDataset ?? null;
  if (!nodeDataset) {
    const cacheDir = options.nodeCachePath ? path.dirname(options.nodeCachePath) : undefined;
    nodeDataset = loadDatasetFromCache(cacheDir);
    if (!nodeDataset) {
      const targetPath = options.nodeCachePath || '.wpt-cache/last-run.json';
      if (fs.existsSync(targetPath)) {
        nodeDataset = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as TestRunDataset;
      }
    }
  }

  if (!nodeDataset) {
    throw new Error(
      'Node test dataset not found (.wpt-cache/last-run.json). Run "pnpm run wpt" first to establish Node results.'
    );
  }

  // 2. Load Injected Browser report
  let browserData: WptReportJson | null = options.browserReportData ?? null;
  const browserPath = options.browserReportPath || path.resolve('dist/report-chrome.json');
  if (!browserData) {
    if (!fs.existsSync(browserPath)) {
      throw new Error(
        `Browser WPT report not found at: ${browserPath}. Run "pnpm run wpt:browser:chrome" first.`
      );
    }
    const raw = fs.readFileSync(browserPath, 'utf-8');
    browserData = JSON.parse(raw) as WptReportJson;
  }

  if (!browserData || !Array.isArray(browserData.results)) {
    throw new Error('Invalid browser report format: "results" array is missing.');
  }

  // 3. Load optional Upstream Vanilla report
  let upstreamData: WptReportJson | null = options.upstreamReportData ?? options.upstreamReport ?? null;
  if (!upstreamData && options.upstreamReportPath) {
    if (!fs.existsSync(options.upstreamReportPath)) {
      throw new Error(`Upstream WPT report not found at: ${options.upstreamReportPath}`);
    }
    const raw = fs.readFileSync(options.upstreamReportPath, 'utf-8');
    upstreamData = JSON.parse(raw) as WptReportJson;
  }

  const isThreeWay = Boolean(upstreamData && Array.isArray(upstreamData.results));

  // 4. Index Injected Browser subtests
  const browserMap = new Map<string, { status: 'PASS' | 'FAIL'; message?: string; file: string; subtestName: string }>();

  for (const item of browserData.results) {
    const normFile = normalizeWptPath(item.test);
    if (Array.isArray(item.subtests) && item.subtests.length > 0) {
      for (const st of item.subtests) {
        const subName = st.name || '(anonymous)';
        const key = `${normFile}::${subName}`;
        const isPass = st.status === 'PASS';
        browserMap.set(key, {
          status: isPass ? 'PASS' : 'FAIL',
          message: st.message || undefined,
          file: normFile,
          subtestName: subName,
        });
      }
    } else {
      const key = `${normFile}::(root)`;
      const isPass = item.status === 'OK' || item.status === 'PASS';
      browserMap.set(key, {
        status: isPass ? 'PASS' : 'FAIL',
        message: item.message || undefined,
        file: normFile,
        subtestName: '(root)',
      });
    }
  }

  // 5. Index Upstream Vanilla subtests (if present)
  const upstreamMap = new Map<string, { status: 'PASS' | 'FAIL'; message?: string; file: string; subtestName: string }>();

  if (isThreeWay && upstreamData && Array.isArray(upstreamData.results)) {
    for (const item of upstreamData.results) {
      const normFile = normalizeWptPath(item.test);
      if (Array.isArray(item.subtests) && item.subtests.length > 0) {
        for (const st of item.subtests) {
          const subName = st.name || '(anonymous)';
          const key = `${normFile}::${subName}`;
          const isPass = st.status === 'PASS';
          upstreamMap.set(key, {
            status: isPass ? 'PASS' : 'FAIL',
            message: st.message || undefined,
            file: normFile,
            subtestName: subName,
          });
        }
      } else {
        const key = `${normFile}::(root)`;
        const isPass = item.status === 'OK' || item.status === 'PASS';
        upstreamMap.set(key, {
          status: isPass ? 'PASS' : 'FAIL',
          message: item.message || undefined,
          file: normFile,
          subtestName: '(root)',
        });
      }
    }
  }

  // 6. Index and match against Node dataset
  const comparedResults: ParitySubtestResult[] = [];
  const specSummaries: Record<string, ParitySpecSummary> = {};

  for (const spec of SPEC_ORDER) {
    specSummaries[spec] = {
      spec,
      displayName: SPEC_DISPLAY_NAMES[spec] || spec,
      verifiedConformance: 0,
      polyfillImprovements: 0,
      verifiedSpecGaps: 0,
      feasibilityBoundaries: 0,
      overMocking: 0,
      totalCompared: 0,
    };
  }

  for (const f of nodeDataset.fileResults) {
    const normFile = normalizeWptPath(f.file);
    const spec = f.spec || resolveSpecFromPath(normFile);

    if (options.filterBySpec && spec !== options.filterBySpec) {
      continue;
    }

    if (!specSummaries[spec]) {
      specSummaries[spec] = {
        spec,
        displayName: SPEC_DISPLAY_NAMES[spec] || spec,
        verifiedConformance: 0,
        polyfillImprovements: 0,
        verifiedSpecGaps: 0,
        feasibilityBoundaries: 0,
        overMocking: 0,
        totalCompared: 0,
      };
    }

    if (Array.isArray(f.subtests) && f.subtests.length > 0) {
      for (const st of f.subtests) {
        const subName = st.name || '(anonymous)';
        const key = `${normFile}::${subName}`;
        const browserEntry = browserMap.get(key);
        if (!browserEntry) {
          continue; // Only compare intersecting subtests
        }

        const nodeStatus: 'PASS' | 'FAIL' = st.status === 'PASS' ? 'PASS' : 'FAIL';
        const browserStatus: 'PASS' | 'FAIL' = browserEntry.status;

        const upstreamEntry = isThreeWay ? upstreamMap.get(key) : undefined;
        const upstreamStatus: 'PASS' | 'FAIL' | undefined = upstreamEntry?.status;
        const effectiveUpstream: 'PASS' | 'FAIL' = upstreamStatus ?? browserStatus;

        let category: ParityTruthCategory;
        if (isThreeWay) {
          if (nodeStatus === 'PASS' && browserStatus === 'PASS') {
            if (effectiveUpstream === 'PASS') {
              category = 'VERIFIED_CONFORMANCE';
              specSummaries[spec].verifiedConformance++;
            } else {
              category = 'POLYFILL_IMPROVEMENT';
              specSummaries[spec].polyfillImprovements++;
            }
          } else if (nodeStatus === 'FAIL' && browserStatus === 'FAIL') {
            if (effectiveUpstream === 'PASS') {
              category = 'VERIFIED_SPEC_GAP';
              specSummaries[spec].verifiedSpecGaps++;
            } else {
              category = 'FEASIBILITY_BOUNDARY';
              specSummaries[spec].feasibilityBoundaries++;
            }
          } else if (nodeStatus === 'PASS' && browserStatus === 'FAIL') {
            category = 'OVER_MOCKING_FALSE_POSITIVE';
            specSummaries[spec].overMocking++;
          } else {
            // nodeStatus === 'FAIL' && browserStatus === 'PASS'
            if (effectiveUpstream === 'PASS') {
              category = 'VERIFIED_SPEC_GAP';
              specSummaries[spec].verifiedSpecGaps++;
            } else {
              category = 'POLYFILL_IMPROVEMENT';
              specSummaries[spec].polyfillImprovements++;
            }
          }
        } else {
          // 2-Way Comparison (Node vs Browser)
          if (nodeStatus === 'PASS' && browserStatus === 'PASS') {
            category = 'VERIFIED_CONFORMANCE';
            specSummaries[spec].verifiedConformance++;
          } else if (nodeStatus === 'FAIL' && browserStatus === 'PASS') {
            category = 'VERIFIED_SPEC_GAP';
            specSummaries[spec].verifiedSpecGaps++;
          } else if (nodeStatus === 'FAIL' && browserStatus === 'FAIL') {
            category = 'FEASIBILITY_BOUNDARY';
            specSummaries[spec].feasibilityBoundaries++;
          } else {
            category = 'OVER_MOCKING_FALSE_POSITIVE';
            specSummaries[spec].overMocking++;
          }
        }
        specSummaries[spec].totalCompared++;

        comparedResults.push({
          file: normFile,
          subtest: subName,
          spec,
          category,
          nodeStatus,
          browserStatus,
          upstreamStatus,
          nodeError: st.error || st.rawError,
          browserMessage: browserEntry.message,
          upstreamMessage: upstreamEntry?.message,
        });
      }
    } else {
      const key = `${normFile}::(root)`;
      const browserEntry = browserMap.get(key);
      if (!browserEntry) {
        continue;
      }

      const nodeStatus: 'PASS' | 'FAIL' = (f.status === 'OK' || f.passing > 0) ? 'PASS' : 'FAIL';
      const browserStatus: 'PASS' | 'FAIL' = browserEntry.status;

      const upstreamEntry = isThreeWay ? upstreamMap.get(key) : undefined;
      const upstreamStatus: 'PASS' | 'FAIL' | undefined = upstreamEntry?.status;
      const effectiveUpstream: 'PASS' | 'FAIL' = upstreamStatus ?? browserStatus;

      let category: ParityTruthCategory;
      if (isThreeWay) {
        if (nodeStatus === 'PASS' && browserStatus === 'PASS') {
          if (effectiveUpstream === 'PASS') {
            category = 'VERIFIED_CONFORMANCE';
            specSummaries[spec].verifiedConformance++;
          } else {
            category = 'POLYFILL_IMPROVEMENT';
            specSummaries[spec].polyfillImprovements++;
          }
        } else if (nodeStatus === 'FAIL' && browserStatus === 'FAIL') {
          if (effectiveUpstream === 'PASS') {
            category = 'VERIFIED_SPEC_GAP';
            specSummaries[spec].verifiedSpecGaps++;
          } else {
            category = 'FEASIBILITY_BOUNDARY';
            specSummaries[spec].feasibilityBoundaries++;
          }
        } else if (nodeStatus === 'PASS' && browserStatus === 'FAIL') {
          category = 'OVER_MOCKING_FALSE_POSITIVE';
          specSummaries[spec].overMocking++;
        } else {
          // nodeStatus === 'FAIL' && browserStatus === 'PASS'
          if (effectiveUpstream === 'PASS') {
            category = 'VERIFIED_SPEC_GAP';
            specSummaries[spec].verifiedSpecGaps++;
          } else {
            category = 'POLYFILL_IMPROVEMENT';
            specSummaries[spec].polyfillImprovements++;
          }
        }
      } else {
        // 2-Way Comparison (Node vs Browser)
        if (nodeStatus === 'PASS' && browserStatus === 'PASS') {
          category = 'VERIFIED_CONFORMANCE';
          specSummaries[spec].verifiedConformance++;
        } else if (nodeStatus === 'FAIL' && browserStatus === 'PASS') {
          category = 'VERIFIED_SPEC_GAP';
          specSummaries[spec].verifiedSpecGaps++;
        } else if (nodeStatus === 'FAIL' && browserStatus === 'FAIL') {
          category = 'FEASIBILITY_BOUNDARY';
          specSummaries[spec].feasibilityBoundaries++;
        } else {
          category = 'OVER_MOCKING_FALSE_POSITIVE';
          specSummaries[spec].overMocking++;
        }
      }
      specSummaries[spec].totalCompared++;

      comparedResults.push({
        file: normFile,
        subtest: '(root)',
        spec,
        category,
        nodeStatus,
        browserStatus,
        upstreamStatus,
        nodeError: f.loadError,
        browserMessage: browserEntry.message,
        upstreamMessage: upstreamEntry?.message,
      });
    }
  }

  // 7. Aggregate totals
  const totals = {
    verifiedConformance: 0,
    polyfillImprovements: 0,
    verifiedSpecGaps: 0,
    feasibilityBoundaries: 0,
    overMocking: 0,
    totalCompared: 0,
  };

  for (const s of Object.values(specSummaries)) {
    totals.verifiedConformance += s.verifiedConformance;
    totals.polyfillImprovements += s.polyfillImprovements;
    totals.verifiedSpecGaps += s.verifiedSpecGaps;
    totals.feasibilityBoundaries += s.feasibilityBoundaries;
    totals.overMocking += s.overMocking;
    totals.totalCompared += s.totalCompared;
  }

  // 8. Partition discrepancies
  const discrepancies = {
    polyfillImprovements: comparedResults.filter((r) => r.category === 'POLYFILL_IMPROVEMENT'),
    overMocking: comparedResults.filter((r) => r.category === 'OVER_MOCKING_FALSE_POSITIVE'),
    specGaps: comparedResults.filter((r) => r.category === 'VERIFIED_SPEC_GAP'),
    feasibilityBoundaries: comparedResults.filter((r) => r.category === 'FEASIBILITY_BOUNDARY'),
  };

  const browserName = browserData.browser || 'Headless Chrome';
  const upstreamName = upstreamData ? (upstreamData.browser || 'Upstream Vanilla Chrome') : undefined;

  return {
    timestamp: new Date().toISOString(),
    nodeCommit: nodeDataset.commitHash || 'unknown',
    browserName,
    upstreamName,
    summaryBySpec: specSummaries,
    totals,
    discrepancies,
    allResults: options.includeAllResults ? comparedResults : undefined,
    isThreeWay,
  };
}

/**
 * Formats a ParityReport into a GitHub-Flavored Markdown report.
 */
export function formatParityMarkdown(report: ParityReport, limit = 10): string {
  const lines: string[] = [];

  if (report.isThreeWay) {
    lines.push('# 3-Way Cross-Browser Differential Parity Matrix');
    lines.push('');
    lines.push(`**Injected Engine**: ${report.browserName} | **Upstream Baseline**: ${report.upstreamName || 'Vanilla Chrome'} | **Node Baseline**: \`${report.nodeCommit}\` | **Generated**: ${report.timestamp}`);
    lines.push('');
    lines.push('| Spec Domain | Verified Conformance | Polyfill Improvements | Verified Spec Gaps | Feasibility Boundaries | Over-Mocking False Positives | Total Compared |');
    lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');

    for (const spec of SPEC_ORDER) {
      const s = report.summaryBySpec[spec];
      if (!s || s.totalCompared === 0) continue;
      lines.push(`| **${s.displayName}** | ${s.verifiedConformance.toLocaleString()} | ${s.polyfillImprovements.toLocaleString()} | ${s.verifiedSpecGaps.toLocaleString()} | ${s.feasibilityBoundaries.toLocaleString()} | ${s.overMocking.toLocaleString()} | ${s.totalCompared.toLocaleString()} |`);
    }

    for (const [specKey, s] of Object.entries(report.summaryBySpec)) {
      if ((SPEC_ORDER as readonly string[]).includes(specKey) || s.totalCompared === 0) continue;
      lines.push(`| **${s.displayName}** | ${s.verifiedConformance.toLocaleString()} | ${s.polyfillImprovements.toLocaleString()} | ${s.verifiedSpecGaps.toLocaleString()} | ${s.feasibilityBoundaries.toLocaleString()} | ${s.overMocking.toLocaleString()} | ${s.totalCompared.toLocaleString()} |`);
    }

    lines.push(`| **Total** | **${report.totals.verifiedConformance.toLocaleString()}** | **${report.totals.polyfillImprovements.toLocaleString()}** | **${report.totals.verifiedSpecGaps.toLocaleString()}** | **${report.totals.feasibilityBoundaries.toLocaleString()}** | **${report.totals.overMocking.toLocaleString()}** | **${report.totals.totalCompared.toLocaleString()}** |`);
    lines.push('');

    // 1. Polyfill Improvements
    lines.push('### 🚀 Polyfill Improvements (Node: PASS, Injected: PASS, Upstream: FAIL)');
    lines.push('*Tests where cssomnom successfully polyfills or fixes native browser engine shortcomings.*');
    lines.push('');
    if (report.discrepancies.polyfillImprovements.length === 0) {
      lines.push('✔ None detected. No upstream browser shortcomings polyfilled in this run.');
    } else {
      const samples = report.discrepancies.polyfillImprovements.slice(0, limit);
      for (const d of samples) {
        lines.push(`- \`${d.file}\` > "${d.subtest}"`);
        if (d.upstreamMessage) {
          lines.push(`  - Upstream Browser Output: ${d.upstreamMessage.trim().substring(0, 120)}`);
        }
      }
      if (report.discrepancies.polyfillImprovements.length > limit) {
        lines.push(`  *... and ${report.discrepancies.polyfillImprovements.length - limit} more polyfill improvements.*`);
      }
    }
    lines.push('');
  } else {
    lines.push('# Cross-Browser Differential Parity Matrix');
    lines.push('');
    lines.push(`**Browser Engine**: ${report.browserName} | **Node Baseline**: \`${report.nodeCommit}\` | **Generated**: ${report.timestamp}`);
    lines.push('');
    lines.push('| Spec Domain | Verified Conformance | Verified Spec Gaps | Feasibility Boundaries | Over-Mocking False Positives | Total Compared |');
    lines.push('| :--- | :---: | :---: | :---: | :---: | :---: |');

    for (const spec of SPEC_ORDER) {
      const s = report.summaryBySpec[spec];
      if (!s || s.totalCompared === 0) continue;
      lines.push(`| **${s.displayName}** | ${s.verifiedConformance.toLocaleString()} | ${s.verifiedSpecGaps.toLocaleString()} | ${s.feasibilityBoundaries.toLocaleString()} | ${s.overMocking.toLocaleString()} | ${s.totalCompared.toLocaleString()} |`);
    }

    for (const [specKey, s] of Object.entries(report.summaryBySpec)) {
      if ((SPEC_ORDER as readonly string[]).includes(specKey) || s.totalCompared === 0) continue;
      lines.push(`| **${s.displayName}** | ${s.verifiedConformance.toLocaleString()} | ${s.verifiedSpecGaps.toLocaleString()} | ${s.feasibilityBoundaries.toLocaleString()} | ${s.overMocking.toLocaleString()} | ${s.totalCompared.toLocaleString()} |`);
    }

    lines.push(`| **Total** | **${report.totals.verifiedConformance.toLocaleString()}** | **${report.totals.verifiedSpecGaps.toLocaleString()}** | **${report.totals.feasibilityBoundaries.toLocaleString()}** | **${report.totals.overMocking.toLocaleString()}** | **${report.totals.totalCompared.toLocaleString()}** |`);
    lines.push('');
  }

  // Over-Mocking False Positives (Highest Priority)
  lines.push('### ⚠️ Over-Mocking False Positives (Node: PASS, Browser: FAIL)');
  lines.push('*Assertions passing in Node.js test environment but failing in real browser engines.*');
  lines.push('');
  if (report.discrepancies.overMocking.length === 0) {
    lines.push('✔ None detected. All Node.js passing assertions match browser engine behavior.');
  } else {
    const samples = report.discrepancies.overMocking.slice(0, limit);
    for (const d of samples) {
      lines.push(`- \`${d.file}\` > "${d.subtest}"`);
      if (d.browserMessage) {
        lines.push(`  - Browser Output: ${d.browserMessage.trim().substring(0, 120)}`);
      }
    }
    if (report.discrepancies.overMocking.length > limit) {
      lines.push(`  *... and ${report.discrepancies.overMocking.length - limit} more over-mocking discrepancies.*`);
    }
  }
  lines.push('');

  // Verified Spec Gaps
  lines.push('### 🔍 Top Verified Spec Gaps (Node: FAIL, Browser: PASS)');
  lines.push('*Genuine implementation gaps in cssomnom tested against real browser engines.*');
  lines.push('');
  if (report.discrepancies.specGaps.length === 0) {
    lines.push('🎉 None detected. No failing Node.js assertions that pass in the browser.');
  } else {
    const samples = report.discrepancies.specGaps.slice(0, limit);
    for (const d of samples) {
      lines.push(`- \`${d.file}\` > "${d.subtest}"`);
      if (d.nodeError) {
        lines.push(`  - Node Error: ${d.nodeError.trim().substring(0, 120)}`);
      }
    }
    if (report.discrepancies.specGaps.length > limit) {
      lines.push(`  *... and ${report.discrepancies.specGaps.length - limit} more verified spec gaps.*`);
    }
  }
  lines.push('');

  // Feasibility Boundaries
  lines.push('### 🛡️ Sample Feasibility Boundaries (Node: FAIL, Browser: FAIL)');
  lines.push('*Contested spec requirements, browser bugs, or unimplemented upstream features.*');
  lines.push('');
  if (report.discrepancies.feasibilityBoundaries.length === 0) {
    lines.push('✔ No shared test failures detected.');
  } else {
    const samples = report.discrepancies.feasibilityBoundaries.slice(0, limit);
    for (const d of samples) {
      lines.push(`- \`${d.file}\` > "${d.subtest}"`);
    }
    if (report.discrepancies.feasibilityBoundaries.length > limit) {
      lines.push(`  *... and ${report.discrepancies.feasibilityBoundaries.length - limit} more feasibility boundaries.*`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats a ParityReport for colored terminal output.
 */
export function formatParityConsole(report: ParityReport, limit = 10): string {
  const lines: string[] = [];

  if (report.isThreeWay) {
    lines.push('\n================================================================================');
    lines.push(`🔬 3-Way Cross-Browser Differential Parity Matrix`);
    lines.push(`   Node Baseline: ${report.nodeCommit} | Injected: ${report.browserName}`);
    lines.push(`   Upstream Baseline: ${report.upstreamName || 'Upstream Chrome'} | Total Compared: ${report.totals.totalCompared.toLocaleString()}`);
    lines.push('================================================================================\n');

    lines.push(`| ${'Spec Domain'.padEnd(16)} | ${'Verified Pass'.padStart(14)} | ${'Polyfill Imp'.padStart(13)} | ${'Spec Gap'.padStart(10)} | ${'Feasibility'.padStart(12)} | ${'Over-Mock'.padStart(10)} | ${'Total'.padStart(8)} |`);
    lines.push(`|${'-'.repeat(18)}|${'-'.repeat(16)}|${'-'.repeat(15)}|${'-'.repeat(12)}|${'-'.repeat(14)}|${'-'.repeat(12)}|${'-'.repeat(10)}|`);

    for (const spec of SPEC_ORDER) {
      const s = report.summaryBySpec[spec];
      if (!s || s.totalCompared === 0) continue;
      lines.push(`| ${s.displayName.padEnd(16)} | \x1b[32m${s.verifiedConformance.toLocaleString().padStart(14)}\x1b[0m | \x1b[36m${s.polyfillImprovements.toLocaleString().padStart(13)}\x1b[0m | \x1b[33m${s.verifiedSpecGaps.toLocaleString().padStart(10)}\x1b[0m | \x1b[35m${s.feasibilityBoundaries.toLocaleString().padStart(12)}\x1b[0m | \x1b[31m${s.overMocking.toLocaleString().padStart(10)}\x1b[0m | ${s.totalCompared.toLocaleString().padStart(8)} |`);
    }

    lines.push(`|${'-'.repeat(18)}|${'-'.repeat(16)}|${'-'.repeat(15)}|${'-'.repeat(12)}|${'-'.repeat(14)}|${'-'.repeat(12)}|${'-'.repeat(10)}|`);
    lines.push(`| ${'TOTAL'.padEnd(16)} | \x1b[1;32m${report.totals.verifiedConformance.toLocaleString().padStart(14)}\x1b[0m | \x1b[1;36m${report.totals.polyfillImprovements.toLocaleString().padStart(13)}\x1b[0m | \x1b[1;33m${report.totals.verifiedSpecGaps.toLocaleString().padStart(10)}\x1b[0m | \x1b[1;35m${report.totals.feasibilityBoundaries.toLocaleString().padStart(12)}\x1b[0m | \x1b[1;31m${report.totals.overMocking.toLocaleString().padStart(10)}\x1b[0m | \x1b[1m${report.totals.totalCompared.toLocaleString().padStart(8)}\x1b[0m |`);
    lines.push('');

    if (report.discrepancies.polyfillImprovements.length > 0) {
      lines.push(`\x1b[36m🚀  Polyfill Improvements (${report.discrepancies.polyfillImprovements.length} assertions):\x1b[0m`);
      const samples = report.discrepancies.polyfillImprovements.slice(0, limit);
      for (const d of samples) {
        lines.push(`   • [${d.file}] ${d.subtest.substring(0, 70)}`);
        if (d.upstreamMessage) {
          lines.push(`     ↳ Upstream Fail: ${d.upstreamMessage.trim().substring(0, 80)}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('\n================================================================================');
    lines.push(`🔬 Cross-Browser Differential Parity Matrix [${report.browserName} vs Node.js]`);
    lines.push(`   Node Baseline: ${report.nodeCommit} | Total Compared: ${report.totals.totalCompared.toLocaleString()}`);
    lines.push('================================================================================\n');

    lines.push(`| ${'Spec Domain'.padEnd(16)} | ${'Verified Pass'.padStart(14)} | ${'Spec Gap'.padStart(10)} | ${'Feasibility'.padStart(12)} | ${'Over-Mock'.padStart(10)} | ${'Total'.padStart(8)} |`);
    lines.push(`|${'-'.repeat(18)}|${'-'.repeat(16)}|${'-'.repeat(12)}|${'-'.repeat(14)}|${'-'.repeat(12)}|${'-'.repeat(10)}|`);

    for (const spec of SPEC_ORDER) {
      const s = report.summaryBySpec[spec];
      if (!s || s.totalCompared === 0) continue;
      lines.push(`| ${s.displayName.padEnd(16)} | \x1b[32m${s.verifiedConformance.toLocaleString().padStart(14)}\x1b[0m | \x1b[33m${s.verifiedSpecGaps.toLocaleString().padStart(10)}\x1b[0m | \x1b[36m${s.feasibilityBoundaries.toLocaleString().padStart(12)}\x1b[0m | \x1b[31m${s.overMocking.toLocaleString().padStart(10)}\x1b[0m | ${s.totalCompared.toLocaleString().padStart(8)} |`);
    }

    lines.push(`|${'-'.repeat(18)}|${'-'.repeat(16)}|${'-'.repeat(12)}|${'-'.repeat(14)}|${'-'.repeat(12)}|${'-'.repeat(10)}|`);
    lines.push(`| ${'TOTAL'.padEnd(16)} | \x1b[1;32m${report.totals.verifiedConformance.toLocaleString().padStart(14)}\x1b[0m | \x1b[1;33m${report.totals.verifiedSpecGaps.toLocaleString().padStart(10)}\x1b[0m | \x1b[1;36m${report.totals.feasibilityBoundaries.toLocaleString().padStart(12)}\x1b[0m | \x1b[1;31m${report.totals.overMocking.toLocaleString().padStart(10)}\x1b[0m | \x1b[1m${report.totals.totalCompared.toLocaleString().padStart(8)}\x1b[0m |`);
    lines.push('');
  }

  if (report.discrepancies.overMocking.length > 0) {
    lines.push(`\x1b[31m⚠️  Over-Mocking False Positives (${report.discrepancies.overMocking.length} assertions):\x1b[0m`);
    const samples = report.discrepancies.overMocking.slice(0, limit);
    for (const d of samples) {
      lines.push(`   • [${d.file}] ${d.subtest.substring(0, 70)}`);
      if (d.browserMessage) {
        lines.push(`     ↳ Browser: ${d.browserMessage.trim().substring(0, 80)}`);
      }
    }
    lines.push('');
  }

  if (report.discrepancies.specGaps.length > 0) {
    lines.push(`\x1b[33m🔍 Top Verified Spec Gaps (${report.discrepancies.specGaps.length} assertions):\x1b[0m`);
    const samples = report.discrepancies.specGaps.slice(0, limit);
    for (const d of samples) {
      lines.push(`   • [${d.file}] ${d.subtest.substring(0, 70)}`);
      if (d.nodeError) {
        lines.push(`     ↳ Node: ${d.nodeError.trim().substring(0, 80)}`);
      }
    }
    lines.push('');
  }

  lines.push('================================================================================\n');
  return lines.join('\n');
}
