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
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { parseHTML } from 'linkedom';

// Root-relative imports (ensuring ParseHooks and all prototypes are initialized)
import '../../src/index.ts';
import { tokenize } from '../../src/tokenizer.ts';
import { Parser, parseStyleSheet } from '../../src/parser.ts';
import { CSSStyleDeclaration } from '../../src/CSSStyleDeclaration.ts';
import { matches } from '../../src/matcher.ts';
import { CSSStyleValue, CSSNumericValue } from '../../src/typed-om.ts';
import { getCascadedStyle } from '../../src/cascade.ts';

// --- Fixture Loader ---
function loadFixtures() {
  const rootDir = path.resolve(import.meta.dirname, '../..');

  // 1. Synthetic sample (original baseline)
  const syntheticSample = `
.rule1 { color: red; margin: 10px; padding: 5px; border: 1px solid black; }
.rule2 { font-size: 14px; line-height: 1.5; background-color: #fff; }
@media (min-width: 600px) {
  .rule3 { color: blue; display: flex; justify-content: center; }
  .rule4 { width: 50%; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
  const syntheticLarge = syntheticSample.repeat(500); // ~163 KB

  // 2. Modern CSS features fixture (nesting, container queries, custom properties, color-mix)
  const modernPath = path.join(rootDir, 'tests/fixtures/modern.css');
  const modernCss = fs.existsSync(modernPath) ? fs.readFileSync(modernPath, 'utf-8') : syntheticSample;

  // 3. Real-world spec stylesheet: Geocities (large legacy + complex CSS)
  const geocitiesPath = path.join(rootDir, 'submodules/csswg-drafts/geocities.css');
  const geocitiesCss = fs.existsSync(geocitiesPath) ? fs.readFileSync(geocitiesPath, 'utf-8') : syntheticSample;

  // 4. Real-world spec stylesheet: WHATWG HTML styles (standard browser-facing rules)
  const htmlStylesPath = path.join(rootDir, 'submodules/whatwg-html/dev/styles.css');
  const htmlStylesCss = fs.existsSync(htmlStylesPath) ? fs.readFileSync(htmlStylesPath, 'utf-8') : syntheticSample;

  // 5. PostCSS parser test cases corpus
  const postcssDir = path.join(rootDir, 'submodules/postcss-parser-tests/cases');
  let postcssCss = '';
  if (fs.existsSync(postcssDir)) {
    const files = fs.readdirSync(postcssDir).filter((f: string) => f.endsWith('.css')).sort();
    for (const f of files) {
      postcssCss += `/* ${f} */\n${fs.readFileSync(path.join(postcssDir, f), 'utf-8')}\n`;
    }
  } else {
    postcssCss = syntheticSample;
  }

  return {
    syntheticLarge,
    modernCss,
    geocitiesCss,
    htmlStylesCss,
    postcssCss,
  };
}

// Statistical calculation
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

export function calculateStats(
  name: string,
  sampleTimes: number[],
  iterationsPerSample: number,
  totalGcTimeMs: number,
  totalGcCount: number,
  peakDeltaHeapKb: number,
  gcActive: boolean
): BenchmarkStats {
  const sorted = [...sampleTimes].sort((a, b) => a - b);
  const n = sorted.length;
  const minMs = sorted[0];
  const maxMs = sorted[n - 1];

  // Completely UNBIASED statistics across ALL raw recorded samples:
  // No trimming top or bottom percentiles.
  const medianMs = n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const meanMs = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - meanMs) ** 2, 0) / n;
  const stdDevMs = Math.sqrt(variance);
  const opsPerSec = medianMs > 0 ? (iterationsPerSample * 1000) / medianMs : 0;

  const gcTimePerSampleMs = n > 0 ? totalGcTimeMs / n : 0;
  const gcPercentTime = (sum + totalGcTimeMs) > 0 ? (totalGcTimeMs / (sum + totalGcTimeMs)) * 100 : 0;
  const totalIterations = n * iterationsPerSample;
  const gcCountPerIter = totalIterations > 0 ? totalGcCount / totalIterations : 0;

  return {
    name,
    samples: n,
    iterationsPerSample,
    medianMs,
    meanMs,
    stdDevMs,
    minMs,
    maxMs,
    opsPerSec,
    gcTimePerSampleMs,
    gcPercentTime,
    gcCountPerIter,
    peakDeltaHeapKb,
    gcActive,
  };
}

// Dead-code elimination sink
let _blackHoleSink: unknown = null;
export function sink(val: unknown): void {
  _blackHoleSink = val;
}

// Run a benchmark with warmup, multiple samples, and explicit GC & memory instrumentation
async function runBench(
  name: string,
  fn: () => void,
  options: { warmupRounds?: number; samples?: number; iterations?: number } = {}
): Promise<BenchmarkStats> {
  const warmupRounds = options.warmupRounds ?? 8;
  const samples = options.samples ?? 20;
  const iterations = options.iterations ?? 10;

  // 1. Warmup: run multiple rounds to ensure JIT tier-up and IC stabilization
  for (let w = 0; w < warmupRounds; w++) {
    for (let i = 0; i < iterations; i++) {
      fn();
    }
  }

  // 2. Pre-run full GC if exposed to clear warmup allocations from heap
  let gcActive = false;
  if (typeof (globalThis as unknown as { gc?: () => void }).gc === 'function') {
    (globalThis as unknown as { gc: () => void }).gc();
    gcActive = true;
  }

  // 3. Setup GC PerformanceObserver to explicitly record GC time and pause counts
  let totalGcTimeMs = 0;
  let totalGcCount = 0;
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      totalGcTimeMs += entry.duration;
      totalGcCount++;
    }
  });
  gcObserver.observe({ entryTypes: ['gc'] });

  const initialHeapUsed = process.memoryUsage().heapUsed;
  let peakHeapUsed = initialHeapUsed;

  // 4. Timed samples (unbiased: includes natural GC pauses occurring during execution)
  const sampleTimes: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const t1 = performance.now();
    sampleTimes.push(t1 - t0);

    const currentHeap = process.memoryUsage().heapUsed;
    if (currentHeap > peakHeapUsed) {
      peakHeapUsed = currentHeap;
    }
  }

  // Yield to Node event loop so all pending PerformanceObserver GC entries fire
  await new Promise((resolve) => setTimeout(resolve, 10));
  gcObserver.disconnect();

  const peakDeltaHeapKb = Math.max(0, (peakHeapUsed - initialHeapUsed) / 1024);

  return calculateStats(name, sampleTimes, iterations, totalGcTimeMs, totalGcCount, peakDeltaHeapKb, gcActive);
}

export interface BenchmarkDefinition {
  name: string;
  run: () => Promise<BenchmarkStats>;
}

export function getBenchmarkDefinitions(): BenchmarkDefinition[] {
  const fixtures = loadFixtures();

  // Pre-tokenize / pre-parse fixtures for isolated benchmarks
  const syntheticTokens = tokenize(fixtures.syntheticLarge);
  const modernTokens = tokenize(fixtures.modernCss);
  const modernSheet = new Parser(modernTokens).parseStyleSheet();

  // DOM setup for matcher & cascade
  const domHtml = `
  <div id="app" class="wrapper">
    <header class="site-header">
      <nav class="nav-bar">
        <ul class="nav-list">
          <li class="nav-item active"><a href="#home">Home</a></li>
          <li class="nav-item"><a href="#about">About</a></li>
        </ul>
      </nav>
    </header>
    <main class="content">
      <article class="post primary" data-kind="editorial">
        <h1 class="title">Main Title</h1>
        <p class="intro">Intro paragraph with <span class="highlight">emphasis</span>.</p>
        <div class="card" data-state="visible">
          <p class="desc">Card description</p>
          <a class="btn primary" href="#action">Click me</a>
        </div>
      </article>
    </main>
  </div>`;
  const { document } = parseHTML(domHtml);
  const targetElement = document.querySelector('p.intro')!;
  const cardElement = document.querySelector('.card')!;

  const cascadeCss = `
    div { font-size: 16px; color: black; }
    .wrapper { padding: 20px; }
    header.site-header { margin-bottom: 10px; }
    article.post { padding: 15px; border: 1px solid #ccc; }
    p.intro { color: navy; font-weight: bold; margin: 10px 0; }
    span.highlight { color: red; }
    .card { background-color: #fafafa; border-radius: 4px; }
  `;
  const cascadeRules = parseStyleSheet(cascadeCss);

  return [
    // 1. Tokenizer on Large Synthetic CSS (~163 KB)
    {
      name: 'tokenize: synthetic large (163KB)',
      run: () => runBench(
        'tokenize: synthetic large (163KB)',
        () => { sink(tokenize(fixtures.syntheticLarge)); },
        { warmupRounds: 2, samples: 10, iterations: 5 }
      ),
    },

    // 2. Tokenizer on Modern CSS (nesting, range media queries, colors)
    {
      name: 'tokenize: modern.css (7.7KB)',
      run: () => runBench(
        'tokenize: modern.css (7.7KB)',
        () => { sink(tokenize(fixtures.modernCss)); },
        { warmupRounds: 3, samples: 10, iterations: 40 }
      ),
    },

    // 3. Parser only on pre-tokenized Large Synthetic CSS
    {
      name: 'parse: synthetic large tokens (163KB)',
      run: () => runBench(
        'parse: synthetic large tokens (163KB)',
        () => {
          const p = new Parser(syntheticTokens);
          sink(p.parseStyleSheet());
        },
        { warmupRounds: 2, samples: 10, iterations: 3 }
      ),
    },

    // 4. Combined Tokenize + Parse on Large Synthetic CSS
    {
      name: 'tokenize + parse: synthetic large (163KB)',
      run: () => runBench(
        'tokenize + parse: synthetic large (163KB)',
        () => { sink(new Parser(tokenize(fixtures.syntheticLarge)).parseStyleSheet()); },
        { warmupRounds: 2, samples: 10, iterations: 3 }
      ),
    },

    // 5. Combined Tokenize + Parse on Geocities CSS (15KB real-world sheet)
    {
      name: 'tokenize + parse: geocities.css (15KB)',
      run: () => runBench(
        'tokenize + parse: geocities.css (15KB)',
        () => { sink(new Parser(tokenize(fixtures.geocitiesCss)).parseStyleSheet()); },
        { warmupRounds: 3, samples: 10, iterations: 30 }
      ),
    },

    // 6. Combined Tokenize + Parse on WHATWG HTML Dev Styles (11KB)
    {
      name: 'tokenize + parse: whatwg styles.css (11KB)',
      run: () => runBench(
        'tokenize + parse: whatwg styles.css (11KB)',
        () => { sink(new Parser(tokenize(fixtures.htmlStylesCss)).parseStyleSheet()); },
        { warmupRounds: 3, samples: 10, iterations: 30 }
      ),
    },

    // 7. Combined Tokenize + Parse on Modern CSS (nesting & modern features)
    {
      name: 'tokenize + parse: modern.css (7.7KB)',
      run: () => runBench(
        'tokenize + parse: modern.css (7.7KB)',
        () => { sink(new Parser(tokenize(fixtures.modernCss)).parseStyleSheet()); },
        { warmupRounds: 3, samples: 10, iterations: 30 }
      ),
    },

    // 8. Combined Tokenize + Parse on PostCSS Corpus (30 varied test cases)
    {
      name: 'tokenize + parse: postcss cases (4.4KB)',
      run: () => runBench(
        'tokenize + parse: postcss cases (4.4KB)',
        () => { sink(new Parser(tokenize(fixtures.postcssCss)).parseStyleSheet()); },
        { warmupRounds: 3, samples: 10, iterations: 40 }
      ),
    },

    // 9. CSSStyleDeclaration: setProperty with Shorthand Expansions & Reads
    {
      name: 'CSSStyleDeclaration: setProperty shorthands & read',
      run: () => runBench(
        'CSSStyleDeclaration: setProperty shorthands & read',
        () => {
          const d = new CSSStyleDeclaration();
          d.setProperty('margin', '10px 20px 30px 40px');
          d.setProperty('padding', '5px 15px');
          d.setProperty('border', '1px solid red');
          d.setProperty('background', 'url("bg.png") no-repeat center');
          d.setProperty('margin-top', '0px');
          sink(d.getPropertyValue('margin'));
          sink(d.getPropertyValue('border'));
          sink(d.cssText);
        },
        { warmupRounds: 3, samples: 10, iterations: 60 }
      ),
    },

    // 10. CSSRule serialization (cssText) across all modern.css rules
    {
      name: 'serialize: modern.css rules cssText',
      run: () => runBench(
        'serialize: modern.css rules cssText',
        () => {
          let len = 0;
          for (let i = 0; i < modernSheet.cssRules.length; i++) {
            len += modernSheet.cssRules[i].cssText.length;
          }
          sink(len);
        },
        { warmupRounds: 3, samples: 10, iterations: 40 }
      ),
    },

    // 11. Full parse -> serialize -> re-parse round-trip: true text -> parse -> serialize -> reparse
    {
      name: 'round-trip: parse -> serialize -> reparse (geocities.css)',
      run: () => runBench(
        'round-trip: parse -> serialize -> reparse (geocities.css)',
        () => {
          const initialSheet = new Parser(tokenize(fixtures.geocitiesCss)).parseStyleSheet();
          let fullText = '';
          for (let i = 0; i < initialSheet.cssRules.length; i++) {
            fullText += initialSheet.cssRules[i].cssText + '\n';
          }
          const reParsed = new Parser(tokenize(fullText)).parseStyleSheet();
          sink(reParsed.cssRules.length);
        },
        { warmupRounds: 3, samples: 10, iterations: 10 }
      ),
    },

    // 12. Selector matching via matches()
    {
      name: 'matcher: complex selectors matches()',
      run: () => runBench(
        'matcher: complex selectors matches()',
        () => {
          sink(matches(targetElement, 'div.wrapper article.post > p.intro:first-of-type'));
          sink(matches(targetElement, 'main article p:has(span.highlight)'));
          sink(matches(targetElement, ':not(span, a)'));
          sink(matches(cardElement, 'div[data-state="visible"] > a.btn.primary'));
        },
        { warmupRounds: 5, samples: 10, iterations: 400 }
      ),
    },

    // 13. Cascade & getCascadedStyle computation
    {
      name: 'cascade: getCascadedStyle()',
      run: () => runBench(
        'cascade: getCascadedStyle()',
        () => {
          sink(getCascadedStyle(targetElement, cascadeRules));
          sink(getCascadedStyle(cardElement, cascadeRules));
        },
        { warmupRounds: 3, samples: 10, iterations: 20 }
      ),
    },

    // 14. Typed OM parsing: CSSStyleValue & CSSNumericValue
    {
      name: 'typed-om: parse values & math',
      run: () => runBench(
        'typed-om: parse values & math',
        () => {
          sink(CSSStyleValue.parse('color', 'red'));
          sink(CSSStyleValue.parse('transform', 'translate(10px, 20px) rotate(45deg) scale(2)'));
          sink(CSSStyleValue.parse('background-color', 'rgb(255, 128, 0)'));
          sink(CSSNumericValue.parse('calc(10px + 20px * 2)'));
          sink(CSSNumericValue.parse('clamp(10px, 5vw, 50px)'));
        },
        { warmupRounds: 5, samples: 10, iterations: 200 }
      ),
    },
  ];
}

export async function runAllBenchmarks(filterName?: string): Promise<BenchmarkStats[]> {
  const defs = getBenchmarkDefinitions();
  const results: BenchmarkStats[] = [];

  for (const def of defs) {
    if (filterName && def.name !== filterName) continue;
    results.push(await def.run());
  }

  return results;
}

// Print formatted console table
export function printResultsTable(results: BenchmarkStats[]): void {
  console.log('\n========================================================================================================================================');
  console.log('CSSOMNOM BENCHMARK SUITE');
  console.log('========================================================================================================================================');
  console.log(
    'Benchmark'.padEnd(46) +
    'Median (ms)'.padStart(13) +
    'Spread (±)'.padStart(11) +
    'Ops/sec'.padStart(13) +
    'GC ms/sample'.padStart(14) +
    'GC % time'.padStart(11) +
    'GC/iter'.padStart(10) +
    'Peak ΔHeap'.padStart(13) +
    'Samples'.padStart(9)
  );
  console.log('-'.repeat(136));

  for (const r of results) {
    const name = r.name.length > 44 ? r.name.slice(0, 41) + '...' : r.name;
    const medianStr = r.medianMs.toFixed(2) + ' ms';
    const spreadStr = '±' + r.stdDevMs.toFixed(2);
    const opsStr = r.opsPerSec.toFixed(1) + ' op/s';
    const gcTimeStr = r.gcTimePerSampleMs.toFixed(2) + ' ms';
    const gcPctStr = r.gcPercentTime.toFixed(1) + '%';
    const gcIterStr = r.gcCountPerIter.toFixed(3);
    const heapStr = r.peakDeltaHeapKb >= 1024
      ? (r.peakDeltaHeapKb / 1024).toFixed(1) + ' MB'
      : r.peakDeltaHeapKb.toFixed(0) + ' KB';
    const samplesStr = `${r.samples}×${r.iterationsPerSample}`;
    console.log(
      name.padEnd(46) +
      medianStr.padStart(13) +
      spreadStr.padStart(11) +
      opsStr.padStart(13) +
      gcTimeStr.padStart(14) +
      gcPctStr.padStart(11) +
      gcIterStr.padStart(10) +
      heapStr.padStart(13) +
      samplesStr.padStart(9)
    );
  }
  console.log('========================================================================================================================================\n');
}

// If executed directly
async function main() {
  const isJson = process.argv.includes('--json');
  let filterName: string | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--bench=')) {
      filterName = process.argv[i].slice('--bench='.length);
    } else if (process.argv[i] === '--bench' && process.argv[i + 1]) {
      filterName = process.argv[++i];
    }
  }

  const results = await runAllBenchmarks(filterName);
  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printResultsTable(results);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('parser.bench.ts') || process.argv[1].endsWith('parser.bench.js'))) {
  main().catch((err) => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  });
}
