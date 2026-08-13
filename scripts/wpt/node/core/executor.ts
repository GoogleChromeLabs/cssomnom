/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { safeWorkerPool, safeExecTestFile, getGitCommitInfo, type ExecResult } from '../safe-child-process.ts';
import { parseRunnerOutput } from './parser.ts';
import type { CrawledTestFile, TestRunDataset, ParsedFileResult, SpecSummary } from './types.ts';

export interface ExecutorOptions {
  concurrency?: number;
  timeout?: number;
  onProgress?: (completed: number, total: number, file: CrawledTestFile) => void;
}

export async function executeWptTests(
  files: CrawledTestFile[],
  options: ExecutorOptions = {}
): Promise<TestRunDataset> {
  const timeout = options.timeout ?? 180000;
  let completed = 0;

  const fileResults = await safeWorkerPool(
    files,
    async (file: CrawledTestFile): Promise<ParsedFileResult> => {
      let execRes: ExecResult;
      try {
        execRes = await safeExecTestFile(file.absolutePath, { timeout });
      } catch (err: unknown) {
        const errorObj = err as ExecResult;
        execRes = {
          stdout: typeof errorObj?.stdout === 'string' ? errorObj.stdout : '',
          stderr: typeof errorObj?.stderr === 'string' ? errorObj.stderr : '',
          durationMs: typeof errorObj?.durationMs === 'number' ? errorObj.durationMs : 0,
          peakRssMb: typeof errorObj?.peakRssMb === 'number' ? errorObj.peakRssMb : 0,
          exitCode: typeof errorObj?.exitCode === 'number' ? errorObj.exitCode : null,
          signal: typeof errorObj?.signal === 'string' ? errorObj.signal : null,
          status: errorObj?.status ?? 'ERROR',
        };
      }

      const parsed = parseRunnerOutput(execRes.stdout, execRes.stderr, {
        file: file.relativePath,
        spec: file.spec,
        durationMs: execRes.durationMs,
        peakRssMb: execRes.peakRssMb,
        status: execRes.status,
        exitCode: execRes.exitCode,
        signal: execRes.signal,
        filePath: file.absolutePath,
      });

      completed++;
      if (options.onProgress) {
        options.onProgress(completed, files.length, file);
      }

      return parsed;
    },
    { concurrency: options.concurrency }
  );

  const specSummaries: Record<string, SpecSummary> = {};
  let totalPassing = 0;
  let totalTests = 0;

  for (const res of fileResults) {
    if (!specSummaries[res.spec]) {
      specSummaries[res.spec] = { passing: 0, total: 0, files: 0 };
    }
    specSummaries[res.spec].passing += res.passing;
    specSummaries[res.spec].total += res.total;
    specSummaries[res.spec].files += 1;
    totalPassing += res.passing;
    totalTests += res.total;
  }

  const { commitHash, isDirty } = getGitCommitInfo();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  return {
    timestamp,
    commitHash,
    isDirty,
    specSummaries,
    totalPassing,
    totalTests,
    totalFiles: fileResults.length,
    fileResults,
  };
}
