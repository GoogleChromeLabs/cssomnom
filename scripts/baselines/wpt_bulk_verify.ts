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
import { tokenize } from '../../src/tokenizer.ts';
import { Parser } from '../../src/parser.ts';

const wptDir = path.resolve(process.cwd(), 'submodules/web-platform-tests');

function getAllCssFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git') {
        files.push(...getAllCssFiles(res));
      }
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(res);
    }
  }
  return files;
}

console.log('Finding CSS files in WPT...');
const cssFiles = getAllCssFiles(wptDir);
console.log(`Found ${cssFiles.length} CSS files.`);

let parsedCount = 0;
let errorCount = 0;

for (const file of cssFiles) {
  const relativePath = path.relative(wptDir, file);
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const tokens = tokenize(content);
    const parser = new Parser(tokens);
    parser.parseStyleSheet();
    parsedCount++;
    if (parsedCount % 100 === 0) {
      console.log(`Parsed ${parsedCount} files...`);
    }
  } catch (e) {
    errorCount++;
    console.error(`Failed to parse ${relativePath}:`, e);
  }
}

console.log(`Finished. Parsed: ${parsedCount}, Errors: ${errorCount}`);
