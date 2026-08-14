/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import {
  getProgressPath,
  SPEC_ORDER,
  CANONICAL_FEASIBLE_TARGETS,
  CANONICAL_FEASIBLE_TOTAL,
} from './config.ts';
import { addGitNote, getGitNotesLog } from '../safe-child-process.ts';
import type { TestRunDataset } from './types.ts';

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

export function updateProgressLog(
  dataset: TestRunDataset,
  dryRun = false,
  progressPath = getProgressPath()
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
