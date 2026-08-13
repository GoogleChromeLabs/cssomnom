/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  patchWindowForTypedOM,
  extractScripts,
  runIframeDocumentWrite
} from '../src/index.ts';

test('extractScripts correctly parses inline and external script tags', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="/resources/testharness.js"></script>
        <script src="./helper.js"></script>
      </head>
      <body>
        <script>
          window.myValue = 42;
        </script>
      </body>
    </html>
  `;

  const scripts = extractScripts(html, '/test/dir');
  assert.ok(Array.isArray(scripts));
  // testharness.js is filtered out
  const inlineScript = scripts.find(s => s.filename === 'inline-script.js');
  assert.ok(inlineScript);
  assert.ok(inlineScript.code.includes('window.myValue = 42'));
});

test('HTMLIFrameElement contentDocument, contentWindow, and postMessage event bus', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><iframe id="ifr"></iframe></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const iframe = win.document.getElementById('ifr') as HTMLElement & {
    contentDocument?: Document & { write?: (s: string) => void };
    contentWindow?: typeof win;
  };
  assert.ok(iframe);
  assert.ok(iframe.contentDocument);
  assert.ok(iframe.contentWindow);
  assert.strictEqual(typeof iframe.contentDocument.write, 'function');

  // Verify postMessage from iframe routes to parent window
  let messageReceived: unknown = null;
  win.addEventListener('message', (ev: Event) => {
    messageReceived = (ev as unknown as { data: unknown }).data;
  });

  iframe.contentWindow.postMessage({ hello: 'from-iframe' });
  assert.deepStrictEqual(messageReceived, { hello: 'from-iframe' });
});

test('runIframeDocumentWrite executes script in isolated context and dispatches complete', async () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><iframe id="ifr"></iframe></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const iframe = win.document.getElementById('ifr') as HTMLElement & {
    contentDocument?: Document & { write?: (s: string) => void };
    contentWindow?: typeof win;
  };
  assert.ok(iframe && iframe.contentDocument && iframe.contentWindow);

  let completeData: { type: string; tests: Array<{ name: string; status: number }> } | null = null;
  win.addEventListener('message', (ev: Event) => {
    const data = (ev as unknown as { data: { type: string; tests: Array<{ name: string; status: number }> } }).data;
    if (data && data.type === 'complete') {
      completeData = data;
    }
  });

  const iframeSrc = `
    <!DOCTYPE html>
    <title>Subframe test</title>
    <script>
      test(() => {
        assert_equals(1 + 1, 2);
      }, "simple addition subtest");
    </script>
  `;

  runIframeDocumentWrite(iframe.contentWindow, iframe.contentDocument, iframeSrc, win, patchWindowForTypedOM);

  // Wait for microtasks and timers in runIframeDocumentWrite
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.ok(completeData, 'complete event should be dispatched via postMessage');
  const resultData = completeData as { type: string; tests: Array<{ name: string; status: number }> };
  assert.strictEqual(resultData.type, 'complete');
  assert.ok(Array.isArray(resultData.tests));
  const subtest = resultData.tests.find((t: { name: string; status: number }) => t.name === 'simple addition subtest');
  assert.ok(subtest);
  assert.strictEqual(subtest.status, 0, 'subtest should pass');
});
