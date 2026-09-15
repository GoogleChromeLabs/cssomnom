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

  assert.strictEqual(win.document.activeElement, win.document.body, 'activeElement defaults to body before focus');

  input.focus();

  assert.strictEqual(focusEventFired, true, 'focus event was fired synchronously');
  assert.strictEqual(win.document.activeElement, input, 'activeElement set to focused input');
  assert.strictEqual(focusPseudoMatched, true, ':focus matched input inside focus handler');
  assert.strictEqual(focusVisiblePseudoMatched, true, ':focus-visible matched input inside focus handler');
  assert.strictEqual(focusWithinPseudoMatched, true, ':focus-within matched documentElement inside focus handler');

  input.blur();

  assert.strictEqual(blurEventFired, true, 'blur event was fired synchronously');
  assert.strictEqual(win.document.activeElement, win.document.body, 'activeElement falls back to body after blur');
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

// Regression guard: LinkeDOM exposes throw-on-construct *facades* on the window whose `prototype`
// is the very same object as the internal class's prototype:
//
//   export function DocumentFragment() { illegalConstructor(); }
//   DocumentFragment.prototype = _DocumentFragment.prototype;
//
// So `X.prototype.constructor` deliberately points at the *internal* class, not at the facade, and
// LinkeDOM's own code depends on it -- non-element-parent-node.js does
// `const {constructor} = this; new constructor(ownerDocument)` inside cloneNode().
//
// "Repairing" that wiring to satisfy WebIDL 3.6.3 makes every such internal construction throw
// `TypeError: Illegal constructor`. It was tried in 699040c and cost 142 css-cascade subtests
// (every @scope test clones a fragment). This test fails loudly if anyone tries it again.
test('patching does not clobber LinkeDOM internal constructor wiring (cloneNode still works)', () => {
  const dom = parseHTML('<!DOCTYPE html><html><body><div id="host"><span>a</span><span>b</span></div></body></html>');
  const win = dom.window;
  patchWindowForTypedOM(win);

  const fragment = win.document.createDocumentFragment();
  fragment.appendChild(win.document.createElement('p'));

  const shallow = fragment.cloneNode(false);
  assert.ok(shallow, 'shallow cloneNode on a DocumentFragment does not throw');
  assert.equal(shallow.childNodes.length, 0, 'shallow clone has no children');

  const deep = fragment.cloneNode(true);
  assert.equal(deep.childNodes.length, 1, 'deep clone copies children');

  // Element cloning travels the same internal path.
  const host = win.document.getElementById('host')!;
  const clonedHost = host.cloneNode(true);
  assert.equal(clonedHost.childNodes.length, 2, 'deep element clone copies children');
});

test('HTMLElement.prototype.offsetWidth resolves width from cascaded style and inline style', () => {
  const dom = parseHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          #box { width: 120px; }
          #override-box { width: 100px; }
          #auto-box { color: red; }
        </style>
      </head>
      <body>
        <div id="box"></div>
        <div id="inline-box" style="width: 250px;"></div>
        <div id="override-box" style="width: 300px;"></div>
        <div id="auto-box"></div>
      </body>
    </html>
  `);
  const win = dom.window;
  patchWindowForTypedOM(win);

  const box = win.document.getElementById('box') as HTMLElement;
  const inlineBox = win.document.getElementById('inline-box') as HTMLElement;
  const overrideBox = win.document.getElementById('override-box') as HTMLElement;
  const autoBox = win.document.getElementById('auto-box') as HTMLElement;

  assert.strictEqual(box.offsetWidth, 120, 'offsetWidth resolves from <style> stylesheet');
  assert.strictEqual(inlineBox.offsetWidth, 250, 'offsetWidth resolves from inline style');
  assert.strictEqual(overrideBox.offsetWidth, 300, 'offsetWidth resolves inline style over cascaded stylesheet rule');
  // Note: In headless test harness without a 2D layout engine, testing autoBox.offsetWidth === 0 verifies the headless stub's fallback when no width is styled
  assert.strictEqual(autoBox.offsetWidth, 0, "offsetWidth tests the headless stub's fallback (0) when no width is styled");
  assert.strictEqual((win.document.documentElement as HTMLElement).offsetWidth, 800, 'documentElement defaults to 800');
  assert.strictEqual((win.document.body as HTMLElement).offsetWidth, 800, 'body defaults to 800');
});

