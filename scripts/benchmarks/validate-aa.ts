/**
 * Multi-round A/A validator
 * Runs N rounds of A/A comparison (same sha f8c80d0 in two separate worktrees)
 * across all 14 benchmarks and computes the observed false positive rate and
 * 95% binomial confidence bound.
 */

import { BENCHMARK_NAMES, ensureWorktree, runAllBenchmarksInDir, bootstrapMedianDelta } from './compare.ts';
import type { BenchmarkStats } from './compare.ts';

const REF = 'f8c80d0';
const RUNS_PER_REF = 10;
const ROUNDS = 3;

async function runAAValidation() {
  console.log(`Starting multi-round A/A validation: ${ROUNDS} rounds x ${BENCHMARK_NAMES.length} benchmarks = ${ROUNDS * BENCHMARK_NAMES.length} total trials.`);
  console.log(`Ref: ${REF} vs ${REF}_aa_clone, ${RUNS_PER_REF} interleaved runs per trial.\n`);

  const baseDir = ensureWorktree(REF);
  const targetDir = ensureWorktree(REF, `${REF}_aa_clone`);

  let totalTrials = 0;
  let falsePositives = 0;
  const trialResults: Array<{ round: number; bench: string; delta: number; ciLower: number; ciUpper: number; fp: boolean }> = [];

  for (let r = 1; r <= ROUNDS; r++) {
    console.log(`\n=================== ROUND ${r} / ${ROUNDS} ===================`);
    
    const baseStatsPerBench: Record<string, BenchmarkStats[]> = {};
    const targetStatsPerBench: Record<string, BenchmarkStats[]> = {};
    for (const b of BENCHMARK_NAMES) {
      baseStatsPerBench[b] = [];
      targetStatsPerBench[b] = [];
    }

    for (let run = 0; run < RUNS_PER_REF; run++) {
      if (run % 2 === 0) {
        process.stdout.write(`  ↳ [Round ${r}] Run ${run + 1}/${RUNS_PER_REF} [${REF}]... `);
        const t0 = performance.now();
        const bMap = await runAllBenchmarksInDir(baseDir);
        for (const b of BENCHMARK_NAMES) if (bMap[b]) baseStatsPerBench[b].push(bMap[b]);
        console.log(`done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);

        process.stdout.write(`  ↳ [Round ${r}] Run ${run + 1}/${RUNS_PER_REF} [${REF}_clone]... `);
        const t1 = performance.now();
        const tMap = await runAllBenchmarksInDir(targetDir);
        for (const b of BENCHMARK_NAMES) if (tMap[b]) targetStatsPerBench[b].push(tMap[b]);
        console.log(`done (${((performance.now() - t1) / 1000).toFixed(1)}s)`);
      } else {
        process.stdout.write(`  ↳ [Round ${r}] Run ${run + 1}/${RUNS_PER_REF} [${REF}_clone]... `);
        const t1 = performance.now();
        const tMap = await runAllBenchmarksInDir(targetDir);
        for (const b of BENCHMARK_NAMES) if (tMap[b]) targetStatsPerBench[b].push(tMap[b]);
        console.log(`done (${((performance.now() - t1) / 1000).toFixed(1)}s)`);

        process.stdout.write(`  ↳ [Round ${r}] Run ${run + 1}/${RUNS_PER_REF} [${REF}]... `);
        const t0 = performance.now();
        const bMap = await runAllBenchmarksInDir(baseDir);
        for (const b of BENCHMARK_NAMES) if (bMap[b]) baseStatsPerBench[b].push(bMap[b]);
        console.log(`done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
      }
    }

    console.log(`Round ${r} evaluation:`);
    for (const benchName of BENCHMARK_NAMES) {
      const baseMedians = (baseStatsPerBench[benchName] || []).map(s => s.medianMs);
      const targetMedians = (targetStatsPerBench[benchName] || []).map(s => s.medianMs);

      const { deltaPercent, ciLowerPercent, ciUpperPercent } = bootstrapMedianDelta(baseMedians, targetMedians);
      const excludesZero = (ciLowerPercent > 0 && ciUpperPercent > 0) || (ciLowerPercent < 0 && ciUpperPercent < 0);

      totalTrials++;
      if (excludesZero) {
        falsePositives++;
        console.log(`  ⚠️ FP: "${benchName}": delta=${deltaPercent.toFixed(1)}%, CI=[${ciLowerPercent.toFixed(1)}%, ${ciUpperPercent.toFixed(1)}%]`);
      } else {
        console.log(`  ✔ Flat: "${benchName}": delta=${deltaPercent.toFixed(1)}%, CI=[${ciLowerPercent.toFixed(1)}%, ${ciUpperPercent.toFixed(1)}%]`);
      }

      trialResults.push({
        round: r,
        bench: benchName,
        delta: deltaPercent,
        ciLower: ciLowerPercent,
        ciUpper: ciUpperPercent,
        fp: excludesZero,
      });
    }
  }

  // Binomial 95% upper bound
  const fpRate = (falsePositives / totalTrials) * 100;
  const upper95 = (1 - Math.pow(1 - 0.95, 1 / totalTrials)) * 100;

  console.log(`\n=================== VALIDATION SUMMARY ===================`);
  console.log(`Total Trials:      ${totalTrials}`);
  console.log(`False Positives:   ${falsePositives}`);
  console.log(`Observed FP Rate:  ${fpRate.toFixed(1)}%`);
  console.log(`95% CI Upper Bound:${upper95.toFixed(1)}% (at 0 FPs)`);
  console.log(`==========================================================\n`);

  console.log(JSON.stringify({ totalTrials, falsePositives, fpRate, upper95 }, null, 2));
}

runAAValidation().catch((err) => {
  console.error('A/A validation error:', err);
  process.exit(1);
});
