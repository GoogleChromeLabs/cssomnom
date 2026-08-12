/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM, createWptContext, type WptSandboxTest } from '../../../tests/wpt-shim.ts';
import assert from 'node:assert/strict';
import * as vm from 'node:vm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as TypedOM from '../../../src/index.ts';

export interface WptTest {
  name: string;
  fn: () => void | Promise<void>;
  isAsync: boolean;
}

export interface WptFileResult {
  tests: WptTest[];
  cleanup: () => void;
}

const WPT_ROOT = path.resolve(process.cwd(), 'submodules/web-platform-tests');

function getScriptContent(htmlDir: string, src: string): string {
  if (src.startsWith('/resources/testharness')) {
    return '';
  }
  
  let resolvedSrc = src;
  if (src === '/resources/WebIDLParser.js') {
    resolvedSrc = '/resources/webidl2/lib/webidl2.js';
  }

  let fullPath: string;
  if (resolvedSrc.startsWith('/')) {
    fullPath = path.join(WPT_ROOT, resolvedSrc);
  } else {
    fullPath = path.resolve(htmlDir, resolvedSrc);
  }
  
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf-8');
  }
  
  console.warn(`Warning: script src "${src}" resolved to "${fullPath}" not found`);
  return '';
}

export function runWptFile(filePath: string): WptFileResult {
  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const dom = parseHTML(htmlContent);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const sandbox = createWptContext(win, dom.document, tests);

  // Copy linkedom window properties to sandbox
  const winObj = win as unknown as Record<string, unknown>;
  const windowKeys = Object.getOwnPropertyNames(win);
  for (const key of windowKeys) {
    try {
      if (!(key in sandbox)) { sandbox[key] = winObj[key]; }
    } catch {
      // Ignore getter errors
    }
  }

  const windowProxy: unknown = new Proxy(winObj, {
    get(target, prop) {
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
        return windowProxy;
      }
      if (prop === 'navigator') {
        return sandbox.navigator;
      }
      if (typeof prop === 'string') {
        const val = target[prop];
        if (val !== undefined) {
          if (typeof val === 'function') {
            return val.bind(target);
          }
          return val;
        }
        if (prop in sandbox) {
          return Reflect.get(sandbox, prop);
        }
        if (dom.document && typeof dom.document.getElementById === 'function') {
          const el = dom.document.getElementById(prop);
          if (el) return el;
        }
      }
      return Reflect.get(sandbox, prop as string);
    },
    has(target, prop) {
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
        return true;
      }
      if (typeof prop === 'string') {
        return (target[prop] !== undefined) || (prop in sandbox) || (Boolean(dom.document?.getElementById?.(prop)));
      }
      return prop in sandbox;
    },
    set(target, prop, value) {
      if (typeof prop === 'string' && target[prop] !== undefined) {
        return Reflect.set(target, prop, value);
      }
      return Reflect.set(sandbox, prop as string, value);
    }
  });

  // Ensure standard aliases are present
  sandbox.window = windowProxy;
  sandbox.document = dom.document;
  sandbox.globalThis = windowProxy;
  sandbox.self = windowProxy;

  // Copy common globals explicitly if they are on window
  const commonGlobals = [
    'Node',
    'Element',
    'HTMLElement',
    'HTMLStyleElement',
    'DOMException',
    'Event',
    'CustomEvent',
    'navigator'
  ];
  for (const g of commonGlobals) {
    if (g in win && !(g in sandbox)) {
      sandbox[g] = winObj[g];
    }
  }

  // Copy global Matrix mocks
  sandbox.DOMMatrix = (globalThis as unknown as Record<string, unknown>).DOMMatrix;
  sandbox.DOMMatrixReadOnly = (globalThis as unknown as Record<string, unknown>).DOMMatrixReadOnly;

  // Copy Typed OM classes (omit CSSPositionValue per CSS Typed OM 1 spec)
  for (const [key, value] of Object.entries(TypedOM)) {
    if (key !== 'CSSPositionValue') {
      sandbox[key] = value;
    }
  }

  const context = vm.createContext(sandbox);
  const htmlDir = path.dirname(filePath);

  const cleanup = () => {
    const sandboxObj = sandbox as {[key: string]: unknown};
    if (sandboxObj && typeof sandboxObj.__cleanup === 'function') {
      (sandboxObj.__cleanup as () => void)();
    }
  };

  // Extract script tags
  try {
    const scripts = dom.document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const scriptEl = scripts[i];
      const src = scriptEl.getAttribute('src');
      let code = '';
      if (src && src !== 'null') {
        code = getScriptContent(htmlDir, src);
      } else {
        code = scriptEl.textContent || '';
      }

      if (code.trim()) {
        const script = new vm.Script(code, { filename: filePath + `#script-${i}` });
        script.runInContext(context);
      }
    }
  } catch (err) {
    cleanup();
    throw err;
  }

  // Dispatch load event to unblock window onload / load event listeners
  try {
    // @ts-expect-error - internal load event tracking property
    win.__loadEventFired = true;
    win.dispatchEvent(new win.Event('load'));
  } catch (err) {
    console.error("Failed to dispatch load event:", err);
  }

  const testQueue: WptTest[] = [];
  for (const t of tests) {
    if (t.executed) {
      const wrappedFn = async () => {
        if ((t.status ?? 0) !== 0) {
          throw new Error(t.message || `Test failed with status ${t.status}`);
        }
      };
      testQueue.push({ name: t.name, fn: wrappedFn, isAsync: false });
      continue;
    }

    const cleanups: Function[] = [];
    const testHarnessParam = {
      add_cleanup(fn: Function) {
        cleanups.push(fn);
      },
      step_timeout(fn: Function, delay: number) {
        return setTimeout(fn, delay);
      },
      step_func(fn: Function) {
        return fn;
      },
      step_func_done(fn: Function) {
        return () => { fn(); };
      },
      step(fn: Function) {
        return fn();
      },
      unreached_func(desc?: string) {
        return () => {
          assert.fail(`Unreached function called: ${desc || 'unreached'}`);
        };
      },
      done() {}
    };
    const wrappedFn = async () => {
      try {
        if (t.fn) {
          await t.fn.call(testHarnessParam, testHarnessParam);
        }
      } finally {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            // ignore
          }
        }
      }
    };
    testQueue.push({ name: t.name, fn: wrappedFn, isAsync: false });
  }
  return {
    tests: testQueue,
    cleanup: () => {
      const sandboxObj = sandbox as {[key: string]: unknown};
      if (sandboxObj && typeof sandboxObj.__cleanup === 'function') {
        (sandboxObj.__cleanup as () => void)();
      }
    }
  };
}

