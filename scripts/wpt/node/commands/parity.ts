/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { VALID_SPECS, validateSpecName } from '../core/config.ts';
import { compareParity, formatParityConsole, type ParityReport } from '../../browser/parity.ts';

export interface ParityCommandOptions {
  filterBySpec?: string;
  browserReport?: string;
  upstreamReport?: string;
  nodeCache?: string;
  limit?: number;
  json?: boolean;
}

export async function parityCommand(options: ParityCommandOptions = {}): Promise<ParityReport> {
  if (options.filterBySpec && !validateSpecName(options.filterBySpec)) {
    throw new Error(`Invalid spec "${options.filterBySpec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  const limit = options.limit ?? 15;

  let upstreamReportPath = options.upstreamReport;
  if (!upstreamReportPath) {
    const defaultUpstream = path.resolve('.wpt-cache/report-chrome-upstream.json');
    if (fs.existsSync(defaultUpstream)) {
      upstreamReportPath = defaultUpstream;
    }
  }

  let report: ParityReport;
  try {
    report = compareParity({
      browserReportPath: options.browserReport,
      upstreamReportPath,
      nodeCachePath: options.nodeCache,
      filterBySpec: options.filterBySpec,
      limit,
      includeAllResults: options.json,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m❌ Parity Comparison Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log(formatParityConsole(report, limit));
  return report;
}
