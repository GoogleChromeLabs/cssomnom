/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeExecTestFile, type ExecResult } from './safe-child-process.ts';

export interface MonsterBenchmarkResult {
  file: string;
  durationMs: number;
  peakRssMb: number;
  status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR';
  exitCode: number | null;
  signal: string | null;
  passing: number;
  total: number;
  timeSeries: { elapsedMs: number; rssMB: number; state: string }[];
  errorMessage?: string;
  runSummary?: string;
}

export async function benchmarkMonsterFile(
  relPath: string,
  options: {
    timeout?: number;
    maxOldSpaceSize?: number;
    maxRssMb?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<MonsterBenchmarkResult> {
  const fullPath = path.resolve(process.cwd(), relPath);
  const timeSeries: { elapsedMs: number; rssMB: number; state: string }[] = [];

  let execRes: ExecResult;
  let errorMsg: string | undefined;

  try {
    execRes = await safeExecTestFile(fullPath, {
      timeout: options.timeout ?? 60000,
      maxOldSpaceSize: options.maxOldSpaceSize ?? 4096,
      maxRssMb: options.maxRssMb ?? 8192,
      pollIntervalMs: options.pollIntervalMs ?? 50,
      onSample: (sample) => {
        timeSeries.push({
          elapsedMs: sample.elapsedMs,
          rssMB: Math.round(sample.rssMB * 10) / 10,
          state: sample.state,
        });
      },
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
    passing = passCount;
    total = passCount + failCount;
  }

  return {
    file: relPath,
    durationMs: execRes.durationMs,
    peakRssMb: Math.round(execRes.peakRssMb * 10) / 10,
    status: execRes.status,
    exitCode: execRes.exitCode,
    signal: execRes.signal,
    passing,
    total,
    timeSeries,
    errorMessage: errorMsg,
    runSummary: summaryMatch ? summaryMatch[0] : (mergedOutput.slice(-300).trim()),
  };
}

async function main() {
  const targetFiles = [
    // 5 Watchdog Killed files
    'submodules/web-platform-tests/css/selectors/selectors-case-sensitive-001.html',
    'submodules/web-platform-tests/css/selectors/focus-visible-009.html',
    'submodules/web-platform-tests/css/selectors/focus-in-focus-event-001.html',
    'submodules/web-platform-tests/css/selectors/has-focus-display-change.html',
    'submodules/web-platform-tests/css/cssom/style-attr-update-across-documents.html',
    // CPU/Memory intensive test files
    'submodules/web-platform-tests/css/selectors/invalidation/has-complexity.html',
    'submodules/web-platform-tests/css/css-typed-om/the-stylepropertymap/properties/logical.html',
    'submodules/web-platform-tests/css/css-typed-om/the-stylepropertymap/properties/scroll-margin.html',
    'submodules/web-platform-tests/css/css-typed-om/the-stylepropertymap/properties/scroll-padding.html',
    'submodules/web-platform-tests/css/selectors/invalidation/not-pseudo-containing-complex-in-has.html',
    'submodules/web-platform-tests/css/selectors/invalidation/has-in-ancestor-position.html',
    'submodules/web-platform-tests/css/selectors/invalidation/is-pseudo-containing-complex-in-has.html',
    'submodules/web-platform-tests/css/css-variables/variables-animation-math-functions.html',
  ];

  console.log(`Starting isolated benchmarking of ${targetFiles.length} monster/heavy files...`);
  console.log(`Budget per file: 60s timeout, 4096MB V8 heap, 8192MB RSS limit.\n`);

  const results: MonsterBenchmarkResult[] = [];

  for (const relPath of targetFiles) {
    console.log(`▶ Benchmarking: ${relPath}`);
    const res = await benchmarkMonsterFile(relPath, {
      timeout: 60000,
      maxOldSpaceSize: 4096,
      maxRssMb: 8192,
      pollIntervalMs: 50,
    });
    results.push(res);
    console.log(`  ✔ Status: ${res.status} | Duration: ${res.durationMs}ms | Peak RSS: ${res.peakRssMb}MB | Pass: ${res.passing}/${res.total}`);
    if (res.timeSeries.length > 0) {
      const sampleStride = Math.max(1, Math.floor(res.timeSeries.length / 5));
      const samplePoints = res.timeSeries.filter((_, i) => i % sampleStride === 0 || i === res.timeSeries.length - 1);
      console.log(`  📈 Memory Profile: ${samplePoints.map(p => `${p.elapsedMs}ms: ${p.rssMB}MB`).join(' -> ')}`);
    }
    console.log('');
  }

  const outPath = path.resolve(process.cwd(), 'tests/fixtures/profiling/wpt-monsters-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nBenchmark complete! Saved results to ${outPath}`);

  console.log('\n================ ISOLATED BENCHMARK SUMMARY ================');
  console.table(
    results.map(r => ({
      file: r.file.replace('submodules/web-platform-tests/css/', ''),
      status: r.status,
      durationMs: r.durationMs,
      peakRssMb: r.peakRssMb,
      passRate: `${r.passing}/${r.total}`,
    }))
  );
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('benchmark-monsters.ts'))) {
  main().catch(console.error);
}
