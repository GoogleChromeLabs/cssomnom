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
import { test, describe } from 'node:test';
import fs from 'node:fs';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

const fixturesPath = new URL('./fixtures/lightningcss.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

type Failure = { type: string; source: string; expected?: string; actual?: string; err: string };

describe('LightningCSS Extracted Tests', () => {
    let parseSuccess = 0;
    let matchSuccess = 0;
    let expectedErrors = 0;
    const failures: Failure[] = [];

    const isErrorTest = (type: string) => 
        type === 'error_test' || type === 'css_modules_error_test' || type === 'error_recovery_test';

    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

    for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];

        test(`Test ${i}: ${fixture.type}`, () => {
            if (isErrorTest(fixture.type)) {
                expectedErrors++;
                
                try {
                    const tokens = tokenize(fixture.source);
                    new Parser(tokens).parseStyleSheet();
                } catch {
                    parseSuccess++;
                    return;
                }

                failures.push({ 
                    type: fixture.type, 
                    source: fixture.source, 
                    err: 'Expected to throw but did not' 
                });
                return;
            }

            let cssText = '';
            try {
                const tokens = tokenize(fixture.source);
                const stylesheet = new Parser(tokens).parseStyleSheet();
                cssText = Array.from(stylesheet.cssRules).map(r => r.cssText).join('\n');
                parseSuccess++;
            } catch (e: unknown) {
                const errMessage = e instanceof Error ? e.message : String(e);
                failures.push({ 
                    type: fixture.type, 
                    source: fixture.source, 
                    err: `Threw during parse: ${errMessage}` 
                });
                return;
            }

            if (!fixture.expected) return;

            const nActual = normalize(cssText);
            const nExpected = normalize(fixture.expected);

            if (nActual === nExpected) {
                matchSuccess++;
                return;
            }

            failures.push({ 
                type: fixture.type, 
                source: fixture.source, 
                expected: nExpected, 
                actual: nActual, 
                err: 'Mismatch' 
            });
        });
    }

    test('Summary Output', () => {
        const summary = {
            total: fixtures.length,
            parseSuccess,
            matchSuccess,
            expectedErrors,
            failuresCount: failures.length,
            failures: failures.slice(0, 50)
        };
        fs.writeFileSync('tests/fixtures/failures_summary.json', JSON.stringify(summary, null, 2));
    });
});
