/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM, createWptContext } from './wpt-shim.ts';
import type { WptSandboxTest } from './wpt-shim.ts';
import { StylePropertyMapReadOnly } from '../src/typed-om.ts';

test('window.getComputedStyle in sandbox shim', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><div id="test" style="color: red;"></div></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  assert.ok('getComputedStyle' in win, 'getComputedStyle should be in win');
  const el = win.document.getElementById('test')!;
  const style = win.getComputedStyle(el);
  assert.ok(style, 'getComputedStyle(el) should return style');
  assert.strictEqual(style.color, 'red');

  // styleMap on computed style is a StylePropertyMapReadOnly
  assert.ok('styleMap' in style, 'styleMap should be in style');
  const styleMap = (style as Record<string, unknown>).styleMap as StylePropertyMapReadOnly;
  assert.ok(styleMap, 'styleMap should be defined');
  assert.strictEqual(styleMap.get('color')?.toString(), 'rgb(255, 0, 0)'); // computed map maps red to rgb(255, 0, 0) in our mock ComputedStylePropertyMap
});

test('document.styleSheets in sandbox shim', () => {
  const dom = parseHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          div { color: blue; }
        </style>
        <style>
          span { color: green; }
        </style>
      </head>
      <body></body>
    </html>
  `);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const doc = win.document;
  assert.ok('styleSheets' in doc, 'styleSheets should be in document');
  const sheets = doc.styleSheets;
  assert.strictEqual(sheets.length, 2);
  assert.ok(sheets[0]);
  assert.ok(sheets[1]);
  assert.ok(sheets[0].cssRules);
  assert.strictEqual(sheets[0].cssRules.length, 1);
  assert.strictEqual(sheets[0].cssRules[0].cssText.replace(/\s+/g, ''), 'div{color:blue;}');
});

test('window.matchMedia in sandbox shim', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  assert.ok('matchMedia' in win, 'matchMedia should be in win');
  const mql = win.matchMedia('(max-width: 600px)');
  assert.ok(mql);
  assert.strictEqual(typeof mql.matches, 'boolean');
  assert.strictEqual(mql.media, '(max-width: 600px)');
  assert.strictEqual(typeof mql.addListener, 'function');
  assert.strictEqual(typeof mql.removeListener, 'function');
});

test('async_test lifecycle mock in sandbox context', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  const async_test = ctx.async_test as Function;
  assert.strictEqual(typeof async_test, 'function');

  let testRef: unknown;
  const returnedTest = async_test((t: unknown) => {
    testRef = t;
  }, 'my-async-test') as {[key: string]: unknown};

  assert.ok(returnedTest, 'should return a test object');
  assert.strictEqual(returnedTest, testRef, 'returned object and callback argument should be the same');

  assert.strictEqual(typeof returnedTest.step, 'function');
  assert.strictEqual(typeof returnedTest.done, 'function');
  assert.strictEqual(typeof returnedTest.step_func, 'function');
  assert.strictEqual(typeof returnedTest.step_func_done, 'function');
  assert.strictEqual(typeof returnedTest.add_cleanup, 'function');

  let cleanCalled = false;
  (returnedTest.add_cleanup as Function)(() => {
    cleanCalled = true;
  });

  const stepFunc = returnedTest.step_func as Function;
  const wrapped = stepFunc(() => {
    assert.ok(true);
  });
  wrapped();

  (returnedTest.done as Function)();
  
  await tests[0].promise;
  
  // Run cleanups manually to test it
  for (const cleanup of tests[0].cleanups || []) {
    cleanup();
  }
  assert.ok(cleanCalled, 'cleanup should be called');
  assert.strictEqual(tests[0].status, 0, 'test should pass');
});

test('requestAnimationFrame and cancelAnimationFrame mock in sandbox context', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);
  const ctx = createWptContext(win, win.document, []);

  const rAF = ctx.requestAnimationFrame as Function;
  const cAF = ctx.cancelAnimationFrame as Function;

  assert.strictEqual(typeof rAF, 'function');
  assert.strictEqual(typeof cAF, 'function');

  let called = false;
  const id = rAF(() => {
    called = true;
  });
  assert.strictEqual(typeof id, 'number');
  assert.strictEqual(called, false, 'should run asynchronously');

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual(called, true, 'should execute callback');

  let cancelled = false;
  const cancelId = rAF(() => {
    cancelled = true;
  });
  cAF(cancelId);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual(cancelled, false, 'should cancel callback');
});

test('document.fonts in sandbox context', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);
  const ctx = createWptContext(win, win.document, []);

  const doc = ctx.document as {[key: string]: unknown};
  assert.ok(doc.fonts, 'fonts should be defined on document');
  const fonts = doc.fonts as {[key: string]: unknown};
  assert.ok(fonts.ready instanceof Promise, 'fonts.ready should be a Promise');
});

test('document.implementation.createHTMLDocument mock in sandbox context', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const doc = win.document;
  assert.strictEqual(typeof doc.implementation.createHTMLDocument, 'function');
  
  const doc2 = doc.implementation.createHTMLDocument('my-title');
  assert.ok(doc2);
  assert.strictEqual(doc2.title, 'my-title');
  assert.ok(doc2.body, 'document should have a body element');
});

test('patchWindowForTypedOM prototype patching guard', () => {
  const dom1 = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const dom2 = parseHTML('<!DOCTYPE html><html><body></body></html>');
  
  const elementProto = dom1.window.Element.prototype;
  
  // Call patch once
  patchWindowForTypedOM(dom1.window);
  const firstPatchedAppend = elementProto.appendChild;
  
  // Call patch again with a different window
  patchWindowForTypedOM(dom2.window);
  const secondPatchedAppend = elementProto.appendChild;
  
  // They should be identical (guard prevents wrapping again)
  assert.strictEqual(
    firstPatchedAppend, 
    secondPatchedAppend, 
    'Should not wrap prototype methods multiple times'
  );
});

