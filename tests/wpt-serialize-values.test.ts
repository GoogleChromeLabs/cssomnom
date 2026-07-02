/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { serialize } from '../src/serializer.ts';

// Load fixtures
const fixturesPath = path.join(process.cwd(), 'tests/fixtures/wpt_serialize_values.json');
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
