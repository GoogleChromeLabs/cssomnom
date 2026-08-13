/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import fs from 'node:fs';
import path from 'node:path';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { HarnessError, messageOf } from './wpt-assertions.ts';
import { createWptContext, type WindowType, type DocumentType, type WptSandboxTest } from './testharness-bridge.ts';
import type { VirtualClock } from './virtual-clock.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const WPT_ROOT = path.join(REPO_ROOT, 'submodules/web-platform-tests');

export interface IframeSandboxContext {
  parent?: unknown;
  top?: unknown;
  window?: unknown;
  self?: unknown;
  location?: { href: string };
  isSingleTest?: boolean;
  allowUncaughtException?: boolean;
  harnessCompleted?: boolean;
  harnessAborted?: boolean;
  harnessErrorStatus?: number;
  harnessErrorMessage?: string | null;
  [key: string]: unknown;
}

export function extractScripts(htmlContent: string, htmlDir: string): { code: string; filename: string }[] {
  const scriptsToRun: { code: string; filename: string }[] = [];
  const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptTagRegex.exec(htmlContent)) !== null) {
    const attrs = match[1];
    const content = match[2];

    const srcMatch = /src=["']([^"']+)["']/i.exec(attrs);
    if (srcMatch) {
      const src = srcMatch[1];
      if (src.includes('testharness') || src.includes('comparisons.js')) {
        continue;
      }
      let resolvedPath: string;
      if (src.startsWith('/css/css-typed-om/')) {
        resolvedPath = path.join(WPT_ROOT, src);
      } else if (src.startsWith('../') || src.startsWith('./') || !src.startsWith('/')) {
        resolvedPath = path.resolve(htmlDir, src);
      } else {
        resolvedPath = path.join(WPT_ROOT, src);
      }

      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        scriptsToRun.push({
          code: fileContent,
          filename: resolvedPath
        });
      } catch {
        // File not found or unreadable; ignore per BAN TOCTOU
      }
    } else {
      if (content.trim()) {
        scriptsToRun.push({
          code: content,
          filename: 'inline-script.js'
        });
      }
    }
  }
  return scriptsToRun;
}

