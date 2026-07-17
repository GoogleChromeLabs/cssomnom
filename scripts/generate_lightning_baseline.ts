/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

const fixturesPath = new URL('../tests/fixtures/lightningcss.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const isErrorTest = (type: string) => 
    type === 'error_test' || type === 'css_modules_error_test' || type === 'error_recovery_test';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

const knownFailures: string[] = [];

for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    let failed = false;

    if (isErrorTest(fixture.type)) {
        try {
            const tokens = tokenize(fixture.source);
            new Parser(tokens).parseStyleSheet();
            failed = true; // Expected to throw but did not
        } catch {
            // Passed (correctly threw)
        }
    } else {
        let cssText = '';
        try {
            const tokens = tokenize(fixture.source);
            const stylesheet = new Parser(tokens).parseStyleSheet();
            cssText = Array.from(stylesheet.cssRules).map(r => r.cssText).join('\n');
            
            if (fixture.expected) {
                const nActual = normalize(cssText);
                const nExpected = normalize(fixture.expected);
                if (nActual !== nExpected) {
                    failed = true; // Output mismatch
                }
            }
        } catch (e) {
            failed = true; // Threw during parse
        }
    }

    if (failed) {
        knownFailures.push(fixture.type + '|' + normalize(fixture.source));
    }
}

// Make sure target directory exists
fs.mkdirSync(new URL('../tests/fixtures/external', import.meta.url), { recursive: true });

fs.writeFileSync(
    new URL('../tests/fixtures/external/lightning_known_failures.json', import.meta.url),
    JSON.stringify(knownFailures, null, 2) + '\n'
);

console.log(`Generated ${knownFailures.length} known failures.`);
