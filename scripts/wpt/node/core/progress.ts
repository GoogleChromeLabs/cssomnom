/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getProgressPath,
  SPEC_ORDER,
  SPEC_DISPLAY_NAMES,
  CANONICAL_FEASIBLE_TARGETS,
  CANONICAL_FEASIBLE_TOTAL,
  DEFAULT_REFERENCE_STATS,
  DEFAULT_REFERENCE_BROWSER,
  DEFAULT_REFERENCE_MILESTONE,
} from './config.ts';
import { addGitNote, getGitNotesLog } from '../safe-child-process.ts';
import type { TestRunDataset } from './types.ts';

export interface ReferenceBaselineStats {
  browser: string;
  milestone: string;
  specs: Record<string, { pass: number; total: number }>;
}

export function loadReferenceBaselineStats(reportPath?: string): ReferenceBaselineStats {
  const resolvedPath = reportPath ?? path.resolve(process.cwd(), '.wpt-cache/report-chrome-upstream.json');
  if (fs.existsSync(resolvedPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
      const browserStr = typeof data.browser === 'string' ? data.browser : DEFAULT_REFERENCE_BROWSER;
      const milestoneMatch = browserStr.match(/(?:chrome|chromium)\s+(\d+)/i);
      const milestone = milestoneMatch ? milestoneMatch[1] : DEFAULT_REFERENCE_MILESTONE;

      const specs: Record<string, { pass: number; total: number }> = {};
      for (const s of SPEC_ORDER) {
        specs[s] = { pass: 0, total: 0 };
      }

      const upstreamMap = new Map<string, boolean>();
      if (Array.isArray(data.results)) {
        for (const r of data.results) {
          const testPath = r.test ? r.test.replace(/^\//, '') : '';
          if (Array.isArray(r.subtests)) {
            for (const st of r.subtests) {
              if (st && st.name) {
                upstreamMap.set(`${testPath}::${st.name}`, st.status === 'PASS');
              }
            }
          }
        }
      }

      const lastRunPath = path.resolve(process.cwd(), '.wpt-cache/last-run.json');
      if (fs.existsSync(lastRunPath)) {
        const lastRun = JSON.parse(fs.readFileSync(lastRunPath, 'utf-8'));
        if (Array.isArray(lastRun.fileResults)) {
          for (const f of lastRun.fileResults) {
            const spec = f.spec;
            if (!specs[spec]) specs[spec] = { pass: 0, total: 0 };
            const normPath = f.file ? f.file.replace(/^\/?(submodules\/web-platform-tests\/)?/, '') : '';
            if (Array.isArray(f.subtests)) {
              for (const st of f.subtests) {
                const key = `${normPath}::${st.name}`;
                if (upstreamMap.has(key)) {
                  specs[spec].total++;
                  if (upstreamMap.get(key)) {
                    specs[spec].pass++;
                  }
                }
              }
            }
          }
        }
      }

      const hasData = Object.values(specs).some(s => s.total > 0);
      if (hasData) {
        return { browser: browserStr, milestone, specs };
      }
    } catch {
      // Fall through to default
    }
  }

  return {
    browser: DEFAULT_REFERENCE_BROWSER,
    milestone: DEFAULT_REFERENCE_MILESTONE,
    specs: DEFAULT_REFERENCE_STATS,
  };
}

export function formatBaselineSummaryTable(dataset: TestRunDataset, referenceReportPath?: string): string {
  const ref = loadReferenceBaselineStats(referenceReportPath);
  const lines: string[] = [];

  lines.push('### Feasibility & Cross-Engine Baseline Comparison');
  lines.push('');
  lines.push('> [!NOTE]');
  lines.push('> - **Normalized Conformance ($P / M$)**: Measures `cssomnom` progress against all achievable pure Node.js capabilities ($M = 18,769$ assertions), subtracting physically browser-dependent tests ($E = 106$ assertions) documented in [`tests/fixtures/wpt-browser-only-manifest.json`](./tests/fixtures/wpt-browser-only-manifest.json).');
  lines.push(`> - **Reference Engine**: Comparison numbers represent official unpolyfilled **${ref.browser}** test runs from [\`wpt.fyi\`](https://wpt.fyi) across the corresponding in-scope test suites.`);
  lines.push('');
  lines.push(`| Spec Domain | **cssomnom** | Chrome ${ref.milestone} (\`wpt.fyi\`) | Parity vs Chrome |`);
  lines.push('| :--- | :---: | :---: | :---: |');

  let totalNodePass = 0;
  const totalNodeTarget = CANONICAL_FEASIBLE_TOTAL;
  let totalRefPass = 0;
  let totalRefTotal = 0;

  for (const spec of SPEC_ORDER) {
    const displayName = SPEC_DISPLAY_NAMES[spec] ?? spec;
    const summary = dataset.specSummaries[spec] ?? { passing: 0, total: 0 };
    const target = CANONICAL_FEASIBLE_TARGETS[spec] ?? summary.total;
    const nodePassing = summary.passing;
    totalNodePass += nodePassing;

    const nodeRate = target > 0 ? (nodePassing / target) * 100 : 0;
    const nodeCell = `${nodePassing.toLocaleString()} / ${target.toLocaleString()} (**${nodeRate.toFixed(1)}%**)`;

    const refSpec = ref.specs[spec] ?? { pass: 0, total: 0 };
    totalRefPass += refSpec.pass;
    totalRefTotal += refSpec.total;

    const refRate = refSpec.total > 0 ? (refSpec.pass / refSpec.total) * 100 : 0;
    const refCell = refSpec.total > 0 ? `${refSpec.pass.toLocaleString()} / ${refSpec.total.toLocaleString()} (${refRate.toFixed(1)}%)` : 'N/A';

    const delta = nodeRate - refRate;
    const deltaCell = delta >= 0
      ? `🟢 **+${delta.toFixed(1)}%**`
      : `${delta.toFixed(1)}%`;

    lines.push(`| **\`${displayName}\`** | ${nodeCell} | ${refCell} | ${deltaCell} |`);
  }

  const overallNodeRate = totalNodeTarget > 0 ? (totalNodePass / totalNodeTarget) * 100 : 0;
  const overallNodeCell = `**${totalNodePass.toLocaleString()} / ${totalNodeTarget.toLocaleString()} (${overallNodeRate.toFixed(1)}%)**`;

  const overallRefRate = totalRefTotal > 0 ? (totalRefPass / totalRefTotal) * 100 : 0;
  const overallRefCell = `**${totalRefPass.toLocaleString()} / ${totalRefTotal.toLocaleString()} (${overallRefRate.toFixed(1)}%)**`;

  const overallDelta = overallNodeRate - overallRefRate;
  const overallDeltaCell = overallDelta >= 0
    ? `🟢 **+${overallDelta.toFixed(1)}%**`
    : `**${overallDelta.toFixed(1)}%**`;

  lines.push(`| **OVERALL** | ${overallNodeCell} | ${overallRefCell} | ${overallDeltaCell} |`);
  return lines.join('\n');
}

export function formatProgressRow(dataset: TestRunDataset, commitStr: string): string {
  const rowParts = [dataset.timestamp, `\`${commitStr}\``];
  for (const key of SPEC_ORDER) {
    const summary = dataset.specSummaries[key] ?? { passing: 0, total: 0 };
    const target = CANONICAL_FEASIBLE_TARGETS[key] ?? summary.total;
    rowParts.push(`${summary.passing}/${target}`);
  }
  const rawRate = dataset.totalTests > 0 ? ((dataset.totalPassing / dataset.totalTests) * 100).toFixed(2) : '0.00';
  const normRate = CANONICAL_FEASIBLE_TOTAL > 0 ? Math.min(100, (dataset.totalPassing / CANONICAL_FEASIBLE_TOTAL) * 100).toFixed(2) : '0.00';
  rowParts.push(`${dataset.totalPassing}/${CANONICAL_FEASIBLE_TOTAL}`, `${rawRate}%`, `**${normRate}%**`);
  return `| ${rowParts.join(' | ')} |`;
}

export function attachGitNote(commitHash: string, dataset: TestRunDataset): void {
  if (!commitHash || commitHash === 'unknown') return;
  const payload = JSON.stringify({
    timestamp: dataset.timestamp,
    totalPassing: dataset.totalPassing,
    totalTests: dataset.totalTests,
    totalFiles: dataset.totalFiles,
    specSummaries: dataset.specSummaries,
  });
  addGitNote(commitHash, payload, 'wpt');
}

export function syncProgressFromNotes(progressPath = getProgressPath()): void {
  if (!fs.existsSync(progressPath)) return;
  const content = fs.readFileSync(progressPath, 'utf-8');
  const lines = content.split('\n');
  const histIdx = lines.findIndex(l => l.includes('### Historical Conformance Progress Log'));
  if (histIdx === -1) return;

  let delimIdx = -1;
  for (let i = histIdx; i < lines.length; i++) {
    if (lines[i].includes(':---')) {
      delimIdx = i;
      break;
    }
  }
  if (delimIdx === -1 || delimIdx + 1 >= lines.length) return;

  const topRow = lines[delimIdx + 1];
  if (!topRow || !topRow.includes('|')) return;

  const cells = topRow.split('|').map(s => s.trim());
  if (cells.length < 12) return;

  const commitCell = cells[2];
  if (!/pending|unknown/i.test(commitCell)) return;

  const overallCell = cells[10];
  const passingInCell = overallCell ? parseInt(overallCell.split('/')[0], 10) : NaN;

  const notesLog = getGitNotesLog(5, 'wpt');
  for (const entry of notesLog) {
    if (!entry.note || !entry.commitHash) continue;
    try {
      const parsed = JSON.parse(entry.note) as { totalPassing?: number };
      if (typeof parsed.totalPassing === 'number' && parsed.totalPassing === passingInCell) {
        cells[2] = `\`${entry.commitHash}\``;
        lines[delimIdx + 1] = `| ${cells.slice(1, -1).join(' | ')} |`;
        fs.writeFileSync(progressPath, lines.join('\n'), 'utf-8');
        console.log(`[WPT Progress] Reconciled pending commit to ${entry.commitHash} from git notes.`);
        break;
      }
    } catch {
      // Ignore invalid json notes
    }
  }
}

export function updateBaselineSummaryTable(
  dataset: TestRunDataset,
  progressPath = getProgressPath(),
  referenceReportPath?: string
): void {
  if (!fs.existsSync(progressPath)) return;
  const content = fs.readFileSync(progressPath, 'utf-8');

  const startRegex = /(?:### Feasibility & Cross-Engine Baseline Comparison|### Feasibility & Normalized Conformance Baseline)/;
  const match = content.match(startRegex);
  if (!match || match.index === undefined) return;

  const startIdx = match.index;
  const afterStart = content.slice(startIdx);
  const endMatch = afterStart.match(/\n---\n/);
  if (!endMatch || endMatch.index === undefined) return;

  const endIdx = startIdx + endMatch.index;
  const newSummaryBlock = formatBaselineSummaryTable(dataset, referenceReportPath);

  const updated = content.slice(0, startIdx) + newSummaryBlock + content.slice(endIdx);
  fs.writeFileSync(progressPath, updated, 'utf-8');
}

export function updateProgressLog(
  dataset: TestRunDataset,
  dryRun = false,
  progressPath = getProgressPath(),
  referenceReportPath?: string
): void {
  syncProgressFromNotes(progressPath);

  const baseCommit = dataset.commitHash && dataset.commitHash !== 'unknown' ? dataset.commitHash : 'pending';
  const commitStr = dataset.isDirty ? (baseCommit === 'pending' ? 'pending*' : `${baseCommit}*`) : baseCommit;
  const newRow = formatProgressRow(dataset, commitStr);

  if (dryRun) {
    console.log(`[Dry Run] Would insert progress row:\n${newRow}`);
    return;
  }
  if (!fs.existsSync(progressPath)) {
    console.warn(`Warning: Progress file not found at ${progressPath}`);
    return;
  }

  updateBaselineSummaryTable(dataset, progressPath, referenceReportPath);

  const content = fs.readFileSync(progressPath, 'utf-8');
  const lines = content.split('\n');
  const histIdx = lines.findIndex(l => l.includes('### Historical Conformance Progress Log'));
  let delimIdx = -1;
  if (histIdx !== -1) {
    for (let i = histIdx; i < lines.length; i++) {
      if (lines[i].includes(':---')) {
        delimIdx = i;
        break;
      }
    }
  }

  if (delimIdx !== -1) {
    const prev = lines[delimIdx + 1];
    const newMetrics = newRow.split('|').slice(3).map(s => s.trim()).join('|');
    if (prev && prev.split('|').slice(3).map(s => s.trim()).join('|') === newMetrics) {
      console.log(`[WPT Progress] Conformance numbers unchanged (${dataset.totalPassing}/${dataset.totalTests}). Skipping duplicate row.`);
      return;
    }
    lines.splice(delimIdx + 1, 0, newRow);
    fs.writeFileSync(progressPath, lines.join('\n'), 'utf-8');
    console.log(`Updated progress table in ${progressPath}`);
  }

  if (dataset.commitHash && !dataset.isDirty && dataset.commitHash !== 'unknown') {
    attachGitNote(dataset.commitHash, dataset);
  }
}

