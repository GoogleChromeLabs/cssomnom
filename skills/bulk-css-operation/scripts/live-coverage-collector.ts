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

import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
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

export function findChromeExecutable(): string {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  if (candidates.length === 0) {
    throw new Error('No Chrome/Chromium executable found in standard locations. Set CHROME_BIN.');
  }
  return candidates[0];
}

interface CdpMessage {
  id: number;
  sessionId?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string; code?: number };
}

class CdpConnection {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (evt) => {
      const msg: CdpMessage = JSON.parse(evt.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        const listeners = this.eventHandlers.get(msg.method);
        if (listeners) {
          for (const listener of listeners) {
            listener(msg.params);
          }
        }
      }
    };
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (val: unknown) => void, reject });
      const payload: Record<string, unknown> = { id, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }
      this.ws.send(JSON.stringify(payload));
    });
  }

  on<T = unknown>(method: string, handler: (params: T) => void): () => void {
    let set = this.eventHandlers.get(method);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(method, set);
    }
    const genericHandler = handler as (params: unknown) => void;
    set.add(genericHandler);
    return () => {
      set?.delete(genericHandler);
    };
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Ignore socket closing errors
    }
  }
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
 * Launches Chrome in headless mode, collects live CSS coverage for an HTML string or URL,
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

  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  const chrome = spawn(chromeBin, chromeArgs, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const cleanup = () => {
    try {
      if (!chrome.killed && chrome.pid) {
        chrome.kill('SIGKILL');
      }
    } catch {
      // Ignore
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  };

  try {
    const wsEndpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Chrome DevTools WebSocket after ${timeoutMs}ms`));
      }, timeoutMs);

      let buffer = '';
      chrome.stderr?.on('data', (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });

      chrome.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      chrome.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome process exited early with code ${code}`));
      });
    });

    const ws = new WebSocket(wsEndpoint);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    const cdp = new CdpConnection(ws);

    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });

    await cdp.send('DOM.enable', {}, sessionId);
    await cdp.send('CSS.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);

    const stylesheetSources = new Map<string, { url: string; text: string }>();

    cdp.on<{ header?: { styleSheetId?: string; sourceURL?: string; origin?: string } }>('CSS.styleSheetAdded', (params) => {
      const header = params?.header;
      if (!header?.styleSheetId) return;
      cdp.send<{ text: string }>('CSS.getStyleSheetText', { styleSheetId: header.styleSheetId }, sessionId)
        .then((resp) => {
          stylesheetSources.set(header.styleSheetId!, {
            url: header.sourceURL || header.origin || 'inline',
            text: resp.text,
          });
        })
        .catch(() => {});
    });

    await cdp.send('CSS.startRuleUsageTracking', {}, sessionId);

    const targetUrl = 'url' in target ? target.url : `data:text/html;charset=utf-8,${encodeURIComponent(target.html)}`;
    await cdp.send('Page.navigate', { url: targetUrl }, sessionId);

    await new Promise((resolve) => {
      const off = cdp.on('Page.loadEventFired', () => {
        off();
        resolve(undefined);
      });
      setTimeout(resolve, 600);
    });

    await new Promise((res) => setTimeout(res, 150));

    const { ruleUsage } = await cdp.send<{
      ruleUsage: Array<{ styleSheetId: string; startOffset: number; endOffset: number; used: boolean }>;
    }>('CSS.stopRuleUsageTracking', {}, sessionId);
    cdp.close();

    const sheetRanges = new Map<string, Array<{ startOffset: number; endOffset: number; count: number }>>();
    for (const entry of (ruleUsage || [])) {
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
      // We pass the raw un-flattened used ranges to pruneUnusedCss so that outer grouping
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
    cleanup();
  }
}
