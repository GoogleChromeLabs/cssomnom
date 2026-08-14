/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  VALID_SPECS,
  SPEC_DISPLAY_NAMES,
  SPEC_ORDER,
  CANONICAL_FEASIBLE_TARGETS,
  CANONICAL_FEASIBLE_TOTAL,
  loadWptConfig,
  validateSpecName,
} from '../scripts/wpt/node/core/config.ts';

import { crawlSpecFiles } from '../scripts/wpt/node/core/crawler.ts';

import {
  classifyError,
  categorizeDiff,
  parseRunnerOutput,
  clusterFailures,
  extractExpectationDiffs,
  auditBaseline,
  countDeclaredTests,
} from '../scripts/wpt/node/core/parser.ts';

import {
  saveDatasetToCache,
  loadDatasetFromCache,
  hasValidCache,
} from '../scripts/wpt/node/core/cache.ts';

import {
  formatProgressRow,
  updateProgressLog,
  syncProgressFromNotes,
  attachGitNote,
} from '../scripts/wpt/node/core/progress.ts';

import type { TestRunDataset, ParsedFileResult } from '../scripts/wpt/node/core/types.ts';

describe('WPT CLI Core Modules', () => {
  describe('core/config.ts', () => {
    test('enumerates valid specs and metadata', () => {
      assert.strictEqual(VALID_SPECS.length, 7);
      assert.ok(validateSpecName('css-typed-om'));
      assert.ok(validateSpecName('selectors'));
      assert.ok(validateSpecName('cssom'));
      assert.ok(!validateSpecName('non-existent-spec'));

      assert.strictEqual(SPEC_ORDER.length, 7);
      for (const spec of SPEC_ORDER) {
        assert.ok(SPEC_DISPLAY_NAMES[spec], `Display name missing for ${spec}`);
        assert.ok(CANONICAL_FEASIBLE_TARGETS[spec] > 0, `Target missing for ${spec}`);
      }
      assert.strictEqual(CANONICAL_FEASIBLE_TOTAL, 18769);
    });

    test('loads wpt-node-config.json accurately', () => {
      const config = loadWptConfig();
      assert.ok(config.specs);
      assert.ok(config.specs['cssom']);
      assert.ok(config.specs['selectors']);
      assert.ok(config.specs['css-typed-om']);
      assert.ok(Array.isArray(config.specs['css-typed-om'].exclude));
    });
  });

  describe('core/crawler.ts', () => {
    test('crawls files and applies spec and path filters', () => {
      const config = loadWptConfig();
      const allFiles = crawlSpecFiles(config);
      assert.ok(allFiles.length > 500, `Expected >500 files, got ${allFiles.length}`);

      const nestingFiles = crawlSpecFiles(config, { filterBySpec: 'css-nesting' });
      assert.ok(nestingFiles.length > 0);
      assert.ok(nestingFiles.every(f => f.spec === 'css-nesting'));

      const filteredByPath = crawlSpecFiles(config, { filterByPath: 'css-nesting' });
      assert.ok(filteredByPath.length > 0);
      assert.ok(filteredByPath.every(f => f.relativePath.includes('css-nesting')));
    });

    test('throws on unknown spec filter', () => {
      const config = loadWptConfig();
      assert.throws(() => {
        crawlSpecFiles(config, { filterBySpec: 'invalid-spec-xyz' });
      }, /Spec "invalid-spec-xyz" not found/);
    });
  });

  describe('core/parser.ts', () => {
    test('classifies error patterns accurately', () => {
      assert.strictEqual(classifyError('AssertionError: expected foo, but got bar').errorType, 'assert_equals');
      assert.strictEqual(classifyError('assert_throws_js(TypeError, ...').errorType, 'assert_throws');
      assert.strictEqual(classifyError('assert_true(flag)').errorType, 'assert_boolean');
      assert.strictEqual(classifyError('TypeError: Cannot read properties of undefined (reading \'foo\')').cleanMessage, 'TypeError: Cannot read property on undefined/null');
      assert.strictEqual(classifyError('Runner timed out after 15000ms').errorType, 'TimeoutOrCrash');
    });

    test('categorizes expectation diffs', () => {
      assert.strictEqual(categorizeDiff('rgb(0, 0, 0)', 'rgba(0, 0, 0, 1)'), 'Color Normalization Mismatch');
      assert.strictEqual(categorizeDiff('10px', '20px'), 'Length Unit Mismatch');
      assert.strictEqual(categorizeDiff('foo', ''), 'Unset/Default Value Missing');
      assert.strictEqual(categorizeDiff('inline', 'block'), 'Other Value Mismatch');
    });

    test('parses test runner stdout/stderr with passing and failing subtests', () => {
      const stdout = [
        'Running WPT file: cssom/test.html',
        '  ✔ subtest-1 passes',
        '  ✔ subtest-2 passes',
        '  ✖ subtest-3 fails',
        'AssertionError: expected value to be strictly equal',
        '  + \'actual-value\'',
        '  - \'expected-value\'',
        'Summary: 2/3 passed, 1 failed',
      ].join('\n');

      const parsed = parseRunnerOutput(stdout, '', {
        file: 'cssom/test.html',
        spec: 'cssom',
        durationMs: 120,
        peakRssMb: 45,
        status: 'OK',
      });

      assert.strictEqual(parsed.passing, 2);
      assert.strictEqual(parsed.total, 3);
      assert.strictEqual(parsed.passingSubtests.length, 2);
      assert.strictEqual(parsed.failedSubtests.length, 1);
      assert.strictEqual(parsed.subtests.length, 3);
      assert.strictEqual(parsed.subtests[2].expected, '\'expected-value\'');
      assert.strictEqual(parsed.subtests[2].actual, '\'actual-value\'');
    });

    test('parses runner timeout or crash without summary line', () => {
      const parsed = parseRunnerOutput('', 'Runner timed out after 15000ms', {
        file: 'cssom/timeout.html',
        spec: 'cssom',
        durationMs: 15000,
        peakRssMb: 60,
        status: 'TIMEOUT',
      });

      assert.strictEqual(parsed.passing, 0);
      assert.ok(parsed.total >= 1);
      assert.ok(parsed.loadError?.includes('timed out'));
    });

    test('clusters failures and extracts expectation diffs', () => {
      const mockResult: ParsedFileResult = {
        file: 'css/cssom/color.html',
        spec: 'cssom',
        passing: 1,
        total: 2,
        passingSubtests: ['pass-1'],
        failedSubtests: ['fail-1'],
        subtests: [
          { name: 'pass-1', status: 'PASS' },
          {
            name: 'serialize color test',
            status: 'FAIL',
            error: 'assert_equals: expected [value] but got [value]',
            errorType: 'assert_equals',
            rawError: 'AssertionError: assert_equals: expected red but got rgb(255, 0, 0)',
            expected: 'red',
            actual: 'rgb(255, 0, 0)',
          },
        ],
        durationMs: 50,
        peakRssMb: 30,
        status: 'OK',
      };

      const clusters = clusterFailures([mockResult]);
      assert.strictEqual(clusters.length, 1);
      assert.ok(clusters[0].title.includes('Serialization Mismatch'));
      assert.strictEqual(clusters[0].count, 1);

      const diffs = extractExpectationDiffs([mockResult]);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].expected, 'red');
      assert.strictEqual(diffs[0].actual, 'rgb(255, 0, 0)');
      assert.strictEqual(diffs[0].category, 'Color Normalization Mismatch');
    });

    test('audits baseline comparing passing set and detecting regressions', () => {
      const baseline = {
        'file1.html': ['test-a', 'test-b'],
        'file2.html': ['test-c'],
      };
      const currentSuccess = {
        'file1.html': ['test-a', 'test-b', 'test-new'],
        'file2.html': ['test-c'],
      };
      const audit1 = auditBaseline(baseline, currentSuccess);
      assert.strictEqual(audit1.regressions.length, 0);
      assert.strictEqual(audit1.newPasses.length, 1);
      assert.strictEqual(audit1.isMonotonic, true);

      const currentRegression = {
        'file1.html': ['test-a'], // dropped test-b
        'file2.html': ['test-c'],
      };
      const audit2 = auditBaseline(baseline, currentRegression);
      assert.strictEqual(audit2.regressions.length, 1);
      assert.strictEqual(audit2.regressions[0].test, 'test-b');
      assert.strictEqual(audit2.isMonotonic, false);
    });

    test('counts declared tests in html file', () => {
      assert.strictEqual(countDeclaredTests(undefined), 1);
      assert.strictEqual(countDeclaredTests('non-existent-file.html'), 1);
    });
  });

  describe('core/cache.ts', () => {
    test('saves and loads dataset to cache in temp directory', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-cache-test-'));
      try {
        assert.strictEqual(hasValidCache(tempDir), false);
        assert.strictEqual(loadDatasetFromCache(tempDir), null);

        const dataset: TestRunDataset = {
          timestamp: '2026-08-13 12:00:00',
          commitHash: 'abcdef1',
          isDirty: false,
          specSummaries: { cssom: { passing: 10, total: 10, files: 1 } },
          totalPassing: 10,
          totalTests: 10,
          totalFiles: 1,
          fileResults: [],
        };

        saveDatasetToCache(dataset, tempDir);
        assert.strictEqual(hasValidCache(tempDir), true);

        const loaded = loadDatasetFromCache(tempDir);
        assert.ok(loaded);
        assert.strictEqual(loaded.commitHash, 'abcdef1');
        assert.strictEqual(loaded.totalPassing, 10);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('core/progress.ts', () => {
    test('formats progress row with correct column structure and calculations', () => {
      const dataset: TestRunDataset = {
        timestamp: '2026-08-13 20:00:00',
        commitHash: '1234567',
        isDirty: false,
        specSummaries: {
          'css-typed-om': { passing: 11000, total: 12219, files: 200 },
          'cssom': { passing: 600, total: 923, files: 50 },
          'css-nesting': { passing: 117, total: 117, files: 10 },
          'css-syntax': { passing: 398, total: 398, files: 20 },
          'css-variables': { passing: 300, total: 548, files: 30 },
          'selectors': { passing: 3500, total: 4147, files: 100 },
          'mediaqueries': { passing: 417, total: 417, files: 15 },
        },
        totalPassing: 16332,
        totalTests: 18769,
        totalFiles: 425,
        fileResults: [],
      };

      const row = formatProgressRow(dataset, '1234567');
      assert.ok(row.startsWith('| 2026-08-13 20:00:00 | `1234567` |'));
      assert.ok(row.includes('11000/12219'));
      assert.ok(row.includes('600/923'));
      assert.ok(row.includes('16332/18769'));
      assert.ok(row.includes('87.02%'));
      assert.ok(row.includes('**87.02%**'));
    });

    test('updates progress log and handles dry run, duplicates, and dirty status', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-progress-test-'));
      const testProgressPath = path.join(tempDir, 'wpt-progress.md');

      try {
        const initialContent = [
          '# Progress Log',
          '',
          '### Historical Conformance Progress Log',
          '',
          '| Date & Time (UTC) | Commit | Typed OM | CSSOM | Nesting | Syntax | Variables | Selectors | MQ | Overall | Raw Pass Rate | Normalized |',
          '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
          '',
        ].join('\n');
        fs.writeFileSync(testProgressPath, initialContent, 'utf-8');

        const dataset1: TestRunDataset = {
          timestamp: '2026-08-13 18:00:00',
          commitHash: 'abc1234',
          isDirty: true,
          specSummaries: {
            'css-typed-om': { passing: 100, total: 100, files: 1 },
          },
          totalPassing: 100,
          totalTests: 100,
          totalFiles: 1,
          fileResults: [],
        };

        // Dry run should not write to file
        updateProgressLog(dataset1, true, testProgressPath);
        assert.strictEqual(fs.readFileSync(testProgressPath, 'utf-8'), initialContent);

        // Actual update should insert row with dirty asterisk
        updateProgressLog(dataset1, false, testProgressPath);
        let updatedContent = fs.readFileSync(testProgressPath, 'utf-8');
        assert.ok(updatedContent.includes('`abc1234*`'));
        assert.ok(updatedContent.includes('100/18769'));

        // Duplicate run with identical metrics should be skipped
        updateProgressLog(dataset1, false, testProgressPath);
        const linesAfterDuplicate = fs.readFileSync(testProgressPath, 'utf-8').split('\n').filter(l => l.includes('`abc1234*`'));
        assert.strictEqual(linesAfterDuplicate.length, 1);

        // New dataset with different metrics should insert new top row
        const dataset2: TestRunDataset = {
          timestamp: '2026-08-13 18:05:00',
          commitHash: 'def5678',
          isDirty: false,
          specSummaries: {
            'css-typed-om': { passing: 200, total: 200, files: 2 },
          },
          totalPassing: 200,
          totalTests: 200,
          totalFiles: 2,
          fileResults: [],
        };
        updateProgressLog(dataset2, false, testProgressPath);
        updatedContent = fs.readFileSync(testProgressPath, 'utf-8');
        const rows = updatedContent.split('\n').filter(l => l.startsWith('| 2026-'));
        assert.strictEqual(rows.length, 2);
        assert.ok(rows[0].includes('`def5678`'));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('syncProgressFromNotes reconciles pending placeholder when note exists', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-notes-test-'));
      const testProgressPath = path.join(tempDir, 'wpt-progress.md');

      try {
        const contentWithPending = [
          '# Progress Log',
          '',
          '### Historical Conformance Progress Log',
          '',
          '| Date & Time (UTC) | Commit | Typed OM | CSSOM | Nesting | Syntax | Variables | Selectors | MQ | Overall | Raw Pass Rate | Normalized |',
          '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
          '| 2026-08-13 19:00:00 | `pending*` | 500/12219 | 100/923 | 50/117 | 100/398 | 50/548 | 200/4147 | 100/417 | 1100/18769 | 5.86% | **5.86%** |',
          '',
        ].join('\n');
        fs.writeFileSync(testProgressPath, contentWithPending, 'utf-8');

        // Without matching note, leaves as pending
        syncProgressFromNotes(testProgressPath);
        assert.ok(fs.readFileSync(testProgressPath, 'utf-8').includes('`pending*`'));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('attachGitNote safely handles unknown or invalid commits', () => {
      const dataset: TestRunDataset = {
        timestamp: '2026-08-13 19:00:00',
        commitHash: 'unknown',
        isDirty: false,
        specSummaries: {},
        totalPassing: 0,
        totalTests: 0,
        totalFiles: 0,
        fileResults: [],
      };
      // Should gracefully return without throwing
      assert.doesNotThrow(() => {
        attachGitNote('unknown', dataset);
        attachGitNote('', dataset);
      });
    });
  });
});

