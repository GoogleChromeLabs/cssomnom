/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeExecTestFile, safeWorkerPool, type ExecResult } from './safe-child-process.ts';

interface SpecConfig {
  path: string;
  exclude: string[];
}

interface SandboxConfig {
  specs: Record<string, SpecConfig>;
}

export interface FileProfileResult {
  file: string;
  spec: string;
  durationMs: number;
  peakRssMb: number;
  passing: number;
  total: number;
  status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR';
  exitCode: number | null;
  signal: string | null;
  errorMessage?: string;
}

function crawlDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
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

function countDeclaredTests(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/\b(test|async_test|promise_test)\s*\(/g);
    return matches ? Math.max(1, matches.length) : 1;
  } catch {
    return 1;
  }
}

export async function runProfileScan(options: {
  concurrency?: number;
  timeout?: number;
  maxRssMb?: number;
  specFilter?: string;
  outputJsonPath?: string;
} = {}): Promise<FileProfileResult[]> {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;

  const filesToScan: { file: string; spec: string }[] = [];

  for (const [specName, specConfig] of Object.entries(config.specs)) {
    if (options.specFilter && specName !== options.specFilter) continue;
    const specDir = path.resolve(process.cwd(), specConfig.path);
    const files = crawlDirectory(specDir);
    for (const f of files) {
      const rel = path.relative(process.cwd(), f);
      const isExcluded = specConfig.exclude.some(excl => rel === excl || rel.includes(excl));
      if (!isExcluded) {
        filesToScan.push({ file: f, spec: specName });
      }
    }
  }

  console.log(`Discovered ${filesToScan.length} test files across WPT suites.`);
  const concurrency = options.concurrency ?? Math.min(12, Math.max(1, Math.floor((os.freemem() / (1024 * 1024 * 1024)) / 2)));
  console.log(`Running profile scan with concurrency: ${concurrency}`);

  let completedCount = 0;
  const results = await safeWorkerPool(
    filesToScan,
    async ({ file, spec }) => {
      const relativePath = path.relative(process.cwd(), file);
      let execRes: ExecResult;
      let errorMsg: string | undefined;

      try {
        execRes = await safeExecTestFile(file, {
          timeout: options.timeout ?? 15000,
          maxRssMb: options.maxRssMb ?? 6144,
          pollIntervalMs: 25,
        });
      } catch (err: unknown) {
        const errorObj = err as ExecResult & { message?: string };
        execRes = {
          stdout: typeof errorObj.stdout === 'string' ? errorObj.stdout : '',
          stderr: typeof errorObj.stderr === 'string' ? errorObj.stderr : '',
          durationMs: typeof errorObj.durationMs === 'number' ? errorObj.durationMs : 0,
          peakRssMb: typeof errorObj.peakRssMb === 'number' ? errorObj.peakRssMb : 0,
          exitCode: typeof errorObj.exitCode === 'number' ? errorObj.exitCode : null,
          signal: typeof errorObj.signal === 'string' ? errorObj.signal : null,
          status: errorObj.status || 'ERROR',
        };
        errorMsg = errorObj.message;
      }

      const mergedOutput = execRes.stdout + '\n' + execRes.stderr;
      let passing = 0;
      let total = 0;

      const summaryMatch = mergedOutput.match(/Summary: (\d+)\/(\d+) passed/);
      if (summaryMatch) {
        passing = parseInt(summaryMatch[1], 10);
        total = parseInt(summaryMatch[2], 10);
      } else {
        const passCount = (mergedOutput.match(/^\s*✔/gm) || []).length;
        const failCount = (mergedOutput.match(/^\s*✖/gm) || []).length;
        if (passCount > 0 || failCount > 0) {
          passing = passCount;
          total = passCount + failCount;
        } else {
          total = countDeclaredTests(file);
        }
      }

      completedCount++;
      if (completedCount % 50 === 0 || completedCount === filesToScan.length) {
        console.log(`Progress: ${completedCount}/${filesToScan.length} files scanned...`);
      }

      const fileResult: FileProfileResult = {
        file: relativePath,
        spec,
        durationMs: execRes.durationMs,
        peakRssMb: Math.round(execRes.peakRssMb * 10) / 10,
        passing,
        total,
        status: execRes.status,
        exitCode: execRes.exitCode,
        signal: execRes.signal,
        errorMessage: errorMsg,
      };

      return fileResult;
    },
    { concurrency }
  );

  const outPath = options.outputJsonPath ?? path.resolve(process.cwd(), 'tests/fixtures/profiling/wpt-profile-scan.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nScan complete! Saved raw profile to: ${outPath}`);

  return results;
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('profile-scan.ts'))) {
  (async () => {
    const results = await runProfileScan();

    console.log('\n================ TOP 20 FILES BY DURATION (WALL-CLOCK MS) ================');
    const sortedByDuration = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20);
    console.table(
      sortedByDuration.map(r => ({
        file: r.file.replace('submodules/web-platform-tests/css/', ''),
        durationMs: r.durationMs,
        peakRssMb: r.peakRssMb,
        pass: `${r.passing}/${r.total}`,
        status: r.status,
      }))
    );

    console.log('\n================ TOP 20 FILES BY PEAK RSS (MB) ================');
    const sortedByRss = [...results].sort((a, b) => b.peakRssMb - a.peakRssMb).slice(0, 20);
    console.table(
      sortedByRss.map(r => ({
        file: r.file.replace('submodules/web-platform-tests/css/', ''),
        peakRssMb: r.peakRssMb,
        durationMs: r.durationMs,
        pass: `${r.passing}/${r.total}`,
        status: r.status,
      }))
    );

    console.log('\n================ NON-OK (TIMEOUT / WATCHDOG_KILLED / ERROR) FILES ================');
    const nonOkFiles = results.filter(r => r.status !== 'OK' || r.passing < r.total);
    console.log(`Total non-OK or failing files: ${nonOkFiles.length}`);
    const badStatus = results.filter(r => r.status !== 'OK');
    console.table(
      badStatus.map(r => ({
        file: r.file.replace('submodules/web-platform-tests/css/', ''),
        status: r.status,
        durationMs: r.durationMs,
        peakRssMb: r.peakRssMb,
        pass: `${r.passing}/${r.total}`,
      }))
    );
  })();
}
