/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
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

export async function runCrawler(options: { spec?: string; file?: string; verbose?: boolean } = {}): Promise<Record<string, SpecResult>> {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-sandbox-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Error: WPT sandbox config not found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const specResults: Record<string, SpecResult> = {};

  const concurrency = Math.max(1, os.availableParallelism() - 1);
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
      let passing = 0;
      let total = 0;
      try {
        const { stdout } = await execPromise(`node scripts/run_wpt_sandbox.ts "${filePath}"`, { timeout: 10000 });
        if (options.verbose) {
          console.log(stdout);
        }
        const match = stdout.match(/Summary: (\d+)\/(\d+) passed/);
        if (match) {
          passing = parseInt(match[1], 10);
          total = parseInt(match[2], 10);
        }
      } catch (err: unknown) {
        const stdout = (err && typeof err === 'object' && 'stdout' in err) ? String((err as Record<string, unknown>).stdout) : '';
        if (options.verbose) {
          console.log(stdout);
          if (err instanceof Error) {
            console.error(err.message);
          }
        }
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
    if (options.verbose || specsToRun.length > 1 || options.file) {
      console.log(`- Spec ${specName}: ${specPassing}/${specTotal} passed.`);
    }
  }

  return specResults;
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('run_wpt_crawler.ts'))) {
  const args = process.argv.slice(2);
  let spec: string | undefined;
  let file: string | undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--spec' && i + 1 < args.length) {
      spec = args[i + 1];
      i++;
    } else if (args[i] === '--file' && i + 1 < args.length) {
      file = args[i + 1];
      i++;
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }

  (async () => {
    const results = await runCrawler({ spec, file, verbose });
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
