/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { normalizeWptPath, resolveSpecFromPath, type WptReportJson, type WptReportResult } from './parity.ts';
import { VALID_SPECS, validateSpecName } from '../node/core/config.ts';

export interface WptFyiRunItem {
  id: number;
  browser_name: string;
  browser_version: string;
  os_name: string;
  os_version: string;
  revision: string;
  full_revision_hash?: string;
  results_url?: string;
  raw_results_url?: string;
  created_at?: string;
  time_start?: string;
  time_end?: string;
  labels?: string[];
}

export interface FetchWptFyiOptions {
  product?: string;
  label?: string;
  revision?: string;
  runId?: number | string;
  cachePath?: string;
  spec?: string;
  dryRun?: boolean;
  maxCount?: number;
  quiet?: boolean;
  customFetch?: typeof fetch;
}

export interface FetchWptFyiResult {
  runId: number | string;
  product: string;
  browserVersion: string;
  revision: string;
  fullRevisionHash?: string;
  totalTests: number;
  totalSubtests: number;
  cachedPath?: string;
  report: WptReportJson;
}

/**
 * Builds the wpt.fyi API URL for querying runs.
 */
export function buildWptFyiApiUrl(options: FetchWptFyiOptions = {}): string {
  const baseUrl = 'https://wpt.fyi/api/runs';
  const params = new URLSearchParams();

  if (options.runId) {
    return `${baseUrl}/${options.runId}`;
  }

  const product = options.product || 'chrome';
  params.set('product', product);

  if (options.revision) {
    params.set('sha', options.revision);
  } else {
    params.set('label', options.label || 'master');
  }

  params.set('max-count', String(options.maxCount || 1));
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Decompresses gzipped buffer (checked via magic bytes 0x1F 0x8B) or returns UTF-8 text string.
 */
export function decompressBuffer(buffer: Buffer): string {
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  if (isGzip) {
    try {
      const unzipped = zlib.gunzipSync(buffer);
      return unzipped.toString('utf-8');
    } catch {
      return buffer.toString('utf-8');
    }
  }
  return buffer.toString('utf-8');
}

/**
 * Normalizes raw WPT report/summary JSON into uniform WptReportJson structure.
 */
export function normalizeWptFyiData(rawData: unknown, defaultBrowser: string): WptReportJson {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid WPT data: parsed content is not an object or array.');
  }

  if (Array.isArray(rawData)) {
    // Array of WptReportResult items
    return {
      browser: defaultBrowser,
      results: rawData as WptReportResult[],
    };
  }

  const obj = rawData as Record<string, unknown>;
  if (Array.isArray(obj.results)) {
    return {
      browser: typeof obj.browser === 'string' ? obj.browser : defaultBrowser,
      time: typeof obj.time === 'number' ? obj.time : undefined,
      results: obj.results as WptReportResult[],
    };
  }

  // Dictionary map (e.g. summary_v2 or key-value map of path -> result)
  const results: WptReportResult[] = [];
  for (const [testPath, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      results.push({
        test: testPath,
        status: val[0] === 0 || val[0] === 'OK' || val[0] === 'PASS' ? 'OK' : 'FAIL',
      });
    } else if (val && typeof val === 'object') {
      const v = val as Record<string, unknown>;
      results.push({
        test: testPath,
        status: typeof v.status === 'string' ? v.status : 'OK',
        subtests: Array.isArray(v.subtests) ? (v.subtests as import('./parity.ts').WptReportSubtest[]) : undefined,
      });
    }
  }

  return {
    browser: typeof obj.browser === 'string' ? obj.browser : defaultBrowser,
    results,
  };
}

/**
 * Fetches latest master or revision-specific Chrome WPT baseline from wpt.fyi / GCS.
 */
export async function fetchWptFyiRun(options: FetchWptFyiOptions = {}): Promise<FetchWptFyiResult> {
  const fetchFn = options.customFetch || fetch;
  const product = options.product || 'chrome';
  const label = options.label || 'master';

  if (options.spec && !validateSpecName(options.spec)) {
    throw new Error(`Invalid spec filter "${options.spec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  const apiUrl = buildWptFyiApiUrl(options);

  if (!options.quiet) {
    console.log(`[wpt.fyi] Querying runs API: ${apiUrl}`);
  }

  const apiRes = await fetchFn(apiUrl);
  if (!apiRes.ok) {
    throw new Error(`Failed to query wpt.fyi API (${apiRes.status} ${apiRes.statusText}) at ${apiUrl}`);
  }

  const apiData = await apiRes.json();
  let run: WptFyiRunItem;

  if (Array.isArray(apiData)) {
    if (apiData.length === 0) {
      throw new Error(`No WPT runs found on wpt.fyi matching product="${product}" and label="${label}"`);
    }
    run = apiData[0] as WptFyiRunItem;
  } else if (apiData && typeof apiData === 'object' && 'id' in apiData) {
    run = apiData as WptFyiRunItem;
  } else {
    throw new Error('Unexpected response format from wpt.fyi API.');
  }

  const browserVersion = run.browser_version || 'upstream';
  const browserDisplayName = `Upstream ${run.browser_name || 'Chrome'} ${browserVersion}`.trim();
  const downloadUrl = run.raw_results_url || run.results_url;

  if (!downloadUrl) {
    throw new Error(`Run ID ${run.id} has no results_url or raw_results_url.`);
  }

  if (!options.quiet) {
    console.log(`[wpt.fyi] Found Run ID ${run.id} (${run.browser_name} ${browserVersion}, commit: ${run.revision})`);
    console.log(`[wpt.fyi] Downloading baseline results from: ${downloadUrl}`);
  }

  const dlRes = await fetchFn(downloadUrl);
  if (!dlRes.ok) {
    throw new Error(`Failed to download report data (${dlRes.status} ${dlRes.statusText}) from ${downloadUrl}`);
  }

  const arrayBuffer = await dlRes.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);
  const jsonText = decompressBuffer(rawBuffer);
  const rawReportJson = JSON.parse(jsonText);

  let report = normalizeWptFyiData(rawReportJson, browserDisplayName);

  // Optional spec domain filtering
  if (options.spec) {
    const targetSpec = options.spec;
    report.results = report.results.filter((r) => {
      const norm = normalizeWptPath(r.test);
      const spec = resolveSpecFromPath(norm);
      return spec === targetSpec;
    });
  }

  let totalTests = 0;
  let totalSubtests = 0;
  for (const r of report.results) {
    totalTests++;
    if (Array.isArray(r.subtests) && r.subtests.length > 0) {
      totalSubtests += r.subtests.length;
    } else {
      totalSubtests++;
    }
  }

  let targetPath: string | undefined;
  if (!options.dryRun) {
    targetPath = path.resolve(options.cachePath || '.wpt-cache/report-chrome-upstream.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(report, null, 2), 'utf-8');
  }

  if (!options.quiet) {
    console.log(`[wpt.fyi] Ingested ${totalTests.toLocaleString()} tests (${totalSubtests.toLocaleString()} subtests).`);
    if (!options.dryRun && targetPath) {
      console.log(`[wpt.fyi] Cached upstream baseline to: ${targetPath}`);
    } else {
      console.log(`[wpt.fyi] [Dry Run] Report previewed without writing to disk.`);
    }
  }

  return {
    runId: run.id,
    product: run.browser_name,
    browserVersion,
    revision: run.revision,
    fullRevisionHash: run.full_revision_hash,
    totalTests,
    totalSubtests,
    cachedPath: targetPath,
    report,
  };
}
