/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

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
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }
  await Promise.all(promises);
  return results;
}

export async function runCrawler(options: { spec?: string; file?: string; verbose?: boolean; concurrency?: number; updateProgress?: boolean; updateBaseline?: boolean } = {}): Promise<Record<string, SpecResult>> {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-sandbox-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: WPT sandbox config not found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const specResults: Record<string, SpecResult> = {};
  const allKnownFailures: Record<string, string[]> = {};
  const allSyntaxErrors: Record<string, string> = {};

  const concurrency = options.concurrency ?? Math.min(4, Math.max(1, os.availableParallelism() - 1));
  if (options.verbose) {
    console.log(`Using parallel concurrency limit: ${concurrency}`);
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
      // Monitor system health and throttle if load is too high or free memory is low
      const cpuCount = os.cpus().length;
      let load = os.loadavg()[0];
      let freeMem = os.freemem() / (1024 * 1024 * 1024); // GB
      
      if (load > cpuCount * 0.95 || freeMem < 1.5) {
        console.warn(`[System Health Guard] High Load: ${load.toFixed(1)} (cores: ${cpuCount}), Free Mem: ${freeMem.toFixed(2)}GB. Pausing worker for 1000ms...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Refresh load stats after sleep
        load = os.loadavg()[0];
        freeMem = os.freemem() / (1024 * 1024 * 1024);
      }

      let passing = 0;
      let total = 0;
      const failedTests: string[] = [];
      let loadError: string | undefined;

      try {
        const { stdout } = await execPromise(`"${process.execPath}" scripts/run_wpt_sandbox.ts "${filePath}" 2>&1`, { timeout: 4000 });
        if (options.verbose) {
          console.log(stdout);
        }
        const match = stdout.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
        if (options.updateBaseline) {
          const matches = stdout.matchAll(/^\s*✖ (.*)/gm);
          for (const m of matches) {
            failedTests.push(m[1].trim());
          }
        }
      } catch (err: unknown) {
        const stdout = (err && typeof err === 'object' && 'stdout' in err) ? String((err as Record<string, unknown>).stdout) : '';
        if (options.verbose) {
          console.log(stdout);
        }
        const match = stdout.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
        if (options.updateBaseline) {
          const loadErrorMatch = stdout.match(/Failed to run file .*?: (.*)/);
          if (loadErrorMatch) {
            loadError = loadErrorMatch[1].trim();
          } else {
            const matches = stdout.matchAll(/^\s*✖ (.*)/gm);
            for (const m of matches) {
              failedTests.push(m[1].trim());
            }
            if (failedTests.length === 0) {
              loadError = (err instanceof Error) ? err.message : String(err);
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
    for (const [, res] of Object.entries(specResults)) {
      grandTotal += res.total;
      grandPassing += res.passing;
    }
    const overallPassRate = grandTotal > 0 ? ((grandPassing / grandTotal) * 100).toFixed(2) : '0.00';

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
      rowParts.push(`${res.passing}/${res.total}`);
    }
    rowParts.push(`${grandPassing}/${grandTotal}`);
    rowParts.push(`${overallPassRate}%`);
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

  return specResults;
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('run_wpt_crawler.ts'))) {
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
