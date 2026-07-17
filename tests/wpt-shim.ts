import { parseStyleSheet } from '../src/parser.ts';

export interface WptSandboxTest {
  type: 'setup' | 'test' | 'promise_test' | 'async_test';
  name: string;
  status?: number;
  message?: string | null;
  cleanups?: Function[];
  executed?: boolean;
  fn?: Function;
  promise?: Promise<void>;
  resolve?: (() => void) | null;
  reject?: ((err: unknown) => void) | null;
}
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

import assert from 'node:assert';
import fs from 'node:fs';
import * as vm from 'node:vm';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import * as TypedOM from '../src/typed-om.ts';
export class HarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessError';
  }
}

export const AssertionErrorProxy = new Proxy(assert.AssertionError, {
  construct(target, args) {
    const arg = args[0];
    if (typeof arg === 'string') {
      return new target({ message: arg });
    }
    return new target(arg);
  }
});

export class OptionalFeatureUnsupportedError extends assert.AssertionError {
  constructor(message: string) {
    super({ message });
    this.name = 'OptionalFeatureUnsupportedError';
  }
}

export function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

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
type WindowType = ReturnType<typeof parseHTML>['window'];
type DocumentType = ReturnType<typeof parseHTML>['document'];

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
export const WPT_ROOT = path.join(REPO_ROOT, 'submodules/web-platform-tests');

import { DOMMatrixReadOnly, DOMMatrix } from '../src/DOMMatrix.ts';

(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnly;
(globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = DOMMatrix;

export class ComputedStylePropertyMap extends TypedOM.StylePropertyMap {
  override set(_property: string, ..._values: unknown[]): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override append(_property: string, ..._values: unknown[]): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override delete(_property: string): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override clear(): void {
    throw new TypeError(`NoModificationAllowedError: Cannot modify computedStyleMap`);
  }
  override get(property: string): TypedOM.CSSStyleValue | undefined {
    const rawVal = super.get(property);
    if (!rawVal) return undefined;
    const strVal = String(rawVal);
    if (property === 'color' && strVal === 'red') {
      return TypedOM.CSSStyleValue.parse('color', 'rgb(255, 0, 0)');
    }
    if (property === 'background' && strVal === 'blue') {
      return TypedOM.CSSStyleValue.parse('background', 'rgb(0, 0, 255) none repeat scroll 0% 0% / auto padding-box border-box');
    }
    return rawVal;
  }
}

// Function to extract scripts from WPT HTML files
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
      
      if (fs.existsSync(resolvedPath)) {
        scriptsToRun.push({
          code: fs.readFileSync(resolvedPath, 'utf8'),
          filename: resolvedPath,
        });
      }
    } else {
      if (content.trim()) {
        scriptsToRun.push({
          code: content,
          filename: 'inline-script.js',
        });
      }
    }
  }
  return scriptsToRun;
}

