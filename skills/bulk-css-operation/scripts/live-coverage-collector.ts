/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { pruneUnusedCss, type CoverageRange, type CoveragePruneResult, type PruneOptions } from './coverage-prune.ts';

export interface LiveCoverageResult {
  url: string;
  originalCss: string;
  ranges: CoverageRange[];
  pruneResult: CoveragePruneResult;
}

export interface CollectCoverageOptions {
  chromePath?: string;
  userDataDir?: string;
  timeoutMs?: number;
  pruneOptions?: PruneOptions;
}

/**
 * Discovers a local Chrome or Chromium executable across Linux, macOS, and Windows.
 * Respects CHROME_BIN and PUPPETEER_EXECUTABLE_PATH environment overrides.
 */
export function findChromeExecutable(): string {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const platform = process.platform;
  let candidates: string[] = [];

  if (platform === 'linux') {
    candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
  } else if (platform === 'darwin') {
    candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  } else if (platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    candidates = [
      path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    ];
  }

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `No Chrome/Chromium executable found for platform '${platform}'. Set CHROME_BIN or PUPPETEER_EXECUTABLE_PATH.`
    );
  }
  return found;
}

/**
 * Converts CDP raw rule usage ranges into disjoint character ranges.
 * Implements the standard interval scan-line algorithm matching Puppeteer's convertToDisjointRanges.
 */
export function convertToDisjointRanges(
  nestedRanges: Array<{ startOffset: number; endOffset: number; count: number }>
): CoverageRange[] {
  const points: Array<{ offset: number; type: 0 | 1; count: number; length: number }> = [];
  for (const r of nestedRanges) {
    const length = r.endOffset - r.startOffset;
    points.push({ offset: r.startOffset, type: 0, count: r.count, length });
    points.push({ offset: r.endOffset, type: 1, count: r.count, length });
  }

  points.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    if (a.type !== b.type) return b.type - a.type;
    if (a.type === 0) return b.length - a.length;
    return a.length - b.length;
  });

  const hitStack: number[] = [];
  const results: CoverageRange[] = [];
  let lastOffset = 0;

  for (const pt of points) {
    if (hitStack.length > 0 && lastOffset < pt.offset && hitStack[hitStack.length - 1] > 0) {
      const prev = results[results.length - 1];
      if (prev && prev.end === lastOffset) {
        prev.end = pt.offset;
      } else {
        results.push({ start: lastOffset, end: pt.offset });
      }
    }
    lastOffset = pt.offset;
    if (pt.type === 0) {
      hitStack.push(pt.count);
    } else {
      hitStack.pop();
    }
  }

  return results.filter((r) => r.end - r.start > 0);
}

/**
 * Launches Chrome in headless mode via puppeteer-core, collects live CSS coverage for an HTML string or URL,
 * and passes the gathered stylesheet and coverage ranges through cssomnom's 3-Tier pruner.
 */
export async function collectLiveCssCoverage(
  target: { html: string } | { url: string },
  options: CollectCoverageOptions = {}
): Promise<LiveCoverageResult[]> {
  const chromeBin = options.chromePath ?? findChromeExecutable();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const userDataDir = options.userDataDir ?? path.join(os.tmpdir(), `cssom-chrome-${Date.now()}-${randomSuffix}`);
  const timeoutMs = options.timeoutMs ?? 30000;

  const browser = await puppeteer.launch({
    executablePath: chromeBin,
    headless: true,
    userDataDir,
    timeout: timeoutMs,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
    ],
  });

  try {
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();

    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');

    const stylesheetSources = new Map<string, { url: string; text: string }>();

    cdp.on('CSS.styleSheetAdded', (event) => {
      const header = event.header;
      if (!header?.styleSheetId) return;
      cdp.send('CSS.getStyleSheetText', { styleSheetId: header.styleSheetId })
        .then((resp) => {
          stylesheetSources.set(header.styleSheetId, {
            url: header.sourceURL || header.origin || 'inline',
            text: resp.text,
          });
        })
        .catch(() => {});
    });

    await cdp.send('CSS.startRuleUsageTracking');

    if ('url' in target) {
      await page.goto(target.url, { waitUntil: 'load', timeout: timeoutMs });
    } else {
      await page.setContent(target.html, { waitUntil: 'load', timeout: timeoutMs });
    }

    // Brief stabilization delay for style recalc
    await new Promise((res) => setTimeout(res, 100));

    const { ruleUsage } = await cdp.send('CSS.stopRuleUsageTracking');

    const sheetRanges = new Map<string, Array<{ startOffset: number; endOffset: number; count: number }>>();
    for (const entry of ruleUsage || []) {
      if (!entry.styleSheetId) continue;
      let list = sheetRanges.get(entry.styleSheetId);
      if (!list) {
        list = [];
        sheetRanges.set(entry.styleSheetId, list);
      }
      list.push({
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
        count: entry.used ? 1 : 0,
      });
    }

    const results: LiveCoverageResult[] = [];
    for (const [sheetId, sheetInfo] of stylesheetSources.entries()) {
      if (!sheetInfo.text.trim()) continue;
      const rawUsage = sheetRanges.get(sheetId) || [];
      const disjointRanges = convertToDisjointRanges(rawUsage);
      // We pass the raw unflattened used ranges to pruneUnusedCss so that outer grouping
      // at-rules (@layer, @media) do not have their coverage intervals flattened with child rules.
      const usedRuleRanges: CoverageRange[] = rawUsage
        .filter((u) => u.count > 0)
        .map((u) => ({ start: u.startOffset, end: u.endOffset }));

      const pruneResult = pruneUnusedCss(sheetInfo.text, usedRuleRanges, options.pruneOptions);

      results.push({
        url: sheetInfo.url,
        originalCss: sheetInfo.text,
        ranges: disjointRanges,
        pruneResult,
      });
    }

    return results;
  } finally {
    try {
      await browser.close();
    } catch {
      // Ignore browser close errors
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
