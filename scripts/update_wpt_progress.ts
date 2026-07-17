/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runWptFile } from './run_wpt_sandbox.ts';

interface SandboxConfig {
  exclude: string[];
  knownFailures: Record<string, string[]>;
}

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

async function main() {
  const configPath = path.resolve(process.cwd(), 'tests/fixtures/baselines/wpt-sandbox-known-failures.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: WPT sandbox config not found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const targetDir = path.resolve(process.cwd(), 'submodules/web-platform-tests/css/css-typed-om');
  const allFiles = crawlDirectory(targetDir).sort();

  console.log('Running WPT sandbox tests to compute progress...');
  let totalTests = 0;
  let passingTests = 0;
  let failingTests = 0;
  let fileCount = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    
    // Check exclude list
    let isExcluded = false;
    for (const excl of config.exclude || []) {
      if (relativePath === excl || relativePath.includes(excl)) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      continue;
    }

    fileCount++;
    try {
      const testQueue = runWptFile(filePath);
      for (const testItem of testQueue) {
        totalTests++;
        try {
          await testItem.fn();
          passingTests++;
        } catch {
          failingTests++;
        }
      }
    } catch (err) {
      // If file fails to initialize, treat it as failing all tests or just log it
      console.warn(`Warning: failed to run ${relativePath}:`, err);
    }
  }

  const passRate = totalTests > 0 ? ((passingTests / totalTests) * 100).toFixed(2) : '0.00';
  console.log(`\nResults: ${passingTests}/${totalTests} passed (${passRate}%), ${failingTests} failed. (Scanned ${fileCount} files)`);

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

  const progressFilePath = path.resolve(process.cwd(), 'wpt-typed-om-progress.md');
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
      if (parts.length >= 7) {
        const lastTotal = parseInt(parts[3], 10);
        const lastPassed = parseInt(parts[4], 10);
        const lastFailed = parseInt(parts[5], 10);

        if (lastTotal === totalTests && lastPassed === passingTests && lastFailed === failingTests) {
          console.log('No changes in test counts since last run. Skipping log update.');
          shouldAppend = false;
        }
      }
    }
  }

  if (shouldAppend) {
    const newRow = `| ${dateStr} | \`${commitStr}\` | ${totalTests} | ${passingTests} | ${failingTests} | ${passRate}% |`;
    
    if (!fileExists) {
      const initialContent = `# WPT Typed OM Sandbox Progress Log\n\n` +
        `This file tracks the conformance progress of the CSS Typed OM parser implementation against the W3C Web Platform Tests (WPT) sandbox runner.\n\n` +
        `| Date & Time (UTC) | Commit | Total Tests | Passing | Failing | Pass Rate |\n` +
        `| :--- | :--- | :---: | :---: | :---: | :---: |\n` +
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
