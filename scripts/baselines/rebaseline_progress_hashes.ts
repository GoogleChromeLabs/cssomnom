/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { execGit, addGitNote } from '../wpt/node/safe-child-process.ts';
import { getProgressPath, SPEC_ORDER } from '../wpt/node/core/config.ts';

interface CommitDiffRow {
  actualShort: string;
  actualFull: string;
  recordedHash: string;
  timestamp: string;
  overallPassing: number;
  overallTotal: number;
  specSummaries: Record<string, { passing: number; total: number }>;
}

export function extractHistoricalRowMappings(): Map<string, CommitDiffRow> {
  const stdout = execGit(['log', '--all', '--format=COMMIT_INFO %h %H', '-p', '--', 'wpt-progress.md']);
  const lines = stdout.split('\n');

  let currentCommitShort = '';
  let currentCommitFull = '';
  const rowToCommit = new Map<string, CommitDiffRow>();

  for (const line of lines) {
    if (line.startsWith('COMMIT_INFO ')) {
      const parts = line.split(' ');
      currentCommitShort = parts[1] ?? '';
      currentCommitFull = parts[2] ?? '';
      continue;
    }
    if (line.startsWith('+| ') || line.startsWith('+ | ')) {
      const rowText = line.substring(1).trim();
      if (rowText.includes('| :---') || rowText.includes('| Date & Time')) continue;
      const cells = rowText.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 10) {
        const timestamp = cells[0];
        const recordedHash = cells[1];
        if (!rowToCommit.has(timestamp) && currentCommitShort) {
          const specSummaries: Record<string, { passing: number; total: number }> = {};
          for (let i = 0; i < SPEC_ORDER.length; i++) {
            const key = SPEC_ORDER[i];
            const col = cells[2 + i];
            if (col && col.includes('/')) {
              const [p, t] = col.split('/');
              specSummaries[key] = {
                passing: parseInt(p, 10) || 0,
                total: parseInt(t, 10) || 0,
              };
            }
          }

          const overallCol = cells[2 + SPEC_ORDER.length] ?? '';
          let overallPassing = 0;
          let overallTotal = 0;
          if (overallCol.includes('/')) {
            const [p, t] = overallCol.split('/');
            overallPassing = parseInt(p, 10) || 0;
            overallTotal = parseInt(t, 10) || 0;
          }

          rowToCommit.set(timestamp, {
            actualShort: currentCommitShort,
            actualFull: currentCommitFull,
            recordedHash,
            timestamp,
            overallPassing,
            overallTotal,
            specSummaries,
          });
        }
      }
    }
  }

  return rowToCommit;
}

export function rebaselineProgressHashes(options: { write?: boolean; progressPath?: string } = {}): void {
  const isDryRun = !options.write;
  const progressPath = options.progressPath ?? getProgressPath();

  if (!fs.existsSync(progressPath)) {
    console.error(`Error: wpt-progress.md not found at ${progressPath}`);
    return;
  }

  const mappings = extractHistoricalRowMappings();
  console.log(`\n🔍 Found ${mappings.size} historical progress rows in git log history.`);

  const content = fs.readFileSync(progressPath, 'utf-8');
  const lines = content.split('\n');
  const histIdx = lines.findIndex(l => l.includes('### Historical Conformance Progress Log'));
  if (histIdx === -1) {
    console.error('Error: "### Historical Conformance Progress Log" section not found.');
    return;
  }

  let delimIdx = -1;
  for (let i = histIdx; i < lines.length; i++) {
    if (lines[i].includes(':---')) {
      delimIdx = i;
      break;
    }
  }

  if (delimIdx === -1) {
    console.error('Error: Table delimiter not found.');
    return;
  }

  let matchedCount = 0;
  let updatedCount = 0;
  const plannedUpdates: { timestamp: string; oldHash: string; newHash: string }[] = [];

  for (let i = delimIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(s => s.trim());
    if (cells.length < 4) continue;

    const timestamp = cells[1];
    const currentCommitCell = cells[2];
    const mapping = mappings.get(timestamp);

    if (mapping) {
      matchedCount++;
      const targetHashCell = `\`${mapping.actualShort}\``;
      if (currentCommitCell !== targetHashCell) {
        plannedUpdates.push({
          timestamp,
          oldHash: currentCommitCell,
          newHash: targetHashCell,
        });
        cells[2] = targetHashCell;
        lines[i] = `| ${cells.slice(1, -1).join(' | ')} |`;
        updatedCount++;
      }

      if (options.write) {
        const payload = JSON.stringify({
          timestamp: mapping.timestamp,
          totalPassing: mapping.overallPassing,
          totalTests: mapping.overallTotal,
          specSummaries: mapping.specSummaries,
        });
        addGitNote(mapping.actualShort, payload, 'wpt');
      }
    }
  }

  console.log(`Matched rows: ${matchedCount} | Rows needing hash rebaseline: ${updatedCount}\n`);
  console.log('| Timestamp           | Recorded (Old) | True Commit (New) |');
  console.log('| :------------------ | :------------- | :---------------- |');
  for (const update of plannedUpdates.slice(0, 25)) {
    console.log(`| ${update.timestamp.padEnd(19)} | ${update.oldHash.padEnd(14)} | ${update.newHash.padEnd(17)} |`);
  }
  if (plannedUpdates.length > 25) {
    console.log(`| ... and ${plannedUpdates.length - 25} more rows |`);
  }

  if (isDryRun) {
    console.log('\n[Dry Run] No files modified and no Git notes attached. Pass --write to apply changes.');
  } else {
    fs.writeFileSync(progressPath, lines.join('\n'), 'utf-8');
    console.log(`\n✔ Successfully rebaselined ${updatedCount} commit hashes in ${progressPath}`);
    console.log('✔ Attached Git notes for matched commits under ref "wpt".');
  }
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('rebaseline_progress_hashes.ts'))) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      write: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: true },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`\nUsage: node scripts/baselines/rebaseline_progress_hashes.ts [--write] [--dry-run]\n`);
    process.exit(0);
  }

  rebaselineProgressHashes({ write: values.write === true });
}
