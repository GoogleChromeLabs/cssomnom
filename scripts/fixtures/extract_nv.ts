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

const filePath = path.resolve(import.meta.dirname, '../../submodules/CSSOM/spec/parse.spec.js');

function run() {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        console.error('Please make sure submodules are initialized.');
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Find where var TESTS = [ starts
    const startIndex = content.indexOf('var TESTS = [');
    if (startIndex === -1) {
        console.error('Could not find var TESTS = [');
        return;
    }

    // Find the end of the array. It ends with ]; before describe('CSSOM'
    const describeIndex = content.indexOf("describe('CSSOM'");
    const arrayEndIndex = content.lastIndexOf('];', describeIndex);

    if (arrayEndIndex === -1) {
        console.error('Could not find end of TESTS array');
        return;
    }

    const testsCode = content.substring(startIndex, arrayEndIndex + 2);

    // Change to return the array directly for eval
    const executableCode = testsCode.replace('var TESTS = [', '[');

    try {
        // Eval the code to get the array
        // eslint-disable-next-line no-eval
        const tests = eval(executableCode);
        console.log(`Extracted ${tests.length} tests`);

        // Remove circular references to allow JSON stringify
        const removeCircular = (obj: unknown) => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                obj.forEach(removeCircular);
                return;
            }
            const record = obj as Record<string, unknown>;
            delete record.parentStyleSheet;
            delete record.parentRule;
            for (const key in record) {
                if (Object.prototype.hasOwnProperty.call(record, key)) {
                    removeCircular(record[key]);
                }
            }
        };

        removeCircular(tests);

        const outputPath = path.resolve(import.meta.dirname, '../../tests/fixtures/external/nv_tests.json');
        fs.writeFileSync(outputPath, JSON.stringify(tests, null, 2));
        console.log(`Saved to ${outputPath}`);
    } catch (e) {
        console.error('Failed to eval or stringify:', e);
    }
}

run();
