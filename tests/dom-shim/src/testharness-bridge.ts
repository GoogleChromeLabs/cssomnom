/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import * as TypedOM from '../../../src/typed-om.ts';
import { CSSStyleDeclaration } from '../../../src/CSSStyleDeclaration.ts';
import { DOMMatrixReadOnly, DOMMatrix, DOMPointReadOnly, DOMPoint } from '../../../src/DOMMatrix.ts';
import {
  HarnessError,
  AssertionErrorProxy,
  OptionalFeatureUnsupportedError,
  messageOf,
  sanitize_unpaired_surrogates,
  get_test_name,
  WPT_ASSERTIONS
} from './wpt-assertions.ts';
import {
  FallbackRange,
  FallbackMutationObserver,
  createNavigatorPreferences,
  getMediaEnvForWindow
} from './dom-stubs.ts';

(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;
(globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = DOMMatrix;
(globalThis as unknown as { DOMPointReadOnly: unknown }).DOMPointReadOnly = DOMPointReadOnly;
(globalThis as unknown as { DOMPoint: unknown }).DOMPoint = DOMPoint;

export type WindowType = ReturnType<typeof parseHTML>['window'];
export type DocumentType = ReturnType<typeof parseHTML>['document'];

export type WptSandboxTest =
  | {
      type: 'setup';
      name: string;
      status?: number;
      message?: string | null;
      cleanups?: Function[];
      executed?: boolean;
      fn?: Function;
    }
  | {
      type: 'test';
      name: string;
      status?: number;
      message?: string | null;
      cleanups?: Function[];
      executed?: boolean;
      fn?: Function;
    }
  | {
      type: 'promise_test';
      name: string;
      status?: number;
      message?: string | null;
      cleanups?: Function[];
      executed?: boolean;
      fn?: Function;
    }
  | {
      type: 'async_test';
      name: string;
      status?: number;
      message?: string | null;
      cleanups?: Function[];
      executed?: boolean;
      fn?: Function;
      promise?: Promise<void>;
      resolve?: (() => void) | null;
      reject?: ((err: unknown) => void) | null;
    };

export const TYPED_OM_EXPORTS = Object.fromEntries(
  Object.entries(TypedOM).filter(([k]) => k !== 'CSSPositionValue')
);

export function createWptContext(
  window: WindowType,
  document: Partial<DocumentType>,
  tests: WptSandboxTest[]
): Record<string, unknown> {
  let nextRafId = 1;
  const activeRafs = new Map<number, NodeJS.Timeout>();
  const activeTimeouts = new Set<NodeJS.Timeout>();
  const activeIntervals = new Set<NodeJS.Timeout>();

  const win = window as unknown as Record<string, unknown>;

  const checkAutofocus = () => {
    const docObj = document as (Document & { activeElement?: unknown; querySelector?: (s: string) => Element | null }) | undefined;
    if (docObj && typeof docObj.querySelector === 'function' && !docObj.activeElement) {
      const autofocusEl = docObj.querySelector('[autofocus]');
      if (autofocusEl) {
        docObj.activeElement = autofocusEl;
      }
    }
  };
  checkAutofocus();

  const ctx: Record<string, unknown> = {
    // Expose elements with IDs as globals (must precede harness functions so IDs like id="test" don't clobber harness functions)
    ...(document.querySelectorAll ? Array.from(document.querySelectorAll('[id]')).reduce<Record<string, unknown>>((acc, el) => {
      const id = el.getAttribute('id');
      if (id) {
        acc[id] = el;
      }
      return acc;
    }, {}) : {}),

    window,
    document,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
    getComputedStyle: win.getComputedStyle,
    matchMedia: win.matchMedia,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    HTMLStyleElement: win.HTMLStyleElement,
    CSSStyleDeclaration: win.CSSStyleDeclaration || CSSStyleDeclaration,
    DOMException: win.DOMException,
    Event: win.Event,
    CustomEvent: win.CustomEvent,
    FocusEvent: win.FocusEvent,
    Range: win.Range || (globalThis as { Range?: unknown }).Range || FallbackRange,
    MutationObserver: win.MutationObserver || (globalThis as { MutationObserver?: unknown }).MutationObserver || FallbackMutationObserver,
    navigator: win.__navigator || { preferences: createNavigatorPreferences() },
    location: win.location || { href: 'http://localhost/test.html', origin: 'http://localhost' },
    ...TYPED_OM_EXPORTS,
    DOMMatrix: (globalThis as { DOMMatrix?: unknown }).DOMMatrix,
    DOMMatrixReadOnly: (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly,
    CSS: TypedOM.CSS,
    AssertionError: AssertionErrorProxy,
    OptionalFeatureUnsupportedError,

    // Timers
    setTimeout: (cb: Function, delay?: number, ...args: unknown[]) => {
      const timer = setTimeout(() => {
        activeTimeouts.delete(timer);
        try {
          cb(...args);
        } catch {}
      }, delay);
      activeTimeouts.add(timer);
      return timer;
    },
    clearTimeout: (timer: unknown) => {
      clearTimeout(timer as NodeJS.Timeout);
      activeTimeouts.delete(timer as NodeJS.Timeout);
    },
    setInterval: (cb: Function, delay?: number, ...args: unknown[]) => {
      const timer = setInterval(() => {
        try {
          cb(...args);
        } catch {}
      }, delay);
      activeIntervals.add(timer);
      return timer;
    },
    clearInterval: (timer: unknown) => {
      clearInterval(timer as NodeJS.Timeout);
      activeIntervals.delete(timer as NodeJS.Timeout);
    },
    requestAnimationFrame: (cb: (time: number) => void) => {
      const id = nextRafId++;
      const timer = setTimeout(() => {
        activeRafs.delete(id);
        try {
          checkAutofocus();
          const checkWindow = (w: Record<string, unknown>) => {
            const env = getMediaEnvForWindow(w);
            const prevW = w.__lastWidth as number | undefined;
            const prevH = w.__lastHeight as number | undefined;
            if (prevW !== undefined && prevH !== undefined && (prevW !== env.width || prevH !== env.height)) {
              w.__lastWidth = env.width;
              w.__lastHeight = env.height;
              const resizeEv = new ((w.Event as { new(t: string): Event }) || Event)('resize');
              if (typeof (w.dispatchEvent as (e: Event) => boolean) === 'function') {
                (w.dispatchEvent as (e: Event) => boolean).call(w, resizeEv);
              }
              if (w.__resizeListeners instanceof Set) {
                for (const l of w.__resizeListeners) {
                  try {
                    l.call(w, resizeEv);
                  } catch {}
                }
              }
              if (typeof (w as { onresize?: (e: Event) => void }).onresize === 'function') {
                try {
                  (w as { onresize: (e: Event) => void }).onresize(resizeEv);
                } catch {}
              }
            } else {
              w.__lastWidth = env.width;
              w.__lastHeight = env.height;
            }
            if (w.__activeMqls instanceof Set) {
              for (const m of w.__activeMqls) {
                if (typeof (m as { _checkChange?: () => void })._checkChange === 'function') {
                  (m as { _checkChange: () => void })._checkChange();
                }
              }
            }
          };

          checkWindow(window as unknown as Record<string, unknown>);
          const iframes = (window.document?.querySelectorAll ? Array.from(window.document.querySelectorAll('iframe')) : []) as unknown as Array<{ contentWindow?: unknown }>;
          for (const ifr of iframes) {
            if (ifr && ifr.contentWindow) {
              checkWindow(ifr.contentWindow as Record<string, unknown>);
            }
          }

          cb(performance.now());
        } catch {}
      }, 16);
      activeRafs.set(id, timer);
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      const timer = activeRafs.get(id);
      if (timer) {
        clearTimeout(timer);
        activeRafs.delete(id);
      }
    },
    __cleanup: () => {
      for (const timer of activeTimeouts) {
        clearTimeout(timer);
      }
      activeTimeouts.clear();
      for (const timer of activeIntervals) {
        clearInterval(timer);
      }
      activeIntervals.clear();
      for (const timer of activeRafs.values()) {
        clearTimeout(timer);
      }
      activeRafs.clear();
    },

    // Test lifecycle harness
    setup: (func_or_properties?: Function | { single_test?: boolean; allow_uncaught_exception?: boolean }, maybe_properties?: { single_test?: boolean; allow_uncaught_exception?: boolean }) => {
      let func: Function | null = null;
      let properties: { single_test?: boolean; allow_uncaught_exception?: boolean } = {};
      if (typeof func_or_properties === 'function') {
        func = func_or_properties;
        if (maybe_properties) properties = maybe_properties;
      } else if (func_or_properties) {
        properties = func_or_properties;
      }
      if (properties.single_test) {
        ctx.isSingleTest = true;
      }
      if (properties.allow_uncaught_exception) {
        ctx.allowUncaughtException = true;
      }
      if (func) {
        func();
      }
    },
    done: () => {
      ctx.harnessCompleted = true;
      if (tests.filter(t => t.type !== 'setup').length === 0) {
        ctx.harnessErrorStatus = 1; // ERROR
        ctx.harnessErrorMessage = 'done() called before any tests were defined';
      }
    },
    isSingleTest: false,
    allowUncaughtException: false,
    promiseSetupCalled: false,
    harnessCompleted: false,
    harnessAborted: false,
    harnessErrorStatus: undefined as number | undefined,
    harnessErrorMessage: undefined as string | null | undefined,

    promise_setup: (func: Function, properties: { single_test?: boolean; allow_uncaught_exception?: boolean } = {}) => {
      if (typeof func !== 'function') {
        throw new HarnessError('`promise_setup` invoked without a function');
      }
      ctx.promiseSetupCalled = true;
      tests.push({
        type: 'setup',
        name: 'promise_setup',
        fn: () => {
          (ctx.setup as Function)(properties);
          const result = func();
          if (!result || typeof result.then !== 'function') {
            throw new HarnessError('Non-thenable returned by function passed to `promise_setup`');
          }
          return result;
        }
      });
    },

    test: (func_or_name: Function | string, name?: string | Function) => {
      let fn: Function | null = null;
      let testName = 'anonymous-test';
      if (typeof func_or_name === 'function') {
        fn = func_or_name;
        testName = get_test_name(fn, typeof name === 'string' ? name : undefined, 'anonymous-test', tests);
      } else if (typeof func_or_name === 'string') {
        testName = func_or_name;
        if (typeof name === 'function') {
          fn = name;
        }
      }
      if (ctx.harnessCompleted || ctx.harnessAborted) {
        tests.push({
          type: 'test',
          name: sanitize_unpaired_surrogates(testName),
          status: 3, // NOTRUN
          message: 'Harness was aborted or completed before execution',
          executed: true
        });
        return;
      }
      if (ctx.promiseSetupCalled) {
        throw new HarnessError('subsequent invocation of test');
      }
      let status = 0; // PASS
      let message: string | null = null;
      let returnValue: unknown;
      const cleanups: Function[] = [];
      const testObj = {
        type: 'test' as const,
        name: sanitize_unpaired_surrogates(testName),
        cleanups,
        add_cleanup: (cleanFn: Function) => {
          cleanups.push(cleanFn);
        },
        step: (stepFn: Function) => stepFn(),
        step_timeout: (cb: Function, delay: number) => {
          return setTimeout(() => {
            try {
              cb();
            } catch (e) {
              status = 1;
              message = messageOf(e);
            }
          }, delay);
        },
        step_func: (stepFn?: Function) => {
          return function(this: unknown, ...args: unknown[]) {
            if (typeof stepFn === 'function') {
              return stepFn.apply(this, args);
            }
          };
        },
        step_func_done: (stepFn?: Function) => {
          return function(this: unknown, ...args: unknown[]) {
            if (typeof stepFn === 'function') {
              stepFn.apply(this, args);
            }
          };
        },
        unreached_func: (description?: string) => {
          return function() {
            assert.fail(`Unreached function called: ${description || 'unreached'}`);
          };
        },
        done: () => {}
      };

      if (fn) {
        try {
          returnValue = fn.call(testObj, testObj);
        } catch (err: unknown) {
          status = 1; // FAIL
          message = messageOf(err);
        } finally {
          for (const cleanFn of cleanups) {
            try {
              cleanFn();
            } catch (cleanErr: unknown) {
              ctx.harnessErrorStatus = 1;
              ctx.harnessErrorMessage = messageOf(cleanErr);
              ctx.harnessCompleted = true;
            }
          }
        }
      }

      tests.push({
        type: 'test',
        name: sanitize_unpaired_surrogates(testName),
        status,
        message,
        executed: true
      });

      if (returnValue !== undefined) {
        let msg = `Test named "${testName}" passed a function to \`test\` that returned a value.`;
        try {
          if (returnValue && typeof returnValue === 'object' && 'then' in returnValue && typeof (returnValue as Record<string, unknown>).then === 'function') {
            msg += ' Consider using `promise_test` instead when using Promises or async/await.';
          }
        } catch {}
        ctx.harnessErrorStatus = 1;
        ctx.harnessErrorMessage = msg;
        ctx.harnessCompleted = true;
      }
    },

    promise_test: (fn: Function, name?: string) => {
      const testName = get_test_name(fn, name, 'anonymous-test', tests);
      if (ctx.harnessCompleted || ctx.harnessAborted) {
        tests.push({
          type: 'promise_test',
          name: sanitize_unpaired_surrogates(testName),
          status: 3, // NOTRUN
          message: 'Harness was aborted or completed before execution',
          fn: () => Promise.resolve(),
          cleanups: [],
          executed: true
        });
        return;
      }
      tests.push({
        type: 'promise_test',
        name: sanitize_unpaired_surrogates(testName),
        fn,
        cleanups: []
      });
    },

    async_test: (func_or_name?: Function | string, name?: string | Function) => {
      let fn: Function | null = null;
      let testName = 'anonymous-test';
      if (typeof func_or_name === 'function') {
        fn = func_or_name;
        testName = get_test_name(fn, typeof name === 'string' ? name : undefined, 'anonymous-test', tests);
      } else if (typeof func_or_name === 'string') {
        testName = func_or_name;
        if (typeof name === 'function') {
          fn = name;
        }
      }
      if (ctx.harnessCompleted || ctx.harnessAborted) {
        tests.push({
          type: 'async_test',
          name: sanitize_unpaired_surrogates(testName),
          status: 3, // NOTRUN
          message: 'Harness was aborted or completed before execution',
          promise: Promise.resolve(),
          cleanups: [],
          executed: true
        });
        return;
      }
      if (ctx.promiseSetupCalled) {
        throw new HarnessError('subsequent invocation of async_test');
      }

      const testObj: WptSandboxTest = {
        type: 'async_test',
        name: sanitize_unpaired_surrogates(testName),
        status: 0,
        message: null,
        resolve: null,
        promise: undefined,
        cleanups: [],
        executed: true
      };

      testObj.promise = new Promise<void>((resolve, reject) => {
        testObj.resolve = resolve;
        testObj.reject = reject;
      });

      const tObj = {
        step: (stepFn: Function) => {
          try {
            if (typeof stepFn === 'function') {
              stepFn();
            }
          } catch (e: unknown) {
            testObj.status = 1; // FAIL
            testObj.message = messageOf(e);
            if (testObj.resolve) {
              testObj.resolve();
            }
          }
        },
        done: () => {
          if ((testObj as unknown as { completed?: boolean }).completed) return;
          (testObj as unknown as { completed?: boolean }).completed = true;
          const cleanups = testObj.cleanups || [];
          testObj.cleanups = [];
          for (const cleanFn of cleanups) {
            try {
              cleanFn();
            } catch {}
          }
          if (testObj.resolve) {
            testObj.resolve();
          }
        },
        step_func: (stepFn?: Function, this_obj?: unknown) => {
          return function(this: unknown, ...args: unknown[]) {
            return tObj.step(() => {
              if (typeof stepFn === 'function') {
                return stepFn.apply(this_obj !== undefined ? this_obj : (this !== undefined && this !== null && this !== globalThis ? this : tObj), args);
              }
            });
          };
        },
        step_func_done: (stepFn?: Function, this_obj?: unknown) => {
          return function(this: unknown, ...args: unknown[]) {
            tObj.step(() => {
              if (typeof stepFn === 'function') {
                stepFn.apply(this_obj !== undefined ? this_obj : (this !== undefined && this !== null && this !== globalThis ? this : tObj), args);
              }
            });
            tObj.done();
          };
        },
        step_timeout: (stepFn: Function, delay: number) => {
          return setTimeout(tObj.step_func(stepFn), delay);
        },
        add_cleanup: (cleanFn: Function) => {
          if (!testObj.cleanups) {
            testObj.cleanups = [];
          }
          testObj.cleanups.push(cleanFn);
        },
        unreached_func: (description?: string) => {
          return function() {
            assert.fail(`Unreached function called: ${description || 'unreached'}`);
          };
        }
      };

      let returnValue: unknown;
      if (fn) {
        try {
          returnValue = fn.call(tObj, tObj);
        } catch (err: unknown) {
          if (err instanceof HarnessError || (err && typeof err === 'object' && 'name' in err && (err as Record<string, unknown>).name === 'HarnessError')) {
            throw err;
          }
          testObj.status = 1; // FAIL
          testObj.message = messageOf(err);
          if (testObj.resolve) {
            testObj.resolve();
          }
        }
      }

      tests.push(testObj);

      if (returnValue !== undefined) {
        let msg = `Test named "${testName}" passed a function to \`async_test\` that returned a value.`;
        try {
          if (returnValue && typeof returnValue === 'object' && 'then' in returnValue && typeof (returnValue as Record<string, unknown>).then === 'function') {
            msg += ' Consider using `promise_test` instead when using Promises or async/await.';
          }
        } catch {}
        ctx.harnessErrorStatus = 1;
        ctx.harnessErrorMessage = msg;
        ctx.harnessCompleted = true;
      }

      return tObj;
    },

    _test_disabled_placeholder: (fn: Function, name: string) => {
      tests.push({ type: 'test', name, fn });
    },

    // Assertions
    ...WPT_ASSERTIONS
  };

  return ctx;
}
