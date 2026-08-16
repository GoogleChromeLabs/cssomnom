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
  formatBaselineSummaryTable,
  updateBaselineSummaryTable,
  loadReferenceBaselineStats,
} from '../scripts/wpt/node/core/progress.ts';

import * as zlib from 'node:zlib';

import {
  compareParity,
  formatParityMarkdown,
  formatParityConsole,
  normalizeWptPath,
  resolveSpecFromPath,
  type WptReportJson,
} from '../scripts/wpt/browser/parity.ts';

import {
  buildWptFyiApiUrl,
  decompressBuffer,
  normalizeWptFyiData,
  fetchWptFyiRun,
} from '../scripts/wpt/browser/fetch-wptfyi.ts';

import { parityCommand } from '../scripts/wpt/node/commands/parity.ts';
import { fetchUpstreamCommand } from '../scripts/wpt/node/commands/fetch-upstream.ts';

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
      if (allFiles.length > 0) {
        assert.ok(allFiles.length > 500, `Expected >500 files, got ${allFiles.length}`);

        const nestingFiles = crawlSpecFiles(config, { filterBySpec: 'css-nesting' });
        assert.ok(nestingFiles.length > 0);
        assert.ok(nestingFiles.every(f => f.spec === 'css-nesting'));

        const filteredByPath = crawlSpecFiles(config, { filterByPath: 'css-nesting' });
        assert.ok(filteredByPath.length > 0);
        assert.ok(filteredByPath.every(f => f.relativePath.includes('css-nesting')));
      } else {
        // Submodules not cloned (e.g., CI sparse checkout)
        assert.ok(Array.isArray(allFiles));
      }
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

    test('formats baseline summary table in Option A 4-column layout with reference Chrome', () => {
      const dataset: TestRunDataset = {
        timestamp: '2026-08-16 12:00:00',
        commitHash: '1234567',
        isDirty: false,
        specSummaries: {
          'css-typed-om': { passing: 11509, total: 12219, files: 348 },
          'cssom': { passing: 643, total: 923, files: 224 },
          'css-nesting': { passing: 117, total: 117, files: 53 },
          'css-syntax': { passing: 412, total: 398, files: 45 },
          'css-variables': { passing: 392, total: 548, files: 267 },
          'selectors': { passing: 3521, total: 4147, files: 648 },
          'mediaqueries': { passing: 417, total: 417, files: 102 },
        },
        totalPassing: 17011,
        totalTests: 18769,
        totalFiles: 1687,
        fileResults: [],
      };

      const table = formatBaselineSummaryTable(dataset);
      assert.ok(table.includes('### Feasibility & Cross-Engine Baseline Comparison'));
      assert.ok(table.includes('[`tests/fixtures/wpt-browser-only-manifest.json`](./tests/fixtures/wpt-browser-only-manifest.json)'));
      assert.ok(table.includes('| Spec Domain | **cssomnom** | Chrome 153 (`wpt.fyi`) | Parity vs Chrome |'));
      assert.ok(table.includes('| **`Typed OM`** | 11,509 / 12,219 (**94.2%**) |'));
      assert.ok(table.includes('| **`Nesting`** | 117 / 117 (**100.0%**) |'));
      assert.ok(table.includes('| **OVERALL** | **17,011 / 18,769 (90.6%)** |'));
    });

    test('updates baseline summary table in wpt-progress.md preserving historical log', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-summary-test-'));
      const testProgressPath = path.join(tempDir, 'wpt-progress.md');

      try {
        const initialContent = [
          '# WPT Progress',
          '',
          '### Feasibility & Cross-Engine Baseline Comparison',
          '',
          '| Old Table |',
          '| :--- |',
          '| old data |',
          '',
          '---',
          '',
          '### Historical Conformance Progress Log',
          '',
          '| Date & Time (UTC) | Commit | Typed OM | CSSOM | Nesting | Syntax | Variables | Selectors | MQ | Overall | Raw Pass Rate | Normalized |',
          '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
          '| 2026-08-16 00:00:00 | `abc1234` | 11509/12219 | 643/923 | 117/117 | 412/398 | 392/548 | 3521/4147 | 417/417 | 17011/18769 | 90.04% | **90.63%** |',
        ].join('\n');

        fs.writeFileSync(testProgressPath, initialContent, 'utf-8');

        const dataset: TestRunDataset = {
          timestamp: '2026-08-16 12:00:00',
          commitHash: 'def5678',
          isDirty: false,
          specSummaries: {
            'css-typed-om': { passing: 11509, total: 12219, files: 348 },
            'cssom': { passing: 643, total: 923, files: 224 },
            'css-nesting': { passing: 117, total: 117, files: 53 },
            'css-syntax': { passing: 412, total: 398, files: 45 },
            'css-variables': { passing: 392, total: 548, files: 267 },
            'selectors': { passing: 3521, total: 4147, files: 648 },
            'mediaqueries': { passing: 417, total: 417, files: 102 },
          },
          totalPassing: 17011,
          totalTests: 18769,
          totalFiles: 1687,
          fileResults: [],
        };

        updateBaselineSummaryTable(dataset, testProgressPath);
        const updated = fs.readFileSync(testProgressPath, 'utf-8');
        assert.ok(updated.includes('| Spec Domain | **cssomnom** | Chrome 153 (`wpt.fyi`) | Parity vs Chrome |'));
        assert.ok(updated.includes('### Historical Conformance Progress Log'));
        assert.ok(updated.includes('`abc1234`'));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('loadReferenceBaselineStats falls back to default constants when file is missing', () => {
      const stats = loadReferenceBaselineStats('/non/existent/path.json');
      assert.strictEqual(stats.milestone, '153');
      assert.strictEqual(stats.browser, 'Chrome 153.0.8008.0');
      assert.ok(stats.specs['css-typed-om'].total > 0);
    });
  });

  describe('browser/parity.ts & commands/parity.ts', () => {
    test('normalizes paths and resolves spec domains accurately', () => {
      assert.strictEqual(
        normalizeWptPath('submodules/web-platform-tests/css/css-typed-om/test.html'),
        'css/css-typed-om/test.html'
      );
      assert.strictEqual(
        normalizeWptPath('/css/selectors/focus.html'),
        'css/selectors/focus.html'
      );
      assert.strictEqual(
        normalizeWptPath('\\css\\cssom\\style.html'),
        'css/cssom/style.html'
      );

      assert.strictEqual(resolveSpecFromPath('css/css-typed-om/test.html'), 'css-typed-om');
      assert.strictEqual(resolveSpecFromPath('css/selectors/test.html'), 'selectors');
      assert.strictEqual(resolveSpecFromPath('css/cssom/test.html'), 'cssom');
      assert.strictEqual(resolveSpecFromPath('css/css-variables/test.html'), 'css-variables');
      assert.strictEqual(resolveSpecFromPath('css/mediaqueries/test.html'), 'mediaqueries');
      assert.strictEqual(resolveSpecFromPath('css/css-syntax/test.html'), 'css-syntax');
      assert.strictEqual(resolveSpecFromPath('css/css-nesting/test.html'), 'css-nesting');
      assert.strictEqual(resolveSpecFromPath('custom/unknown/test.html'), 'custom');
    });

    test('categorizes all 4 truth matrix states correctly in compareParity', () => {
      const mockNodeDataset: TestRunDataset = {
        timestamp: '2026-08-14 00:00:00',
        commitHash: 'abc1234',
        isDirty: false,
        specSummaries: {
          'css-typed-om': { passing: 2, total: 4, files: 1 },
          selectors: { passing: 1, total: 1, files: 1 },
        },
        totalPassing: 3,
        totalTests: 5,
        totalFiles: 2,
        fileResults: [
          {
            file: 'submodules/web-platform-tests/css/css-typed-om/matrix-test.html',
            spec: 'css-typed-om',
            passing: 2,
            total: 4,
            passingSubtests: ['subtest-conformance', 'subtest-over-mock'],
            failedSubtests: ['subtest-spec-gap', 'subtest-feasibility'],
            subtests: [
              { name: 'subtest-conformance', status: 'PASS' },
              { name: 'subtest-spec-gap', status: 'FAIL', error: 'AssertionError: expected foo got bar' },
              { name: 'subtest-feasibility', status: 'FAIL', error: 'Error: getClientRects not supported' },
              { name: 'subtest-over-mock', status: 'PASS' },
            ],
            durationMs: 100,
            peakRssMb: 40,
            status: 'OK',
          },
          {
            file: 'submodules/web-platform-tests/css/selectors/root-test.html',
            spec: 'selectors',
            passing: 1,
            total: 1,
            passingSubtests: ['(root)'],
            failedSubtests: [],
            subtests: [],
            durationMs: 50,
            peakRssMb: 30,
            status: 'OK',
          },
        ],
      };

      const mockBrowserReport: WptReportJson = {
        browser: 'Headless Chrome 130',
        results: [
          {
            test: '/css/css-typed-om/matrix-test.html',
            status: 'OK',
            subtests: [
              { name: 'subtest-conformance', status: 'PASS' },
              { name: 'subtest-spec-gap', status: 'PASS' },
              { name: 'subtest-feasibility', status: 'FAIL', message: 'assert_equals: expected 10 got 0' },
              { name: 'subtest-over-mock', status: 'FAIL', message: 'TypeError: failed in real blink' },
            ],
          },
          {
            test: '/css/selectors/root-test.html',
            status: 'OK',
            subtests: [],
          },
        ],
      };

      const report = compareParity({
        nodeDataset: mockNodeDataset,
        browserReportData: mockBrowserReport,
        includeAllResults: true,
      });

      assert.strictEqual(report.browserName, 'Headless Chrome 130');
      assert.strictEqual(report.nodeCommit, 'abc1234');
      assert.strictEqual(report.totals.totalCompared, 5);

      // Verified Conformance (Node: PASS, Browser: PASS) -> 2 (1 subtest + 1 root test)
      assert.strictEqual(report.totals.verifiedConformance, 2);
      // Verified Spec Gap (Node: FAIL, Browser: PASS) -> 1
      assert.strictEqual(report.totals.verifiedSpecGaps, 1);
      // Feasibility Boundary (Node: FAIL, Browser: FAIL) -> 1
      assert.strictEqual(report.totals.feasibilityBoundaries, 1);
      // Over-Mocking False Positive (Node: PASS, Browser: FAIL) -> 1
      assert.strictEqual(report.totals.overMocking, 1);

      assert.strictEqual(report.discrepancies.overMocking.length, 1);
      assert.strictEqual(report.discrepancies.overMocking[0].subtest, 'subtest-over-mock');
      assert.strictEqual(report.discrepancies.overMocking[0].category, 'OVER_MOCKING_FALSE_POSITIVE');

      assert.strictEqual(report.discrepancies.specGaps.length, 1);
      assert.strictEqual(report.discrepancies.specGaps[0].subtest, 'subtest-spec-gap');
      assert.strictEqual(report.discrepancies.specGaps[0].category, 'VERIFIED_SPEC_GAP');

      assert.strictEqual(report.discrepancies.feasibilityBoundaries.length, 1);
      assert.strictEqual(report.discrepancies.feasibilityBoundaries[0].subtest, 'subtest-feasibility');
      assert.strictEqual(report.discrepancies.feasibilityBoundaries[0].category, 'FEASIBILITY_BOUNDARY');

      // Spec summary verification
      assert.strictEqual(report.summaryBySpec['css-typed-om'].totalCompared, 4);
      assert.strictEqual(report.summaryBySpec['css-typed-om'].verifiedConformance, 1);
      assert.strictEqual(report.summaryBySpec['selectors'].totalCompared, 1);
      assert.strictEqual(report.summaryBySpec['selectors'].verifiedConformance, 1);
    });

    test('supports --filter-by-spec in compareParity', () => {
      const mockNodeDataset: TestRunDataset = {
        timestamp: '2026-08-14 00:00:00',
        commitHash: 'def5678',
        isDirty: false,
        specSummaries: {},
        totalPassing: 2,
        totalTests: 2,
        totalFiles: 2,
        fileResults: [
          {
            file: 'submodules/web-platform-tests/css/css-typed-om/test1.html',
            spec: 'css-typed-om',
            passing: 1,
            total: 1,
            passingSubtests: ['sub1'],
            failedSubtests: [],
            subtests: [{ name: 'sub1', status: 'PASS' }],
            durationMs: 10,
            peakRssMb: 10,
            status: 'OK',
          },
          {
            file: 'submodules/web-platform-tests/css/selectors/test2.html',
            spec: 'selectors',
            passing: 1,
            total: 1,
            passingSubtests: ['sub2'],
            failedSubtests: [],
            subtests: [{ name: 'sub2', status: 'PASS' }],
            durationMs: 10,
            peakRssMb: 10,
            status: 'OK',
          },
        ],
      };

      const mockBrowserReport: WptReportJson = {
        results: [
          { test: '/css/css-typed-om/test1.html', status: 'OK', subtests: [{ name: 'sub1', status: 'PASS' }] },
          { test: '/css/selectors/test2.html', status: 'OK', subtests: [{ name: 'sub2', status: 'PASS' }] },
        ],
      };

      const filteredReport = compareParity({
        nodeDataset: mockNodeDataset,
        browserReportData: mockBrowserReport,
        filterBySpec: 'css-typed-om',
      });

      assert.strictEqual(filteredReport.totals.totalCompared, 1);
      assert.strictEqual(filteredReport.summaryBySpec['css-typed-om'].totalCompared, 1);
      assert.strictEqual(filteredReport.summaryBySpec['selectors'].totalCompared, 0);

      assert.throws(() => {
        compareParity({
          nodeDataset: mockNodeDataset,
          browserReportData: mockBrowserReport,
          filterBySpec: 'invalid-suite',
        });
      }, /Invalid spec filter/);
    });

    test('generates markdown table and console formatting', () => {
      const mockNodeDataset: TestRunDataset = {
        timestamp: '2026-08-14 00:00:00',
        commitHash: 'test123',
        isDirty: false,
        specSummaries: {},
        totalPassing: 1,
        totalTests: 1,
        totalFiles: 1,
        fileResults: [
          {
            file: 'submodules/web-platform-tests/css/css-typed-om/sample.html',
            spec: 'css-typed-om',
            passing: 1,
            total: 1,
            passingSubtests: ['sample'],
            failedSubtests: [],
            subtests: [{ name: 'sample', status: 'PASS' }],
            durationMs: 10,
            peakRssMb: 10,
            status: 'OK',
          },
        ],
      };

      const mockBrowserReport: WptReportJson = {
        browser: 'Headless Chrome',
        results: [
          { test: '/css/css-typed-om/sample.html', status: 'OK', subtests: [{ name: 'sample', status: 'PASS' }] },
        ],
      };

      const report = compareParity({
        nodeDataset: mockNodeDataset,
        browserReportData: mockBrowserReport,
      });

      const md = formatParityMarkdown(report, 5);
      assert.ok(md.includes('# Cross-Browser Differential Parity Matrix'));
      assert.ok(md.includes('| **Typed OM** | 1 | 0 | 0 | 0 | 1 |'));
      assert.ok(md.includes('### ⚠️ Over-Mocking False Positives'));
      assert.ok(md.includes('None detected'));

      const consoleOutput = formatParityConsole(report, 5);
      assert.ok(consoleOutput.includes('Cross-Browser Differential Parity Matrix'));
      assert.ok(consoleOutput.includes('TOTAL'));
    });

    test('executes parityCommand with json and mock datasets', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-parity-cmd-test-'));
      const mockNodePath = path.join(tempDir, 'last-run.json');
      const mockBrowserPath = path.join(tempDir, 'report-chrome.json');

      try {
        const mockNodeDataset: TestRunDataset = {
          timestamp: '2026-08-14 00:00:00',
          commitHash: 'cmd1234',
          isDirty: false,
          specSummaries: {},
          totalPassing: 1,
          totalTests: 1,
          totalFiles: 1,
          fileResults: [
            {
              file: 'submodules/web-platform-tests/css/css-typed-om/test.html',
              spec: 'css-typed-om',
              passing: 1,
              total: 1,
              passingSubtests: ['subtest-1'],
              failedSubtests: [],
              subtests: [{ name: 'subtest-1', status: 'PASS' }],
              durationMs: 10,
              peakRssMb: 10,
              status: 'OK',
            },
          ],
        };
        fs.writeFileSync(mockNodePath, JSON.stringify(mockNodeDataset), 'utf-8');

        const mockBrowserReport: WptReportJson = {
          browser: 'Headless Chrome',
          results: [
            { test: '/css/css-typed-om/test.html', status: 'OK', subtests: [{ name: 'subtest-1', status: 'PASS' }] },
          ],
        };
        fs.writeFileSync(mockBrowserPath, JSON.stringify(mockBrowserReport), 'utf-8');

        const report = await parityCommand({
          nodeCache: mockNodePath,
          browserReport: mockBrowserPath,
          json: true,
        });

        assert.strictEqual(report.nodeCommit, 'cmd1234');
        assert.strictEqual(report.totals.totalCompared, 1);
        assert.strictEqual(report.totals.verifiedConformance, 1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('throws when datasets are missing', () => {
      assert.throws(() => {
        compareParity({
          nodeCachePath: '/non/existent/path/last-run.json',
          browserReportPath: '/non/existent/path/report.json',
        });
      }, /not found/);
    });

    test('categorizes all 5 truth matrix states correctly in 3-Way compareParity', () => {
      const mockNodeDataset: TestRunDataset = {
        timestamp: '2026-08-14 12:00:00',
        commitHash: '3way123',
        isDirty: false,
        specSummaries: {
          'css-typed-om': { passing: 3, total: 5, files: 1 },
        },
        totalPassing: 3,
        totalTests: 5,
        totalFiles: 1,
        fileResults: [
          {
            file: 'submodules/web-platform-tests/css/css-typed-om/3way-matrix.html',
            spec: 'css-typed-om',
            passing: 3,
            total: 5,
            passingSubtests: ['test-conformance', 'test-polyfill', 'test-over-mock'],
            failedSubtests: ['test-spec-gap', 'test-feasibility'],
            subtests: [
              { name: 'test-conformance', status: 'PASS' },
              { name: 'test-polyfill', status: 'PASS' },
              { name: 'test-spec-gap', status: 'FAIL', error: 'Missing feature in cssomnom' },
              { name: 'test-feasibility', status: 'FAIL', error: 'Browser layout dependency' },
              { name: 'test-over-mock', status: 'PASS' },
            ],
            durationMs: 80,
            peakRssMb: 35,
            status: 'OK',
          },
        ],
      };

      const mockInjectedReport: WptReportJson = {
        browser: 'Injected Chrome 130',
        results: [
          {
            test: '/css/css-typed-om/3way-matrix.html',
            status: 'OK',
            subtests: [
              { name: 'test-conformance', status: 'PASS' },
              { name: 'test-polyfill', status: 'PASS' },
              { name: 'test-spec-gap', status: 'FAIL', message: 'Fails in injected test' },
              { name: 'test-feasibility', status: 'FAIL', message: 'Fails in injected test' },
              { name: 'test-over-mock', status: 'FAIL', message: 'Strict browser throws' },
            ],
          },
        ],
      };

      const mockUpstreamReport: WptReportJson = {
        browser: 'Upstream Chrome 130',
        results: [
          {
            test: '/css/css-typed-om/3way-matrix.html',
            status: 'OK',
            subtests: [
              { name: 'test-conformance', status: 'PASS' },
              { name: 'test-polyfill', status: 'FAIL', message: 'Native browser bug' },
              { name: 'test-spec-gap', status: 'PASS' },
              { name: 'test-feasibility', status: 'FAIL', message: 'Native browser also fails' },
              { name: 'test-over-mock', status: 'FAIL', message: 'Native browser fails' },
            ],
          },
        ],
      };

      const report = compareParity({
        nodeDataset: mockNodeDataset,
        browserReportData: mockInjectedReport,
        upstreamReportData: mockUpstreamReport,
        includeAllResults: true,
      });

      assert.strictEqual(report.isThreeWay, true);
      assert.strictEqual(report.browserName, 'Injected Chrome 130');
      assert.strictEqual(report.upstreamName, 'Upstream Chrome 130');
      assert.strictEqual(report.totals.totalCompared, 5);

      // 1. VERIFIED_CONFORMANCE (Node: PASS, Injected: PASS, Upstream: PASS)
      assert.strictEqual(report.totals.verifiedConformance, 1);
      // 2. POLYFILL_IMPROVEMENT (Node: PASS, Injected: PASS, Upstream: FAIL)
      assert.strictEqual(report.totals.polyfillImprovements, 1);
      // 3. VERIFIED_SPEC_GAP (Node: FAIL, Injected: FAIL, Upstream: PASS)
      assert.strictEqual(report.totals.verifiedSpecGaps, 1);
      // 4. FEASIBILITY_BOUNDARY (Node: FAIL, Injected: FAIL, Upstream: FAIL)
      assert.strictEqual(report.totals.feasibilityBoundaries, 1);
      // 5. OVER_MOCKING_FALSE_POSITIVE (Node: PASS, Injected: FAIL, Upstream: FAIL)
      assert.strictEqual(report.totals.overMocking, 1);

      assert.strictEqual(report.discrepancies.polyfillImprovements.length, 1);
      assert.strictEqual(report.discrepancies.polyfillImprovements[0].subtest, 'test-polyfill');
      assert.strictEqual(report.discrepancies.polyfillImprovements[0].category, 'POLYFILL_IMPROVEMENT');

      // Spec summary verification
      const specSummary = report.summaryBySpec['css-typed-om'];
      assert.strictEqual(specSummary.totalCompared, 5);
      assert.strictEqual(specSummary.verifiedConformance, 1);
      assert.strictEqual(specSummary.polyfillImprovements, 1);
      assert.strictEqual(specSummary.verifiedSpecGaps, 1);
      assert.strictEqual(specSummary.feasibilityBoundaries, 1);
      assert.strictEqual(specSummary.overMocking, 1);

      // 3-Way Markdown table formatting verification
      const md = formatParityMarkdown(report, 5);
      assert.ok(md.includes('# 3-Way Cross-Browser Differential Parity Matrix'));
      assert.ok(md.includes('| Spec Domain | Verified Conformance | Polyfill Improvements | Verified Spec Gaps | Feasibility Boundaries | Over-Mocking False Positives | Total Compared |'));
      assert.ok(md.includes('| **Typed OM** | 1 | 1 | 1 | 1 | 1 | 5 |'));
      assert.ok(md.includes('### 🚀 Polyfill Improvements (Node: PASS, Injected: PASS, Upstream: FAIL)'));
      assert.ok(md.includes('`css/css-typed-om/3way-matrix.html` > "test-polyfill"'));

      // 3-Way Console output formatting verification
      const consoleOutput = formatParityConsole(report, 5);
      assert.ok(consoleOutput.includes('3-Way Cross-Browser Differential Parity Matrix'));
      assert.ok(consoleOutput.includes('Polyfill Imp'));
      assert.ok(consoleOutput.includes('Polyfill Improvements (1 assertions)'));
    });

    test('executes parityCommand with 3-way upstream report', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-3way-cmd-test-'));
      const mockNodePath = path.join(tempDir, 'last-run.json');
      const mockBrowserPath = path.join(tempDir, 'report-chrome.json');
      const mockUpstreamPath = path.join(tempDir, 'report-chrome-upstream.json');

      try {
        const mockNodeDataset: TestRunDataset = {
          timestamp: '2026-08-14 12:00:00',
          commitHash: 'cmd3way',
          isDirty: false,
          specSummaries: {},
          totalPassing: 1,
          totalTests: 1,
          totalFiles: 1,
          fileResults: [
            {
              file: 'submodules/web-platform-tests/css/css-typed-om/test.html',
              spec: 'css-typed-om',
              passing: 1,
              total: 1,
              passingSubtests: ['subtest-1'],
              failedSubtests: [],
              subtests: [{ name: 'subtest-1', status: 'PASS' }],
              durationMs: 10,
              peakRssMb: 10,
              status: 'OK',
            },
          ],
        };
        fs.writeFileSync(mockNodePath, JSON.stringify(mockNodeDataset), 'utf-8');

        const mockBrowserReport: WptReportJson = {
          browser: 'Injected Chrome',
          results: [
            { test: '/css/css-typed-om/test.html', status: 'OK', subtests: [{ name: 'subtest-1', status: 'PASS' }] },
          ],
        };
        fs.writeFileSync(mockBrowserPath, JSON.stringify(mockBrowserReport), 'utf-8');

        const mockUpstreamReport: WptReportJson = {
          browser: 'Upstream Chrome',
          results: [
            { test: '/css/css-typed-om/test.html', status: 'OK', subtests: [{ name: 'subtest-1', status: 'FAIL' }] },
          ],
        };
        fs.writeFileSync(mockUpstreamPath, JSON.stringify(mockUpstreamReport), 'utf-8');

        const report = await parityCommand({
          nodeCache: mockNodePath,
          browserReport: mockBrowserPath,
          upstreamReport: mockUpstreamPath,
          json: true,
        });

        assert.strictEqual(report.isThreeWay, true);
        assert.strictEqual(report.totals.totalCompared, 1);
        assert.strictEqual(report.totals.polyfillImprovements, 1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('browser/fetch-wptfyi.ts & commands/fetch-upstream.ts', () => {
    test('buildWptFyiApiUrl formats query parameters and endpoints accurately', () => {
      assert.strictEqual(
        buildWptFyiApiUrl(),
        'https://wpt.fyi/api/runs?product=chrome&label=master&max-count=1'
      );

      assert.strictEqual(
        buildWptFyiApiUrl({ product: 'firefox', label: 'experimental', maxCount: 5 }),
        'https://wpt.fyi/api/runs?product=firefox&label=experimental&max-count=5'
      );

      assert.strictEqual(
        buildWptFyiApiUrl({ revision: 'a1b2c3d4e5f6' }),
        'https://wpt.fyi/api/runs?product=chrome&sha=a1b2c3d4e5f6&max-count=1'
      );

      assert.strictEqual(
        buildWptFyiApiUrl({ runId: 123456789 }),
        'https://wpt.fyi/api/runs/123456789'
      );
    });

    test('decompressBuffer handles plain text and gzipped payloads', () => {
      const text = JSON.stringify({ hello: 'wpt.fyi' });
      const plainBuffer = Buffer.from(text, 'utf-8');
      assert.strictEqual(decompressBuffer(plainBuffer), text);

      const gzippedBuffer = zlib.gzipSync(plainBuffer);
      assert.strictEqual(decompressBuffer(gzippedBuffer), text);
    });

    test('normalizeWptFyiData converts various data representations into uniform WptReportJson', () => {
      // 1. Array of results
      const arrayData = [
        { test: '/css/cssom/test1.html', status: 'OK', subtests: [{ name: 'sub1', status: 'PASS' }] },
      ];
      const norm1 = normalizeWptFyiData(arrayData, 'Chrome Master');
      assert.strictEqual(norm1.browser, 'Chrome Master');
      assert.strictEqual(norm1.results.length, 1);
      assert.strictEqual(norm1.results[0].test, '/css/cssom/test1.html');

      // 2. Standard WptReportJson
      const reportData = {
        browser: 'Custom Chrome',
        time: 123456,
        results: [
          { test: '/css/selectors/test2.html', status: 'OK' },
        ],
      };
      const norm2 = normalizeWptFyiData(reportData, 'Default Browser');
      assert.strictEqual(norm2.browser, 'Custom Chrome');
      assert.strictEqual(norm2.time, 123456);
      assert.strictEqual(norm2.results.length, 1);

      // 3. Key-Value summary dictionary
      const dictData = {
        '/css/css-syntax/test3.html': [0, [1, 0]],
        '/css/css-variables/test4.html': { status: 'FAIL' },
      };
      const norm3 = normalizeWptFyiData(dictData, 'Chrome Summary');
      assert.strictEqual(norm3.browser, 'Chrome Summary');
      assert.strictEqual(norm3.results.length, 2);
      assert.strictEqual(norm3.results[0].test, '/css/css-syntax/test3.html');
      assert.strictEqual(norm3.results[0].status, 'OK');
      assert.strictEqual(norm3.results[1].test, '/css/css-variables/test4.html');
      assert.strictEqual(norm3.results[1].status, 'FAIL');
    });

    test('fetchWptFyiRun ingests, filters by spec, and caches results accurately with mock fetch', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpt-fyi-fetch-test-'));
      const testCachePath = path.join(tempDir, 'report-chrome-upstream.json');

      try {
        const mockRunItem = {
          id: 778899,
          browser_name: 'chrome',
          browser_version: '130.0.6723.44',
          os_name: 'linux',
          os_version: 'ubuntu',
          revision: 'feedbeef12',
          full_revision_hash: 'feedbeef1234567890',
          raw_results_url: 'https://storage.googleapis.com/mock-wptd/report.json.gz',
        };

        const mockReportData = {
          browser: 'Chrome 130.0.6723.44',
          results: [
            {
              test: '/css/css-typed-om/test-typed.html',
              status: 'OK',
              subtests: [
                { name: 'sub-1', status: 'PASS' },
                { name: 'sub-2', status: 'FAIL' },
              ],
            },
            {
              test: '/css/selectors/test-sel.html',
              status: 'OK',
              subtests: [{ name: 'sub-3', status: 'PASS' }],
            },
          ],
        };

        const gzippedPayload = zlib.gzipSync(Buffer.from(JSON.stringify(mockReportData), 'utf-8'));

        const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('https://wpt.fyi/api/runs')) {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => [mockRunItem],
            } as Response;
          }
          if (urlStr === 'https://storage.googleapis.com/mock-wptd/report.json.gz') {
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'content-encoding': 'gzip' }),
              arrayBuffer: async () => gzippedPayload.buffer.slice(
                gzippedPayload.byteOffset,
                gzippedPayload.byteOffset + gzippedPayload.byteLength
              ),
            } as Response;
          }
          return { ok: false, status: 404, statusText: 'Not Found' } as Response;
        };

        // 1. Dry Run test without writing to disk
        const dryResult = await fetchWptFyiRun({
          customFetch: mockFetch,
          cachePath: testCachePath,
          dryRun: true,
          quiet: true,
        });

        assert.strictEqual(dryResult.runId, 778899);
        assert.strictEqual(dryResult.revision, 'feedbeef12');
        assert.strictEqual(dryResult.totalTests, 2);
        assert.strictEqual(dryResult.totalSubtests, 3);
        assert.strictEqual(dryResult.cachedPath, undefined);
        assert.strictEqual(fs.existsSync(testCachePath), false);

        // 2. Real Run with Spec filter and disk caching
        const filteredResult = await fetchWptFyiRun({
          customFetch: mockFetch,
          cachePath: testCachePath,
          spec: 'css-typed-om',
          quiet: true,
        });

        assert.strictEqual(filteredResult.runId, 778899);
        assert.strictEqual(filteredResult.totalTests, 1);
        assert.strictEqual(filteredResult.totalSubtests, 2);
        assert.strictEqual(filteredResult.cachedPath, testCachePath);
        assert.strictEqual(fs.existsSync(testCachePath), true);

        const cachedContent = JSON.parse(fs.readFileSync(testCachePath, 'utf-8')) as WptReportJson;
        assert.strictEqual(cachedContent.results.length, 1);
        assert.strictEqual(cachedContent.results[0].test, '/css/css-typed-om/test-typed.html');

        // 3. fetchUpstreamCommand wrapper execution
        const cmdResult = await fetchUpstreamCommand({
          customFetch: mockFetch,
          spec: 'css-typed-om',
          cachePath: testCachePath,
          dryRun: true,
          quiet: true,
        });
        assert.ok(cmdResult);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('fetchWptFyiRun handles errors and invalid filters cleanly', async () => {
      // Invalid spec name
      await assert.rejects(async () => {
        await fetchWptFyiRun({ spec: 'invalid-spec-domain', quiet: true });
      }, /Invalid spec filter/);

      // 404 API error
      const mock404Fetch: typeof fetch = async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await assert.rejects(async () => {
        await fetchWptFyiRun({ customFetch: mock404Fetch, quiet: true });
      }, /Failed to query wpt.fyi API \(404 Not Found\)/);

      // Empty runs list
      const mockEmptyFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [],
      } as Response);

      await assert.rejects(async () => {
        await fetchWptFyiRun({ customFetch: mockEmptyFetch, quiet: true });
      }, /No WPT runs found on wpt.fyi/);
    });
  });
});


