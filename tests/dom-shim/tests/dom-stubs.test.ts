/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from '../src/index.ts';
import { CSSStyleSheet } from '../../../src/CSSOM.ts';

test('cross-document node insertion updates ownerDocument and computed style', () => {
  const dom1 = parseHTML('<!DOCTYPE html><html><body><div id="original-div" style="background-color:green; height: 100px; width: 100px"></div></body></html>');
  const dom2 = parseHTML('<!DOCTYPE html><html><body></body></html>');

  patchWindowForTypedOM(dom1.window);
  patchWindowForTypedOM(dom2.window);

  const newDiv = dom2.document.createElement('div');
  newDiv.style.backgroundColor = 'red';
  newDiv.style.height = '100px';
  newDiv.style.width = '100px';
  dom2.document.body.appendChild(newDiv);

  assert.notStrictEqual(newDiv.ownerDocument, dom1.document, 'New div initially belongs to dom2');
  assert.strictEqual(newDiv.ownerDocument, dom2.document, 'New div ownerDocument is dom2');

  const originalDiv = dom1.document.getElementById('original-div')!;
  dom1.document.body.insertBefore(newDiv, originalDiv);

  assert.strictEqual(newDiv.ownerDocument, dom1.document, 'New div now belongs to dom1 after insertBefore');

  newDiv.style.backgroundColor = 'blue';
  assert.strictEqual(
    dom1.window.getComputedStyle(newDiv).getPropertyValue('background-color'),
    'rgb(0, 0, 255)',
    'Computed background-color reflects update in new document'
  );

  newDiv.style.backgroundColor = 'green';
  assert.strictEqual(
    dom1.window.getComputedStyle(newDiv).getPropertyValue('background-color'),
    'rgb(0, 128, 0)',
    'Computed background-color reflects second update'
  );

  // Test adoptNode migration
  const adopted = dom2.document.adoptNode(newDiv);
  assert.strictEqual(adopted, newDiv);
  assert.strictEqual(newDiv.ownerDocument, dom2.document, 'New div ownerDocument updated to dom2 after adoptNode');
});

test('HTMLElement.prototype.focus() and blur() with synchronous :focus/:focus-visible event matching', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><input id="target-input" type="text"></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const input = win.document.getElementById('target-input') as HTMLElement;
  assert.ok(input);

  let focusEventFired = false;
  let focusPseudoMatched = false;
  let focusVisiblePseudoMatched = false;
  let focusWithinPseudoMatched = false;

  input.addEventListener('focus', (e: Event) => {
    focusEventFired = true;
    const focusEl = win.document.querySelector(':focus');
    const focusVisibleEl = win.document.querySelector(':focus-visible');
    const focusWithinEl = win.document.querySelector(':focus-within');

    if (focusEl === e.target && focusEl === input) {
      focusPseudoMatched = true;
    }
    if (focusVisibleEl === e.target && focusVisibleEl === input) {
      focusVisiblePseudoMatched = true;
    }
    if (focusWithinEl === win.document.documentElement) {
      focusWithinPseudoMatched = true;
    }
  });

  let blurEventFired = false;
  input.addEventListener('blur', () => {
    blurEventFired = true;
  });

  input.focus();

  assert.strictEqual(focusEventFired, true, 'focus event was fired synchronously');
  assert.strictEqual(win.document.activeElement, input, 'activeElement set to focused input');
  assert.strictEqual(focusPseudoMatched, true, ':focus matched input inside focus handler');
  assert.strictEqual(focusVisiblePseudoMatched, true, ':focus-visible matched input inside focus handler');
  assert.strictEqual(focusWithinPseudoMatched, true, ':focus-within matched documentElement inside focus handler');

  input.blur();

  assert.strictEqual(blurEventFired, true, 'blur event was fired synchronously');
  assert.strictEqual(win.document.activeElement, null, 'activeElement cleared after blur');
  assert.strictEqual(win.document.querySelector(':focus'), null, ':focus matches nothing after blur');
});

test('[autofocus] initialization on document load and rAF flushing', async () => {
  const dom = parseHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          :focus-visible { outline-color: green; }
          #btn:focus:not(:focus-visible) { outline-color: red; }
        </style>
      </head>
      <body>
        <button id="btn" autofocus tabindex="-1">Auto Focused</button>
      </body>
    </html>
  `);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const btn = win.document.getElementById('btn') as HTMLElement;
  assert.ok(btn);

  // Autofocus should be applied immediately on patchWindowInstance
  assert.strictEqual(win.document.activeElement, btn, 'activeElement initialized to autofocus element');
  assert.strictEqual(win.document.querySelector(':focus-visible'), btn, ':focus-visible matches autofocus element');

  // Verify rAF flushes cleanly
  let rafTicked = false;
  await new Promise<void>(resolve => {
    win.requestAnimationFrame(() => {
      rafTicked = true;
      assert.strictEqual(win.document.activeElement, btn, 'activeElement persists after rAF');
      resolve();
    });
  });
  assert.strictEqual(rafTicked, true, 'rAF callback executed');
});

test('adoptedStyleSheets and document.styleSheets collection behavior', () => {
  const dom = parseHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>body { color: red; }</style>
        <link rel="stylesheet" href="test.css">
      </head>
      <body></body>
    </html>
  `);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const doc = win.document;
  assert.ok(doc.styleSheets);
  assert.strictEqual(doc.styleSheets.length, 2);
  assert.strictEqual(typeof doc.styleSheets.item, 'function');
  assert.strictEqual(doc.styleSheets.item(0), doc.styleSheets[0]);
  assert.strictEqual(doc.styleSheets.item(99), null);

  // AdoptedStyleSheets
  assert.ok(Array.isArray(doc.adoptedStyleSheets));
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('div { margin: 10px; }');
  (doc as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
  assert.strictEqual(doc.adoptedStyleSheets.length, 1);
  assert.strictEqual(doc.adoptedStyleSheets[0] as unknown as CSSStyleSheet, sheet);

  // Reject non-CSSStyleSheet
  assert.throws(() => {
    (doc as unknown as { adoptedStyleSheets: unknown }).adoptedStyleSheets = ['invalid' as unknown as CSSStyleSheet];
  }, TypeError);
});
