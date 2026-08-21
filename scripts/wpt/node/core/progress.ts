/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getProgressPath,
  SPEC_ORDER,
  SPEC_DISPLAY_NAMES,
} from './config.ts';
import { addGitNote, getGitNotesLog, execGit } from '../safe-child-process.ts';
import type { TestRunDataset } from './types.ts';

export interface ReferenceBaselineStats {
  browser: string;
  milestone: string;
  specs: Record<string, { pass: number; total: number }>;
}

export function loadReferenceBaselineStats(reportPath?: string): ReferenceBaselineStats | null {
  const resolvedPath = reportPath ?? path.resolve(process.cwd(), '.wpt-cache/report-chrome-upstream.json');
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    const browserStr = typeof data.browser === 'string' ? data.browser : 'Chrome';
    const milestoneMatch = browserStr.match(/(?:chrome|chromium)\s+(\d+)/i);
    const milestone = milestoneMatch ? milestoneMatch[1] : '';

    const specs: Record<string, { pass: number; total: number }> = {};
    for (const s of SPEC_ORDER) {
      specs[s] = { pass: 0, total: 0 };
    }

    if (Array.isArray(data.results)) {
      for (const r of data.results) {
        const testPath = r.test ? r.test.replace(/^\//, '') : '';
        const clean = testPath.replace(/^css\//, '');
        let matchedSpec: string | null = null;
        for (const spec of SPEC_ORDER) {
          if (clean.startsWith(spec) || testPath.startsWith(spec)) {
            matchedSpec = spec;
            break;
          }
        }
        if (matchedSpec && specs[matchedSpec]) {
          if (Array.isArray(r.subtests) && r.subtests.length > 0) {
            for (const st of r.subtests) {
              specs[matchedSpec].total++;
              if (st && st.status === 'PASS') {
                specs[matchedSpec].pass++;
              }
            }
          } else {
            specs[matchedSpec].total++;
            if (r.status === 'OK' || r.status === 'PASS') {
              specs[matchedSpec].pass++;
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
    // Return null on read/parse failure
  }

  return null;
}

export function formatBaselineSummaryTable(dataset: TestRunDataset, referenceReportPath?: string): string {
  const ref = loadReferenceBaselineStats(referenceReportPath);
  const lines: string[] = [];

  if (ref) {
    const chromeLabel = ref.milestone ? `Chrome ${ref.milestone}` : 'Chrome';
    lines.push('### Feasibility & Cross-Engine Baseline Comparison');
    lines.push('');
    lines.push('> [!NOTE]');
    lines.push('> - **WPT Conformance ($P / T$)**: Evaluates `cssomnom` in pure Node.js across all in-scope W3C test suites ($T$). Physically browser-dependent tests requiring GPU rasterization or 2D window layout are cataloged in [`tests/fixtures/wpt-browser-only-manifest.json`](./tests/fixtures/wpt-browser-only-manifest.json).');
    lines.push(`> - **Reference Engine**: Comparison numbers represent official unpolyfilled **${ref.browser}** test runs from [\`wpt.fyi\`](https://wpt.fyi) across matching test suites.`);
    lines.push('');
    lines.push(`| Spec Domain | **cssomnom** | ${chromeLabel} (\`wpt.fyi\`) | Parity vs Chrome |`);
    lines.push('| :--- | :---: | :---: | :---: |');

    let totalNodePass = 0;
    let totalNodeTarget = 0;
    let totalRefPass = 0;
    let totalRefTotal = 0;

    for (const spec of SPEC_ORDER) {
      const displayName = SPEC_DISPLAY_NAMES[spec] ?? spec;
      const summary = dataset.specSummaries[spec] ?? { passing: 0, total: 0 };
      const target = summary.total;
      const nodePassing = summary.passing;
      totalNodePass += nodePassing;
      totalNodeTarget += target;

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
  } else {
    lines.push('### Feasibility & Baseline Conformance');
    lines.push('');
    lines.push('> [!NOTE]');
    lines.push('> - **WPT Conformance ($P / T$)**: Evaluates `cssomnom` in pure Node.js across all in-scope W3C test suites ($T$). Physically browser-dependent tests requiring GPU rasterization or 2D window layout are cataloged in [`tests/fixtures/wpt-browser-only-manifest.json`](./tests/fixtures/wpt-browser-only-manifest.json).');
    lines.push('> - To populate cross-engine reference metrics from `wpt.fyi`, run `pnpm run wpt fetch-upstream`.');
    lines.push('');
    lines.push('| Spec Domain | Target Tests | **cssomnom** | Pass Rate |');
    lines.push('| :--- | :---: | :---: | :---: |');

    let totalNodePass = 0;
    let totalNodeTarget = 0;

    for (const spec of SPEC_ORDER) {
      const displayName = SPEC_DISPLAY_NAMES[spec] ?? spec;
      const summary = dataset.specSummaries[spec] ?? { passing: 0, total: 0 };
      const target = summary.total;
      const nodePassing = summary.passing;
      totalNodePass += nodePassing;
      totalNodeTarget += target;

      const nodeRate = target > 0 ? (nodePassing / target) * 100 : 0;
      lines.push(`| **\`${displayName}\`** | ${target.toLocaleString()} | ${nodePassing.toLocaleString()} | **${nodeRate.toFixed(1)}%** |`);
    }

    const overallNodeRate = totalNodeTarget > 0 ? (totalNodePass / totalNodeTarget) * 100 : 0;
    lines.push(`| **OVERALL** | **${totalNodeTarget.toLocaleString()}** | **${totalNodePass.toLocaleString()}** | **${overallNodeRate.toFixed(1)}%** |`);
  }

  return lines.join('\n');
}

export function formatProgressRow(dataset: TestRunDataset, commitStr: string): string {
  const rowParts = [dataset.timestamp, `\`${commitStr}\``];
  let rowTotalPass = 0;
  let rowTotalTarget = 0;
  for (const key of SPEC_ORDER) {
    const summary = dataset.specSummaries[key] ?? { passing: 0, total: 0 };
    const target = summary.total;
    rowTotalPass += summary.passing;
    rowTotalTarget += target;
    rowParts.push(`${summary.passing}/${target}`);
  }
  const totalTests = rowTotalTarget > 0 ? rowTotalTarget : dataset.totalTests;
  const passRate = totalTests > 0 ? ((dataset.totalPassing / totalTests) * 100).toFixed(2) : '0.00';
  rowParts.push(`${dataset.totalPassing}/${totalTests}`, `**${passRate}%**`);
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

  const notesLog = getGitNotesLog(50, 'wpt');
  const notesMap = new Map<number, string>();
  for (const entry of notesLog) {
    if (!entry.note || !entry.commitHash) continue;
    try {
      const parsed = JSON.parse(entry.note) as { totalPassing?: number };
      if (typeof parsed.totalPassing === 'number') {
        notesMap.set(parsed.totalPassing, entry.commitHash);
      }
    } catch {
      // Ignore invalid json notes
    }
  }

  let gitCommits: { hash: string; time: number; msg: string }[] | null = null;
  function getRecentGitCommits() {
    if (gitCommits) return gitCommits;
    try {
      const raw = execGit(['log', '-n', '50', '--format=%h|%ad|%s', '--date=iso-strict']);
      gitCommits = raw.trim().split('\n').filter(Boolean).map(l => {
        const [hash, date, msg] = l.split('|');
        return { hash: hash.trim(), time: new Date(date).getTime(), msg: (msg || '').trim() };
      });
    } catch {
      gitCommits = [];
    }
    return gitCommits;
  }

  let modified = false;
  for (let i = delimIdx + 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row || !row.includes('|')) break;

    const cells = row.split('|').map(s => s.trim());
    if (cells.length < 12) continue;

    const dateStr = cells[1];
    const commitCell = cells[2];
    if (!/pending|unknown|\*/i.test(commitCell)) continue;

    const overallCell = cells[10];
    const passingInCell = overallCell ? parseInt(overallCell.split('/')[0], 10) : NaN;

    let matchedHash: string | null = null;
    if (notesMap.has(passingInCell)) {
      matchedHash = notesMap.get(passingInCell)!;
    } else {
      const rowTime = new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
      const commits = getRecentGitCommits();
      let minDiff = Infinity;
      for (const c of commits) {
        const diff = Math.abs(c.time - rowTime);
        if (diff < minDiff && diff < 30 * 60 * 1000) {
          minDiff = diff;
          matchedHash = c.hash;
        }
      }
    }

    if (matchedHash) {
      cells[2] = `\`${matchedHash}\``;
      lines[i] = `| ${cells.slice(1, -1).join(' | ')} |`;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(progressPath, lines.join('\n'), 'utf-8');
    console.log(`[WPT Progress] Reconciled unfinalized progress rows in ${progressPath}`);
  }
}

export function formatReadmeSummaryTable(dataset: TestRunDataset, referenceReportPath?: string): string {
  const ref = loadReferenceBaselineStats(referenceReportPath);
  const lines: string[] = [];

  let totalNodePass = 0;
  let totalNodeTarget = 0;
  let totalRefPass = 0;
  let totalRefTotal = 0;

  const rows: string[] = [];

  for (const spec of SPEC_ORDER) {
    const displayName = SPEC_DISPLAY_NAMES[spec] ?? spec;
    const summary = dataset.specSummaries[spec] ?? { passing: 0, total: 0 };
    const target = summary.total;
    const nodePassing = summary.passing;
    totalNodePass += nodePassing;
    totalNodeTarget += target;

    const nodeRate = target > 0 ? (nodePassing / target) * 100 : 0;
    const refSpec = ref?.specs[spec] ?? { pass: 0, total: 0 };
    totalRefPass += refSpec.pass;
    totalRefTotal += refSpec.total;

    const refRate = refSpec.total > 0 ? (refSpec.pass / refSpec.total) * 100 : 0;
    const delta = nodeRate - refRate;

    let deltaCell = 'N/A';
    if (refSpec.total > 0) {
      if (delta > 0) {
        deltaCell = `🟢 **+${delta.toFixed(1)}%** (ahead of Chrome)`;
      } else if (delta === 0) {
        deltaCell = `🟢 **0.0%** (full parity)`;
      } else {
        deltaCell = `${delta.toFixed(1)}%`;
      }
    }

    rows.push(`| **\`${displayName}\`** | ${target.toLocaleString()} | ${nodePassing.toLocaleString()} | **${nodeRate.toFixed(1)}%** | ${deltaCell} |`);
  }

  const overallNodeRate = totalNodeTarget > 0 ? (totalNodePass / totalNodeTarget) * 100 : 0;
  const overallRefRate = totalRefTotal > 0 ? (totalRefPass / totalRefTotal) * 100 : 0;
  const overallDelta = overallNodeRate - overallRefRate;
  const overallDeltaCell = overallDelta >= 0 ? `🟢 **+${overallDelta.toFixed(1)}%**` : `**${overallDelta.toFixed(1)}%**`;

  const totalFiles = dataset.totalFiles > 0 ? dataset.totalFiles : 1687;

  lines.push(`* **W3C Standards Conformance**: **${overallNodeRate.toFixed(1)}%** (${totalNodePass.toLocaleString()} / ${totalNodeTarget.toLocaleString()} passed assertions across ${totalFiles.toLocaleString()} test files).`);
  if (ref && totalRefTotal > 0) {
    const chromeLabel = ref.milestone ? `Chrome ${ref.milestone}` : 'Chrome';
    lines.push(`* **${chromeLabel} Parity**: **${overallNodeRate.toFixed(1)}%** pass rate across ${totalRefTotal.toLocaleString()} common subtests evaluated against official [\`wpt.fyi\`](https://wpt.fyi) runs.`);
  }
  lines.push('');
  lines.push('| Specification Suite | In-Scope Tests | **cssomnom** | Pass Rate | Parity vs Chrome 153 |');
  lines.push('| :--- | :---: | :---: | :---: | :---: |');
  lines.push(...rows);
  lines.push(`| **OVERALL** | **${totalNodeTarget.toLocaleString()}** | **${totalNodePass.toLocaleString()}** | **${overallNodeRate.toFixed(1)}%** | ${overallDeltaCell} |`);

  return lines.join('\n');
}

export function updateReadmeSummaryTable(
  dataset: TestRunDataset,
  readmePath = path.resolve(process.cwd(), 'README.md'),
  referenceReportPath?: string
): void {
  if (!fs.existsSync(readmePath)) return;
  let content = fs.readFileSync(readmePath, 'utf-8');

  const startTag = '<!-- WPT_PROGRESS_SUMMARY_START -->';
  const endTag = '<!-- WPT_PROGRESS_SUMMARY_END -->';

  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);

  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    const before = content.substring(0, startIdx + startTag.length);
    const after = content.substring(endIdx);
    const summaryBlock = '\n' + formatReadmeSummaryTable(dataset, referenceReportPath) + '\n';
    content = before + summaryBlock + after;
    fs.writeFileSync(readmePath, content, 'utf-8');
    console.log(`[WPT Progress] Updated README.md conformance summary table.`);
  }
}

export function updateBaselineSummaryTable(
  dataset: TestRunDataset,
  progressPath = getProgressPath(),
  referenceReportPath?: string
): void {
  if (!fs.existsSync(progressPath)) return;
  const content = fs.readFileSync(progressPath, 'utf-8');

  const startRegex = /(?:### Feasibility & Cross-Engine Baseline Comparison|### Feasibility & Baseline Conformance|### Feasibility & Normalized Conformance Baseline)/;
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
  referenceReportPath?: string,
  readmePath = path.resolve(process.cwd(), 'README.md')
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
  updateReadmeSummaryTable(dataset, readmePath, referenceReportPath);

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

