/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeExecTestFile, safeWorkerPool } from './safe-child-process.ts';

interface SpecConfig {
  path: string;
  exclude: string[];
}

interface SandboxConfig {
  specs: Record<string, SpecConfig>;
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

interface TestRunResult {
  file: string;
  passingSubtests: string[];
  failedSubtests: string[];
  loadError?: string;
}

async function runFile(filePath: string): Promise<TestRunResult> {
  const relativePath = path.relative(process.cwd(), filePath);
  try {
    const { stdout, stderr } = await safeExecTestFile(filePath, { timeout: 15000 });
    const merged = stdout + '\n' + stderr;
    const passingSubtests: string[] = [];
    const failedSubtests: string[] = [];

    const passMatches = merged.matchAll(/^\s*✔\s*(.*)/gm);
    for (const m of passMatches) {
      passingSubtests.push(m[1].trim());
    }

    const failMatches = merged.matchAll(/^\s*✖\s*(.*)/gm);
    for (const m of failMatches) {
      failedSubtests.push(m[1].trim());
    }

    return { file: relativePath, passingSubtests, failedSubtests };
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    const stdout = typeof errorObj.stdout === 'string' ? errorObj.stdout : '';
    const stderr = typeof errorObj.stderr === 'string' ? errorObj.stderr : '';
    const merged = stdout + '\n' + stderr;

    const passingSubtests: string[] = [];
    const failedSubtests: string[] = [];

    const passMatches = merged.matchAll(/^\s*✔\s*(.*)/gm);
    for (const m of passMatches) {
      passingSubtests.push(m[1].trim());
    }

    const failMatches = merged.matchAll(/^\s*✖\s*(.*)/gm);
    for (const m of failMatches) {
      failedSubtests.push(m[1].trim());
    }

    const loadErrorMatch = merged.match(/Failed to run file .*?: (.*)/);
    const loadError = loadErrorMatch ? loadErrorMatch[1].trim() : 'Execution failed or timed out';

    return { file: relativePath, passingSubtests, failedSubtests, loadError };
  }
}

export async function capturePassingSet(): Promise<Record<string, string[]>> {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SandboxConfig;
  const passingMap: Record<string, string[]> = {};

  const allFiles: string[] = [];
  for (const spec of Object.values(config.specs)) {
    const specDir = path.resolve(process.cwd(), spec.path);
    const files = crawlDirectory(specDir);
    for (const f of files) {
      const rel = path.relative(process.cwd(), f);
      if (!spec.exclude.includes(rel)) {
        allFiles.push(f);
      }
    }
  }

  const results = await safeWorkerPool(allFiles, runFile);

  let totalPassing = 0;
  for (const r of results) {
    if (r.passingSubtests.length > 0) {
      passingMap[r.file] = r.passingSubtests;
      totalPassing += r.passingSubtests.length;
    }
  }
  console.log(`Captured ${totalPassing} passing assertions across ${Object.keys(passingMap).length} files.`);
  return passingMap;
}

const BASELINE_PATH = path.resolve(process.cwd(), 'tests/fixtures/baselines/wpt-passing-set-baseline.json');

async function main() {
  const args = process.argv.slice(2);
  const isSnapshot = args.includes('--snapshot');
  const isVerify = args.includes('--verify');

  if (isSnapshot) {
    const map = await capturePassingSet();
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(map, null, 2), 'utf-8');
    console.log(`Saved baseline snapshot to ${path.relative(process.cwd(), BASELINE_PATH)}`);
  } else if (isVerify) {
    if (!fs.existsSync(BASELINE_PATH)) {
      console.error(`Error: Baseline snapshot not found at ${BASELINE_PATH}. Run with --snapshot first.`);
      process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as Record<string, string[]>;
    const current = await capturePassingSet();

    const regressions: { file: string; test: string }[] = [];
    const newPasses: { file: string; test: string }[] = [];

    for (const [file, expectedTests] of Object.entries(baseline)) {
      const currentTests = new Set(current[file] || []);
      for (const t of expectedTests) {
        if (!currentTests.has(t)) {
          regressions.push({ file, test: t });
        }
      }
    }

    for (const [file, currentTests] of Object.entries(current)) {
      const expectedTests = new Set(baseline[file] || []);
      for (const t of currentTests) {
        if (!expectedTests.has(t)) {
          newPasses.push({ file, test: t });
        }
      }
    }

    console.log('\n--- ZERO-REGRESSION AUDIT REPORT ---');
    console.log(`Baseline passing assertions: ${Object.values(baseline).reduce((acc, v) => acc + v.length, 0)}`);
    console.log(`Current passing assertions:  ${Object.values(current).reduce((acc, v) => acc + v.length, 0)}`);
    console.log(`Newly passing assertions:    +${newPasses.length}`);
    console.log(`Regressed / Dropped tests:   -${regressions.length}`);

    if (regressions.length > 0) {
      console.error('\n🔴 REGRESSIONS DETECTED:');
      for (const r of regressions.slice(0, 20)) {
        console.error(`  - ${r.file} -> ${r.test}`);
      }
      if (regressions.length > 20) {
        console.error(`  ... and ${regressions.length - 20} more regressions.`);
      }
      process.exit(1);
    } else {
      console.log('\n🟢 ZERO REGRESSIONS: 100% of baseline passing tests continue to pass!');
    }
  } else {
    console.log('Usage: node scripts/wpt/node/snapshot-and-verify.ts [--snapshot | --verify]');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
