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

import { runWptFile } from './run_wpt_sandbox.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.cwd();
const TARGET_DIR = path.join(REPO_ROOT, 'submodules/web-platform-tests/css/css-typed-om');
const CONFIG_PATH = path.join(REPO_ROOT, 'tests/wpt-sandbox-config.json');

function crawlDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }
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

async function main() {
  console.log(`Scanning WPT HTML files under: ${TARGET_DIR}...`);
  const allFiles = crawlDirectory(TARGET_DIR);
  console.log(`Found ${allFiles.length} HTML test files.`);

  const includeList: string[] = [];
  const knownFailures: Record<string, string[]> = {};
  const syntaxErrors: Record<string, string> = {};

  for (const filePath of allFiles) {
    const relativePath = path.relative(REPO_ROOT, filePath);
    console.log(`Running: ${relativePath}...`);
    
    let queue;
    try {
      queue = runWptFile(filePath);
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(`  [Init Error - Excluded]: ${error.message}`);
      syntaxErrors[relativePath] = error.message || String(err);
      continue;
    }

    includeList.push(relativePath);
    const failures: string[] = [];

    for (const testItem of queue) {
      try {
        await testItem.fn();
      } catch (err: unknown) {
        failures.push(testItem.name);
      }
    }

    if (failures.length > 0) {
      knownFailures[relativePath] = failures;
      console.log(`  -> ${failures.length} / ${queue.length} assertions failed (baselined)`);
    } else {
      console.log(`  -> All ${queue.length} assertions passed!`);
    }
  }

  const excludeList = Object.keys(syntaxErrors).sort();

  // Custom compact JSON serialization to keep git diffs readable and file size under ~400 lines:
  // - "exclude" list on a few lines
  // - "knownFailures" values (arrays of strings) on a single line per file
  const lines: string[] = [];
  lines.push('{');
  
  // Serialize exclude list
  lines.push('  "exclude": [');
  for (let i = 0; i < excludeList.length; i++) {
    const isLast = i === excludeList.length - 1;
    lines.push(`    "${excludeList[i]}"${isLast ? '' : ','}`);
  }
  lines.push('  ],');
  
  // Serialize knownFailures
  lines.push('  "knownFailures": {');
  const failureEntries = Object.entries(knownFailures).sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 0; i < failureEntries.length; i++) {
    const [file, fails] = failureEntries[i];
    const isLast = i === failureEntries.length - 1;
    const failsJson = JSON.stringify(fails);
    lines.push(`    "${file}": ${failsJson}${isLast ? '' : ','}`);
  }
  lines.push('  }');
  lines.push('}');

  fs.writeFileSync(CONFIG_PATH, lines.join('\n') + '\n', 'utf-8');
  console.log(`\nSuccessfully updated baseline configuration at: ${CONFIG_PATH}`);
  console.log(`Total active files crawled: ${includeList.length}`);
  console.log(`Total excluded files (syntax/init errors): ${excludeList.length}`);
}

main().catch(console.error);
