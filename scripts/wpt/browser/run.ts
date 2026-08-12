/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { execSync, spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const args = process.argv.slice(2);
let browser = 'chrome';
let testSpec = 'css/css-typed-om';
let processes = 16;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--browser' && i + 1 < args.length) {
    browser = args[i + 1];
    i++;
  } else if (args[i].startsWith('--browser=')) {
    browser = args[i].split('=')[1];
  } else if (args[i] === '--spec' && i + 1 < args.length) {
    testSpec = args[i + 1];
    i++;
  } else if (args[i].startsWith('--spec=')) {
    testSpec = args[i].split('=')[1];
  } else if (args[i] === '--processes' && i + 1 < args.length) {
    processes = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('-')) {
    testSpec = args[i];
  }
}

console.log(`[WPT Browser] Building browser IIFE global bundle...`);
execSync('pnpm run build', { stdio: 'inherit' });

const reportJson = path.resolve(`dist/report-${browser}.json`);
const screenshotFile = path.resolve(`dist/${browser}-screenshots.txt`);
const reportHtml = path.resolve(`dist/report-${browser}.html`);
const injectScript = path.resolve('dist/cssomnom.iife.global.js');
const wptExecutable = path.resolve('submodules/web-platform-tests/wpt');

if (!fs.existsSync(injectScript)) {
  console.error(`Injected bundle not found at: ${injectScript}`);
  process.exit(1);
}

const wptArgs = [
  'run',
  '--processes', String(processes),
  '--headless',
  '-y',
  '--log-wptreport', reportJson,
  '--log-wptscreenshot', screenshotFile,
  '--log-html', reportHtml,
  '--inject-script', injectScript,
  browser,
  testSpec,
];

console.log(`[WPT Browser] Spawning: python3 ${wptExecutable} ${wptArgs.join(' ')}`);

const wptProcess = spawn('python3', [wptExecutable, ...wptArgs], {
  stdio: 'inherit',
});

wptProcess.on('close', (code) => {
  console.log(`[WPT Browser] Test execution exited with code ${code}. Generating report...`);
  try {
    execSync('node scripts/wpt/browser/report.ts', { stdio: 'inherit' });
  } catch (err) {
    console.error('[WPT Browser] Report generation error:', err);
  }
});
