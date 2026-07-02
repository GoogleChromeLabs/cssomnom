/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';

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
