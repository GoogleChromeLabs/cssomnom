/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runWptFile } from './run_wpt_sandbox.ts';

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

function classifyError(err: unknown): { errorType: string; signature: string; cleanMessage: string } {
  const raw = err instanceof Error ? err.message || err.toString() : String(err);
  let errorType = 'UnknownError';
  let cleanMessage = raw.split('\n')[0].trim();

  if (cleanMessage.includes('assert_equals')) {
    errorType = 'assert_equals';
    // Match common assert_equals patterns: expected "X" but got "Y"
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

  // Normalize specific function signatures
  const signature = `${errorType}: ${cleanMessage}`;
  return { errorType, signature, cleanMessage };
}

async function analyzeSpec(specName: string, specPath: string) {
  const fullSpecPath = path.resolve(process.cwd(), specPath);
  console.log(`\n================================================================================`);
  console.log(`🔍 Scanning WPT Spec: "${specName}" (${specPath})`);
  console.log(`================================================================================`);

  const files = crawlDirectory(fullSpecPath).sort();
  if (files.length === 0) {
    console.log(`No HTML files found in ${fullSpecPath}`);
    return;
  }

  const failures: FailureRecord[] = [];
  let totalTests = 0;
  let passedTests = 0;

  for (const file of files) {
    const relFile = path.relative(process.cwd(), file);
    try {
      const result = runWptFile(file);
      for (const testItem of result.tests) {
        totalTests++;
        try {
          await testItem.fn();
          passedTests++;
        } catch (err) {
          const raw = err instanceof Error ? err.message || err.toString() : String(err);
          const { errorType, cleanMessage } = classifyError(err);
          failures.push({
            spec: specName,
            file: relFile,
            testName: testItem.name,
            errorType,
            errorMessage: cleanMessage,
            rawError: raw
          });
        }
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      result.cleanup();
    } catch (err) {
      failures.push({
        spec: specName,
        file: relFile,
        testName: '[FILE INIT CRASH]',
        errorType: 'FileInitCrash',
        errorMessage: String(err).split('\n')[0],
        rawError: String(err)
      });
    }
  }

  console.log(`\nResults: ${passedTests}/${totalTests} passed (${failures.length} failures, ${(passedTests / Math.max(1, totalTests) * 100).toFixed(2)}% pass rate)`);

  // Cluster failures
  const clusters = new Map<string, FailureCluster>();

  for (const fail of failures) {
    // Generate cluster key based on errorType + normalized pattern
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
  for (const arg of args) {
    if (arg.startsWith('--spec=')) {
      targetSpec = arg.split('=')[1];
    }
  }

  const configPath = path.resolve(process.cwd(), 'tests/wpt-sandbox-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (targetSpec) {
    const specInfo = config.specs[targetSpec];
    if (!specInfo) {
      console.error(`Error: Spec "${targetSpec}" not found in tests/wpt-sandbox-config.json`);
      process.exit(1);
    }
    await analyzeSpec(targetSpec, specInfo.path);
  } else {
    for (const [name, specInfo] of Object.entries(config.specs)) {
      await analyzeSpec(name, (specInfo as { path: string }).path);
    }
  }
}

main().catch(err => {
  console.error('Fatal error in cluster analyzer:', err);
  process.exit(1);
});