export function runIframeDocumentWrite(
  iframeWindow: WindowType,
  iframeDocument: DocumentType,
  src: string,
  parentWindow: WindowType,
  _patchWindow: (win: WindowType) => void
): void {
  const htmlToParse = src.includes('<html') ? src : `<!doctype html><html><head>${src}</head><body></body></html>`;
  const parsedDom = parseHTML(htmlToParse);
  if (iframeDocument.head && parsedDom.document.head) {
    iframeDocument.head.innerHTML = parsedDom.document.head.innerHTML;
  }
  if (iframeDocument.body && parsedDom.document.body) {
    iframeDocument.body.innerHTML = parsedDom.document.body.innerHTML;
  }
  const scripts = extractScripts(src, '');
  const iframeTests: WptSandboxTest[] = [];
  const titleMatch = /<title>(.*?)<\/title>/i.exec(src);
  const iframeTitle = titleMatch ? titleMatch[1] : 'Document title';
  if (titleMatch) {
    iframeDocument.title = titleMatch[1];
  }

  const rootClock = (parentWindow as unknown as { __virtualClock?: VirtualClock }).__virtualClock;
  const iframeSandbox = createWptContext(iframeWindow, iframeDocument, iframeTests, rootClock) as IframeSandboxContext;
  iframeSandbox.parent = parentWindow;
  iframeSandbox.top = parentWindow;
  iframeSandbox.window = iframeWindow;
  iframeSandbox.self = iframeWindow;
  iframeSandbox.location = { href: 'about:blank' };

  const iframeContext = vm.createContext(iframeSandbox);

  let overallStatus = 0; // OK
  let overallMessage: string | null = null;

  let singleTestFailed = false;
  let singleTestMessage: string | null = null;

  const rejectionHandler = (reason: unknown) => {
    const isHarnessErr =
      reason instanceof HarnessError ||
      (reason !== null &&
        typeof reason === 'object' &&
        'name' in reason &&
        (reason as Record<string, unknown>).name === 'HarnessError');
    if (isHarnessErr || !iframeSandbox?.allowUncaughtException) {
      if (iframeSandbox?.isSingleTest) {
        singleTestFailed = true;
        singleTestMessage = messageOf(reason);
      } else {
        overallStatus = 1;
        overallMessage = messageOf(reason);
      }
    }
  };

  const exceptionHandler = (err: unknown) => {
    const isHarnessErr =
      err instanceof HarnessError ||
      (err !== null &&
        typeof err === 'object' &&
        'name' in err &&
        (err as Record<string, unknown>).name === 'HarnessError');
    if (isHarnessErr || !iframeSandbox?.allowUncaughtException) {
      if (iframeSandbox?.isSingleTest) {
        singleTestFailed = true;
        singleTestMessage = messageOf(err);
      } else {
        overallStatus = 1;
        overallMessage = messageOf(err);
      }
    }
  };

  process.on('unhandledRejection', rejectionHandler);
  process.on('uncaughtException', exceptionHandler);

  for (const s of scripts) {
    if (s.code.trim()) {
      try {
        const script = new vm.Script(s.code, { filename: s.filename });
        script.runInContext(iframeContext);
      } catch (err: unknown) {
        const isHarnessErr =
          err instanceof HarnessError ||
          (err !== null &&
            typeof err === 'object' &&
            'name' in err &&
            (err as Record<string, unknown>).name === 'HarnessError');
        if (isHarnessErr || !iframeSandbox?.allowUncaughtException) {
          if (iframeSandbox?.isSingleTest) {
            singleTestFailed = true;
            singleTestMessage = messageOf(err);
          } else {
            overallStatus = 1;
            overallMessage = messageOf(err);
          }
        }
      }
    }
  }

  try {
    const domContentLoadedEv = new iframeWindow.Event('DOMContentLoaded', { bubbles: true });
    iframeWindow.dispatchEvent(domContentLoadedEv);
    const loadEv = new iframeWindow.Event('load', { bubbles: true });
    iframeWindow.dispatchEvent(loadEv);
  } catch (e: unknown) {
    if (
      e &&
      typeof e === 'object' &&
      (('name' in e && e.name === 'AssertionError') || ('code' in e && (e as { code: string }).code === 'ERR_ASSERTION'))
    ) {
      throw e;
    }
  }

  Promise.resolve().then(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));

    const timeoutPromise = <T>(promise: Promise<T>, ms: number, errorType: 'TIMEOUT' | 'ERROR' = 'TIMEOUT'): Promise<T> => {
      let timer: NodeJS.Timeout;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(errorType);
          (err as Error & { isTimeout?: boolean }).isTimeout = true;
          reject(err);
        }, ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    const results = [];
    const testStatusMap = { PASS: 0, FAIL: 1, TIMEOUT: 2, NOTRUN: 3, PRECONDITION_FAILED: 4 };

    let setupFailed = false;
    let setupError: unknown = null;
    let promiseSetupCalled = false;

    if (iframeSandbox?.isSingleTest) {
      const hasSubtests = iframeTests.some(t => t.type !== 'setup');
      if (hasSubtests) {
        singleTestFailed = true;
        singleTestMessage = 'Erroneous usage: subtest declaration in single_test page';
      }
      results.push({
        name: iframeTitle,
        status: singleTestFailed ? 1 : 0,
        message: singleTestMessage,
        ...testStatusMap
      });
    } else {
      for (const t of iframeTests) {
        if (t.type === 'setup') {
          promiseSetupCalled = true;
          try {
            if (t.fn) {
              const setupPromise = t.fn();
              await timeoutPromise(setupPromise, 1000);
            }
          } catch (e: unknown) {
            setupFailed = true;
            setupError = e;
            if (e && typeof e === 'object' && (e as Record<string, unknown>).isTimeout === true) {
              overallStatus = 2; // TIMEOUT
              overallMessage = 'promise_setup timed out';
            } else {
              overallStatus = 1; // ERROR
              overallMessage = messageOf(e);
            }
          }
          continue;
        }

        if (setupFailed) {
          results.push({
            name: t.name,
            status: 3, // NOTRUN
            message: `Setup failed: ${messageOf(setupError)}`,
            ...testStatusMap
          });
          continue;
        }

        if (promiseSetupCalled && (t.type === 'test' || t.type === 'async_test')) {
          overallStatus = 1; // ERROR
          overallMessage = `Error: subsequent invocation of ${t.type}`;
          results.push({
            name: t.name,
            status: 1, // FAIL
            message: `subsequent invocation of ${t.type}`,
            ...testStatusMap
          });
          continue;
        }

        let statusCode = 0; // PASS
        let message: string | null = null;
        if (t.type === 'test') {
          statusCode = t.status ?? 0;
          message = t.message ?? null;
        } else if (t.type === 'async_test') {
          try {
            if (t.promise) {
              const clock = (iframeWindow as unknown as { __virtualClock?: VirtualClock }).__virtualClock;
              let isDone = false;
              const pumpPromise = clock ? clock.pumpUntil(() => isDone, { maxTicks: 5000, maxVirtualDuration: 30000 }) : Promise.resolve();
              const testPromise = timeoutPromise(t.promise, 2000).finally(() => {
                isDone = true;
              });
              await Promise.all([pumpPromise, testPromise]);
            }
            statusCode = t.status ?? 0;
            message = t.message ?? null;
          } catch (err: unknown) {
            const isTimeout = err && typeof err === 'object' && (err as Record<string, unknown>).isTimeout === true;
            statusCode = isTimeout ? 2 : 1; // TIMEOUT or FAIL
            message = messageOf(err);
          } finally {
            for (const cleanFn of t.cleanups || []) {
              try {
                cleanFn();
              } catch (cleanErr: unknown) {
                overallStatus = 1;
                overallMessage = messageOf(cleanErr);
                if (iframeSandbox) {
                  iframeSandbox.harnessAborted = true;
                }
              }
            }
          }
        } else if (t.type === 'promise_test') {
          const tObj = {
            add_cleanup: (cleanFn: Function) => {
              if (!t.cleanups) {
                t.cleanups = [];
              }
              t.cleanups.push(cleanFn);
            }
          };
          try {
            if (t.fn) {
              const fn = t.fn;
              const clock = (iframeWindow as unknown as { __virtualClock?: VirtualClock }).__virtualClock;
              let isDone = false;
              const pumpPromise = clock ? clock.pumpUntil(() => isDone, { maxTicks: 5000, maxVirtualDuration: 30000 }) : Promise.resolve();
              const testPromise = (async () => {
                try {
                  const valOrPromise = fn(tObj);
                  if (
                    valOrPromise &&
                    typeof valOrPromise === 'object' &&
                    'then' in valOrPromise &&
                    typeof (valOrPromise as Record<string, unknown>).then === 'function'
                  ) {
                    await timeoutPromise(valOrPromise as Promise<unknown>, 2000);
                  } else {
                    await valOrPromise;
                  }
                } finally {
                  isDone = true;
                }
              })();
              await Promise.all([pumpPromise, testPromise]);
            }
          } catch (err: unknown) {
            const isTimeout = err && typeof err === 'object' && (err as Record<string, unknown>).isTimeout === true;
            statusCode = isTimeout ? 2 : 1; // TIMEOUT or FAIL
            message = messageOf(err);
          } finally {
            for (const cleanFn of t.cleanups || []) {
              try {
                cleanFn();
              } catch (cleanErr: unknown) {
                overallStatus = 1;
                overallMessage = messageOf(cleanErr);
                if (iframeSandbox) {
                  iframeSandbox.harnessAborted = true;
                }
              }
            }
          }
        }

        results.push({
          name: t.name,
          status: statusCode,
          message,
          ...testStatusMap
        });
      }
    }
    if (iframeSandbox?.harnessCompleted && iframeSandbox.harnessErrorStatus !== undefined) {
      overallStatus = iframeSandbox.harnessErrorStatus;
      overallMessage = iframeSandbox.harnessErrorMessage ?? null;
    }

    const completeData = {
      type: 'complete',
      tests: results,
      status: {
        status: overallStatus,
        message: overallMessage,
        OK: 0,
        ERROR: 1,
        TIMEOUT: 2,
        NOTRUN: 3
      }
    };
    iframeWindow.postMessage(completeData);
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);
  });
}

