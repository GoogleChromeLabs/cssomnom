/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile, execSync } from 'node:child_process';
import { getBrowserOnlyFileCount } from './feasibility/audit.ts';

function countDeclaredTests(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/\b(test|async_test|promise_test)\s*\(/g);
    return matches ? Math.max(1, matches.length) : 1;
  } catch {
    return 1;
  }
}

function execFilePromise(
  file: string,
  args: string[],
  options: { timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: options.timeout }, (err, stdout, stderr) => {
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (err) {
        return reject(Object.assign(err, { stdout, stderr }));
      }
      resolve({ stdout, stderr });
    });

    let dStateCount = 0;
    const watchdogTimer = setInterval(() => {
      if (!child.pid || child.killed) {
        clearInterval(watchdogTimer);
        return;
      }
      try {
        const statPath = `/proc/${child.pid}/stat`;
        if (fs.existsSync(statPath)) {
          const statContent = fs.readFileSync(statPath, 'utf-8');
          const lastParen = statContent.lastIndexOf(')');
          if (lastParen !== -1) {
            const fields = statContent.slice(lastParen + 2).trim().split(/\s+/);
            const state = fields[0];
            const rssPages = parseInt(fields[21], 10);
            const rssMB = (rssPages * 4096) / (1024 * 1024);

            if (rssMB > 1536) {
              console.warn(`[Watchdog] Child PID ${child.pid} exceeded RSS limit (${rssMB.toFixed(1)}MB > 1536MB). Terminating with SIGKILL.`);
              child.kill('SIGKILL');
              clearInterval(watchdogTimer);
              return;
            }

            if (state === 'D') {
              dStateCount++;
              if (dStateCount >= 2) {
                console.warn(`[Watchdog] Child PID ${child.pid} entered uninterruptible sleep state D for 2 consecutive checks. Terminating with SIGKILL.`);
                child.kill('SIGKILL');
                clearInterval(watchdogTimer);
                return;
              }
            } else {
              dStateCount = 0;
            }
          }
        }
      } catch {
        // Child process may have exited during check
      }
    }, 250);
  });
}

interface SpecConfig {
  path: string;
  exclude: string[];
}

interface SandboxConfig {
  specs: Record<string, SpecConfig>;
}

export interface SpecResult {
  passing: number;
  total: number;
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

async function pool<T, R>(limit: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
      // Yield to event loop to allow system process scheduler to settle
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }
  await Promise.all(promises);
  return results;
}

