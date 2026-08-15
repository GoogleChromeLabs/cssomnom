/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile, execFileSync, execSync, type ChildProcess } from 'node:child_process';

const activeChildren = new Set<ChildProcess>();
let cleanupRegistered = false;

function registerProcessCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const killAllChildren = () => {
    for (const child of activeChildren) {
      try {
        if (!child.killed && child.pid) {
          child.kill('SIGKILL');
        }
      } catch {
        // Ignore errors during process exit cleanup
      }
    }
    activeChildren.clear();
  };

  process.on('exit', killAllChildren);
  process.on('SIGINT', () => {
    killAllChildren();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    killAllChildren();
    process.exit(143);
  });
}

registerProcessCleanup();

export interface SafeExecOptions {
  timeout?: number;
  maxBuffer?: number;
  maxRssMb?: number;
  args?: string[];
  runnerPath?: string;
  maxOldSpaceSize?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  pollIntervalMs?: number;
  onSample?: (sample: { timestamp: number; elapsedMs: number; rssMB: number; state: string }) => void;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  peakRssMb: number;
  exitCode: number | null;
  signal: string | null;
  status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR';
}

export function safeExecTestFile(
  filePath: string,
  options: SafeExecOptions = {}
): Promise<ExecResult> {
  const timeout = options.timeout ?? 15000;
  const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024;
  const maxOldSpaceSize = options.maxOldSpaceSize ?? 512;
  const maxRssMB = options.maxRssMb ?? 6144;
  const runnerPath = options.runnerPath ?? path.resolve(import.meta.dirname, 'run.ts');
  const extraArgs = options.args ?? [];
  const pollIntervalMs = options.pollIntervalMs ?? 250;

  const args = [
    `--max-old-space-size=${maxOldSpaceSize}`,
    runnerPath,
    ...extraArgs,
    filePath,
  ];

  return new Promise((resolve, reject) => {
    let watchdogTimer: NodeJS.Timeout | null = null;
    const startTime = Date.now();
    let peakRssMb = 0;
    let isWatchdogKilled = false;

    const child = execFile(
      process.execPath,
      args,
      {
        timeout,
        maxBuffer,
        cwd: options.cwd,
        env: options.env,
      },
      (err, stdout, stderr) => {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
        activeChildren.delete(child);

        const durationMs = Date.now() - startTime;
        let status: 'OK' | 'TIMEOUT' | 'WATCHDOG_KILLED' | 'ERROR' = 'OK';

        if (isWatchdogKilled) {
          status = 'WATCHDOG_KILLED';
        } else if (err) {
          const isTimeout =
            (err as { killed?: boolean }).killed ||
            (err as { signal?: string }).signal === 'SIGTERM' ||
            (typeof stdout === 'string' && stdout.includes('Runner timed out')) ||
            (typeof stderr === 'string' && stderr.includes('Runner timed out'));
          if (isTimeout) {
            status = 'TIMEOUT';
          } else {
            status = 'ERROR';
          }
        }

        const result: ExecResult = {
          stdout,
          stderr,
          durationMs,
          peakRssMb,
          exitCode: child.exitCode,
          signal: child.signalCode,
          status,
        };

        if (err) {
          return reject(Object.assign(err, result));
        }
        resolve(result);
      }
    );

    activeChildren.add(child);

    let dStateCount = 0;
    watchdogTimer = setInterval(() => {
      if (!child.pid || child.killed || child.exitCode !== null) {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
        return;
      }

      try {
        const statPath = `/proc/${child.pid}/stat`;
        if (fs.existsSync(statPath)) {
          const statContent = fs.readFileSync(statPath, 'utf-8');
          const lastParen = statContent.lastIndexOf(')');
          if (lastParen !== -1) {
            const fields = statContent.slice(lastParen + 2).trim().split(/\s+/);
            const state = fields[0];
            const rssPages = parseInt(fields[21], 10);
            const rssMB = (rssPages * 4096) / (1024 * 1024);

            if (rssMB > peakRssMb) {
              peakRssMb = rssMB;
            }

            if (options.onSample) {
              options.onSample({
                timestamp: Date.now(),
                elapsedMs: Date.now() - startTime,
                rssMB,
                state,
              });
            }

            if (rssMB > maxRssMB) {
              isWatchdogKilled = true;
              console.warn(
                `[Watchdog] Child PID ${child.pid} exceeded RSS limit (${rssMB.toFixed(1)}MB > ${maxRssMB}MB). Terminating with SIGKILL.`
              );
              try {
                child.kill('SIGKILL');
              } catch {
                // Ignore kill errors
              }
              if (watchdogTimer) {
                clearInterval(watchdogTimer);
                watchdogTimer = null;
              }
              return;
            }

            if (state === 'D') {
              dStateCount++;
              if (dStateCount >= 40) {
                isWatchdogKilled = true;
                console.warn(
                  `[Watchdog] Child PID ${child.pid} entered uninterruptible sleep state D for 40 consecutive checks (10s). Terminating with SIGKILL.`
                );
                try {
                  child.kill('SIGKILL');
                } catch {
                  // Ignore kill errors
                }
                if (watchdogTimer) {
                  clearInterval(watchdogTimer);
                  watchdogTimer = null;
                }
                return;
              }
            } else {
              dStateCount = 0;
            }
          }
        }
      } catch {
        // Child process may have exited during check
      }
    }, pollIntervalMs);
  });
}

export interface SafeWorkerPoolOptions {
  concurrency?: number;
  yieldMs?: number;
}

export function getMemorySafeConcurrency(): number {
  const freeMemGB = os.freemem() / (1024 * 1024 * 1024);
  const cpuLimit = Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 2);
  return Math.min(12, Math.min(cpuLimit, Math.max(1, Math.floor(freeMemGB / 2))));
}

export async function safeWorkerPool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: SafeWorkerPoolOptions = {}
): Promise<R[]> {
  const concurrency = options.concurrency ?? getMemorySafeConcurrency();
  const yieldMs = options.yieldMs ?? 15;
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
      if (yieldMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, yieldMs));
      }
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export function getGitCommitInfo(): { commitHash: string; isDirty: boolean } {
  let commitHash = 'unknown';
  let isDirty = false;
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    isDirty = status.length > 0;
  } catch {
    // Ignore git command errors
  }
  return { commitHash, isDirty };
}

export function execGit(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function addGitNote(commitHash: string, noteContent: string, ref = 'wpt'): boolean {
  try {
    execFileSync('git', ['notes', `--ref=${ref}`, 'add', '-f', '-m', noteContent, commitHash], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

export function getGitNotesLog(count = 5, ref = 'wpt'): { commitHash: string; note: string }[] {
  try {
    const stdout = execSync(`git log -n ${count} --notes=${ref} --format="%h %N"`, { encoding: 'utf-8' });
    const results: { commitHash: string; note: string }[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) {
        results.push({ commitHash: trimmed, note: '' });
      } else {
        results.push({
          commitHash: trimmed.substring(0, spaceIdx),
          note: trimmed.substring(spaceIdx + 1).trim(),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