const iframeContentDocumentMap = new WeakMap<object, DocumentType>();
const iframeContentWindowMap = new WeakMap<object, WindowType>();
const iframeSrcDocMap = new WeakMap<object, string>();

export function setupIframePrototype(
  htmlIframeProto: Record<string, unknown>,
  mainWindow: WindowType,
  patchWindow: (win: WindowType) => void
): void {
  Object.defineProperty(htmlIframeProto, 'contentDocument', {
    configurable: true,
    enumerable: true,
    get(this: object) {
      let doc = iframeContentDocumentMap.get(this);
      if (!doc) {
        const iframeEl = this as { ownerDocument?: Document };
        const iframeDom = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
        const iframeWindow = iframeDom.window;
        (iframeWindow as unknown as Record<string, unknown>).frameElement = this;
        (iframeWindow as unknown as Record<string, unknown>).__lastWidth = 100;
        (iframeWindow as unknown as Record<string, unknown>).__lastHeight = 100;
        patchWindow(iframeWindow);

        const parentDoc = iframeEl.ownerDocument;
        const parentWin = (parentDoc?.defaultView as WindowType | undefined) || mainWindow;
        const parentClock = (parentWin as unknown as { __virtualClock?: VirtualClock }).__virtualClock;
        if (parentClock) {
          (iframeWindow as unknown as Record<string, unknown>).__virtualClock = parentClock;
        }

        // Route postMessage to parent window (main window)
        iframeWindow.postMessage = function (this: typeof iframeWindow, data: unknown) {
          const targetDoc = iframeEl.ownerDocument;
          const targetWin = (targetDoc?.defaultView as WindowType | undefined) || mainWindow;
          const EventConstructor = (targetWin.CustomEvent || targetWin.Event || CustomEvent || Event) as { new (t: string): CustomEvent };
          const event = new EventConstructor('message');
          Object.defineProperty(event, 'data', { value: data, enumerable: true });
          Object.defineProperty(event, 'source', { value: this, enumerable: true });
          targetWin.dispatchEvent(event);
        };

        const iframeDocument = iframeDom.document;
        iframeContentDocumentMap.set(this, iframeDocument);
        iframeContentWindowMap.set(this, iframeWindow);

        iframeDocument.write = function (src: string) {
          const parentDoc = iframeEl.ownerDocument;
          const parentWin = (parentDoc?.defaultView as WindowType | undefined) || mainWindow;
          runIframeDocumentWrite(iframeWindow, iframeDocument, src, parentWin, patchWindow);
        };
        iframeDocument.close = function () {};
        doc = iframeDocument;
      }
      return doc;
    }
  });

  Object.defineProperty(htmlIframeProto, 'contentWindow', {
    configurable: true,
    enumerable: true,
    get(this: object) {
      void (this as { contentDocument?: DocumentType }).contentDocument;
      return iframeContentWindowMap.get(this);
    }
  });

  Object.defineProperty(htmlIframeProto, 'srcdoc', {
    configurable: true,
    enumerable: true,
    get(this: object) {
      return iframeSrcDocMap.get(this) ?? '';
    },
    set(this: object, val: string) {
      iframeSrcDocMap.set(this, val);
      const self = this as { contentDocument?: { write?: (s: string) => void }; dispatchEvent?: (ev: Event) => boolean; ownerDocument?: Document };
      const doc = self.contentDocument;
      if (doc && typeof doc.write === 'function') {
        try {
          doc.write(val);
        } catch {}
      }
      queueMicrotask(() => {
        try {
          if (self.dispatchEvent) {
            const parentDoc = self.ownerDocument;
            const parentWin = (parentDoc?.defaultView as WindowType | undefined) || mainWindow;
            const eventConstructor = parentWin as unknown as { Event: new (type: string) => Event };
            self.dispatchEvent(new eventConstructor.Event('load'));
          }
        } catch {}
      });
    }
  });
}