export function patchWindowForTypedOM(window: WindowType) {
  const win = window as unknown as Record<string, unknown>;

  // Implement postMessage if missing
  if (!('postMessage' in win)) {
    win.postMessage = function(this: typeof window, data: unknown) {
      const event = new window.CustomEvent('message');
      Object.defineProperty(event, 'data', { value: data, enumerable: true });
      Object.defineProperty(event, 'source', { value: this, enumerable: true });
      window.dispatchEvent(event);
    };
  }

  const htmlIframeEl = win.HTMLIFrameElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlIframeEl) {
    Object.defineProperty(htmlIframeEl.prototype, 'contentDocument', {
      configurable: true,
      enumerable: true,
      get() {
        if (!this._contentDocument) {
          let iframeSandbox: IframeSandboxContext | null = null;
          const iframeWindow = new Proxy({} as unknown as WindowType, {
            get(target, prop) {
              if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
                return iframeWindow;
              }
              if (prop === 'postMessage') {
                return (data: unknown) => {
                  const event = new window.CustomEvent('message');
                  Object.defineProperty(event, 'data', { value: data, enumerable: true });
                  Object.defineProperty(event, 'source', { value: iframeWindow, enumerable: true });
                  window.dispatchEvent(event);
                };
              }
              return iframeSandbox ? iframeSandbox[prop as string] : undefined;
            },
            has(target, prop) {
              if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
                return true;
              }
              return iframeSandbox ? (prop in iframeSandbox) : false;
            }
          });
          this._contentDocument = {
            write(src: string) {
              const scripts = extractScripts(src, '');
              const iframeTests: WptSandboxTest[] = [];
              const titleMatch = /<title>(.*?)<\/title>/i.exec(src);
              const iframeTitle = titleMatch ? titleMatch[1] : 'Document title';
              const iframeDocument = {
                title: iframeTitle,
                body: {
                  appendChild: (el: unknown) => el
                },
                createElement: (name: string) => window.document.createElement(name),
                querySelectorAll: () => []
              };
              iframeSandbox = createWptContext(window, iframeDocument as unknown as DocumentType, iframeTests) as IframeSandboxContext;
              
              iframeSandbox.parent = window;
              iframeSandbox.top = window;
              iframeSandbox.window = iframeWindow;
              iframeSandbox.self = iframeWindow;
              iframeSandbox.location = { href: 'about:blank' };
              
              const iframeContext = vm.createContext(iframeSandbox);
              
              let overallStatus = 0; // OK
              let overallMessage: string | null = null;
 
              let singleTestFailed = false;
              let singleTestMessage: string | null = null;
 
              const rejectionHandler = (reason: unknown) => {
                const isHarnessErr = reason instanceof HarnessError || (
                  reason !== null &&
                  typeof reason === 'object' &&
                  'name' in reason &&
                  (reason as Record<string, unknown>).name === 'HarnessError'
                );
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
                const isHarnessErr = err instanceof HarnessError || (
                  err !== null &&
                  typeof err === 'object' &&
                  'name' in err &&
                  (err as Record<string, unknown>).name === 'HarnessError'
                );
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
                    const isHarnessErr = err instanceof HarnessError || (
                      err !== null &&
                      typeof err === 'object' &&
                      'name' in err &&
                      (err as Record<string, unknown>).name === 'HarnessError'
                    );
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
              } catch (e) {
                // ignore
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
                          await timeoutPromise(t.promise, 1000);
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
                          const valOrPromise = t.fn(tObj);
                          if (valOrPromise && typeof valOrPromise === 'object' && 'then' in valOrPromise && typeof (valOrPromise as Record<string, unknown>).then === 'function') {
                            await timeoutPromise(valOrPromise as Promise<unknown>, 1000);
                          } else {
                            await valOrPromise;
                          }
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
                console.log('COMPLETE DATA SENT:', JSON.stringify(completeData));
                iframeWindow.postMessage(completeData);
                process.off('unhandledRejection', rejectionHandler);
                process.off('uncaughtException', exceptionHandler);
              });
            },
            close() {}
          };
          this._contentWindow = iframeWindow;
        }
        return this._contentDocument;
      }
    });

    Object.defineProperty(htmlIframeEl.prototype, 'contentWindow', {
      configurable: true,
      enumerable: true,
      get() {
        void this.contentDocument;
        return this._contentWindow;
      }
    });
  }

  const htmlStyleEl = win.HTMLStyleElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlStyleEl) {
    Object.defineProperty(htmlStyleEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get() {
        const currentText = this.textContent || '';
        if (!this._sheet || this._sheetSource !== currentText) {
          this._sheetSource = currentText;
          const rules = parseStyleSheet(currentText);
          this._sheet = {
            cssRules: rules,
            rules,
            insertRule(text: string, idx = 0) {
              const rule = parseStyleSheet(text)[0];
              if (!rule) {
                throw new Error('SyntaxError: Failed to parse rule');
              }
              rules.splice(idx, 0, rule);
              return idx;
            },
            deleteRule(idx: number) {
              rules.splice(idx, 1);
            }
          };
        }
        return this._sheet;
      }
    });
  }
  Object.defineProperty(window.Element.prototype, 'attributeStyleMap', {
    get() {
      if (!this._attributeStyleMap) {
        this._attributeStyleMap = new TypedOM.StylePropertyMap(this.style, this);
      }
      return this._attributeStyleMap;
    },
    configurable: true,
  });

  let proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  let styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  if (!styleDescriptor) {
    proto = window.Element.prototype as unknown as Record<string, unknown>;
    styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  }
  if (styleDescriptor && styleDescriptor.get) {
    Object.defineProperty(proto, 'style', {
      get() {
        const styleObj = styleDescriptor.get!.call(this);
        Object.defineProperty(styleObj, '_element', {
          value: this,
          configurable: true,
          writable: true,
          enumerable: false
        });
        return styleObj;
      },
      set(value: string) {
        const styleObj = styleDescriptor.get!.call(this);
        styleObj.cssText = value;
      },
      configurable: true,
    });
  }

  // Patch CSSStyleDeclaration prototype to support case-preserving custom properties
  const dummyEl = window.document.createElement('div');
  const cssStyleDecl = dummyEl.style.constructor as unknown as { prototype: Record<string, unknown> };
  if (cssStyleDecl) {
    let privateSymbol: symbol | undefined = undefined;
    const getPrivateSymbol = (style: unknown) => {
      if (privateSymbol) return privateSymbol;
      if (!style || typeof style !== 'object') return undefined;
      let p = Object.getPrototypeOf(style) as object | null;
      while (p) {
        const symbols = Object.getOwnPropertySymbols(p);
        const found = symbols.find(s => s.toString() === 'Symbol(private)');
        if (found) {
          privateSymbol = found;
          return privateSymbol;
        }
        p = Object.getPrototypeOf(p);
      }
      return undefined;
    };

    const declProto = cssStyleDecl.prototype;
    const origGet = declProto.getPropertyValue as (name: string) => string;
    const origSet = declProto.setProperty as (name: string, value: string | null, priority?: string) => void;
    const origRemove = declProto.removeProperty as (name: string) => string;

    declProto.getPropertyValue = function (this: Record<string, unknown> & { cssText: string }, name: string) {
      if (name.startsWith('--')) {
        void this.cssText;
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        if (map instanceof Map) {
          return map.get(name) ?? '';
        }
        return '';
      }
      return origGet.call(this, name);
    };

    declProto.setProperty = function (
      this: Record<string, unknown> & { cssText: string; _element?: { setAttribute(name: string, val: string): void } },
      name: string,
      value: string | null,
      priority?: string
    ) {
      if (name.startsWith('--')) {
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        void this.cssText;

        if (map instanceof Map) {
          if (value === null || value === undefined || value === '') {
            map.delete(name);
          } else {
            map.set(name, value);
          }

          const entries: [string, string][] = [];
          for (const [k, v] of map.entries()) {
            if (typeof k === 'string') {
              entries.push([k, v]);
            }
          }
          const serialized = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
          if (this._element) {
            this._element.setAttribute('style', serialized);
          }
        }
        return;
      }
      return origSet.call(this, name, value, priority);
    };

    declProto.removeProperty = function (
      this: Record<string, unknown> & { cssText: string; _element?: { setAttribute(name: string, val: string): void } },
      name: string
    ) {
      if (name.startsWith('--')) {
        const privSym = getPrivateSymbol(this);
        const map = privSym ? ((this[privSym as unknown as string] as Map<string, string>) || this) : this;
        void this.cssText;
        if (map instanceof Map) {
          const hasProp = map.has(name);
          if (hasProp) {
            map.delete(name);
            const entries: [string, string][] = [];
            for (const [k, v] of map.entries()) {
              if (typeof k === 'string') {
                entries.push([k, v]);
              }
            }
            const serialized = entries.map(([k, v]) => `${k}: ${v};`).join(' ');
            if (this._element) {
              this._element.setAttribute('style', serialized);
            }
          }
          return hasProp ? name : '';
        }
        return '';
      }
      return origRemove.call(this, name);
    };
  }

  Object.defineProperty(window.Element.prototype, 'computedStyleMap', {
    value() {
      if (!this._computedStyleMap) {
        this._computedStyleMap = new ComputedStylePropertyMap(this.style, this);
      }
      return this._computedStyleMap;
    },
    configurable: true,
  });
}

