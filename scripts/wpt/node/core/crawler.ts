/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WptConfig, CrawledTestFile } from './types.ts';

export function crawlDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'resources' && entry.name !== 'crashtests') {
        crawlDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.htm'))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export interface CrawlOptions {
  filterBySpec?: string;
  filterByPath?: string;
  rootDir?: string;
}

export function crawlSpecFiles(config: WptConfig, options: CrawlOptions = {}): CrawledTestFile[] {
  const rootDir = options.rootDir ?? process.cwd();
  const results: CrawledTestFile[] = [];

  let specsToCrawl = Object.entries(config.specs);
  if (options.filterBySpec) {
    specsToCrawl = specsToCrawl.filter(([name]) => name === options.filterBySpec);
    if (specsToCrawl.length === 0) {
      throw new Error(`Spec "${options.filterBySpec}" not found in WPT config.`);
    }
  }

  for (const [specName, specConfig] of specsToCrawl) {
    const specDir = path.resolve(rootDir, specConfig.path);
    if (!fs.existsSync(specDir)) continue;

    const files = crawlDirectory(specDir).sort();
    const excludeSet = new Set(specConfig.exclude.map(e => path.resolve(rootDir, e)));

    for (const filePath of files) {
      if (excludeSet.has(filePath)) continue;

      const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

      // Check if any exclusion substring matches
      const isExcluded = specConfig.exclude.some(excl => {
        const normExcl = excl.replace(/\\/g, '/');
        return relativePath === normExcl || relativePath.includes(normExcl);
      });
      if (isExcluded) continue;

      if (options.filterByPath) {
        const filterNorm = options.filterByPath.replace(/\\/g, '/');
        if (!relativePath.includes(filterNorm) && !filePath.includes(filterNorm)) {
          continue;
        }
      }

      results.push({
        absolutePath: filePath,
        relativePath,
        spec: specName,
      });
    }
  }

  return results;
}
