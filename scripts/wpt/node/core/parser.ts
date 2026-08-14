/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import type { ParsedFileResult, ParsedSubtest, FailureCluster, ExpectationDiffItem, BaselineAuditReport } from './types.ts';

export function classifyError(raw: string): { errorType: string; cleanMessage: string } {
  let errorType = 'UnknownError';
  let cleanMessage = raw.split('\n')[0].trim();
  if (cleanMessage.includes('assert_equals') || cleanMessage.includes('AssertionError') || cleanMessage.includes('Expected values')) {
    errorType = 'assert_equals';
    if (/expected\s+([^,]+)\s+but\s+got\s+(.+)$/i.test(cleanMessage)) {
      cleanMessage = 'assert_equals: expected [value] but got [value]';
    }
  } else if (cleanMessage.includes('assert_not_equals')) {
    errorType = 'assert_not_equals';
  } else if (cleanMessage.includes('assert_true') || cleanMessage.includes('assert_false')) {
    errorType = 'assert_boolean';
  } else if (cleanMessage.includes('assert_throws_js') || cleanMessage.includes('assert_throws_dom')) {
    errorType = 'assert_throws';
  } else if (cleanMessage.includes('TypeError')) {
    errorType = 'TypeError';
    cleanMessage = cleanMessage.replace(/Cannot read propert(y|ies of (undefined|null)).*$/g, 'Cannot read property on undefined/null');
  } else if (cleanMessage.includes('SyntaxError')) {
    errorType = 'SyntaxError';
  } else if (cleanMessage.includes('InvalidCharacterError')) {
    errorType = 'InvalidCharacterError';
  } else if (cleanMessage.includes('Timeout') || cleanMessage.includes('timed out')) {
    errorType = 'TimeoutOrCrash';
  }
  return { errorType, cleanMessage };
}

export function categorizeDiff(expected: string, actual: string): string {
  if (expected.startsWith('rgb(') || expected.startsWith('rgba(') || actual.startsWith('rgb(') || actual.startsWith('rgba(')) return 'Color Normalization Mismatch';
  if (expected.endsWith('px') || actual.endsWith('px')) return 'Length Unit Mismatch';
  if (actual === "''" || actual === '') return 'Unset/Default Value Missing';
  return 'Other Value Mismatch';
}

export function countDeclaredTests(filePath?: string): number {
  if (!filePath || !fs.existsSync(filePath)) return 1;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/\b(test|async_test|promise_test)\s*\(/g);
    return matches ? Math.max(1, matches.length) : 1;
  } catch {
    return 1;
  }
}

export function parseRunnerOutput(
  stdout: string,
  stderr: string,
  meta: {
    file: string;
    spec: string;
    durationMs: number;
    peakRssMb: number;
    status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR';
    exitCode?: number | null;
    signal?: string | null;
    filePath?: string;
  }
): ParsedFileResult {
  const merged = stdout + '\n' + stderr;
  const lines = merged.split('\n');
  const passingSubtests: string[] = [];
  const failedSubtests: string[] = [];
  const subtests: ParsedSubtest[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('✔ ')) {
      const name = line.replace(/.*✔\s*/, '').trim();
      passingSubtests.push(name);
      subtests.push({ name, status: 'PASS' });
    } else if (line.includes('✖ ')) {
      const name = line.replace(/.*✖\s*/, '').trim();
      failedSubtests.push(name);
      const rawErr = (lines[i + 1] || 'Assertion failure').trim();
      const { errorType, cleanMessage } = classifyError(rawErr);
      let actual: string | undefined;
      let expected: string | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
        const trimmed = lines[j].trim();
        if (trimmed.startsWith('+ ')) actual = trimmed.substring(2).trim();
        if (trimmed.startsWith('- ')) expected = trimmed.substring(2).trim();
        if (actual !== undefined && expected !== undefined) break;
      }
      subtests.push({ name, status: 'FAIL', error: cleanMessage, errorType, rawError: rawErr, actual, expected });
    }
  }

  let loadError: string | undefined;
  let passing = passingSubtests.length;
  let total = passingSubtests.length + failedSubtests.length;
  const summaryMatch = merged.match(/Summary: (\d+)\/(\d+) passed/);
  if (summaryMatch) {
    passing = parseInt(summaryMatch[1], 10);
    total = parseInt(summaryMatch[2], 10);
  }

  if (meta.status === 'TIMEOUT' || meta.status === 'WATCHDOG_KILLED') {
    loadError = 'Runner timed out or killed by watchdog';
    if (!summaryMatch) total = Math.max(total, countDeclaredTests(meta.filePath));
  } else if (meta.status === 'ERROR' && subtests.length === 0) {
    const match = merged.match(/Failed to run file .*?: (.*)/);
    loadError = match ? match[1].trim() : 'Process crashed during test execution';
    if (!summaryMatch) total = Math.max(total, countDeclaredTests(meta.filePath));
  }

  return { file: meta.file, spec: meta.spec, passing, total, passingSubtests, failedSubtests, subtests, loadError, durationMs: meta.durationMs, peakRssMb: meta.peakRssMb, status: meta.status };
}

