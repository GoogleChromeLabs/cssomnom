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

const cases = [
  'apply', 'at-rule-brackets', 'atrule-decls', 'atrule-empty',
  'atrule-no-params', 'atrule-no-semicolon', 'atrule-no-space',
  'atrule-params', 'atrule-rules', 'between', 'bom', 'colon-selector',
  'comments', 'custom-properties', 'decls', 'empty', 'escape',
  'extends', 'function', 'ie-progid', 'important', 'inside',
  'no-selector', 'prop', 'quotes', 'raw-decl', 'rule-at',
  'rule-no-semicolon', 'selector', 'semicolons', 'spaces', 'tab'
];

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const POSTCSS_TESTS_ROOT = path.join(REPO_ROOT, 'submodules/postcss-parser-tests');

const casesDir = path.join(POSTCSS_TESTS_ROOT, 'cases');
const extraPath = path.join(POSTCSS_TESTS_ROOT, 'extra-cases.json');

async function run() {
  const results = [];

  console.log('Reading extra cases...');
  const extraCases = JSON.parse(fs.readFileSync(extraPath, 'utf8'));

  for (const name of cases) {
    console.log(`Processing ${name}...`);
    let css = '';
    if (extraCases[name]) {
      css = extraCases[name];
    } else {
      const cssPath = path.join(casesDir, `${name}.css`);
      if (fs.existsSync(cssPath)) {
        css = fs.readFileSync(cssPath, 'utf8');
      } else {
        console.error(`Failed to read CSS for ${name}: file not found`);
        continue;
      }
    }

    const jsonPath = path.join(casesDir, `${name}.json`);
    let json = null;
    if (fs.existsSync(jsonPath)) {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } else {
      console.error(`Failed to read JSON for ${name}: file not found`);
      continue;
    }

    results.push({
      name: name,
      input: css.trim(),
      result: json
    });
  }

  const outputPath = path.resolve(import.meta.dirname, '../tests/fixtures/external/postcss_tests.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} tests to ${outputPath}`);
}

run().catch(console.error);
