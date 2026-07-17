/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { serialize } from '../src/serializer.ts';

const REPO_ROOT = process.cwd();

const fixturesPath = path.join(REPO_ROOT, 'tests/fixtures/wpt/wpt-cssom.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8')) as Record<string, unknown>;

const baselinePath = path.join(REPO_ROOT, 'tests/fixtures/baselines/wpt-cssom-known-failures.json');
let baselineList: string[] = [];
if (fs.existsSync(baselinePath)) {
  baselineList = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as string[];
}

const knownFailures = new Set<string>(baselineList);

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

function getPropertyForKey(key: string): string {
  if (key.endsWith('-time')) return 'transition-duration';
  if (key.endsWith('-length')) return 'width';
  if (key.endsWith('-angle')) return 'transform';
  if (key.endsWith('-color')) return 'color';
  if (key.endsWith('-number')) return 'opacity';
  if (key.endsWith('-integer')) return 'z-index';
  if (key.endsWith('-percentage')) return 'width';
  if (key.endsWith('-resolution')) return 'image-resolution';
  return 'color';
}

describe('WPT Extracted Conformance Tests', () => {
  for (const [key, val] of Object.entries(fixtures)) {
    describe(`Section: ${key}`, () => {
      if (key === 'serialize-values') {
        for (const [prop, cases] of Object.entries(val as Record<string, unknown>)) {
          describe(`Property: ${prop}`, () => {
            const casesList = cases as Array<{ input: string; expected: string }>;
            for (let i = 0; i < casesList.length; i++) {
              const c = casesList[i];
              if (!c || !c.input || c.input.startsWith('TODO')) continue;

              const isKnownFailure = knownFailures.has(`${key}|${prop}|${normalize(c.input)}`);
              test(`Case ${i}: "${c.input}"`, { skip: isKnownFailure }, () => {
                const tokens = tokenize(c.input);
                const parsed = new Parser(tokens).parseComponentValues();
                const serialized = serialize(parsed, false, prop);
                assert.strictEqual(serialized, c.expected);
              });
            }
          });
        }
      } else {
        const prop = getPropertyForKey(key);
        const casesList = val as Array<{ input: string; expected: string }>;
        for (let i = 0; i < casesList.length; i++) {
          const c = casesList[i];
          if (!c || !c.input || c.input.startsWith('TODO')) continue;

          const isKnownFailure = knownFailures.has(`${key}|${prop}|${normalize(c.input)}`);
          test(`Case ${i}: "${c.input}"`, { skip: isKnownFailure }, () => {
            const tokens = tokenize(c.input);
            const parsed = new Parser(tokens).parseComponentValues();
            const serialized = serialize(parsed, false, prop);
            assert.strictEqual(serialized, c.expected);
          });
        }
      }
    });
  }
});
