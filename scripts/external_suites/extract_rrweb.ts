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
import * as vm from 'node:vm';

const filePath = path.resolve(import.meta.dirname, '../../submodules/rrweb-cssom/spec/parse.spec.js');
const outputPath = path.resolve(import.meta.dirname, '../../tests/fixtures/external/rrweb-tests.json');

function run() {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error('Please make sure submodules are initialized.');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const specificTests: unknown[] = [];
  const sandbox: Record<string, unknown> = {
    describe: (_name: string, fn: () => void) => fn(),
    given: (input: string, fn: () => void) => specificTests.push({ input, fn }),
    expect: () => ({
      toEqualOwnProperties: () => {},
      toBe: () => {}
    }),
    uncircularOwnProperties: () => {},
    removeUnderscored: () => {},
    CSSOM: {
      parse: () => ({ cssRules: [{ style: {} }] })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(content, sandbox);

  const tests = sandbox.TESTS;

  const removeCircular = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    const record = obj as Record<string, unknown>;
    if ('parentRule' in record) delete record.parentRule;
    if ('parentStyleSheet' in record) delete record.parentStyleSheet;
    for (const key of Object.keys(record)) {
      removeCircular(record[key]);
    }
  };

  removeCircular(tests);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(tests, null, 2) + '\n');
  console.log(`Extracted ${(tests as unknown[]).length} rrweb tests to ${outputPath}`);
}

run();
