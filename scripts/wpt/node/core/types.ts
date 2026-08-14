/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

export type SpecName =
  | 'css-typed-om'
  | 'selectors'
  | 'cssom'
  | 'css-variables'
  | 'mediaqueries'
  | 'css-syntax'
  | 'css-nesting';

export interface SpecConfig {
  path: string;
  exclude: string[];
}

export interface WptConfig {
  specs: Record<string, SpecConfig>;
}

export interface CrawledTestFile {
  absolutePath: string;
  relativePath: string;
  spec: string;
}

export interface ParsedSubtest {
  name: string;
  status: 'PASS' | 'FAIL';
  error?: string;
  expected?: string;
  actual?: string;
  errorType?: string;
  rawError?: string;
}

export interface ParsedFileResult {
  file: string;
  spec: string;
  passing: number;
  total: number;
  passingSubtests: string[];
  failedSubtests: string[];
  subtests: ParsedSubtest[];
  loadError?: string;
  durationMs: number;
  peakRssMb: number;
  status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR';
}

export interface SpecSummary {
  passing: number;
  total: number;
  files: number;
}

export interface TestRunDataset {
  timestamp: string;
  commitHash: string;
  isDirty: boolean;
  specSummaries: Record<string, SpecSummary>;
  totalPassing: number;
  totalTests: number;
  totalFiles: number;
  fileResults: ParsedFileResult[];
}

export interface FailureCluster {
  id: string;
  title: string;
  pattern: string;
  count: number;
  samples: { file: string; testName: string; error: string }[];
  affectedFiles: string[];
}

export interface ExpectationDiffItem {
  file: string;
  testName: string;
  expected: string;
  actual: string;
  category: string;
}

export interface BaselineAuditReport {
  baselineCount: number;
  currentCount: number;
  newPasses: { file: string; test: string }[];
  regressions: { file: string; test: string }[];
  isMonotonic: boolean;
}
