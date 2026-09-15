/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FORBIDDEN_PATTERNS = [
  /submodules\/web-platform-tests/,
  /submodules\/rrweb-cssom/,
];

// Files that legitimately mention submodule paths as static string fixtures
// (e.g. testing WPT CLI path normalization or classifier pattern matching on file paths)
const EXCLUDED_TEST_FILES = new Set([
  'tests/wpt-cli.test.ts',
  'tests/wpt-classifier.test.ts',
  'tests/submodule-dependencies.test.ts',
]);

function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

test('Unit tests in tests/ must not reference git submodules (self-contained fixtures only)', () => {
  const repoRoot = process.cwd();
  const testFiles = findTestFiles(path.join(repoRoot, 'tests'));
  const violations: Array<{ file: string; line: number; text: string }> = [];

  for (const filePath of testFiles) {
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    if (EXCLUDED_TEST_FILES.has(relPath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: relPath,
            line: i + 1,
            text: line.trim(),
          });
          break;
        }
      }
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Found unit test files referencing submodules at runtime:\n${violations
      .map(v => `  ${v.file}:${v.line} -> ${v.text}`)
      .join('\n')}`
  );
});