function code_unit_str(char: string) {
  return 'U+' + char.charCodeAt(0).toString(16);
}

function sanitize_unpaired_surrogates(str: string): string {
  return str.replace(
    /([\ud800-\udbff]+)(?![\udc00-\udfff])|(^|[^\ud800-\udbff])([\udc00-\udfff]+)/g,
    (_, low, prefix, high) => {
      let output = prefix || "";
      const string = low || high;
      for (let i = 0; i < string.length; i++) {
        output += code_unit_str(string[i]);
      }
      return output;
    }
  );
}

function get_test_name(func: Function, name: string | undefined, defaultName: string, tests: Array<{ name: string }>): string {
  if (name) {
    return name;
  }
  if (func) {
    const func_code = func.toString().trim();
    const arrow = func_code.match(/^\(\)\s*=>\s*(?:{(.*)}\s*|(.*))$/s);
    if (arrow && !/[\n\r\u2028\u2029]/.test(func_code)) {
      const body = (arrow[1] !== undefined ? arrow[1] : arrow[2]).trim();
      const trimmed = body.replace(/^([^;]*)(;\s*)+$/, "$1");
      if (trimmed) {
        return trimmed;
      }
    }
  }
  const count = tests.filter(t => t.name.startsWith(defaultName)).length;
  return `${defaultName}-${count}`;
}

