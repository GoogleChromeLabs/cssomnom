/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WptConfig, SpecName } from './types.ts';

export const VALID_SPECS = [
  'css-typed-om',
  'selectors',
  'cssom',
  'css-variables',
  'mediaqueries',
  'css-syntax',
  'css-nesting',
] as const satisfies readonly SpecName[];

export const SPEC_DISPLAY_NAMES: Record<string, string> = {
  'css-typed-om': 'Typed OM',
  'cssom': 'CSSOM',
  'css-nesting': 'Nesting',
  'css-syntax': 'Syntax',
  'css-variables': 'Variables',
  'selectors': 'Selectors',
  'mediaqueries': 'Media Queries',
};

export const SPEC_ORDER: readonly SpecName[] = [
  'css-typed-om',
  'cssom',
  'css-nesting',
  'css-syntax',
  'css-variables',
  'selectors',
  'mediaqueries',
];

export const CANONICAL_FEASIBLE_TARGETS: Record<string, number> = {
  'css-typed-om': 12219,
  'cssom': 2161,
  'css-syntax': 414,
  'css-nesting': 117,
  'css-variables': 561,
  'selectors': 5691,
  'mediaqueries': 417,
};

export const CANONICAL_FEASIBLE_TOTAL = 21580;

export const DEFAULT_REFERENCE_STATS: Record<string, { pass: number; total: number }> = {
  'css-typed-om': { pass: 10690, total: 11230 },
  'cssom': { pass: 883, total: 922 },
  'css-syntax': { pass: 392, total: 398 },
  'css-nesting': { pass: 93, total: 94 },
  'css-variables': { pass: 465, total: 534 },
  'selectors': { pass: 3865, total: 4156 },
  'mediaqueries': { pass: 392, total: 416 },
};

export const DEFAULT_REFERENCE_BROWSER = 'Chrome 153.0.8008.0';
export const DEFAULT_REFERENCE_MILESTONE = '153';

export function getConfigPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'tests/wpt-node-config.json');
}

export function getBaselinePath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'tests/fixtures/baselines/wpt-passing-set-baseline.json');
}

export function getProgressPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'wpt-progress.md');
}

export function validateSpecName(name: string): name is SpecName {
  return (VALID_SPECS as readonly string[]).includes(name);
}

export function loadWptConfig(customPath?: string): WptConfig {
  const configPath = customPath ?? getConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(`WPT node config not found at: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as WptConfig;
}
