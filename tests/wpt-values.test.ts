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
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { serialize } from '../src/serializer.ts';

// Load fixtures
const fixturesPath = path.join(process.cwd(), 'tests/fixtures/wpt/wpt-values.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// https://drafts.csswg.org/css-values-4/#calc-serialize
// https://drafts.csswg.org/css-values-4/#position-serialization
test('WPT serialize-values', async (t: TestContext) => {
  const propertyFilter = process.env.PROPERTY;
  for (const [property, cases] of Object.entries(fixtures)) {
    if (propertyFilter && property !== propertyFilter) continue;
    await t.test(`Property: ${property}`, () => {
      for (const c of cases as { input: string; expected: string }[]) {
        // Skip TODOs in fixtures
        if (c.input.startsWith('TODO')) continue;
        
        const tokens = tokenize(c.input);
        const parsed = new Parser(tokens).parseComponentValues();
        const serialized = serialize(parsed, false, property);
        assert.strictEqual(serialized, c.expected, `Failed for ${c.input}`);
      }
    });
  }
});
