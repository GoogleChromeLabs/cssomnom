/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runCrawler } from './run_wpt_crawler.ts';

const SPEC_DISPLAY_NAMES: Record<string, string> = {
  'css-typed-om': 'Typed OM',
  'cssom': 'CSSOM',
  'css-nesting': 'Nesting',
  'css-syntax': 'Syntax',
  'css-variables': 'Variables',
  'selectors': 'Selectors',
  'mediaqueries': 'MQ'
};

const specOrder = ['css-typed-om', 'cssom', 'css-nesting', 'css-syntax', 'css-variables', 'selectors', 'mediaqueries'];

async function main() {
  console.log('Running WPT sandbox tests across expanded specifications...');
  const specResults = await runCrawler();

  let grandTotal = 0;
  let grandPassing = 0;

  for (const [, res] of Object.entries(specResults)) {
    grandTotal += res.total;
    grandPassing += res.passing;
  }

  const overallPassRate = grandTotal > 0 ? ((grandPassing / grandTotal) * 100).toFixed(2) : '0.00';
  console.log(`\nOverall Results: ${grandPassing}/${grandTotal} passed (${overallPassRate}%).`);

  // Get git details
  let commitHash = 'unknown';
  let isDirty = false;
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    isDirty = status.length > 0;
  } catch (err) {
    console.warn('Warning: failed to get git commit hash.');
  }
  const commitStr = commitHash + (isDirty ? '*' : '');
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);

  const progressFilePath = path.resolve(process.cwd(), 'wpt-progress.md');
  let fileExists = fs.existsSync(progressFilePath);
  let shouldAppend = true;

  if (fileExists) {
    const lines = fs.readFileSync(progressFilePath, 'utf-8').split('\n');
    let lastRowLine = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|') && !line.includes('Date & Time') && !line.includes(':---')) {
        lastRowLine = line;
        break;
      }
    }

    if (lastRowLine) {
      const parts = lastRowLine.split('|').map(p => p.trim());
      if (parts.length >= 11) {
        const lastOverall = parts[10];
        const expectedOverall = `${grandPassing}/${grandTotal}`;
        if (lastOverall === expectedOverall) {
          console.log('No changes in overall test counts since last run. Skipping log update.');
          shouldAppend = false;
        }
      }
    }
  }

  if (shouldAppend) {
    const rowParts = [dateStr, `\`${commitStr}\``];
    for (const key of specOrder) {
      const res = specResults[key] || { passing: 0, total: 0 };
      rowParts.push(`${res.passing}/${res.total}`);
    }
    rowParts.push(`${grandPassing}/${grandTotal}`);
    rowParts.push(`${overallPassRate}%`);
    const newRow = `| ${rowParts.join(' | ')} |`;

    if (!fileExists) {
      const headers = ['Date & Time (UTC)', 'Commit'];
      const alignments = [':---', ':---'];
      for (const key of specOrder) {
        const res = specResults[key] || { passing: 0, total: 0 };
        const displayName = SPEC_DISPLAY_NAMES[key] || key;
        headers.push(`${displayName} (${res.total})`);
        alignments.push(':---:');
      }
      headers.push('Overall');
      alignments.push(':---:');
      headers.push('Pass Rate');
      alignments.push(':---:');

      const initialContent = `# WPT Multi-Spec Conformance Sandbox Progress Log\n\n` +
        `This file tracks the conformance progress of the CSSOM / Typed OM implementations across major W3C Web Platform Tests spec suites.\n\n` +
        `| ${headers.join(' | ')} |\n` +
        `| ${alignments.join(' | ')} |\n` +
        `${newRow}\n`;
      fs.writeFileSync(progressFilePath, initialContent, 'utf-8');
      console.log(`Created ${progressFilePath} with first entry.`);
    } else {
      const content = fs.readFileSync(progressFilePath, 'utf-8');
      const lines = content.split('\n');
      const delimiterIndex = lines.findIndex(line => line.includes(':---'));
      if (delimiterIndex !== -1) {
        lines.splice(delimiterIndex + 1, 0, newRow);
        fs.writeFileSync(progressFilePath, lines.join('\n'), 'utf-8');
        console.log(`Inserted new progress entry into ${progressFilePath}.`);
      } else {
        fs.appendFileSync(progressFilePath, `${newRow}\n`, 'utf-8');
        console.log(`Appended new progress entry to ${progressFilePath} (fallback).`);
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
