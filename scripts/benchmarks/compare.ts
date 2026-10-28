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
import * as os from 'node:os';
import { safeExecTestFile, execGit, execCommand } from '../wpt/node/safe-child-process.ts';

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
  gcTimePerSampleMs: number;
  gcPercentTime: number;
  gcCountPerIter: number;
  peakDeltaHeapKb: number;
  gcActive: boolean;
}

export interface BenchmarkComparisonRow {
  name: string;
  baseMedianMs: number;
  baseOpsPerSec: number;
  baseGcTimePerSampleMs: number;
  baseGcPercentTime: number;
  basePeakDeltaHeapKb: number;
  targetMedianMs: number;
  targetOpsPerSec: number;
  targetGcTimePerSampleMs: number;
  targetGcPercentTime: number;
  targetPeakDeltaHeapKb: number;
  deltaPercent: number; // positive = target is faster, negative = slower
  ciLowerPercent: number;
  ciUpperPercent: number;
  baseSpreadMs: number;
  targetSpreadMs: number;
  isSignificant: boolean;
  significanceCategory: 'faster' | 'slower' | 'small-faster' | 'small-slower' | 'flat';
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

// Entry files for each benchmark to automatically derive transitive import dependencies.
export const BENCHMARK_ENTRY_FILES: Record<string, string[]> = {
  'tokenize: synthetic large (163KB)': ['src/tokenizer.ts'],
  'tokenize: modern.css (7.7KB)': ['src/tokenizer.ts'],
  'parse: synthetic large tokens (163KB)': ['src/parser.ts'],
  'tokenize + parse: synthetic large (163KB)': ['src/parser.ts', 'src/tokenizer.ts'],
  'tokenize + parse: geocities.css (15KB)': ['src/parser.ts', 'src/tokenizer.ts'],
  'tokenize + parse: whatwg styles.css (11KB)': ['src/parser.ts', 'src/tokenizer.ts'],
  'tokenize + parse: modern.css (7.7KB)': ['src/parser.ts', 'src/tokenizer.ts'],
  'tokenize + parse: postcss cases (4.4KB)': ['src/parser.ts', 'src/tokenizer.ts'],
  'CSSStyleDeclaration: setProperty shorthands & read': ['src/CSSStyleDeclaration.ts'],
  'serialize: modern.css rules cssText': ['src/serializer.ts'],
  'round-trip: parse -> serialize -> reparse (geocities.css)': ['src/parser.ts', 'src/serializer.ts', 'src/tokenizer.ts'],
  'matcher: complex selectors matches()': ['src/matcher.ts'],
  'cascade: getCascadedStyle()': ['src/cascade.ts'],
  'typed-om: parse values & math': ['src/typed-om.ts'],
};

// Minimum effect size threshold (2.0% pre-registered):
// Any change where 95% CI excludes 0 is significant.
// Changes with |delta| >= 2.0% are substantial effects ("faster" / "slower");
// Changes with |delta| < 2.0% are labeled "significant, small".
export const PRACTICALLY_NEGLIGIBLE_THRESHOLD = 2.0;

function getFileImports(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const dir = path.dirname(filePath);
  const imports: string[] = [];

  const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const importLines = cleanContent.split('\n');
  for (const line of importLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import type') || trimmed.startsWith('export type')) continue;
    const match = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/.exec(trimmed);
    if (match) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        let resolved = path.resolve(dir, importPath);
        if (!fs.existsSync(resolved)) {
          if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
          else if (fs.existsSync(resolved + '.js')) resolved += '.js';
          else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
          else if (fs.existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
        }
        if (fs.existsSync(resolved)) imports.push(resolved);
      }
    }
  }
  return imports;
}

export function getTransitiveImports(entryFiles: string[], dirRoot: string): string[] {
  const visited = new Set<string>();
  const queue = entryFiles.map(f => path.resolve(dirRoot, f));
  const srcFiles: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    const rel = path.relative(dirRoot, curr).replace(/\\/g, '/');
    if (rel.startsWith('src/') && (rel.endsWith('.ts') || rel.endsWith('.js'))) {
      srcFiles.push(rel);
    }
    const children = getFileImports(curr);
    for (const child of children) {
      if (!visited.has(child)) queue.push(child);
    }
  }
  return srcFiles.sort();
}