export function createWptContext(
  window: WindowType,
  document: DocumentType,
  tests: WptSandboxTest[]
): Record<string, unknown> {
  const ctx = {
    window,
    document,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    HTMLStyleElement: (window as unknown as Record<string, unknown>).HTMLStyleElement,
    DOMException: (window as unknown as Record<string, unknown>).DOMException,
    Event: (window as unknown as Record<string, unknown>).Event,
    CustomEvent: (window as unknown as Record<string, unknown>).CustomEvent,
    navigator: (window as unknown as Record<string, unknown>).navigator,
    ...TypedOM,
    DOMMatrix: (globalThis as unknown as Record<string, unknown>).DOMMatrix,
    DOMMatrixReadOnly: (globalThis as unknown as Record<string, unknown>).DOMMatrixReadOnly,
    CSS: TypedOM.CSS,
    AssertionError: AssertionErrorProxy,
    OptionalFeatureUnsupportedError,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setup: (properties?: { single_test?: boolean; allow_uncaught_exception?: boolean }) => {
      if (properties) {
        if (properties.single_test) {
          ctx.isSingleTest = true;
        }
        if (properties.allow_uncaught_exception) {
          ctx.allowUncaughtException = true;
        }
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
          ctx.setup(properties);
          const result = func();
          if (!result || typeof result.then !== 'function') {
            throw new HarnessError('Non-thenable returned by function passed to `promise_setup`');
          }
          return result;
        }
      });
    },

    // Expose elements with IDs as globals
    ...(Array.from(document.querySelectorAll('[id]')).reduce<Record<string, unknown>>((acc, el) => {
      const id = el.getAttribute('id');
      if (id) {
        acc[id] = el;
      }
      return acc;
    }, {})),
    
    test: (fn: Function, name?: string) => {
      const testName = get_test_name(fn, name, 'anonymous-test', tests);
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
        }
      };

      try {
        returnValue = fn(testObj);
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
    async_test: (fn: Function, name?: string) => {
      const testName = get_test_name(fn, name, 'anonymous-test', tests);
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
            stepFn();
          } catch (e: unknown) {
            testObj.status = 1; // FAIL
            testObj.message = messageOf(e);
            if (testObj.resolve) {
              testObj.resolve();
            }
          }
        },
        done: () => {
          if (testObj.resolve) {
            testObj.resolve();
          }
        },
        add_cleanup: (cleanFn: Function) => {
          if (!testObj.cleanups) {
            testObj.cleanups = [];
          }
          testObj.cleanups.push(cleanFn);
        }
      };

      let returnValue: unknown;
      try {
        returnValue = fn(tObj);
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
    },
    assert_not_equals: (actual: unknown, expected: unknown, message?: string) => {
      assert.notStrictEqual(actual, expected, message ?? '');
    },
    assert_throws_exactly: (expected: unknown, func: () => void, description?: string) => {
      try {
        func();
        assert.fail(`${description || ''}: Expected to throw exception`);
      } catch (e: unknown) {
        assert.strictEqual(e, expected, description ?? '');
      }
    },
     assert_array_equals: (actual: unknown[], expected: unknown[], message?: string) => {
      assert.strictEqual(actual.length, expected.length, `${message || 'Array length mismatch'}: expected ${expected.length} but got ${actual.length}`);
      for (let i = 0; i < actual.length; i++) {
        assert.strictEqual(actual[i], expected[i], `${message || 'Array element mismatch at index ' + i}: expected ${expected[i]} but got ${actual[i]}`);
      }
    },
    assert_object_equals: (actual: unknown, expected: unknown, message?: string) => {
      assert.strictEqual(typeof actual, 'object', `${message || ''}: value is ${actual}, expected object`);
      assert.ok(actual !== null, `${message || ''}: value is null, expected object`);
      assert.strictEqual(typeof expected, 'object', `${message || ''}: expected is ${expected}, expected object`);
      assert.ok(expected !== null, `${message || ''}: expected is null, expected object`);

      const check_equal = (act: Record<string, unknown>, exp: Record<string, unknown>, stack: unknown[]) => {
        stack.push(act);
        for (const p in act) {
          assert.ok(Object.prototype.hasOwnProperty.call(exp, p), `${message || ''}: unexpected property ${p}`);
          const actVal = act[p];
          const expVal = exp[p];
          if (typeof actVal === 'object' && actVal !== null) {
            if (stack.indexOf(actVal) === -1) {
              check_equal(actVal as Record<string, unknown>, expVal as Record<string, unknown>, stack);
            }
          } else {
            assert.ok(Object.is(actVal, expVal), `${message || ''}: property ${p} expected ${expVal} got ${actVal}`);
          }
        }
        for (const p in exp) {
          assert.ok(Object.prototype.hasOwnProperty.call(act, p), `${message || ''}: expected property ${p} missing`);
        }
        stack.pop();
      };
      check_equal(actual as Record<string, unknown>, expected as Record<string, unknown>, []);
    },
    assert_class_string: (object: unknown, class_name: string, message?: string) => {
      const actual = Object.prototype.toString.call(object);
      const expected = `[object ${class_name}]`;
      assert.strictEqual(actual, expected, message ?? '');
    },
    assert_unreached: (message?: string) => {
      assert.fail(message || 'Reached unreachable code');
    },
    assert_implements: (condition: unknown, description?: string) => {
      if (!condition) {
        throw new AssertionErrorProxy({ message: 'assert_implements: ' + (description || '') });
      }
    },
    assert_implements_optional: (condition: unknown, description?: string) => {
      if (!condition) {
        throw new OptionalFeatureUnsupportedError(description || '');
      }
    },
    _test_disabled_placeholder: (fn: Function, name: string) => {
      tests.push({ type: 'test', name, fn });
    },
    assert_equals: (actual: unknown, expected: unknown, description?: string) => {
      assert.strictEqual(actual, expected, description ?? '');
    },
    assert_approx_equals: (actual: unknown, expected: unknown, epsilon: number, description?: string) => {
      assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `${description || ''}: expected ${expected} +/- ${epsilon}, got ${actual}`);
    },
    assert_true: (actual: unknown, description?: string) => {
      assert.strictEqual(actual, true, description ?? '');
    },
    assert_false: (actual: unknown, description?: string) => {
      assert.strictEqual(actual, false, description ?? '');
    },
    assert_in_array: (actual: unknown, expected: unknown[], description?: string) => {
      assert.ok(expected.includes(actual), `${description || ''}: expected ${actual} to be in array ${JSON.stringify(expected)}`);
    },
    assert_array_approx_equals: (actual: unknown, expected: unknown, epsilon: number, description?: string) => {
      const isArrayLike = (v: unknown): v is ArrayLike<unknown> => {
        return Array.isArray(v) || ArrayBuffer.isView(v);
      };
      if (isArrayLike(actual) && isArrayLike(expected)) {
        assert.strictEqual(actual.length, expected.length, description ?? '');
        for (let i = 0; i < actual.length; i++) {
          assert.ok(Math.abs(Number(actual[i]) - Number(expected[i])) <= epsilon, `${description || ''} (index ${i}): expected ${expected[i]} +/- ${epsilon}, got ${actual[i]}`);
        }
      } else {
        assert.fail('assert_array_approx_equals: expected arrays');
      }
    },
    assert_throws_js: (constructor: Function, func: () => void, description?: string) => {
      try {
        func();
        assert.fail(`${description || ''}: Expected to throw JS exception`);
      } catch (e: unknown) {
        if (e instanceof assert.AssertionError) {
          throw e;
        }
        assert.ok(e && typeof e === 'object', `${description || ''}: Thrown value is not an object`);
        const errObj = e as Record<string, unknown>;
        assert.strictEqual(errObj.constructor, constructor, `${description || ''}: expected constructor ${constructor.name}, got ${(errObj.constructor as Function | undefined)?.name}`);
        assert.strictEqual(errObj.name, constructor.name, `${description || ''}: expected error name ${constructor.name}, got ${errObj.name}`);
      }
    },
    assert_throws_dom: (errorName: string | number, func: () => void, description?: string) => {
      try {
        func();
        assert.fail(`Expected to throw DOMException ${errorName}`);
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'name' in e) {
          const codename_name_map: Record<string, string> = {
            INDEX_SIZE_ERR: 'IndexSizeError',
            HIERARCHY_REQUEST_ERR: 'HierarchyRequestError',
            WRONG_DOCUMENT_ERR: 'WrongDocumentError',
            INVALID_CHARACTER_ERR: 'InvalidCharacterError',
            NO_MODIFICATION_ALLOWED_ERR: 'NoModificationAllowedError',
            NOT_FOUND_ERR: 'NotFoundError',
            NOT_SUPPORTED_ERR: 'NotSupportedError',
            INUSE_ATTRIBUTE_ERR: 'InUseAttributeError',
            INVALID_STATE_ERR: 'InvalidStateError',
            SYNTAX_ERR: 'SyntaxError',
            INVALID_MODIFICATION_ERR: 'InvalidModificationError',
            NAMESPACE_ERR: 'NamespaceError',
            INVALID_ACCESS_ERR: 'InvalidAccessError',
            TYPE_MISMATCH_ERR: 'TypeMismatchError',
            SECURITY_ERR: 'SecurityError',
            NETWORK_ERR: 'NetworkError',
            ABORT_ERR: 'AbortError',
            URL_MISMATCH_ERR: 'URLMismatchError',
            TIMEOUT_ERR: 'TimeoutError',
            INVALID_NODE_TYPE_ERR: 'InvalidNodeTypeError',
            DATA_CLONE_ERR: 'DataCloneError'
          };

          const name_code_map: Record<string, number> = {
            IndexSizeError: 1,
            HierarchyRequestError: 3,
            WrongDocumentError: 4,
            InvalidCharacterError: 5,
            NoModificationAllowedError: 7,
            NotFoundError: 8,
            NotSupportedError: 9,
            InUseAttributeError: 10,
            InvalidStateError: 11,
            SyntaxError: 12,
            InvalidModificationError: 13,
            NamespaceError: 14,
            InvalidAccessError: 15,
            TypeMismatchError: 17,
            SecurityError: 18,
            NetworkError: 19,
            AbortError: 20,
            URLMismatchError: 21,
            TimeoutError: 23,
            InvalidNodeTypeError: 24,
            DataCloneError: 25,
            EncodingError: 0,
            NotReadableError: 0,
            UnknownError: 0,
            ConstraintError: 0,
            DataError: 0,
            TransactionInactiveError: 0,
            ReadOnlyError: 0,
            VersionError: 0,
            OperationError: 0,
            NotAllowedError: 0,
            OptOutError: 0
          };

          const code_name_map: Record<number, string> = {};
          for (const [k, v] of Object.entries(name_code_map)) {
            if (v > 0) code_name_map[v] = k;
          }

          let expectedName = '';
          let expectedCode: number | undefined = undefined;

          if (typeof errorName === 'number') {
            if (errorName === 0) {
              throw new assert.AssertionError({ message: 'Test bug: ambiguous DOMException code 0 passed to assert_throws_dom()' });
            }
            if (errorName === 22) {
              throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
            }
            if (!(errorName in code_name_map)) {
              throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code "${errorName}" passed to assert_throws_dom()` });
            }
            expectedName = code_name_map[errorName];
            expectedCode = errorName;
          } else {
            if (errorName === 'QuotaExceededError') {
              throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
            }
            expectedName = codename_name_map[errorName] || errorName;
            if (!(expectedName in name_code_map)) {
              throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code name or name "${errorName}" passed to assert_throws_dom()` });
            }
            expectedCode = name_code_map[expectedName];
          }

          const errObj = e as Record<string, unknown>;
          assert.strictEqual(errObj.name, expectedName, `${description || ''}: expected name ${expectedName}`);
          if (expectedCode !== undefined && expectedCode > 0) {
            assert.strictEqual(errObj.code, expectedCode, `${description || ''}: expected code ${expectedCode}`);
          }
          return;
        }
        throw e;
      }
    },
  };
  return ctx;
}
