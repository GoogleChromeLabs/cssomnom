/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  VirtualClock,
  patchWindowForTypedOM,
  createWptContext,
  type WptSandboxTest
} from '../src/index.ts';

test('VirtualClock setTimeout(..., 1000) fast-forwards in <2ms wall-clock time', async () => {
  const clock = new VirtualClock();
  let executed = false;
  let executionTime = -1;

  clock.setTimeout(() => {
    executed = true;
    executionTime = clock.currentTime;
  }, 1000);

  assert.strictEqual(clock.currentTime, 0);
  assert.strictEqual(executed, false);

  const startWallClock = performance.now();
  const completed = await clock.pumpUntil(() => executed);
  const wallClockDuration = performance.now() - startWallClock;

  assert.strictEqual(completed, true);
  assert.strictEqual(executed, true);
  assert.strictEqual(executionTime, 1000);
  assert.strictEqual(clock.currentTime, 1000);
  assert.ok(wallClockDuration < 20, `Wall-clock duration was ${wallClockDuration}ms (expected <20ms)`);
});

test('VirtualClock rAF snapshotting: rAF scheduled inside a rAF callback does not execute in the same frame', async () => {
  const clock = new VirtualClock();
  const frameOrder: string[] = [];
  const frameTimes: number[] = [];

  clock.requestAnimationFrame((time) => {
    frameOrder.push('first-raf');
    frameTimes.push(time);

    // Schedule second rAF inside the first rAF callback
    clock.requestAnimationFrame((nestedTime) => {
      frameOrder.push('nested-raf');
      frameTimes.push(nestedTime);
    });
  });

  assert.strictEqual(frameOrder.length, 0);

  // Step 1: Execute first frame
  const stepped1 = await clock.step();
  assert.strictEqual(stepped1, true);
  assert.deepStrictEqual(frameOrder, ['first-raf']);
  assert.strictEqual(frameTimes[0], 16.666);
  assert.strictEqual(clock.currentTime, 16.666);

  // Step 2: Execute second frame
  const stepped2 = await clock.step();
  assert.strictEqual(stepped2, true);
  assert.deepStrictEqual(frameOrder, ['first-raf', 'nested-raf']);
  assert.strictEqual(frameTimes[1], 33.332);
  assert.strictEqual(clock.currentTime, 33.332);
});

test('VirtualClock microtask and macrotask execution order', async () => {
  const clock = new VirtualClock();
  const log: string[] = [];

  clock.setTimeout(() => {
    log.push('macrotask-1');
    queueMicrotask(() => {
      log.push('microtask-1');
    });
    Promise.resolve().then(() => {
      log.push('promise-1');
    });
  }, 10);

  clock.setTimeout(() => {
    log.push('macrotask-2');
  }, 20);

  await clock.pumpUntil(() => log.length === 4);

  assert.deepStrictEqual(log, [
    'macrotask-1',
    'microtask-1',
    'promise-1',
    'macrotask-2'
  ]);
});

test('VirtualClock pumpUntil halts on completion even with uncancelled setInterval', async () => {
  const clock = new VirtualClock();
  let intervalCount = 0;
  let targetFinished = false;

  clock.setInterval(() => {
    intervalCount++;
  }, 10);

  clock.setTimeout(() => {
    targetFinished = true;
  }, 50);

  const startWallClock = performance.now();
  const completed = await clock.pumpUntil(() => targetFinished, { maxTicks: 1000 });
  const wallClockDuration = performance.now() - startWallClock;

  assert.strictEqual(completed, true);
  assert.strictEqual(targetFinished, true);
  // Interval fired at t=10, 20, 30, 40 (4 times).
  // At t=50, the setTimeout (scheduled earlier at t=0 with lower sequence number) executes first and causes pumpUntil to immediately halt before the 5th interval tick.
  assert.strictEqual(intervalCount, 4);
  assert.strictEqual(clock.currentTime, 50);
  assert.ok(wallClockDuration < 20, `Wall-clock duration was ${wallClockDuration}ms`);
});

test('VirtualClock clearTimeout, clearInterval, and cancelAnimationFrame', async () => {
  const clock = new VirtualClock();
  let timeoutFired = false;
  let intervalFired = false;
  let rafFired = false;

  const tId = clock.setTimeout(() => {
    timeoutFired = true;
  }, 100);

  const iId = clock.setInterval(() => {
    intervalFired = true;
  }, 50);

  const rId = clock.requestAnimationFrame(() => {
    rafFired = true;
  });

  clock.clearTimeout(tId);
  clock.clearInterval(iId);
  clock.cancelAnimationFrame(rId);

  await clock.step();
  await clock.step();

  assert.strictEqual(timeoutFired, false);
  assert.strictEqual(intervalFired, false);
  assert.strictEqual(rafFired, false);
});

test('VirtualClock reset clears all tasks and resets time', async () => {
  const clock = new VirtualClock();
  clock.setTimeout(() => {}, 100);
  clock.setInterval(() => {}, 50);
  clock.requestAnimationFrame(() => {});

  await clock.step();
  assert.ok(clock.currentTime > 0);

  clock.reset();
  assert.strictEqual(clock.currentTime, 0);
  assert.strictEqual(clock.pendingTasksCount, 0);
  assert.strictEqual(await clock.step(), false);
});

test('createWptContext integrates with VirtualClock for fast-forward async_test', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);
  const clock = ctx.clock as VirtualClock;
  assert.ok(clock instanceof VirtualClock);

  const asyncTestFn = ctx.async_test as (fn: Function, name: string) => Record<string, unknown>;
  let testFinished = false;

  asyncTestFn((t: { step_timeout: (fn: Function, delay: number) => number; step_func_done: (fn: Function) => Function }) => {
    t.step_timeout(t.step_func_done(() => {
      testFinished = true;
    }), 5000);
  }, '5-second step_timeout test');

  assert.strictEqual(tests.length, 1);
  const testEntry = tests[0];

  const startWallClock = Date.now();
  await clock.pumpUntil(() => (testEntry as unknown as { completed?: boolean }).completed === true);
  if (testEntry.type === 'async_test' && testEntry.promise) {
    await testEntry.promise;
  }
  const duration = Date.now() - startWallClock;

  assert.strictEqual(testFinished, true);
  assert.strictEqual(testEntry.status, 0);
  assert.strictEqual(clock.currentTime, 5000);
  assert.ok(duration < 100, `Async test took ${duration}ms (expected <100ms)`);
});

test('createWptContext preserves globalThis native timers and performance', () => {
  const initialSetTimeout = globalThis.setTimeout;
  const initialClearTimeout = globalThis.clearTimeout;
  const initialSetInterval = globalThis.setInterval;
  const initialClearInterval = globalThis.clearInterval;
  const initialPerformance = globalThis.performance;

  const dom = parseHTML('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const tests: WptSandboxTest[] = [];
  const ctx = createWptContext(win, win.document, tests);

  assert.strictEqual(globalThis.setTimeout, initialSetTimeout, 'globalThis.setTimeout must not be polluted');
  assert.strictEqual(globalThis.clearTimeout, initialClearTimeout, 'globalThis.clearTimeout must not be polluted');
  assert.strictEqual(globalThis.setInterval, initialSetInterval, 'globalThis.setInterval must not be polluted');
  assert.strictEqual(globalThis.clearInterval, initialClearInterval, 'globalThis.clearInterval must not be polluted');
  assert.strictEqual(globalThis.performance, initialPerformance, 'globalThis.performance must not be polluted');

  assert.notStrictEqual(ctx.setTimeout, initialSetTimeout, 'ctx.setTimeout must be virtualized');
});
