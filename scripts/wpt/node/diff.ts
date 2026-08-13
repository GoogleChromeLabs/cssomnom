/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';

const execFilePromise = promisify(execFile);

interface NearMiss {
  file: string;
  testName: string;
  expected: string;
  actual: string;
  category: string;
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

async function pool<T, R>(limit: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function analyzeSpec(specName: string, specPath: string): Promise<NearMiss[]> {
  const files = crawlDirectory(path.resolve(process.cwd(), specPath));
  const concurrency = Math.min(16, Math.max(1, os.availableParallelism() - 1));
  const nearMisses: NearMiss[] = [];

  await pool(concurrency, files, async (filePath) => {
    try {
      const { stdout, stderr } = await execFilePromise(process.execPath, ['--max-old-space-size=512', 'scripts/wpt/node/run.ts', filePath], { timeout: 15000 });
      const merged = stdout + '\n' + stderr;
      const lines = merged.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('✖ ')) {
          const testName = lines[i].replace(/.*✖\s*/, '').trim();
          // Look ahead for + actual - expected lines
          let actual = '';
          let expected = '';
          for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
            if (lines[j].startsWith('+ ')) actual = lines[j].substring(2).trim();
            if (lines[j].startsWith('- ')) expected = lines[j].substring(2).trim();
            if (actual && expected) break;
          }

          if (actual && expected) {
            let category = 'Other Value Mismatch';
            if (expected.startsWith('rgb(') || expected.startsWith('rgba(') || actual.startsWith('rgb(') || actual.startsWith('rgba(')) {
              category = 'Color Normalization Mismatch';
            } else if (expected.endsWith('px') || actual.endsWith('px')) {
              category = 'Length Unit Mismatch';
            } else if (actual === "''" || actual === '') {
              category = 'Unset/Default Value Missing';
            }

            nearMisses.push({
              file: path.relative(process.cwd(), filePath),
              testName,
              expected,
              actual,
              category,
            });
          }
        }
      }
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      const stdout = typeof errorObj.stdout === 'string' ? errorObj.stdout : '';
      const stderr = typeof errorObj.stderr === 'string' ? errorObj.stderr : '';
      const merged = stdout + '\n' + stderr;
      const lines = merged.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('✖ ')) {
          const testName = lines[i].replace(/.*✖\s*/, '').trim();
          let actual = '';
          let expected = '';
          for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
            if (lines[j].startsWith('+ ')) actual = lines[j].substring(2).trim();
            if (lines[j].startsWith('- ')) expected = lines[j].substring(2).trim();
            if (actual && expected) break;
          }
          if (actual && expected) {
            let category = 'Other Value Mismatch';
            if (expected.startsWith('rgb(') || expected.startsWith('rgba(') || actual.startsWith('rgb(') || actual.startsWith('rgba(')) {
              category = 'Color Normalization Mismatch';
            } else if (expected.endsWith('px') || actual.endsWith('px')) {
              category = 'Length Unit Mismatch';
            } else if (actual === "''" || actual === '') {
              category = 'Unset/Default Value Missing';
            }

            nearMisses.push({
              file: path.relative(process.cwd(), filePath),
              testName,
              expected,
              actual,
              category,
            });
          }
        }
      }
    }
  });

  return nearMisses;
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('diff.ts') || process.argv[1].endsWith('wpt_diff_failures.ts'))) {
  const specArg = process.argv[2] || 'selectors';
  const specDirMap: Record<string, string> = {
    'selectors': 'submodules/web-platform-tests/css/selectors',
    'css-variables': 'submodules/web-platform-tests/css/css-variables',
    'css-nesting': 'submodules/web-platform-tests/css/css-nesting',
    'cssom': 'submodules/web-platform-tests/css/cssom',
    'css-syntax': 'submodules/web-platform-tests/css/css-syntax',
  };

  const targetPath = specDirMap[specArg] || specArg;
  console.log(`Analyzing failure signatures in ${specArg}...`);

  analyzeSpec(specArg, targetPath).then((misses) => {
    console.log(`\nFound ${misses.length} near-miss assertion failures in ${specArg}:\n`);

    const byCategory = new Map<string, NearMiss[]>();
    for (const m of misses) {
      const list = byCategory.get(m.category) || [];
      list.push(m);
      byCategory.set(m.category, list);
    }

    for (const [cat, list] of byCategory) {
      console.log(`================================================================================`);
      console.log(`📌 ${cat}: ${list.length} assertions across ${new Set(list.map(l => l.file)).size} files`);
      console.log(`================================================================================`);
      for (const sample of list.slice(0, 5)) {
        console.log(`  • [${sample.file}] ${sample.testName}`);
        console.log(`    Expected: ${sample.expected}`);
        console.log(`    Actual:   ${sample.actual}\n`);
      }
    }
  }).catch(console.error);
}