// Support running directly as a CLI script
if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('run.ts') || process.argv[1].endsWith('run_wpt_node.ts'))) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/wpt/node/run.ts <wpt-html-file-paths...>');
    process.exit(1);
  }
  
  (async () => {
    // Master fail-safe timeout: exit process after 10000ms to prevent orphaned background hangs
    setTimeout(() => {
      console.error("Runner timed out after 10000ms (self-termination fail-safe).");
      process.exit(1);
    }, 10000).unref();

    let total = 0;
    let passed = 0;
    let failed = 0;
    
    const filesToRun: string[] = [];
    const collectFiles = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(full);
        } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.htm'))) {
          filesToRun.push(full);
        }
      }
    };

    for (const filePattern of args) {
      const fullPath = path.resolve(process.cwd(), filePattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        collectFiles(fullPath);
      } else {
        filesToRun.push(fullPath);
      }
    }

    for (const fullPath of filesToRun) {
      const relPath = path.relative(process.cwd(), fullPath);
      console.log(`Running WPT file: ${relPath}`);
      try {
        const result = runWptFile(fullPath);
        for (const testItem of result.tests) {
          total++;
          try {
            await testItem.fn();
            passed++;
            console.log(`  ✔ ${testItem.name.replace(/\n/g, '\\n')}`);
          } catch (err) {
            failed++;
            console.error(`  ✖ ${testItem.name.replace(/\n/g, '\\n')}`);
            console.error(err);
          }
          // Yield to event loop for 10ms to allow GC, OS scheduling, and prevent system freeze
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        result.cleanup();
        // Yield 10ms between files
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (err) {
        console.error(`Failed to run file ${relPath}:`, err);
        console.log(`\nSummary: ${passed}/${Math.max(1, total)} passed, ${Math.max(1, failed)} failed`);
        process.exit(1);
      }
    }
    
    console.log(`\nSummary: ${passed}/${total} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
