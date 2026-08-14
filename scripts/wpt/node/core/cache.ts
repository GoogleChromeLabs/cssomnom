/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestRunDataset } from './types.ts';

export function getCacheDir(baseDir = process.cwd()): string {
  return path.resolve(baseDir, '.wpt-cache');
}

export function getCacheFilePath(baseDir = process.cwd()): string {
  return path.resolve(getCacheDir(baseDir), 'last-run.json');
}

export function saveDatasetToCache(dataset: TestRunDataset, baseDir = process.cwd()): void {
  const cacheDir = getCacheDir(baseDir);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const filePath = getCacheFilePath(baseDir);
  fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2), 'utf-8');
}

export function loadDatasetFromCache(baseDir = process.cwd()): TestRunDataset | null {
  const filePath = getCacheFilePath(baseDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as TestRunDataset;
  } catch {
    return null;
  }
}

export function hasValidCache(baseDir = process.cwd()): boolean {
  return loadDatasetFromCache(baseDir) !== null;
}