export function deriveExercisedFilesMap(dirRoot: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [name, entries] of Object.entries(BENCHMARK_ENTRY_FILES)) {
    map[name] = getTransitiveImports(entries, dirRoot);
  }
  return map;
}

export function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function computeMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

export function computeStdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = computeMean(arr);
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export function bootstrapMedianDelta(
  baseMedians: number[],
  targetMedians: number[],
  reps = 3000
): { deltaPercent: number; ciLowerPercent: number; ciUpperPercent: number } {
  const nA = baseMedians.length;
  const nB = targetMedians.length;
  const deltas: number[] = [];

  for (let r = 0; r < reps; r++) {
    const sampleA: number[] = [];
    const sampleB: number[] = [];
    for (let i = 0; i < nA; i++) sampleA.push(baseMedians[Math.floor(Math.random() * nA)]);
    for (let i = 0; i < nB; i++) sampleB.push(targetMedians[Math.floor(Math.random() * nB)]);
    const medA = computeMedian(sampleA);
    const medB = computeMedian(sampleB);
    const delta = medB > 0 ? ((medA - medB) / medB) * 100 : 0;
    deltas.push(delta);
  }

  deltas.sort((a, b) => a - b);
  const ciLowerPercent = deltas[Math.floor(reps * 0.025)];
  const ciUpperPercent = deltas[Math.floor(reps * 0.975)];
  const actualMedA = computeMedian(baseMedians);
  const actualMedB = computeMedian(targetMedians);
  const deltaPercent = actualMedB > 0 ? ((actualMedA - actualMedB) / actualMedB) * 100 : 0;

  return { deltaPercent, ciLowerPercent, ciUpperPercent };
}

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
  } catch (err) {
    console.warn(`Warning: failed to symlink submodules into worktree:`, err);
  }

  const res = await safeExecTestFile('', {
    runnerPath: benchScript,
    args: ['--json', `--bench=${benchName}`],
    maxOldSpaceSize: 1024,
    timeout: 120000,
    cwd: workDir,
    exposeGc: true,
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

export async function runAllBenchmarksInDir(workDir: string): Promise<Record<string, BenchmarkStats>> {
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
  } catch (err) {
    console.warn(`Warning: failed to symlink submodules into worktree:`, err);
  }

  const res = await safeExecTestFile('', {
    runnerPath: benchScript,
    args: ['--json'],
    maxOldSpaceSize: 1024,
    timeout: 180000,
    cwd: workDir,
    exposeGc: true,
  });

  if (res.status !== 'OK') {
    throw new Error(`Benchmark suite run in ${workDir} failed (${res.status}): ${res.stderr || res.stdout}`);
  }

  const stdout = res.stdout.trim();
  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Failed to find JSON benchmark array in output:\n${stdout}`);
  }

  const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as BenchmarkStats[];
  const map: Record<string, BenchmarkStats> = {};
  for (const item of parsed) {
    map[item.name] = item;
  }
  return map;
}

export function ensureWorktree(ref: string, aliasDir?: string): string {
  const dirName = aliasDir ?? ref.replace(/[^a-zA-Z0-9._-]/g, '_');
  const worktreeDir = path.join(rootDir, '.worktrees', dirName);
  if (!fs.existsSync(worktreeDir)) {
    console.log(`Creating worktree for ${ref} at ${worktreeDir}...`);
    execGit(['worktree', 'add', '-d', worktreeDir, ref]);
  }

  // Ensure node_modules exists and is installed via pnpm
  const nodeModules = path.join(worktreeDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.log(`Running pnpm install in ${worktreeDir}...`);
    execCommand('pnpm', ['install'], { cwd: worktreeDir });
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
  rows: BenchmarkComparisonRow[],
  unchangedBenchmarks?: Set<string>
): { tableMarkdown: string; rows: BenchmarkComparisonRow[] } {
  const lines: string[] = [];
  lines.push(`| Benchmark | ${baseLabel} (ms) | ${targetLabel} (ms) | Delta (ops/s) | 95% CI | ${baseLabel} GC | ${targetLabel} GC | ${baseLabel} Peak ΔHeap | ${targetLabel} Peak ΔHeap | Significance |`);
  lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

  for (const r of rows) {
    const deltaSign = r.deltaPercent >= 0 ? '+' : '';
    const deltaStr = `${deltaSign}${r.deltaPercent.toFixed(1)}%`;
    const ciStr = `[${r.ciLowerPercent >= 0 ? '+' : ''}${r.ciLowerPercent.toFixed(1)}%, ${r.ciUpperPercent >= 0 ? '+' : ''}${r.ciUpperPercent.toFixed(1)}%]`;
    
    let status = 'flat (within noise)';
    switch (r.significanceCategory) {
      case 'faster':
        status = `**${deltaStr}** (faster)`;
        break;
      case 'slower':
        status = `**${deltaStr}** (slower)`;
        break;
      case 'small-faster':
        status = `**${deltaStr}** (significant, small)`;
        break;
      case 'small-slower':
        status = `**${deltaStr}** (significant, small)`;
        break;
      case 'flat':
      default:
        status = 'flat (within noise)';
        break;
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
    const baseGc = `${r.baseGcTimePerSampleMs.toFixed(2)}ms (${r.baseGcPercentTime.toFixed(1)}%)`;
    const targetGc = `${r.targetGcTimePerSampleMs.toFixed(2)}ms (${r.targetGcPercentTime.toFixed(1)}%)`;
    const baseHeap = `${(r.basePeakDeltaHeapKb / 1024).toFixed(1)}MB`;
    const targetHeap = `${(r.targetPeakDeltaHeapKb / 1024).toFixed(1)}MB`;

    lines.push(`| \`${r.name}\` | ${baseMs} | ${targetMs} | ${deltaStr} | ${ciStr} | ${baseGc} | ${targetGc} | ${baseHeap} | ${targetHeap} | ${status} |`);
  }

  return { tableMarkdown: lines.join('\n'), rows };
}

