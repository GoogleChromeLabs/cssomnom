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
import assert from 'node:assert';
import fs from 'node:fs';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';

const fixturesPath = new URL('./fixtures/lightningcss.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const baselinePath = new URL('./fixtures/external/lightning_known_failures.json', import.meta.url);
const knownFailuresSet = new Set<string>(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));

describe('LightningCSS Extracted Tests', () => {
    const isErrorTest = (type: string) => 
        type === 'error_test' || type === 'css_modules_error_test' || type === 'error_recovery_test';

    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

    for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        const isKnownFailure = knownFailuresSet.has(fixture.type + '|' + normalize(fixture.source));

        test(`Test ${i}: ${fixture.type}`, { skip: isKnownFailure }, () => {
            if (isErrorTest(fixture.type)) {
                assert.throws(() => {
                    const tokens = tokenize(fixture.source);
                    new Parser(tokens).parseStyleSheet();
                }, (err: unknown) => {
                    return err instanceof DOMException || err instanceof SyntaxError;
                }, 'Expected a parsing error (DOMException or SyntaxError) to be thrown');
                return;
            }

            const tokens = tokenize(fixture.source);
            const stylesheet = new Parser(tokens).parseStyleSheet();
            const cssText = Array.from(stylesheet.cssRules).map(r => r.cssText).join('\n');

            if (!fixture.expected) return;

            const nActual = normalize(cssText);
            const nExpected = normalize(fixture.expected);

            assert.strictEqual(nActual, nExpected);
        });
    }
});