export async function runCrawler(options: { spec?: string; file?: string; verbose?: boolean; concurrency?: number; updateProgress?: boolean; updateBaseline?: boolean } = {}): Promise<Record<string, SpecResult>> {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: WPT node config not found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const specResults: Record<string, SpecResult> = {};
  const allKnownFailures: Record<string, string[]> = {};
  const allSyntaxErrors: Record<string, string> = {};

  const _masterWatchdog = setInterval(() => {
    const masterRssMB = process.memoryUsage().rss / (1024 * 1024);
    if (masterRssMB > 2560) {
      console.error(`\x1b[31m[Fatal Memory Error] Master crawler process exceeded 2.5GB RSS (${masterRssMB.toFixed(0)}MB). Aborting to prevent system memory exhaustion.\x1b[0m`);
      process.exit(1);
    }
  }, 500).unref();

  const concurrency = options.concurrency ?? Math.min(24, Math.max(1, Math.floor((os.freemem() / (1024 * 1024 * 1024)) / 1.5)));
  if (options.verbose) {
    console.log(`Using parallel concurrency limit: ${concurrency}`);
  }

  if (options.updateProgress && (options.spec || options.file)) {
    console.error('Error: --update-progress cannot be run on a partial spec or single file.');
    process.exit(1);
  }

  let specsToRun = Object.entries(config.specs);
  if (options.spec) {
    specsToRun = specsToRun.filter(([name]) => name === options.spec);
    if (specsToRun.length === 0) {
      console.error(`Error: Spec "${options.spec}" not found in config.`);
      process.exit(1);
    }
  }

  for (const [specName, specConfig] of specsToRun) {
    if (options.verbose) {
      console.log(`Starting spec: ${specName}`);
    }
    const targetDir = path.resolve(process.cwd(), specConfig.path);
    if (!fs.existsSync(targetDir)) {
      if (options.verbose) {
        console.warn(`Warning: spec directory ${targetDir} not found, skipping.`);
      }
      specResults[specName] = { passing: 0, total: 0 };
      continue;
    }

    let filteredFiles: string[] = [];

    if (options.file) {
      const absFilePath = path.resolve(process.cwd(), options.file);
      if (absFilePath.startsWith(targetDir)) {
        filteredFiles = [absFilePath];
      } else {
        continue;
      }
    } else {
      const allFiles = crawlDirectory(targetDir).sort();
      filteredFiles = allFiles.filter(filePath => {
        const relativePath = path.relative(process.cwd(), filePath);
        for (const excl of specConfig.exclude || []) {
          if (relativePath === excl || relativePath.includes(excl)) {
            return false;
          }
        }
        return true;
      });
    }

    if (filteredFiles.length === 0) {
      continue;
    }

    let specTotal = 0;
    let specPassing = 0;

    const results = await pool(concurrency, filteredFiles, async (filePath) => {
      // Monitor memory health and pause if memory is dangerously low (< 500MB)
      const freeMem = os.freemem() / (1024 * 1024 * 1024); // GB
      if (freeMem < 0.5) {
        console.warn(`[System Health Guard] Free Mem critically low: ${freeMem.toFixed(2)}GB. Pausing worker for 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      let passing = 0;
      let total = 0;
      const failedTests: string[] = [];
      let loadError: string | undefined;

      try {
        const { stdout, stderr } = await execFilePromise(process.execPath, ['--max-old-space-size=1024', 'scripts/wpt/node/run.ts', filePath], { timeout: 15000 });
        const mergedOutput = stdout + '\n' + stderr;
        if (options.verbose) {
          console.log(mergedOutput);
        }
        const match = mergedOutput.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
        if (options.updateBaseline) {
          const matches = mergedOutput.matchAll(/^\s*✖ (.*)/gm);
          for (const m of matches) {
            failedTests.push(m[1]);
          }
        }
      } catch (err: unknown) {
        const errorObj = err as Record<string, unknown>;
        const stdout = typeof errorObj.stdout === 'string' ? errorObj.stdout : '';
        const stderr = typeof errorObj.stderr === 'string' ? errorObj.stderr : '';
        const mergedOutput = stdout + '\n' + stderr;
        
        if (options.verbose) {
          console.log(mergedOutput);
        }
        const match = mergedOutput.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        } else {
          passing = 0;
          total = countDeclaredTests(filePath);
        }
        if (options.updateBaseline) {
          const isTimeout = errorObj.killed === true || errorObj.signal === 'SIGTERM' || errorObj.signal === 'SIGKILL' || mergedOutput.includes('Runner timed out');
          const hasSummary = mergedOutput.includes('Summary:');
          if (isTimeout) {
            loadError = 'Runner timed out (execution took longer than 3.5s)';
          } else if (!hasSummary) {
            loadError = 'Process crashed during test execution';
          } else {
            const loadErrorMatch = mergedOutput.match(/Failed to run file .*?: (.*)/);
            if (loadErrorMatch) {
              loadError = loadErrorMatch[1].trim();
            } else {
              const matches = mergedOutput.matchAll(/^\s*✖ (.*)/gm);
              for (const m of matches) {
                failedTests.push(m[1]);
              }
              if (failedTests.length === 0) {
                loadError = (err instanceof Error) ? err.message : String(err);
              }
            }
          }
        }
      }
      return { passing, total, failedTests: failedTests.length > 0 ? failedTests : undefined, loadError };
    });

    for (let i = 0; i < filteredFiles.length; i++) {
      const filePath = filteredFiles[i];
      const relativePath = path.relative(process.cwd(), filePath);
      const res = results[i];
      specTotal += res.total;
      specPassing += res.passing;

      if (options.updateBaseline) {
        if (res.loadError) {
          allSyntaxErrors[relativePath] = res.loadError;
        } else if (res.total === 0) {
          allSyntaxErrors[relativePath] = 'Reftest or no harness tests found';
        } else if (res.failedTests) {
          allKnownFailures[relativePath] = res.failedTests;
        }
      }
    }

    specResults[specName] = { passing: specPassing, total: specTotal };
    if (options.verbose || specsToRun.length > 1 || options.file) {
      console.log(`- Spec ${specName}: ${specPassing}/${specTotal} passed.`);
    }
  }

  if (options.updateBaseline) {
    const baselinePath = path.resolve(process.cwd(), 'tests/fixtures/baselines/wpt-sandbox-known-failures.json');
    const excludeList = Object.keys(allSyntaxErrors).sort();
    const lines: string[] = [];
    lines.push('{');
    lines.push('  "exclude": [');
    for (let i = 0; i < excludeList.length; i++) {
      const isLast = i === excludeList.length - 1;
      lines.push(`    "${excludeList[i]}"${isLast ? '' : ','}`);
    }
    lines.push('  ],');
    lines.push('  "knownFailures": {');
    const failureEntries = Object.entries(allKnownFailures).sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < failureEntries.length; i++) {
      const [file, fails] = failureEntries[i];
      const isLast = i === failureEntries.length - 1;
      const failsJson = JSON.stringify(fails);
      lines.push(`    "${file}": ${failsJson}${isLast ? '' : ','}`);
    }
    lines.push('  }');
    lines.push('}');
    fs.writeFileSync(baselinePath, lines.join('\n') + '\n', 'utf-8');
    console.log(`\nSuccessfully updated baseline configuration at: ${baselinePath}`);
  }

  if (options.updateProgress) {
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

    let grandTotal = 0;
    let grandPassing = 0;
    let grandFeasible = 0;
    for (const [specKey, res] of Object.entries(specResults)) {
      grandTotal += res.total;
      grandPassing += res.passing;
      const outOfScope = getBrowserOnlyFileCount(specKey);
      const feasibleForSpec = Math.max(res.passing, res.total - outOfScope);
      grandFeasible += feasibleForSpec;
    }
    const overallPassRate = grandTotal > 0 ? ((grandPassing / grandTotal) * 100).toFixed(2) : '0.00';
    const normalizedPassRate = grandFeasible > 0 ? Math.min(100, (grandPassing / grandFeasible) * 100).toFixed(2) : '0.00';

    const EXPECTED_MINIMUM_TESTS = 16000;
    if (grandTotal < EXPECTED_MINIMUM_TESTS) {
      console.error(`Error: Overall total tests (${grandTotal}) is below minimum sanity threshold (${EXPECTED_MINIMUM_TESTS}). Aborting progress update to prevent log corruption.`);
      process.exit(1);
    }

    // Get git details
    let commitHash = 'unknown';
    let isDirty = false;
    try {
      commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
      const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      isDirty = status.length > 0;
    } catch {}
    const commitStr = commitHash + (isDirty ? '*' : '');
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const progressFilePath = path.resolve(process.cwd(), 'wpt-progress.md');
    const fileExists = fs.existsSync(progressFilePath);
    
    const rowParts = [dateStr, `\`${commitStr}\``];
    for (const key of specOrder) {
      const res = specResults[key] || { passing: 0, total: 0 };
      const outOfScope = getBrowserOnlyFileCount(key);
      const feasibleForSpec = Math.max(res.passing, res.total - outOfScope);
      rowParts.push(`${res.passing}/${feasibleForSpec}`);
    }
    rowParts.push(`${grandPassing}/${grandFeasible}`);
    rowParts.push(`${overallPassRate}%`);
    rowParts.push(`**${normalizedPassRate}%**`);
    const newRow = `| ${rowParts.join(' | ')} |`;

    if (!fileExists) {
      const headers = ['Date & Time (UTC)', 'Commit'];
      const alignments = [':---', ':---'];
      for (const key of specOrder) {
        const displayName = SPEC_DISPLAY_NAMES[key] || key;
        headers.push(`${displayName}`);
        alignments.push(':---:');
      }
      headers.push('Overall');
      alignments.push(':---:');
      headers.push('Raw Pass Rate');
      alignments.push(':---:');
      headers.push('Normalized');
      alignments.push(':---:');

      const initialContent = `# WPT Multi-Spec Conformance Progress Log\n\n` +
        `This file tracks the conformance progress of the CSSOM / Typed OM implementations across 7 major W3C Web Platform Tests (WPT) spec suites in pure Node.js (\`pnpm run wpt:node:progress\`).\n\n` +
        `### Historical Conformance Progress Log\n\n` +
        `| ${headers.join(' | ')} |\n` +
        `| ${alignments.join(' | ')} |\n` +
        `${newRow}\n`;
      fs.writeFileSync(progressFilePath, initialContent, 'utf-8');
      console.log(`Created ${progressFilePath} with first entry.`);
    } else {
      const content = fs.readFileSync(progressFilePath, 'utf-8');
      const lines = content.split('\n');
      const historyHeaderIndex = lines.findIndex(line => line.includes('### Historical Conformance Progress Log'));
      let delimiterIndex = -1;
      if (historyHeaderIndex !== -1) {
        for (let i = historyHeaderIndex; i < lines.length; i++) {
          if (lines[i].includes(':---')) {
            delimiterIndex = i;
            break;
          }
        }
      } else {
        delimiterIndex = lines.findIndex(line => line.includes(':---'));
      }

      if (delimiterIndex !== -1) {
        // Avoid inserting duplicate progress rows if scores are unchanged
        const previousRow = lines[delimiterIndex + 1];
        if (previousRow) {
          const prevNumbers = previousRow
            .split('|')
            .slice(3)
            .map(s => s.trim())
            .join('|');
          const currentNumbers = rowParts
            .slice(2)
            .map(s => s.trim())
            .join('|');

          if (prevNumbers === currentNumbers) {
            console.log(`[WPT Progress] Conformance numbers unchanged (${grandPassing}/${grandTotal} passed). Skipping progress update.`);
            return specResults;
          }
        }

        lines.splice(delimiterIndex + 1, 0, newRow);
        fs.writeFileSync(progressFilePath, lines.join('\n'), 'utf-8');
        console.log(`Inserted new progress entry into ${progressFilePath}.`);
      } else {
        fs.appendFileSync(progressFilePath, `${newRow}\n`, 'utf-8');
        console.log(`Appended new progress entry to ${progressFilePath} (fallback).`);
      }
    }
  }

  return specResults;
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('crawl.ts') || process.argv[1].endsWith('run_wpt_node_crawler.ts') || process.argv[1].endsWith('run_wpt_crawler.ts'))) {
  if (!process.execArgv.some(arg => arg.startsWith('--max-old-space-size'))) {
    console.error('\x1b[31m[Fatal Error] scripts/wpt/node/crawl.ts MUST be executed with `--max-old-space-size=1024` (e.g. `node --max-old-space-size=1024 scripts/wpt/node/crawl.ts`). Aborting to prevent unconstrained memory growth.\x1b[0m');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let spec: string | undefined;
  let file: string | undefined;
  let verbose = false;
  let concurrency: number | undefined;
  let updateProgress = false;
  let updateBaseline = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--spec' && i + 1 < args.length) {
      spec = args[i + 1];
      i++;
    } else if (args[i] === '--file' && i + 1 < args.length) {
      file = args[i + 1];
      i++;
    } else if (args[i] === '--concurrency' && i + 1 < args.length) {
      concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--verbose') {
      verbose = true;
    } else if (args[i] === '--update-progress') {
      updateProgress = true;
    } else if (args[i] === '--update-baseline') {
      updateBaseline = true;
    }
  }

  (async () => {
    const results = await runCrawler({ spec, file, verbose, concurrency, updateProgress, updateBaseline });
    let total = 0;
    let passing = 0;
    for (const [, res] of Object.entries(results)) {
      total += res.total;
      passing += res.passing;
    }
    const passRate = total > 0 ? ((passing / total) * 100).toFixed(2) : '0.00';
    console.log(`\nCrawler Completed: ${passing}/${total} passed (${passRate}%).`);
  })().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
