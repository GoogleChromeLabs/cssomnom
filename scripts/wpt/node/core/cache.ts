/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestRunDataset } from './types.ts';

export const LAST_RUN_FILENAME = 'last-run.json';
export const LAST_FULL_RUN_FILENAME = 'last-full-run.json';
export const LAST_PARTIAL_RUN_FILENAME = 'last-partial-run.json';

export interface SaveCacheOptions {
  isPartial?: boolean;
  baseDir?: string;
}

export interface LoadCacheOptions {
  baseDir?: string;
  allowPartial?: boolean;
  preferFull?: boolean;
}

export function getCacheDir(baseDir = process.cwd()): string {
  return path.resolve(baseDir, '.wpt-cache');
}

export function getCacheFilePath(baseDir = process.cwd(), isPartial = false): string {
  const filename = isPartial ? LAST_PARTIAL_RUN_FILENAME : LAST_RUN_FILENAME;
  return path.resolve(getCacheDir(baseDir), filename);
}

export function getFullCacheFilePath(baseDir = process.cwd()): string {
  return path.resolve(getCacheDir(baseDir), LAST_FULL_RUN_FILENAME);
}

export function getPartialCacheFilePath(baseDir = process.cwd()): string {
  return path.resolve(getCacheDir(baseDir), LAST_PARTIAL_RUN_FILENAME);
}

export function saveDatasetToCache(
  dataset: TestRunDataset,
  optionsOrBaseDir?: string | SaveCacheOptions,
  legacyBaseDir?: string
): void {
  let isPartial = false;
  let baseDir = process.cwd();

  if (typeof optionsOrBaseDir === 'string') {
    baseDir = optionsOrBaseDir;
    isPartial = Boolean(dataset.isPartial);
  } else if (typeof optionsOrBaseDir === 'object' && optionsOrBaseDir !== null) {
    isPartial = optionsOrBaseDir.isPartial ?? Boolean(dataset.isPartial);
    baseDir = optionsOrBaseDir.baseDir ?? legacyBaseDir ?? process.cwd();
  } else if (legacyBaseDir) {
    baseDir = legacyBaseDir;
    isPartial = Boolean(dataset.isPartial);
  }

  dataset.isPartial = isPartial;

  const cacheDir = getCacheDir(baseDir);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const serialized = JSON.stringify(dataset, null, 2);

  if (isPartial) {
    const partialPath = getPartialCacheFilePath(baseDir);
    fs.writeFileSync(partialPath, serialized, 'utf-8');
  } else {
    const fullPath = getFullCacheFilePath(baseDir);
    const lastRunPath = getCacheFilePath(baseDir, false);
    fs.writeFileSync(fullPath, serialized, 'utf-8');
    fs.writeFileSync(lastRunPath, serialized, 'utf-8');
  }
}

export function loadDatasetFromCache(
  optionsOrBaseDir?: string | LoadCacheOptions
): TestRunDataset | null {
  let baseDir = process.cwd();
  let allowPartial = true;
  let preferFull = true;

  if (typeof optionsOrBaseDir === 'string') {
    baseDir = optionsOrBaseDir;
  } else if (typeof optionsOrBaseDir === 'object' && optionsOrBaseDir !== null) {
    baseDir = optionsOrBaseDir.baseDir ?? process.cwd();
    if (optionsOrBaseDir.allowPartial !== undefined) {
      allowPartial = optionsOrBaseDir.allowPartial;
    }
    if (optionsOrBaseDir.preferFull !== undefined) {
      preferFull = optionsOrBaseDir.preferFull;
    }
  }

  function readJson(filePath: string): TestRunDataset | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as TestRunDataset;
    } catch {
      return null;
    }
  }

  const fullPath = getFullCacheFilePath(baseDir);
  const lastRunPath = getCacheFilePath(baseDir, false);
  const partialPath = getPartialCacheFilePath(baseDir);

  if (preferFull) {
    const fullDataset = readJson(fullPath);
    if (fullDataset && !fullDataset.isPartial) {
      return fullDataset;
    }
  }

  const lastRunDataset = readJson(lastRunPath);
  if (lastRunDataset && !lastRunDataset.isPartial) {
    return lastRunDataset;
  }

  const fullDatasetFallback = readJson(fullPath);
  if (fullDatasetFallback && !fullDatasetFallback.isPartial) {
    return fullDatasetFallback;
  }

  if (allowPartial) {
    const partialDataset = readJson(partialPath);
    if (partialDataset) {
      return partialDataset;
    }
    if (lastRunDataset) {
      return lastRunDataset;
    }
  }

  return null;
}

export function loadFullDatasetFromCache(baseDir = process.cwd()): TestRunDataset | null {
  return loadDatasetFromCache({ baseDir, allowPartial: false, preferFull: true });
}

export function loadPartialDatasetFromCache(baseDir = process.cwd()): TestRunDataset | null {
  const partialPath = getPartialCacheFilePath(baseDir);
  if (!fs.existsSync(partialPath)) return null;
  try {
    const raw = fs.readFileSync(partialPath, 'utf-8');
    return JSON.parse(raw) as TestRunDataset;
  } catch {
    return null;
  }
}

export function hasValidCache(baseDir = process.cwd(), requireFull = false): boolean {
  return loadDatasetFromCache({ baseDir, allowPartial: !requireFull, preferFull: true }) !== null;
}
