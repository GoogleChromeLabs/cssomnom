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

// Mapping of benchmarks to primary source files exercised
export const BENCHMARK_EXERCISED_FILES: Record<string, string[]> = {
  'tokenize: synthetic large (163KB)': ['src/tokenizer.ts', 'src/AbstractTokenizer.ts', 'src/types.ts'],
  'tokenize: modern.css (7.7KB)': ['src/tokenizer.ts', 'src/AbstractTokenizer.ts', 'src/types.ts'],
  'parse: synthetic large tokens (163KB)': ['src/parser.ts', 'src/parse-hooks.ts', 'src/rules/at-rules.ts'],
  'tokenize + parse: synthetic large (163KB)': ['src/tokenizer.ts', 'src/parser.ts', 'src/rules/at-rules.ts'],
  'tokenize + parse: geocities.css (15KB)': ['src/tokenizer.ts', 'src/parser.ts', 'src/rules/at-rules.ts'],
  'tokenize + parse: whatwg styles.css (11KB)': ['src/tokenizer.ts', 'src/parser.ts', 'src/rules/at-rules.ts'],
  'tokenize + parse: modern.css (7.7KB)': ['src/tokenizer.ts', 'src/parser.ts', 'src/rules/at-rules.ts'],
  'tokenize + parse: postcss cases (4.4KB)': ['src/tokenizer.ts', 'src/parser.ts', 'src/rules/at-rules.ts'],
  'CSSStyleDeclaration: setProperty shorthands & read': ['src/CSSStyleDeclaration.ts', 'src/shorthands.ts', 'src/serializer.ts'],
  'serialize: modern.css rules cssText': ['src/serializer.ts'],
  'round-trip: parse -> serialize -> reparse (geocities.css)': ['src/parser.ts', 'src/serializer.ts', 'src/tokenizer.ts'],
  'matcher: complex selectors matches()': ['src/matcher.ts'],
  'cascade: getCascadedStyle()': ['src/cascade/index.ts', 'src/cascade/computed-style.ts', 'src/cascade/value-processor.ts', 'src/cascade/cascade-sorter.ts'],
  'typed-om: parse values & math': ['src/typed-om.ts', 'src/typed-om/index.ts', 'src/typed-om/values/style-value-parser.ts'],
};

// Per-benchmark noise thresholds determined empirically from repeated A/A runs across isolated worktrees.
// Heavy parsing/round-trip workloads stabilize within ±5%, while short loops have up to ±10-15% JIT variance.
export const BENCHMARK_NOISE_THRESHOLDS: Record<string, number> = {
  'tokenize: synthetic large (163KB)': 12.0,
  'tokenize: modern.css (7.7KB)': 8.0,
  'parse: synthetic large tokens (163KB)': 5.0,
  'tokenize + parse: synthetic large (163KB)': 5.0,
  'tokenize + parse: geocities.css (15KB)': 5.0,
  'tokenize + parse: whatwg styles.css (11KB)': 8.0,
  'tokenize + parse: modern.css (7.7KB)': 10.0,
  'tokenize + parse: postcss cases (4.4KB)': 10.0,
  'CSSStyleDeclaration: setProperty shorthands & read': 6.0,
  'serialize: modern.css rules cssText': 6.0,
  'round-trip: parse -> serialize -> reparse (geocities.css)': 5.0,
  'matcher: complex selectors matches()': 12.0,
  'cascade: getCascadedStyle()': 5.0,
  'typed-om: parse values & math': 10.0,
};

