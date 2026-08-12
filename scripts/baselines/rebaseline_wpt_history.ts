/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getBrowserOnlyFileCount } from '../wpt/node/feasibility/audit.ts';

const specKeys = ['css-typed-om', 'cssom', 'css-nesting', 'css-syntax', 'css-variables', 'selectors', 'mediaqueries'];

const progressPath = path.resolve(process.cwd(), 'wpt-progress.md');
const content = fs.readFileSync(progressPath, 'utf8');

const rawLines = content.split('\n');
const tableStartIndex = rawLines.findIndex(l => l.includes('### Historical Conformance Progress Log'));
if (tableStartIndex === -1) {
  console.error('Could not find Historical Conformance Progress Log section');
  process.exit(1);
}

const topLines = rawLines.slice(0, tableStartIndex + 1);
const historyLines = rawLines.slice(tableStartIndex + 1);

const cleanHistoryRows: string[] = [];
for (const line of historyLines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) continue;
  if (trimmed.startsWith('| Date & Time') || trimmed.startsWith('| :---')) continue;

  const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) continue;

  const date = parts[0];
  const commit = parts[1];

  if (parts.length >= 10 && parts[2].includes('/') && parts[3] !== '-') {
    let grandPassing = 0;
    let grandTotal = 0;
    let grandFeasible = 0;

    for (let s = 0; s < 7; s++) {
      const col = parts[2 + s];
      const key = specKeys[s];
      if (col && col.includes('/')) {
        const [passStr, totalStr] = col.split('/');
        const passing = parseInt(passStr, 10);
        const total = parseInt(totalStr, 10);
        grandPassing += passing;
        grandTotal += total;
        const outOfScope = getBrowserOnlyFileCount(key);
        grandFeasible += Math.max(passing, total - outOfScope);
      }
    }

    const rawRate = grandTotal > 0 ? ((grandPassing / grandTotal) * 100).toFixed(2) + '%' : '0.00%';
    const normRate = grandFeasible > 0 ? Math.min(100, (grandPassing / grandFeasible) * 100).toFixed(2) + '%' : '0.00%';

    const rowCols = [date, commit];
    for (let s = 0; s < 7; s++) {
      rowCols.push(parts[2 + s]);
    }
    rowCols.push(`${grandPassing}/${grandTotal}`);
    rowCols.push(rawRate);
    rowCols.push(`**${normRate}**`);

    cleanHistoryRows.push(`| ${rowCols.join(' | ')} |`);
  } else if (parts[2].includes('/')) {
    const [passStr, totalStr] = parts[2].split('/');
    const passing = parseInt(passStr, 10);
    const total = parseInt(totalStr, 10);
    const outOfScope = getBrowserOnlyFileCount('css-typed-om');
    const feasible = Math.max(passing, total - outOfScope);

    const rawRate = total > 0 ? ((passing / total) * 100).toFixed(2) + '%' : '0.00%';
    const normRate = feasible > 0 ? Math.min(100, (passing / feasible) * 100).toFixed(2) + '%' : '0.00%';

    const rowCols = [date, commit, `${passing}/${total}`, '-', '-', '-', '-', '-', '-', `${passing}/${total}`, rawRate, `**${normRate}**`];
    cleanHistoryRows.push(`| ${rowCols.join(' | ')} |`);
  }
}

const tableHeader = [
  '',
  '| Date & Time (UTC) | Commit | Typed OM | CSSOM | Nesting | Syntax | Variables | Selectors | MQ | Overall | Raw Pass Rate | Normalized |',
  '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ...cleanHistoryRows,
  '',
];

const finalContent = topLines.join('\n') + '\n' + tableHeader.join('\n');
fs.writeFileSync(progressPath, finalContent, 'utf8');
console.log('Successfully rebaselined clean historical conformance log in wpt-progress.md!');
