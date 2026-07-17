/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

interface SpecConfig {
  path: string;
  exclude: string[];
}

interface SandboxConfig {
  specs: Record<string, SpecConfig>;
}

interface SpecResult {
  passing: number;
  total: number;
}

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

function crawlDirectory(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'resources' && file !== 'crashtests') {
        crawlDirectory(filePath, fileList);
      }
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function pool<T, R>(limit: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }
  await Promise.all(promises);
  return results;
}

async function main() {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-sandbox-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: WPT sandbox config not found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const specResults: Record<string, SpecResult> = {};

  let grandTotal = 0;
  let grandPassing = 0;

  console.log('Running WPT sandbox tests across expanded specifications...');
  const concurrency = Math.max(1, os.availableParallelism() - 1);
  console.log(`Using parallel concurrency limit: ${concurrency}`);

  for (const [specName, specConfig] of Object.entries(config.specs)) {
    console.log(`Starting spec: ${specName}`);
    const targetDir = path.resolve(process.cwd(), specConfig.path);
    if (!fs.existsSync(targetDir)) {
      console.warn(`Warning: spec directory ${targetDir} not found, skipping.`);
      specResults[specName] = { passing: 0, total: 0 };
      continue;
    }

    const allFiles = crawlDirectory(targetDir).sort();
    const filteredFiles = allFiles.filter(filePath => {
      const relativePath = path.relative(process.cwd(), filePath);
      // Check exclude list
      for (const excl of specConfig.exclude || []) {
        if (relativePath === excl || relativePath.includes(excl)) {
          return false;
        }
      }
      return true;
    });

    let specTotal = 0;
    let specPassing = 0;

    const results = await pool(concurrency, filteredFiles, async (filePath) => {
      let passing = 0;
      let total = 0;
      try {
        const { stdout } = await execPromise(`node scripts/run_wpt_sandbox.ts "${filePath}"`, { timeout: 5000 });
        const match = stdout.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
      } catch (err: any) {
        const stdout = err.stdout || '';
        const match = stdout.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
      }
      return { passing, total };
    });

    for (const res of results) {
      specTotal += res.total;
      specPassing += res.passing;
    }

    specResults[specName] = { passing: specPassing, total: specTotal };
    grandTotal += specTotal;
    grandPassing += specPassing;
    console.log(`- Spec ${specName}: ${specPassing}/${specTotal} passed.`);
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
