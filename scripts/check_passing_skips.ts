/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { serialize } from '../src/serializer.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// --- Helper Functions ---

const isErrorTest = (type: string) => 
    type === 'error_test' || type === 'css_modules_error_test' || type === 'error_recovery_test';

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

function checkLightningCSS(type: string, source: string, expected?: string): boolean {
  try {
    if (isErrorTest(type)) {
      assert.throws(() => {
        const tokens = tokenize(source);
        new Parser(tokens).parseStyleSheet();
      }, (err: unknown) => {
        return err instanceof DOMException || err instanceof SyntaxError;
      }, 'Expected a parsing error (DOMException or SyntaxError) to be thrown');
      return true;
    }

    const tokens = tokenize(source);
    const stylesheet = new Parser(tokens).parseStyleSheet();
    const cssText = Array.from(stylesheet.cssRules).map(r => r.cssText).join('\n');

    if (!expected) return true;

    const nActual = normalize(cssText);
    const nExpected = normalize(expected);

    assert.strictEqual(nActual, nExpected);
    return true;
  } catch (e) {
    return false;
  }
}

function checkWptExtracted(key: string, prop: string, input: string, expected: string): boolean {
  try {
    const tokens = tokenize(input);
    const parsed = new Parser(tokens).parseComponentValues();
    const serialized = serialize(parsed, false, prop);
    assert.strictEqual(serialized, expected);
    return true;
  } catch (e) {
    return false;
  }
}

interface LightningFixture {
  type: string;
  source: string;
  expected?: string;
}

interface LegacyWptFailure {
  key: string;
  property: string;
  input: string;
}

// --- Main execution ---

