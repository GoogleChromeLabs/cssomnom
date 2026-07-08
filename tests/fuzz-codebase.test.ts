/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import type { ParseError } from '../src/types.ts';

test('Fuzz codebase with local CSS files', () => {
  const fuzzDir = process.env.FUZZ_DIR;
  if (!fuzzDir) {
    console.log('FUZZ_DIR environment variable not set, skipping fuzzing test. Set FUZZ_DIR to run this test.');
    return;
  }

  if (!fs.existsSync(fuzzDir)) {
    console.log(`Directory ${fuzzDir} does not exist, skipping test.`);
    return;
  }

  console.log(`Finding CSS files in ${fuzzDir}...`);
  let cssFiles: string[] = [];
  try {
    const output = child_process.execSync('fd --glob "*.css"', { cwd: fuzzDir, encoding: 'utf8' });
    cssFiles = output.split('\n').filter(Boolean).map(f => path.resolve(fuzzDir, f));
  } catch (e) {
    console.log('Failed to run fd command, skipping test.', e);
    return;
  }

  console.log(`Found ${cssFiles.length} CSS files to fuzz.`);

  let parsedCount = 0;
  let errorCount = 0;

  for (const file of cssFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const errors: ParseError[] = [];
      const tokens = tokenize(content, false, errors);
      const parser = new Parser(tokens);
      parser.parseStyleSheet();
      
      if (errors.length > 0) {
        console.warn(`Tokenizer errors in ${file}:`, errors.map(e => e.message));
      }
      
      parsedCount++;
    } catch (e) {
      errorCount++;
      console.error(`Failed to parse ${file}:`, e);
    }
  }

  console.log(`Finished fuzzing. Parsed: ${parsedCount}, Errors: ${errorCount}`);
  assert.strictEqual(errorCount, 0, `Found ${errorCount} parsing errors during fuzzing.`);
});
