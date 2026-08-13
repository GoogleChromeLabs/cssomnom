/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeExecTestFile, safeWorkerPool } from './safe-child-process.ts';

interface FailureRecord {
  spec: string;
  file: string;
  testName: string;
  errorType: string;
  errorMessage: string;
  rawError: string;
}

interface FailureCluster {
  id: string;
  title: string;
  pattern: string;
  count: number;
  samples: { file: string; testName: string; error: string }[];
  affectedFiles: Set<string>;
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

function classifyError(raw: string): { errorType: string; cleanMessage: string } {
  let errorType = 'UnknownError';
  let cleanMessage = raw.split('\n')[0].trim();

  if (cleanMessage.includes('assert_equals')) {
    errorType = 'assert_equals';
    const match = cleanMessage.match(/expected\s+([^,]+)\s+but\s+got\s+(.+)$/i);
    if (match) {
      cleanMessage = `assert_equals: expected [value] but got [value]`;
    }
  } else if (cleanMessage.includes('assert_not_equals')) {
    errorType = 'assert_not_equals';
  } else if (cleanMessage.includes('assert_true') || cleanMessage.includes('assert_false')) {
    errorType = 'assert_boolean';
  } else if (cleanMessage.includes('assert_throws_js') || cleanMessage.includes('assert_throws_dom')) {
    errorType = 'assert_throws';
  } else if (cleanMessage.includes('TypeError')) {
    errorType = 'TypeError';
    cleanMessage = cleanMessage.replace(/Cannot read property|Cannot read properties of (undefined|null)/g, 'Cannot read property on undefined/null');
  } else if (cleanMessage.includes('SyntaxError')) {
    errorType = 'SyntaxError';
  } else if (cleanMessage.includes('InvalidCharacterError')) {
    errorType = 'InvalidCharacterError';
  }

  return { errorType, cleanMessage };
}

async function analyzeSpec(specName: string, specPath: string, excludes: string[] = [], customConcurrency?: number) {
  const fullSpecPath = path.resolve(process.cwd(), specPath);
  console.log(`\n================================================================================`);
  console.log(`🔍 Scanning WPT Spec: "${specName}" (${specPath})`);
  console.log(`================================================================================`);

  const excludeSet = new Set(excludes.map(e => path.resolve(process.cwd(), e)));
  const allFiles = crawlDirectory(fullSpecPath).sort();
  const files = allFiles.filter(f => !excludeSet.has(f));
  if (files.length === 0) {
    console.log(`No HTML files found in ${fullSpecPath}`);
    return;
  }

  const concurrency = customConcurrency ?? Math.min(16, Math.max(1, os.availableParallelism() - 1));
  console.log(`Processing ${files.length} test files with concurrency: ${concurrency} (with health throttling & 25ms worker yields)...`);

  const fileResults = await safeWorkerPool(files, async (filePath) => {
    // System health guard
    const cpuCount = os.cpus().length;
    let load = os.loadavg()[0];
    let freeMem = os.freemem() / (1024 * 1024 * 1024);

    if (load > cpuCount * 0.85 || freeMem < 1.5) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const relFile = path.relative(process.cwd(), filePath);
    const fileFailures: FailureRecord[] = [];
    let filePassing = 0;
    let fileTotal = 0;

    try {
      const { stdout, stderr } = await safeExecTestFile(filePath, { timeout: 10000 });
      const merged = stdout + '\n' + stderr;
      const summaryMatch = merged.match(/Summary: (\d+)\/(\d+) passed/);
      if (summaryMatch) {
        filePassing = parseInt(summaryMatch[1], 10);
        fileTotal = parseInt(summaryMatch[2], 10);
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const stdout = typeof errObj.stdout === 'string' ? errObj.stdout : '';
      const stderr = typeof errObj.stderr === 'string' ? errObj.stderr : '';
      const merged = stdout + '\n' + stderr;

      const summaryMatch = merged.match(/Summary: (\d+)\/(\d+) passed/);
      if (summaryMatch) {
        filePassing = parseInt(summaryMatch[1], 10);
        fileTotal = parseInt(summaryMatch[2], 10);
      }

      // Parse individual test failures
      const lines = merged.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('✖ ')) {
          const testName = line.replace(/.*✖\s*/, '').trim();
          const errSnippet = (lines[i + 1] || 'Assertion failure').trim();
          const { errorType, cleanMessage } = classifyError(errSnippet);
          fileFailures.push({
            spec: specName,
            file: relFile,
            testName,
            errorType,
            errorMessage: cleanMessage,
            rawError: errSnippet
          });
        }
      }

      if (fileFailures.length === 0 && !summaryMatch) {
        fileFailures.push({
          spec: specName,
          file: relFile,
          testName: '[FILE INIT CRASH / TIMEOUT]',
          errorType: 'TimeoutOrCrash',
          errorMessage: 'Process timed out or crashed',
          rawError: stderr.slice(0, 200) || 'Timed out'
        });
      }
    }

    return { failures: fileFailures, passing: filePassing, total: fileTotal };
  });

