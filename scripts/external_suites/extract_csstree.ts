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

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const CSSTREE_ROOT = path.join(REPO_ROOT, 'submodules/csstree');

const stylesheetPath = path.join(CSSTREE_ROOT, 'fixtures/ast/stylesheet/StyleSheet.json');
const errorsPath = path.join(CSSTREE_ROOT, 'fixtures/ast/stylesheet/errors.json');

async function run() {
  console.log('Reading StyleSheet.json...');
  const stylesheetData = JSON.parse(fs.readFileSync(stylesheetPath, 'utf8'));

  const stylesheetResults = [];
  for (const key in stylesheetData) {
    const item = stylesheetData[key];
    stylesheetResults.push({
      name: key,
      input: item.source,
      result: item.ast
    });
  }

  const stylesheetOutputPath = path.resolve(REPO_ROOT, 'tests/fixtures/external/csstree-tests.json');
  fs.writeFileSync(stylesheetOutputPath, JSON.stringify(stylesheetResults, null, 2));
  console.log(`Saved ${stylesheetResults.length} tests to ${stylesheetOutputPath}`);

  console.log('Reading errors.json...');
  const errorsData = JSON.parse(fs.readFileSync(errorsPath, 'utf8'));

  const errorResults = [];
  if (errorsData.error) {
    for (const item of errorsData.error) {
      errorResults.push({
        input: item.source,
        error: item.error
      });
    }
  }

  const errorsOutputPath = path.resolve(REPO_ROOT, 'tests/fixtures/external/csstree-errors.json');
  fs.writeFileSync(errorsOutputPath, JSON.stringify(errorResults, null, 2));
  console.log(`Saved ${errorResults.length} error tests to ${errorsOutputPath}`);
}

run().catch(console.error);
