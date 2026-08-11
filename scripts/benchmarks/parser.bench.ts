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
import { tokenize } from '../../src/tokenizer.ts';
import { Parser } from '../../src/parser.ts';
import { performance } from 'node:perf_hooks';

const sampleCSS = `
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

// Repeat sample to make it larger
const largeCSS = sampleCSS.repeat(1000);

console.log(`Large CSS size: ${(largeCSS.length / 1024).toFixed(2)} KB`);

function runBenchmark() {
  console.log('Warming up...');
  // Warmup
  for (let i = 0; i < 10; i++) {
    const tokens = tokenize(largeCSS);
    const parser = new Parser(tokens);
    parser.parseStyleSheet();
  }

  const iterations = 50;
  console.log(`Running benchmark with ${iterations} iterations...`);
  
  // Benchmark Tokenizer
  let start = performance.now();
  for (let i = 0; i < iterations; i++) {
    tokenize(largeCSS);
  }
  let end = performance.now();
  const tokenizerTime = end - start;
  console.log(`Tokenizer: ${(iterations * 1000 / tokenizerTime).toFixed(2)} ops/sec (${(tokenizerTime / iterations).toFixed(2)} ms/op)`);

  // Benchmark Parser (excluding tokenization)
  const tokens = tokenize(largeCSS);
  start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const parser = new Parser(tokens);
    parser.parseStyleSheet();
  }
  end = performance.now();
  const parserTime = end - start;
  console.log(`Parser: ${(iterations * 1000 / parserTime).toFixed(2)} ops/sec (${(parserTime / iterations).toFixed(2)} ms/op)`);

  // Benchmark Combined
  start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = tokenize(largeCSS);
    const p = new Parser(t);
    p.parseStyleSheet();
  }
  end = performance.now();
  const combinedTime = end - start;
  console.log(`Combined: ${(iterations * 1000 / combinedTime).toFixed(2)} ops/sec (${(combinedTime / iterations).toFixed(2)} ms/op)`);
}

runBenchmark();