export const DEFAULT_NOISE_FLOOR_PERCENT = 8.0;

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
  targetResults: BenchmarkStats[],
  unchangedBenchmarks?: Set<string>
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

    const threshold = BENCHMARK_NOISE_THRESHOLDS[t.name] ?? DEFAULT_NOISE_FLOOR_PERCENT;
    const isSignificant = Math.abs(deltaPercent) > threshold;

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
  lines.push(`| Benchmark | ${baseLabel} (ms) | ${targetLabel} (ms) | Delta (ops/s) | ${baseLabel} (op/s) | ${targetLabel} (op/s) | Noise Thr | Significance |`);
  lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

  for (const r of rows) {
    const deltaSign = r.deltaPercent >= 0 ? '+' : '';
    const deltaStr = `${deltaSign}${r.deltaPercent.toFixed(1)}%`;
    const threshold = BENCHMARK_NOISE_THRESHOLDS[r.name] ?? DEFAULT_NOISE_FLOOR_PERCENT;
    let status = 'flat (within noise)';
    if (r.deltaPercent > threshold) {
      status = `**${deltaStr}** (faster)`;
    } else if (r.deltaPercent < -threshold) {
      status = `**${deltaStr}** (slower)`;
    }

    if (unchangedBenchmarks && unchangedBenchmarks.has(r.name)) {
      if (r.isSignificant) {
        status += ' ⚠️ [SOURCE UNCHANGED]';
      } else {
        status += ' [source unchanged]';
      }
    }

    const baseMs = `${r.baseMedianMs.toFixed(2)} ±${r.baseSpreadMs.toFixed(2)}`;
    const targetMs = `${r.targetMedianMs.toFixed(2)} ±${r.targetSpreadMs.toFixed(2)}`;
    const baseOps = r.baseOpsPerSec.toFixed(1);
    const targetOps = r.targetOpsPerSec.toFixed(1);

    lines.push(`| \`${r.name}\` | ${baseMs} | ${targetMs} | ${deltaStr} | ${baseOps} | ${targetOps} | ±${threshold.toFixed(1)}% | ${status} |`);
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
  console.log(`Noise Model: Per-benchmark empirical thresholds (5% - 8%)`);
  console.log(`Mode: Isolated subprocess per benchmark, interleaved AB/BA execution`);
  console.log(`================================================================================\n`);

  const baseDir = ensureWorktree(baseRef);
  const targetDir = ensureWorktree(targetRef);

  // Determine unchanged benchmarks by diffing exercised source files between baseRef and targetRef
  const unchangedBenchmarks = new Set<string>();
  if (baseRef !== targetRef) {
    try {
      const diffOut = execGit(['diff', `${baseRef}..${targetRef}`, '--name-only']);
      const changedFiles = new Set(diffOut.split('\n').map(s => s.trim()).filter(Boolean));
      for (const [benchName, files] of Object.entries(BENCHMARK_EXERCISED_FILES)) {
        const hasChange = files.some(f => changedFiles.has(f));
        if (!hasChange) {
          unchangedBenchmarks.add(benchName);
        }
      }
    } catch {
      // If git diff fails, proceed without control annotations
    }
  } else {
    for (const name of BENCHMARK_NAMES) {
      unchangedBenchmarks.add(name);
    }
  }

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

  const { tableMarkdown, rows } = formatComparisonTable(baseRef, targetRef, baseResults, targetResults, unchangedBenchmarks);

  console.log('\n' + tableMarkdown + '\n');

  const regressions = rows.filter((r) => r.isSignificant && r.deltaPercent < 0);
  const improvements = rows.filter((r) => r.isSignificant && r.deltaPercent > 0);

  console.log('--- Summary Analysis ---');
  if (improvements.length > 0) {
    console.log(`Improvements: ${improvements.length}`);
    for (const imp of improvements) {
      const isUnchanged = unchangedBenchmarks.has(imp.name);
      console.log(`  ✓ ${imp.name}: +${imp.deltaPercent.toFixed(1)}%${isUnchanged ? ' ⚠️ [CONTROL WARNING: SOURCE UNCHANGED]' : ''}`);
    }
  } else {
    console.log(`No significant performance improvements.`);
  }

  if (regressions.length > 0) {
    console.log(`Regressions: ${regressions.length}`);
    for (const reg of regressions) {
      const isUnchanged = unchangedBenchmarks.has(reg.name);
      console.log(`  ⚠ ${reg.name}: ${reg.deltaPercent.toFixed(1)}%${isUnchanged ? ' ⚠️ [CONTROL WARNING: SOURCE UNCHANGED]' : ''}`);
    }
  } else {
    console.log(`No significant regressions detected.`);
  }
}

// Only run main if invoked directly
if (process.argv[1] && (process.argv[1].endsWith('compare.ts') || process.argv[1].endsWith('compare.js'))) {
  main().catch((err) => {
    console.error('Fatal error during benchmark comparison:', err);
    process.exit(1);
  });
}
