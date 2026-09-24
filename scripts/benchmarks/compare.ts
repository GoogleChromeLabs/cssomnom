/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeExecTestFile, execGit } from '../wpt/node/safe-child-process.ts';

export interface BenchmarkStats {
  name: string;
  samples: number;
  iterationsPerSample: number;
  medianMs: number;
  meanMs: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

export interface BenchmarkComparisonRow {
  name: string;
  baseMedianMs: number;
  baseOpsPerSec: number;
  targetMedianMs: number;
  targetOpsPerSec: number;
  deltaPercent: number; // positive = target is faster, negative = slower
  baseSpreadMs: number;
  targetSpreadMs: number;
  isSignificant: boolean;
}

const rootDir = process.cwd();

export const BENCHMARK_NAMES = [
  'tokenize: synthetic large (163KB)',
  'tokenize: modern.css (7.7KB)',
  'parse: synthetic large tokens (163KB)',
  'tokenize + parse: synthetic large (163KB)',
  'tokenize + parse: geocities.css (15KB)',
  'tokenize + parse: whatwg styles.css (11KB)',
  'tokenize + parse: modern.css (7.7KB)',
  'tokenize + parse: postcss cases (4.4KB)',
  'CSSStyleDeclaration: setProperty shorthands & read',
  'serialize: modern.css rules cssText',
  'round-trip: parse -> serialize -> reparse (geocities.css)',
  'matcher: complex selectors matches()',
  'cascade: getCascadedStyle()',
  'typed-om: parse values & math',
];

// Noise threshold determined empirically from A/A testing across isolated processes.
// Even with trimmed stats and process isolation, short/micro sub-100ms runs exhibit up to ±13%
// jitter due to V8 code tiering & heap layout variance across fresh process starts.
export const NOISE_FLOOR_PERCENT = 15.0;

export async function runSingleBenchmarkInDir(workDir: string, benchName: string): Promise<BenchmarkStats> {
  const benchScript = path.join(workDir, 'scripts/benchmarks/parser.bench.ts');

  // Sync latest benchmark script into workDir
  const canonicalScript = path.join(rootDir, 'scripts/benchmarks/parser.bench.ts');
  const targetScriptDir = path.dirname(benchScript);
  if (!fs.existsSync(targetScriptDir)) {
    fs.mkdirSync(targetScriptDir, { recursive: true });
  }
  const canonicalContent = fs.readFileSync(canonicalScript, 'utf-8');
  fs.writeFileSync(benchScript, canonicalContent, 'utf-8');

  // Ensure submodules link exists in worktree
  const worktreeSubmodules = path.join(workDir, 'submodules');
  const realSubmodules = path.join(rootDir, 'submodules');
  try {
    if (fs.existsSync(worktreeSubmodules)) {
      const stat = fs.lstatSync(worktreeSubmodules);
      if (stat.isSymbolicLink()) {
        const dest = fs.readlinkSync(worktreeSubmodules);
        if (dest !== realSubmodules) {
          fs.unlinkSync(worktreeSubmodules);
          fs.symlinkSync(realSubmodules, worktreeSubmodules);
        }
      } else if (stat.isDirectory()) {
        fs.rmSync(worktreeSubmodules, { recursive: true, force: true });
        fs.symlinkSync(realSubmodules, worktreeSubmodules);
      }
    } else {
      fs.symlinkSync(realSubmodules, worktreeSubmodules);
    }
  } catch {
    // Ignore if exists or cannot link
  }

  const res = await safeExecTestFile('', {
    runnerPath: benchScript,
    args: ['--json', `--bench=${benchName}`],
    maxOldSpaceSize: 1024,
    timeout: 120000,
    cwd: workDir,
  });

  if (res.status !== 'OK') {
    throw new Error(`Benchmark run in ${workDir} for "${benchName}" failed (${res.status}): ${res.stderr || res.stdout}`);
  }

  const stdout = res.stdout.trim();
  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Failed to find JSON benchmark array in output for "${benchName}":\n${stdout}`);
  }

  const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as BenchmarkStats[];
  if (!parsed || parsed.length === 0) {
    throw new Error(`Empty benchmark results for "${benchName}"`);
  }
  return parsed[0];
}

export function ensureWorktree(ref: string): string {
  const worktreeDir = path.join(rootDir, '.worktrees', ref.replace(/[^a-zA-Z0-9._-]/g, '_'));
  if (!fs.existsSync(worktreeDir)) {
    console.log(`Creating worktree for ${ref} at ${worktreeDir}...`);
    execGit(['worktree', 'add', '-d', worktreeDir, ref]);
    console.log(`Running pnpm install in ${worktreeDir}...`);
    execGit(['-C', worktreeDir, 'install']);
  }
  // Ensure submodules symlink
  const worktreeSubmodules = path.join(worktreeDir, 'submodules');
  if (!fs.existsSync(worktreeSubmodules)) {
    try {
      fs.symlinkSync(path.join(rootDir, 'submodules'), worktreeSubmodules);
    } catch {
      // Ignore
    }
  }
  return worktreeDir;
}

export function formatComparisonTable(
  baseLabel: string,
  targetLabel: string,
  baseResults: BenchmarkStats[],
  targetResults: BenchmarkStats[]
): { tableMarkdown: string; rows: BenchmarkComparisonRow[] } {
  const baseMap = new Map<string, BenchmarkStats>();
  for (const b of baseResults) {
    baseMap.set(b.name, b);
  }

  const rows: BenchmarkComparisonRow[] = [];

  for (const t of targetResults) {
    const b = baseMap.get(t.name);
    if (!b) continue;

    // Delta in throughput (ops/sec)
    const deltaPercent = b.opsPerSec > 0
      ? ((t.opsPerSec - b.opsPerSec) / b.opsPerSec) * 100
      : 0;

    const isSignificant = Math.abs(deltaPercent) > NOISE_FLOOR_PERCENT;

    rows.push({
      name: t.name,
      baseMedianMs: b.medianMs,
      baseOpsPerSec: b.opsPerSec,
      targetMedianMs: t.medianMs,
      targetOpsPerSec: t.opsPerSec,
      deltaPercent,
      baseSpreadMs: b.stdDevMs,
      targetSpreadMs: t.stdDevMs,
      isSignificant,
    });
  }

  const lines: string[] = [];
  lines.push(`| Benchmark | ${baseLabel} (ms) | ${targetLabel} (ms) | Delta (ops/s) | ${baseLabel} (op/s) | ${targetLabel} (op/s) | Significance |`);
  lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');

  for (const r of rows) {
    const deltaSign = r.deltaPercent >= 0 ? '+' : '';
    const deltaStr = `${deltaSign}${r.deltaPercent.toFixed(1)}%`;
    let status = 'flat (within noise floor)';
    if (r.deltaPercent > NOISE_FLOOR_PERCENT) {
      status = `**${deltaStr}** (faster)`;
    } else if (r.deltaPercent < -NOISE_FLOOR_PERCENT) {
      status = `**${deltaStr}** (slower)`;
    }

    const baseMs = `${r.baseMedianMs.toFixed(2)} ±${r.baseSpreadMs.toFixed(2)}`;
    const targetMs = `${r.targetMedianMs.toFixed(2)} ±${r.targetSpreadMs.toFixed(2)}`;
    const baseOps = r.baseOpsPerSec.toFixed(1);
    const targetOps = r.targetOpsPerSec.toFixed(1);

    lines.push(`| \`${r.name}\` | ${baseMs} | ${targetMs} | ${deltaStr} | ${baseOps} | ${targetOps} | ${status} |`);
  }

  return { tableMarkdown: lines.join('\n'), rows };
}

