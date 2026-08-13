/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ALLOWED_FILES = new Set([
  'scripts/wpt/node/safe-child-process.ts',
  'scripts/codegen/generate_all.ts',
  'scripts/external_suites/extract_all.ts',
  'scripts/wpt/browser/run.ts',
]);

interface Violation {
  file: string;
  lineNumber: number;
  lineContent: string;
}

const IMPORT_PATTERN = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](?:node:)?child_process['"]/;

function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath));
    } else if (/\.[tj]sx?$/.test(entry.name) || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkFiles(): Violation[] {
  const repoRoot = process.cwd();
  const searchDirs = [
    path.join(repoRoot, 'scripts'),
    path.join(repoRoot, 'tests'),
  ];

  const allFiles: string[] = [];
  for (const dir of searchDirs) {
    allFiles.push(...findSourceFiles(dir));
  }

  const violations: Violation[] = [];

  for (const filePath of allFiles) {
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    if (ALLOWED_FILES.has(relPath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (IMPORT_PATTERN.test(line)) {
        violations.push({
          file: relPath,
          lineNumber: i + 1,
          lineContent: line.trim(),
        });
      }
    }
  }

  return violations;
}

function main() {
  const violations = checkFiles();

  if (violations.length > 0) {
    console.error('\x1b[31m================================================================================');
    console.error('❌ [SAFE-EXEC GUARD] FORBIDDEN CHILD_PROCESS IMPORT DETECTED:');
    console.error('================================================================================\x1b[0m');
    for (const v of violations) {
      console.error(`  📁 ${v.file}:${v.lineNumber}`);
      console.error(`     ↳ ${v.lineContent}`);
    }
    console.error('\x1b[33m\nDirect imports of "node:child_process" or "child_process" are disallowed');
    console.error('in test and runner scripts to prevent unmonitored memory growth, swap thrashing,');
    console.error('and orphaned zombie worker processes.\n');
    console.error('Please import the centralized safe execution kernel instead:');
    console.error('  import { safeExecTestFile, safeWorkerPool } from "./safe-child-process.ts";\x1b[0m\n');
    process.exit(1);
  }

  console.log('✔ [SAFE-EXEC GUARD] All scripts and tests conform to safe subprocess policies.');
}

main();
