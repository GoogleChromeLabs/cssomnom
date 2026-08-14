/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const args = process.argv.slice(2);
let browser = 'chrome';
let testSpec = 'css/css-typed-om';
// Conservative default: max 4 processes
const defaultProcesses = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 4)));
let processes = defaultProcesses;
let limit: number | undefined;
let timeoutMs = 600000; // 10 minutes default safety timeout

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
  } else if (args[i].startsWith('--processes=')) {
    processes = parseInt(args[i].split('=')[1], 10);
  } else if (args[i] === '--limit' && i + 1 < args.length) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i].startsWith('--limit=')) {
    limit = parseInt(args[i].split('=')[1], 10);
  } else if (args[i] === '--timeout' && i + 1 < args.length) {
    timeoutMs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i].startsWith('--timeout=')) {
    timeoutMs = parseInt(args[i].split('=')[1], 10);
  } else if (!args[i].startsWith('-')) {
    testSpec = args[i];
  }
}

// Normalize testSpec path (e.g. "css-typed-om" -> "css/css-typed-om")
if (!testSpec.startsWith('css/') && !testSpec.startsWith('/') && !testSpec.includes('/')) {
  testSpec = `css/${testSpec}`;
}

const injectScript = path.resolve('dist/cssomnom.iife.global.js');
if (!fs.existsSync(injectScript)) {
  console.log(`[WPT Browser] Injected bundle not found at ${injectScript}. Building IIFE bundle...`);
  execSync('pnpm run build', { stdio: 'inherit' });
}

if (!fs.existsSync(injectScript)) {
  console.error(`[WPT Browser] Failed to locate injected bundle at: ${injectScript}`);
  process.exit(1);
}

const reportJson = path.resolve(`dist/report-${browser}.json`);
const screenshotFile = path.resolve(`dist/${browser}-screenshots.txt`);
const reportHtml = path.resolve(`dist/report-${browser}.html`);
const wptExecutable = path.resolve('submodules/web-platform-tests/wpt');

if (!fs.existsSync(wptExecutable)) {
  console.error(`[WPT Browser] WPT executable not found at: ${wptExecutable}`);
  process.exit(1);
}

const distDir = path.dirname(reportJson);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
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

console.log(`[WPT Browser] Processes: ${processes} (CPU count: ${os.cpus().length})`);
if (limit !== undefined && limit > 0) {
  console.log(`[WPT Browser] Test limit specified: ${limit}`);
}
console.log(`[WPT Browser] Target Spec: ${testSpec}`);
console.log(`[WPT Browser] Spawning: python3 ${wptExecutable} ${wptArgs.join(' ')}`);

let wptProcess: ChildProcess | null = null;
let cleanedUp = false;

function cleanupChildren() {
  if (cleanedUp || !wptProcess) return;
  cleanedUp = true;
  try {
    if (wptProcess.pid) {
      try {
        process.kill(-wptProcess.pid, 'SIGTERM');
      } catch {
        wptProcess.kill('SIGTERM');
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

process.on('SIGINT', () => {
  console.log('\n[WPT Browser] Received SIGINT. Cleaning up child processes...');
  cleanupChildren();
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n[WPT Browser] Received SIGTERM. Cleaning up child processes...');
  cleanupChildren();
  process.exit(143);
});

process.on('exit', () => {
  cleanupChildren();
});

const timeoutTimer = setTimeout(() => {
  console.error(`\n[WPT Browser] ⏱ Execution exceeded timeout threshold of ${timeoutMs}ms. Aborting...`);
  cleanupChildren();
  process.exit(1);
}, timeoutMs);
timeoutTimer.unref();

wptProcess = spawn('python3', [wptExecutable, ...wptArgs], {
  stdio: 'inherit',
  detached: false,
});

wptProcess.on('error', (err) => {
  clearTimeout(timeoutTimer);
  console.error('[WPT Browser] Failed to spawn python3 WPT runner:', err);
  process.exit(1);
});

wptProcess.on('close', (code, signal) => {
  clearTimeout(timeoutTimer);
  wptProcess = null;
  const exitCode = code ?? (signal ? 1 : 0);
  console.log(`[WPT Browser] Test execution exited with code ${exitCode}. Generating report...`);
  if (fs.existsSync(reportJson)) {
    try {
      execSync('node scripts/wpt/browser/report.ts', { stdio: 'inherit' });
    } catch (err) {
      console.error('[WPT Browser] Report generation error:', err);
    }
  }
  process.exit(exitCode);
});