async function main() {
  const args = process.argv.slice(2);
  let baseRef = 'f8c80d0'; // default pre-janitor
  let targetRef = '1db8d91'; // default post-janitor
  const singleBench = args.find(a => a.startsWith('--bench='))?.slice('--bench='.length);

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--base=')) {
      baseRef = args[i].slice('--base='.length);
    } else if (args[i].startsWith('--target=')) {
      targetRef = args[i].slice('--target='.length);
    } else if (args[i] === '--base' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--target' && args[i + 1]) {
      targetRef = args[++i];
    }
  }

  console.log(`\n================================================================================`);
  console.log(`CSSOMNOM INTERLEAVED CROSS-REF BENCHMARK COMPARISON`);
  console.log(`Base Ref:   ${baseRef}`);
  console.log(`Target Ref: ${targetRef}`);
  console.log(`Noise Floor Threshold: ±${NOISE_FLOOR_PERCENT.toFixed(1)}%`);
  console.log(`Mode: Isolated subprocess per benchmark, interleaved AB/BA execution`);
  console.log(`================================================================================\n`);

  const baseDir = ensureWorktree(baseRef);
  const targetDir = ensureWorktree(targetRef);

  const benchmarksToRun = singleBench ? [singleBench] : BENCHMARK_NAMES;

  const baseResults: BenchmarkStats[] = [];
  const targetResults: BenchmarkStats[] = [];

  for (let idx = 0; idx < benchmarksToRun.length; idx++) {
    const benchName = benchmarksToRun[idx];
    console.log(`[${idx + 1}/${benchmarksToRun.length}] Benchmarking "${benchName}"...`);

    // Interleave execution order: even indices run A then B; odd indices run B then A
    if (idx % 2 === 0) {
      process.stdout.write(`  ↳ [${baseRef}]... `);
      const bRes = await runSingleBenchmarkInDir(baseDir, benchName);
      console.log(`${bRes.medianMs.toFixed(2)} ms (${bRes.opsPerSec.toFixed(1)} op/s)`);

      process.stdout.write(`  ↳ [${targetRef}]... `);
      const tRes = await runSingleBenchmarkInDir(targetDir, benchName);
      console.log(`${tRes.medianMs.toFixed(2)} ms (${tRes.opsPerSec.toFixed(1)} op/s)`);

      baseResults.push(bRes);
      targetResults.push(tRes);
    } else {
      process.stdout.write(`  ↳ [${targetRef}]... `);
      const tRes = await runSingleBenchmarkInDir(targetDir, benchName);
      console.log(`${tRes.medianMs.toFixed(2)} ms (${tRes.opsPerSec.toFixed(1)} op/s)`);

      process.stdout.write(`  ↳ [${baseRef}]... `);
      const bRes = await runSingleBenchmarkInDir(baseDir, benchName);
      console.log(`${bRes.medianMs.toFixed(2)} ms (${bRes.opsPerSec.toFixed(1)} op/s)`);

      baseResults.push(bRes);
      targetResults.push(tRes);
    }
  }

  const { tableMarkdown, rows } = formatComparisonTable(baseRef, targetRef, baseResults, targetResults);

  console.log('\n' + tableMarkdown + '\n');

  const regressions = rows.filter((r) => r.deltaPercent < -NOISE_FLOOR_PERCENT);
  const improvements = rows.filter((r) => r.deltaPercent > NOISE_FLOOR_PERCENT);

  console.log('--- Summary Analysis ---');
  if (improvements.length > 0) {
    console.log(`Improvements (>+${NOISE_FLOOR_PERCENT}% faster): ${improvements.length}`);
    for (const imp of improvements) {
      console.log(`  ✓ ${imp.name}: +${imp.deltaPercent.toFixed(1)}%`);
    }
  } else {
    console.log(`No significant performance improvements (>+${NOISE_FLOOR_PERCENT}%).`);
  }

  if (regressions.length > 0) {
    console.log(`Regressions (<-${NOISE_FLOOR_PERCENT}% slower): ${regressions.length}`);
    for (const reg of regressions) {
      console.log(`  ⚠ ${reg.name}: ${reg.deltaPercent.toFixed(1)}%`);
    }
  } else {
    console.log(`No regressions (<-${NOISE_FLOOR_PERCENT}% slowdown) detected.`);
  }
}

// Only run main if invoked directly
if (process.argv[1] && (process.argv[1].endsWith('compare.ts') || process.argv[1].endsWith('compare.js'))) {
  main().catch((err) => {
    console.error('Fatal error during benchmark comparison:', err);
    process.exit(1);
  });
}
