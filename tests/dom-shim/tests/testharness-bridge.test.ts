/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  patchWindowForTypedOM,
  createWptContext,
  type WptSandboxTest
} from '../src/index.ts';

test('createWptContext test() execution, pass/fail status, and cleanups', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><div id="target"></div></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  const testFn = ctx.test as (fn: Function, name: string) => void;
  assert.strictEqual(typeof testFn, 'function');

  // Passing test with cleanup
  let cleanupRun = false;
  testFn((t: { add_cleanup: (fn: Function) => void }) => {
    t.add_cleanup(() => {
      cleanupRun = true;
    });
    const el = win.document.getElementById('target');
    assert.ok(el);
  }, 'passing test with cleanup');

  assert.strictEqual(tests.length, 1);
  assert.strictEqual(tests[0].name, 'passing test with cleanup');
  assert.strictEqual(tests[0].status, 0, 'status should be PASS (0)');
  assert.strictEqual(cleanupRun, true, 'cleanup should run in finally block');

  // Failing test
  testFn(() => {
    assert.fail('intentional failure');
  }, 'failing test');

  assert.strictEqual(tests.length, 2);
  assert.strictEqual(tests[1].name, 'failing test');
  assert.strictEqual(tests[1].status, 1, 'status should be FAIL (1)');
  assert.ok(tests[1].message?.includes('intentional failure'));
});

test('createWptContext promise_test() lifecycle and resolution', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  const promiseTestFn = ctx.promise_test as (fn: Function, name: string) => void;
  assert.strictEqual(typeof promiseTestFn, 'function');

  promiseTestFn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(1 + 1, 2);
  }, 'async promise test');

  assert.strictEqual(tests.length, 1);
  assert.strictEqual(tests[0].type, 'promise_test');
  assert.strictEqual(tests[0].name, 'async promise test');
  if (tests[0].fn) {
    await tests[0].fn();
  }
});

test('createWptContext async_test() lifecycle, step_func_done, and timeouts', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  const asyncTestFn = ctx.async_test as (fn: Function, name: string) => Record<string, unknown>;
  assert.strictEqual(typeof asyncTestFn, 'function');

  let testDone = false;
  const tObj = asyncTestFn((t: { step_func_done: (fn: Function) => Function }) => {
    const doneCb = t.step_func_done(() => {
      testDone = true;
    });
    setTimeout(doneCb, 10);
  }, 'async_test with step_func_done');

  assert.ok(tObj);
  assert.strictEqual(tests.length, 1);
  if (tests[0].type === 'async_test' && tests[0].promise) {
    await tests[0].promise;
  }
  assert.strictEqual(testDone, true, 'async_test step_func_done callback executed');
  assert.strictEqual(tests[0].status, 0, 'async_test status is PASS (0)');
});

test('createWptContext timer management and __cleanup', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  const setTimer = ctx.setTimeout as (cb: Function, ms: number) => NodeJS.Timeout;
  const cleanupAll = ctx.__cleanup as () => void;

  let timerFired = false;
  setTimer(() => {
    timerFired = true;
  }, 50);

  cleanupAll();

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.strictEqual(timerFired, false, 'timer should have been cancelled by __cleanup()');
});
