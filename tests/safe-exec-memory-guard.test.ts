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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSSStyleSheet, CSSImportRule } from '../src/CSSOM.ts';
import { parseRule } from '../src/parser.ts';
import { parseHTML } from 'linkedom';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';

test('CSSImportRule: child stylesheet parentStyleSheet linkage and unlinking', () => {
  // cssom-1 § 6.4.3: child stylesheet parentStyleSheet reflects ownerRule parentStyleSheet
  const sheet = CSSStyleSheet.createInternal([], parseRule);
  sheet.insertRule('@import url("imported.css");', 0);

  const importRule = sheet.cssRules[0] as CSSImportRule;
  assert.ok(importRule instanceof CSSImportRule);
  assert.equal(importRule.parentStyleSheet, sheet);

  const childSheet = importRule.styleSheet;
  assert.ok(childSheet);
  assert.equal(childSheet.parentStyleSheet, sheet, 'Child stylesheet parentStyleSheet should be parent sheet');

  // Removing the @import rule unlinks the parentStyleSheet
  sheet.deleteRule(0);
  assert.equal(importRule.parentStyleSheet, null, 'Import rule parentStyleSheet should be null after deleteRule');
  assert.equal(childSheet.parentStyleSheet, null, 'Child stylesheet parentStyleSheet should be null after deleteRule');
});

test('Attribute selector case-sensitivity matching performance and memory containment', () => {
  const dom = parseHTML('<div id="root"></div>');
  patchWindowForTypedOM(dom.window);

  const root = dom.document.getElementById('root')!;
  const el = dom.document.createElement('div');
  root.appendChild(el);
  el.setAttribute('data-test', 'FoO_BaR');

  // Verify case-insensitive and case-sensitive selector matches
  assert.ok(dom.document.querySelector('[data-test="foo_bar" i]'));
  assert.ok(dom.document.querySelector('[data-test="FoO_BaR" s]'));
  assert.equal(dom.document.querySelector('[data-test="foo_bar" s]'), null);

  // High-volume query execution should run efficiently
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) {
    dom.document.querySelector('[data-test="foo_bar" i]');
    dom.document.querySelector('[data-test="foo_bar" s]');
  }
  const duration = performance.now() - t0;
  assert.ok(duration < 1000, `Expected 1000 attribute queries to finish in <1000ms, took ${duration.toFixed(1)}ms`);
});

test(':focus-within DOM lifecycle: focus shifting and removal handling', () => {
  const html = `
    <div id="wrapper">
      <div id="outer">
        <input id="tab">
        <input id="input">
      </div>
      <input id="outside">
    </div>
  `;
  const dom = parseHTML(html);
  patchWindowForTypedOM(dom.window);

  const wrapper = dom.document.getElementById('wrapper')!;
  const outer = dom.document.getElementById('outer')!;
  const tab = dom.document.getElementById('tab') as unknown as HTMLElement;
  const input = dom.document.getElementById('input') as unknown as HTMLElement;
  const outside = dom.document.getElementById('outside') as unknown as HTMLElement;

  input.addEventListener('blur', () => outside.focus());

  input.focus();
  assert.equal((dom.document.activeElement as HTMLElement)?.id, 'input');
  assert.ok(outer.matches(':focus-within'));
  assert.ok(wrapper.matches(':focus-within'));

  // Focusing tab triggers input blur -> blur listener moves focus to outside
  tab.focus();
  assert.equal((dom.document.activeElement as HTMLElement)?.id, 'outside', 'Focus should move to outside via blur handler');
  assert.ok(wrapper.matches(':focus-within'), 'Wrapper should still match :focus-within');
  assert.ok(!outer.matches(':focus-within'), 'Outer should no longer match :focus-within');
});