  let totalTests = 0;
  let passedTests = 0;
  const failures: FailureRecord[] = [];

  for (const res of fileResults) {
    if (!res) continue;
    totalTests += res.total;
    passedTests += res.passing;
    failures.push(...res.failures);
  }

  console.log(`\nResults: ${passedTests}/${totalTests} passed (${failures.length} failures, ${(passedTests / Math.max(1, totalTests) * 100).toFixed(2)}% pass rate)`);

  // Cluster failures
  const clusters = new Map<string, FailureCluster>();

  for (const fail of failures) {
    let clusterKey = fail.errorMessage;
    if (fail.rawError.includes('assert_equals')) {
      if (fail.testName.toLowerCase().includes('serialize') || fail.testName.toLowerCase().includes('serialization')) {
        clusterKey = 'Serialization Mismatch: ' + fail.errorMessage;
      } else if (fail.testName.toLowerCase().includes('parse') || fail.testName.toLowerCase().includes('parsing')) {
        clusterKey = 'Parsing Mismatch: ' + fail.errorMessage;
      }
    }

    let cluster = clusters.get(clusterKey);
    if (!cluster) {
      cluster = {
        id: clusterKey,
        title: clusterKey,
        pattern: fail.errorMessage,
        count: 0,
        samples: [],
        affectedFiles: new Set()
      };
      clusters.set(clusterKey, cluster);
    }

    cluster.count++;
    cluster.affectedFiles.add(fail.file);
    if (cluster.samples.length < 3) {
      cluster.samples.push({
        file: fail.file,
        testName: fail.testName,
        error: fail.rawError.split('\n')[0].substring(0, 120)
      });
    }
  }

  const sortedClusters = Array.from(clusters.values()).sort((a, b) => b.count - a.count);

  console.log(`\n📊 Top Failure Clusters for "${specName}":`);
  console.log(`--------------------------------------------------------------------------------`);

  let rank = 1;
  for (const cluster of sortedClusters.slice(0, 10)) {
    const percentage = ((cluster.count / failures.length) * 100).toFixed(1);
    console.log(`\n#${rank++} [${cluster.count} failures | ${percentage}% of total] ${cluster.title}`);
    console.log(`    📁 Affected files (${cluster.affectedFiles.size}): ${Array.from(cluster.affectedFiles).slice(0, 3).map(f => path.basename(f)).join(', ')}${cluster.affectedFiles.size > 3 ? '...' : ''}`);
    console.log(`    🔍 Samples:`);
    for (const sample of cluster.samples) {
      console.log(`       • [${path.basename(sample.file)}] ${sample.testName.replace(/\n/g, '\\n').substring(0, 80)}`);
      console.log(`         ↳ ${sample.error}`);
    }
  }
  console.log(`--------------------------------------------------------------------------------\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let targetSpec = '';
  let customConcurrency: number | undefined;

  for (const arg of args) {
    if (arg.startsWith('--spec=')) {
      targetSpec = arg.split('=')[1];
    } else if (arg.startsWith('--concurrency=')) {
      customConcurrency = parseInt(arg.split('=')[1], 10);
    }
  }

  const configPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (targetSpec) {
    const specInfo = config.specs[targetSpec];
    if (!specInfo) {
      console.error(`Error: Spec "${targetSpec}" not found in tests/wpt-node-config.json`);
      process.exit(1);
    }
    await analyzeSpec(targetSpec, specInfo.path, specInfo.exclude, customConcurrency);
  } else {
    for (const [name, specInfo] of Object.entries(config.specs)) {
      await analyzeSpec(name, (specInfo as { path: string; exclude?: string[] }).path, (specInfo as { exclude?: string[] }).exclude, customConcurrency);
    }
  }
}

main().catch(err => {
  console.error('Fatal error in cluster analyzer:', err);
  process.exit(1);
});