async function main() {
  const args = process.argv.slice(2);
  let baseRef = 'f8c80d0'; // default pre-janitor
  let targetRef = '1db8d91'; // default post-janitor
  let runsPerRef = 15; // default 15 fresh processes per ref interleaved ABAB
  const singleBench = args.find(a => a.startsWith('--bench='))?.slice('--bench='.length);

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--base=')) {
      baseRef = args[i].slice('--base='.length);
    } else if (args[i].startsWith('--target=')) {
      targetRef = args[i].slice('--target='.length);
    } else if (args[i].startsWith('--runs=')) {
      runsPerRef = parseInt(args[i].slice('--runs='.length), 10);
    } else if (args[i] === '--base' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--target' && args[i + 1]) {
      targetRef = args[++i];
    } else if (args[i] === '--runs' && args[i + 1]) {
      runsPerRef = parseInt(args[++i], 10);
    }
  }

  // Record system load and check active wpt processes
  let activeWptCount = 0;
  try {
    const wptCheck = execCommand('pgrep', ['-af', 'wpt']);
    const lines = wptCheck.split('\n').filter(l => l.trim() && !l.includes('compare.ts') && !l.includes('pgrep'));
    activeWptCount = lines.length;
  } catch {
    // pgrep exits 1 when no matches found
    activeWptCount = 0;
  }

  const loadAvg = os.loadavg().map(v => v.toFixed(2)).join(', ');

  console.log(`\n================================================================================`);
  console.log(`CSSOMNOM INTERLEAVED CROSS-REF BENCHMARK COMPARISON`);
  console.log(`Base Ref:        ${baseRef}`);
  console.log(`Target Ref:      ${targetRef}`);
  console.log(`Runs per Ref:    ${runsPerRef} fresh subprocesses interleaved ABAB...`);
  console.log(`Significance:    Bootstrap 95% CI (excludes 0; <${PRACTICALLY_NEGLIGIBLE_THRESHOLD}% labeled "significant, small")`);
  console.log(`System Load:     ${loadAvg}`);
  console.log(`Active WPT Tasks:${activeWptCount > 0 ? ` ⚠️ ${activeWptCount} detected` : ' 0 (quiescent)'}`);
  console.log(`================================================================================\n`);

  const baseDir = ensureWorktree(baseRef);
  const targetDir = (baseRef === targetRef)
    ? ensureWorktree(targetRef, `${targetRef}_aa_clone`)
    : ensureWorktree(targetRef);

  // Derive exercised files dynamically from entry modules
  const exercisedFiles = deriveExercisedFilesMap(rootDir);
  const unchangedBenchmarks = new Set<string>();

  if (baseRef !== targetRef) {
    try {
      const diffOut = execGit(['diff', `${baseRef}..${targetRef}`, '--name-only']);
      const changedFiles = new Set(diffOut.split('\n').map(s => s.trim()).filter(Boolean));
      for (const [benchName, files] of Object.entries(exercisedFiles)) {
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
  const rows: BenchmarkComparisonRow[] = [];

  // Data accumulator per benchmark:
  // benchName -> list of runs
  const baseStatsPerBench: Record<string, BenchmarkStats[]> = {};
  const targetStatsPerBench: Record<string, BenchmarkStats[]> = {};
  for (const b of benchmarksToRun) {
    baseStatsPerBench[b] = [];
    targetStatsPerBench[b] = [];
  }

  console.log(`Executing ${runsPerRef} interleaved suite runs per ref...`);
  for (let r = 0; r < runsPerRef; r++) {
    if (r % 2 === 0) {
      process.stdout.write(`  ↳ Run ${r + 1}/${runsPerRef} [${baseRef}]... `);
      const t0 = performance.now();
      const bMap = await runAllBenchmarksInDir(baseDir);
      for (const b of benchmarksToRun) {
        if (bMap[b]) baseStatsPerBench[b].push(bMap[b]);
      }
      console.log(`done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

      process.stdout.write(`  ↳ Run ${r + 1}/${runsPerRef} [${targetRef}]... `);
      const t1 = performance.now();
      const tMap = await runAllBenchmarksInDir(targetDir);
      for (const b of benchmarksToRun) {
        if (tMap[b]) targetStatsPerBench[b].push(tMap[b]);
      }
      console.log(`done (${((performance.now() - t1) / 1000).toFixed(1)}s)`);
    } else {
      process.stdout.write(`  ↳ Run ${r + 1}/${runsPerRef} [${targetRef}]... `);
      const t1 = performance.now();
      const tMap = await runAllBenchmarksInDir(targetDir);
      for (const b of benchmarksToRun) {
        if (tMap[b]) targetStatsPerBench[b].push(tMap[b]);
      }
      console.log(`done (${((performance.now() - t1) / 1000).toFixed(1)}s)`);

      process.stdout.write(`  ↳ Run ${r + 1}/${runsPerRef} [${baseRef}]... `);
      const t0 = performance.now();
      const bMap = await runAllBenchmarksInDir(baseDir);
      for (const b of benchmarksToRun) {
        if (bMap[b]) baseStatsPerBench[b].push(bMap[b]);
      }
      console.log(`done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  for (const benchName of benchmarksToRun) {
    const baseStatsRuns = baseStatsPerBench[benchName] || [];
    const targetStatsRuns = targetStatsPerBench[benchName] || [];

    const baseMedians = baseStatsRuns.map(s => s.medianMs);
    const targetMedians = targetStatsRuns.map(s => s.medianMs);

    const overallBaseMedian = computeMedian(baseMedians);
    const overallTargetMedian = computeMedian(targetMedians);

    const baseOps = computeMedian(baseStatsRuns.map(s => s.opsPerSec));
    const targetOps = computeMedian(targetStatsRuns.map(s => s.opsPerSec));

    const baseSpread = computeStdDev(baseMedians);
    const targetSpread = computeStdDev(targetMedians);

    const baseGcTimePerSample = computeMean(baseStatsRuns.map(s => s.gcTimePerSampleMs));
    const targetGcTimePerSample = computeMean(targetStatsRuns.map(s => s.gcTimePerSampleMs));

    const baseGcPercent = computeMean(baseStatsRuns.map(s => s.gcPercentTime));
    const targetGcPercent = computeMean(targetStatsRuns.map(s => s.gcPercentTime));

    const basePeakDeltaHeap = computeMean(baseStatsRuns.map(s => s.peakDeltaHeapKb));
    const targetPeakDeltaHeap = computeMean(targetStatsRuns.map(s => s.peakDeltaHeapKb));

    const { deltaPercent, ciLowerPercent, ciUpperPercent } = bootstrapMedianDelta(baseMedians, targetMedians);

    // Any change where 95% CI excludes 0 is significant
    const excludesZero = (ciLowerPercent > 0 && ciUpperPercent > 0) || (ciLowerPercent < 0 && ciUpperPercent < 0);
    let significanceCategory: BenchmarkComparisonRow['significanceCategory'] = 'flat';
    if (excludesZero) {
      if (deltaPercent >= PRACTICALLY_NEGLIGIBLE_THRESHOLD) {
        significanceCategory = 'faster';
      } else if (deltaPercent <= -PRACTICALLY_NEGLIGIBLE_THRESHOLD) {
        significanceCategory = 'slower';
      } else if (deltaPercent > 0) {
        significanceCategory = 'small-faster';
      } else {
        significanceCategory = 'small-slower';
      }
    }

    rows.push({
      name: benchName,
      baseMedianMs: overallBaseMedian,
      baseOpsPerSec: baseOps,
      baseGcTimePerSampleMs: baseGcTimePerSample,
      baseGcPercentTime: baseGcPercent,
      basePeakDeltaHeapKb: basePeakDeltaHeap,
      targetMedianMs: overallTargetMedian,
      targetOpsPerSec: targetOps,
      targetGcTimePerSampleMs: targetGcTimePerSample,
      targetGcPercentTime: targetGcPercent,
      targetPeakDeltaHeapKb: targetPeakDeltaHeap,
      deltaPercent,
      ciLowerPercent,
      ciUpperPercent,
      baseSpreadMs: baseSpread,
      targetSpreadMs: targetSpread,
      isSignificant: excludesZero,
      significanceCategory,
    });
  }

  const { tableMarkdown } = formatComparisonTable(baseRef, targetRef, rows, unchangedBenchmarks);

  console.log('\n' + tableMarkdown + '\n');

  const regressions = rows.filter((r) => r.isSignificant && r.deltaPercent < 0);
  const improvements = rows.filter((r) => r.isSignificant && r.deltaPercent > 0);

  console.log('--- Summary Analysis ---');
  if (improvements.length > 0) {
    console.log(`Improvements: ${improvements.length}`);
    for (const imp of improvements) {
      const isUnchanged = unchangedBenchmarks.has(imp.name);
      console.log(`  ✓ ${imp.name}: +${imp.deltaPercent.toFixed(1)}% [${imp.ciLowerPercent.toFixed(1)}%, ${imp.ciUpperPercent.toFixed(1)}%] (${imp.significanceCategory})${isUnchanged ? ' ⚠️ [CONTROL WARNING: SOURCE UNCHANGED]' : ''}`);
    }
  } else {
    console.log(`No significant performance improvements.`);
  }

  if (regressions.length > 0) {
    console.log(`Regressions: ${regressions.length}`);
    for (const reg of regressions) {
      const isUnchanged = unchangedBenchmarks.has(reg.name);
      console.log(`  ⚠ ${reg.name}: ${reg.deltaPercent.toFixed(1)}% [${reg.ciLowerPercent.toFixed(1)}%, ${reg.ciUpperPercent.toFixed(1)}%] (${reg.significanceCategory})${isUnchanged ? ' ⚠️ [CONTROL WARNING: SOURCE UNCHANGED]' : ''}`);
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
