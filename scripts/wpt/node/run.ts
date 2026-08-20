/** MANDATORY INVOCATION FLAG: Always run this file with `node --max-old-space-size=512 scripts/wpt/node/run.ts <file>` to enforce a 512MB heap limit and prevent unconstrained memory growth. */
/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */


import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM, createWptContext, format_value, type WptSandboxTest } from '../../../tests/wpt-shim.ts';
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

const JS_INTRINSICS = new Set([
  'Array',
  'Object',
  'Function',
  'Promise',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'URIError',
  'EvalError',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'RegExp',
  'Date',
  'Math',
  'JSON',
  'Symbol',
  'BigInt',
  'ArrayBuffer',
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'DataView',
  'Proxy',
  'Reflect',
  'Iterator',
  'AsyncIterator',
  'module',
  'exports',
  'require',
  'global',
  'process',
  'Buffer',
  'clearImmediate',
  'setImmediate'
]);

const SAFE_HOST_APIS = new Set([
  'console',
  'crypto',
  'performance',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'queueMicrotask',
  'structuredClone',
  'btoa',
  'atob',
  'fetch',
  'Response',
  'Request',
  'Headers',
  'AbortController',
  'AbortSignal'
]);

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
  (dom.document as unknown as { _htmlDir?: string })._htmlDir = path.dirname(path.resolve(filePath));
  (win as unknown as { _htmlDir?: string })._htmlDir = path.dirname(path.resolve(filePath));
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const sandbox = createWptContext(win, dom.document, tests);

  // Copy linkedom window properties to sandbox, filtering out JS_INTRINSICS
  const winObj = win as unknown as Record<string, unknown>;
  const windowKeys = Object.getOwnPropertyNames(win);
  for (const key of windowKeys) {
    if (JS_INTRINSICS.has(key)) continue;
    try {
      if (!(key in sandbox)) { sandbox[key] = winObj[key]; }
    } catch {
      // Ignore getter errors
    }
  }

  // Intercept relative /interfaces/*.idl fetch calls
  sandbox.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as { url?: string }).url || '';
    if (urlStr.startsWith('/interfaces/')) {
      const idlFileName = urlStr.slice('/interfaces/'.length);
      const fullPath = path.join(WPT_ROOT, 'interfaces', idlFileName);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
          text: async () => content,
          json: async () => JSON.parse(content)
        } as unknown as Response;
      }
    }
    return fetch(input as unknown as RequestInfo, init);
  };

  // Expose Window and format_value on sandbox
  sandbox.Window = win.Window || (win as unknown as { constructor: unknown }).constructor || (globalThis as unknown as Record<string, unknown>).Window;
  sandbox.format_value = (sandbox as { format_value?: unknown }).format_value || format_value;

  let contextRealm: Record<string, unknown> | undefined;

  const windowProxy: unknown = new Proxy(winObj, {
    get(target, prop) {
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
        return windowProxy;
      }
      if (prop === 'navigator') {
        return sandbox.navigator;
      }
      if (typeof prop === 'string') {
        if (JS_INTRINSICS.has(prop)) {
          if (contextRealm && prop in contextRealm) {
            return Reflect.get(contextRealm, prop);
          }
        }
        if (prop in sandbox) {
          return Reflect.get(sandbox, prop);
        }
        if (SAFE_HOST_APIS.has(prop)) {
          return Reflect.get(globalThis, prop);
        }
        const val = target[prop];
        if (val !== undefined) {
          if (typeof val === 'function') {
            if (val.prototype && val.prototype.constructor === val) {
              return val;
            }
            return val.bind(target);
          }
          return val;
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
        if (JS_INTRINSICS.has(prop)) return true;
        if (prop in sandbox) return true;
        if (SAFE_HOST_APIS.has(prop)) return true;
        return (target[prop] !== undefined) || (Boolean(dom.document?.getElementById?.(prop)));
      }
      return prop in sandbox;
    },
    set(target, prop, value) {
      if (typeof prop === 'string' && target[prop] !== undefined) {
        try {
          if (Reflect.set(target, prop, value)) return true;
        } catch {}
      }
      return Reflect.set(sandbox, prop as string, value);
    },
    getOwnPropertyDescriptor(target, prop) {
      const targetDesc = Object.getOwnPropertyDescriptor(target, prop);
      if (targetDesc && !targetDesc.configurable) {
        return targetDesc;
      }
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
        return { value: windowProxy, writable: true, enumerable: false, configurable: true };
      }
      if (typeof prop === 'string') {
        if (JS_INTRINSICS.has(prop) && contextRealm && prop in contextRealm) {
          return { value: contextRealm[prop], writable: true, enumerable: false, configurable: true };
        }
        if (prop in sandbox) {
          return { value: sandbox[prop], writable: true, enumerable: false, configurable: true };
        }
        if (SAFE_HOST_APIS.has(prop) && prop in globalThis) {
          return { value: (globalThis as unknown as Record<string, unknown>)[prop], writable: true, enumerable: false, configurable: true };
        }
        if (targetDesc) {
          return targetDesc;
        }
        if (prop in target) {
          return { value: target[prop], writable: true, enumerable: false, configurable: true };
        }
        if (dom.document && typeof dom.document.getElementById === 'function') {
          const el = dom.document.getElementById(prop);
          if (el) {
            return { value: el, writable: true, enumerable: false, configurable: true };
          }
        }
      }
      return undefined;
    },
    ownKeys(target) {
      return Array.from(new Set([
        ...Reflect.ownKeys(target),
        ...Reflect.ownKeys(sandbox),
        ...(contextRealm ? Reflect.ownKeys(contextRealm) : [])
      ]));
    }
  });

  // Ensure standard aliases and JS primitives are present
  sandbox.window = windowProxy;
  sandbox.document = dom.document;
  sandbox.globalThis = windowProxy;
  sandbox.self = windowProxy;

  // Copy common globals explicitly if they are on window
  const commonGlobals = [
    'Window',
    'Document',
    'DocumentFragment',
    'ProcessingInstruction',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLStyleElement',
    'SVGElement',
    'CharacterData',
    'Comment',
    'Text',
    'Attr',
    'DocumentType',
    'DOMException',
    'Event',
    'CustomEvent',
    'customElements',
    'MutationObserver',
    'navigator',
    'location',
    'history',
    'getComputedStyle',
    'matchMedia',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ];
  for (const g of commonGlobals) {
    const val = winObj[g] ?? (win as unknown as Record<string, unknown>)[g];
    if (val !== undefined && !(g in sandbox)) {
      if (typeof val === 'function' && (!val.prototype || val.prototype.constructor !== val)) {
        sandbox[g] = (val as Function).bind(winObj);
      } else {
        sandbox[g] = val;
      }
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



  const htmlDir = path.dirname(filePath);
  (dom.document as unknown as { _htmlDir?: string })._htmlDir = htmlDir;

  (winObj as unknown as { __sandbox?: Record<string, unknown> }).__sandbox = sandbox;
  if (dom.document) {
    (dom.document as unknown as { __sandbox?: Record<string, unknown> }).__sandbox = sandbox;
  }

  const context = vm.createContext(sandbox);
  contextRealm = vm.runInContext('this', context) as Record<string, unknown>;

  const cleanup = () => {
    (winObj as unknown as { __sandbox?: unknown }).__sandbox = undefined;
    if (dom.document) {
      (dom.document as unknown as { __sandbox?: unknown }).__sandbox = undefined;
    }
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
    const onloadFn = (sandbox as { onload?: (e: unknown) => void }).onload || (win as unknown as { onload?: (e: unknown) => void }).onload;
    if (typeof onloadFn === 'function') {
      try { onloadFn(new win.Event('load')); } catch {}
    }
  } catch (err) {
    console.error("Failed to dispatch load event:", err);
  }

  function wrapTest(t: WptSandboxTest): WptTest {
    if (t.executed) {
      const wrappedFn = async () => {
        if ('promise' in t && t.promise) {
          let timeoutId: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Async test timed out')), 500);
          });
          try {
            await Promise.race([t.promise, timeoutPromise]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
        if ((t.status ?? 0) !== 0) {
          throw new Error(t.message || `Test failed with status ${t.status}`);
        }
      };
      return { name: t.name, fn: wrappedFn, isAsync: 'promise' in t && !!t.promise };
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
    return { name: t.name, fn: wrappedFn, isAsync: false };
  }

  const testQueue: WptTest[] = new Proxy([] as WptTest[], {
    get(target, prop) {
      if (prop === 'length') return tests.length;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const idx = Number(prop);
        if (idx < tests.length) {
          return wrapTest(tests[idx]);
        }
      }
      if (prop === Symbol.iterator) {
        return function* () {
          let i = 0;
          while (i < tests.length) {
            yield wrapTest(tests[i]);
            i++;
          }
        };
      }
      return Reflect.get(target, prop);
    }
  });

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
  if (!process.execArgv.some(arg => arg.startsWith('--max-old-space-size'))) {
    console.error('\x1b[31m[Fatal Error] scripts/wpt/node/run.ts MUST be executed with `--max-old-space-size=512` (e.g. `node --max-old-space-size=512 scripts/wpt/node/run.ts <file>`). Aborting to prevent unconstrained memory growth.\x1b[0m');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/wpt/node/run.ts <wpt-html-file-paths...>');
    process.exit(1);
  }
  
  (async () => {
    // Master fail-safe timeout: exit process after 240000ms to prevent orphaned background hangs
    setTimeout(() => {
      console.error("Runner timed out after 240000ms (self-termination fail-safe).");
      process.exit(1);
    }, 240000).unref();

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
        }
        result.cleanup();
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