function main() {
  console.log('Starting verification of skips...');

  // --- 1. LightningCSS Verification ---
  const lightningFixturesPath = path.join(REPO_ROOT, 'tests/fixtures/lightningcss.json');
  const lightningBaselinePath = path.join(REPO_ROOT, 'tests/fixtures/external/lightning_known_failures.json');

  const lightningFixtures = JSON.parse(fs.readFileSync(lightningFixturesPath, 'utf8')) as LightningFixture[];
  let lightningFailures = JSON.parse(fs.readFileSync(lightningBaselinePath, 'utf8')) as unknown[];
  let lightningMigrated = false;
  if (lightningFailures.length > 0 && typeof lightningFailures[0] === 'object' && lightningFailures[0] !== null) {
    console.log('Migrating lightning_known_failures.json to collapsed key string format...');
    lightningFailures = (lightningFailures as LightningFixture[]).map(kf => kf.type + '|' + normalize(kf.source));
    lightningMigrated = true;
  }

  const lightningMap = new Map<string, LightningFixture[]>();
  for (const f of lightningFixtures) {
    const key = `${f.type}|${normalize(f.source)}`;
    if (!lightningMap.has(key)) {
      lightningMap.set(key, []);
    }
    lightningMap.get(key)!.push(f);
  }

  const lightningPassing: string[] = [];
  const lightningFailing: string[] = [];

  for (const key of lightningFailures as string[]) {
    const fixtures = lightningMap.get(key);
    if (!fixtures || fixtures.length === 0) {
      lightningPassing.push(key);
      continue;
    }

    let allPass = true;
    for (const fixture of fixtures) {
      const passes = checkLightningCSS(fixture.type, fixture.source, fixture.expected);
      if (!passes) {
        allPass = false;
        break;
      }
    }

    if (allPass) {
      lightningPassing.push(key);
    } else {
      lightningFailing.push(key);
    }
  }

  // --- 2. WPT Extracted Verification ---
  const wptFixturesPath = path.join(REPO_ROOT, 'tests/fixtures/wpt_extracted.json');
  const wptBaselinePath = path.join(REPO_ROOT, 'tests/fixtures/external/wpt_extracted_known_failures.json');

  const wptFixtures = JSON.parse(fs.readFileSync(wptFixturesPath, 'utf8')) as Record<string, unknown>;
  let wptFailures = JSON.parse(fs.readFileSync(wptBaselinePath, 'utf8')) as unknown[];
  let wptMigrated = false;
  if (wptFailures.length > 0 && typeof wptFailures[0] === 'object' && wptFailures[0] !== null) {
    console.log('Migrating wpt_extracted_known_failures.json to collapsed key string format...');
    wptFailures = (wptFailures as LegacyWptFailure[]).map(kf => `${kf.key}|${kf.property}|${normalize(kf.input)}`);
    wptMigrated = true;
  }

  const wptMap = new Map<string, Array<{ input: string; expected: string }>>();
  for (const [key, val] of Object.entries(wptFixtures)) {
    if (key === 'serialize-values') {
      for (const [prop, cases] of Object.entries(val as Record<string, unknown>)) {
        const casesList = cases as Array<{ input: string; expected: string }>;
        for (const c of casesList) {
          if (!c || !c.input || c.input.startsWith('TODO')) continue;
          const mapKey = `${key}|${prop}|${normalize(c.input)}`;
          if (!wptMap.has(mapKey)) {
            wptMap.set(mapKey, []);
          }
          wptMap.get(mapKey)!.push(c);
        }
      }
    } else {
      const prop = getPropertyForKey(key);
      const casesList = val as Array<{ input: string; expected: string }>;
      for (const c of casesList) {
        if (!c || !c.input || c.input.startsWith('TODO')) continue;
        const mapKey = `${key}|${prop}|${normalize(c.input)}`;
        if (!wptMap.has(mapKey)) {
          wptMap.set(mapKey, []);
        }
        wptMap.get(mapKey)!.push(c);
      }
    }
  }

  const wptPassing: string[] = [];
  const wptFailing: string[] = [];

  for (const kfKey of wptFailures as string[]) {
    const cases = wptMap.get(kfKey);
    if (!cases || cases.length === 0) {
      wptPassing.push(kfKey);
      continue;
    }

    const parts = kfKey.split('|');
    const key = parts[0];
    const property = parts[1];

    let allPass = true;
    for (const c of cases) {
      const passes = checkWptExtracted(key, property, c.input, c.expected);
      if (!passes) {
        allPass = false;
        break;
      }
    }

    if (allPass) {
      wptPassing.push(kfKey);
    } else {
      wptFailing.push(kfKey);
    }
  }

  // --- 3. Summary & Rewrite ---
  console.log('\n--- LightningCSS Verification ---');
  console.log(`Total checked failures: ${lightningFailures.length}`);
  console.log(`Now passing (will be pruned): ${lightningPassing.length}`);
  console.log(`Still failing: ${lightningFailing.length}`);

  console.log('\n--- WPT Extracted Verification ---');
  console.log(`Total checked failures: ${wptFailures.length}`);
  console.log(`Now passing (will be pruned): ${wptPassing.length}`);
  console.log(`Still failing: ${wptFailing.length}`);

  if (lightningPassing.length > 0) {
    console.log('\nSample of newly passing LightningCSS tests:');
    lightningPassing.slice(0, 10).forEach(p => {
      console.log(` - ${p.substring(0, 80)}...`);
    });
  }

  if (wptPassing.length > 0) {
    console.log('\nSample of newly passing WPT Extracted tests:');
    wptPassing.slice(0, 10).forEach(p => {
      console.log(` - ${p}`);
    });
  }

  // Rewrite files
  if (lightningPassing.length > 0 || lightningMigrated) {
    fs.writeFileSync(lightningBaselinePath, JSON.stringify(lightningFailing, null, 2) + '\n', 'utf8');
    console.log(`\nUpdated ${lightningBaselinePath}`);
  } else {
    console.log('\nNo updates needed for LightningCSS baseline.');
  }

  if (wptPassing.length > 0 || wptMigrated) {
    fs.writeFileSync(wptBaselinePath, JSON.stringify(wptFailing, null, 2) + '\n', 'utf8');
    console.log(`Updated ${wptBaselinePath}`);
  } else {
    console.log('No updates needed for WPT Extracted baseline.');
  }

  console.log('\nVerification complete!');
}

main();
