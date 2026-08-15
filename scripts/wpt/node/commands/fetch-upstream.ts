/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { fetchWptFyiRun, type FetchWptFyiResult } from '../../browser/fetch-wptfyi.ts';
import { VALID_SPECS, validateSpecName } from '../core/config.ts';

export interface FetchUpstreamCommandOptions {
  product?: string;
  label?: string;
  revision?: string;
  runId?: number | string;
  spec?: string;
  cachePath?: string;
  dryRun?: boolean;
  quiet?: boolean;
  customFetch?: typeof fetch;
}

export async function fetchUpstreamCommand(options: FetchUpstreamCommandOptions = {}): Promise<FetchWptFyiResult> {
  if (options.spec && !validateSpecName(options.spec)) {
    throw new Error(`Invalid spec filter "${options.spec}". Valid specs: ${VALID_SPECS.join(', ')}`);
  }

  try {
    const result = await fetchWptFyiRun({
      product: options.product,
      label: options.label,
      revision: options.revision,
      runId: options.runId,
      spec: options.spec,
      cachePath: options.cachePath,
      dryRun: options.dryRun,
      quiet: options.quiet,
      customFetch: options.customFetch,
    });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m❌ Upstream Fetch Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }
}