export function clusterFailures(fileResults: ParsedFileResult[]): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();
  for (const res of fileResults) {
    for (const sub of res.subtests) {
      if (sub.status !== 'FAIL') continue;
      let clusterKey = sub.error ?? 'Unknown error';
      if (sub.rawError?.includes('assert_equals')) {
        const lower = sub.name.toLowerCase();
        if (lower.includes('serialize') || lower.includes('serialization')) clusterKey = `Serialization Mismatch: ${clusterKey}`;
        else if (lower.includes('parse') || lower.includes('parsing')) clusterKey = `Parsing Mismatch: ${clusterKey}`;
      }
      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = { id: clusterKey, title: clusterKey, pattern: sub.error ?? '', count: 0, samples: [], affectedFiles: [] };
        clusters.set(clusterKey, cluster);
      }
      cluster.count++;
      if (!cluster.affectedFiles.includes(res.file)) cluster.affectedFiles.push(res.file);
      if (cluster.samples.length < 3) {
        cluster.samples.push({ file: res.file, testName: sub.name, error: (sub.rawError ?? sub.error ?? '').split('\n')[0].substring(0, 120) });
      }
    }
    if (res.loadError && res.subtests.length === 0) {
      const clusterKey = `Harness Error: ${res.loadError}`;
      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = { id: clusterKey, title: clusterKey, pattern: res.loadError, count: 0, samples: [], affectedFiles: [] };
        clusters.set(clusterKey, cluster);
      }
      cluster.count++;
      if (!cluster.affectedFiles.includes(res.file)) cluster.affectedFiles.push(res.file);
      if (cluster.samples.length < 3) cluster.samples.push({ file: res.file, testName: '[FILE LOAD ERROR]', error: res.loadError });
    }
  }
  return Array.from(clusters.values()).sort((a, b) => b.count - a.count);
}

export function extractExpectationDiffs(fileResults: ParsedFileResult[]): ExpectationDiffItem[] {
  const items: ExpectationDiffItem[] = [];
  for (const res of fileResults) {
    for (const sub of res.subtests) {
      if (sub.status === 'FAIL' && sub.expected !== undefined && sub.actual !== undefined) {
        items.push({ file: res.file, testName: sub.name, expected: sub.expected, actual: sub.actual, category: categorizeDiff(sub.expected, sub.actual) });
      }
    }
  }
  return items;
}

export function auditBaseline(baseline: Record<string, string[]>, currentPassingMap: Record<string, string[]>): BaselineAuditReport {
  const regressions: { file: string; test: string }[] = [];
  const newPasses: { file: string; test: string }[] = [];
  let baselineCount = 0;
  for (const [file, expectedTests] of Object.entries(baseline)) {
    baselineCount += expectedTests.length;
    const currentTests = new Set(currentPassingMap[file] || []);
    for (const t of expectedTests) {
      if (!currentTests.has(t)) regressions.push({ file, test: t });
    }
  }
  let currentCount = 0;
  for (const [file, currentTests] of Object.entries(currentPassingMap)) {
    currentCount += currentTests.length;
    const expectedTests = new Set(baseline[file] || []);
    for (const t of currentTests) {
      if (!expectedTests.has(t)) newPasses.push({ file, test: t });
    }
  }
  const isMonotonic = regressions.length === 0 && currentCount >= baselineCount;
  return { baselineCount, currentCount, newPasses, regressions, isMonotonic };
}
