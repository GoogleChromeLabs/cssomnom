/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { getCascadedStyle, normalizePseudoElement, shouldPreserveAutoMinSize } from '../src/cascade/index.ts';
import { parseStyleSheet } from '../src/parser.ts';

describe('CSSOM: getComputedStyle Pseudo-Element Resolution & Min-Size Auto Resolution (CSSOM § 6.2 & CSS Sizing 3)', () => {
  it('normalizePseudoElement handles legacy aliases and double colons', () => {
    assert.deepStrictEqual(normalizePseudoElement(':before'), { valid: true, normalized: '::before', isKnown: true });
    assert.deepStrictEqual(normalizePseudoElement(':after'), { valid: true, normalized: '::after', isKnown: true });
    assert.deepStrictEqual(normalizePseudoElement('::before'), { valid: true, normalized: '::before', isKnown: true });
    assert.deepStrictEqual(normalizePseudoElement('::highlight(name)'), { valid: true, normalized: '::highlight(name)', isKnown: true });
    assert.deepStrictEqual(normalizePseudoElement('::backdrop'), { valid: true, normalized: '::backdrop', isKnown: true });
  });

  it('normalizePseudoElement rejects invalid pseudo syntax', () => {
    assert.strictEqual(normalizePseudoElement('before'), null);
    assert.deepStrictEqual(normalizePseudoElement(':placeholder'), { valid: false, normalized: '', isKnown: false });
    assert.deepStrictEqual(normalizePseudoElement(':backdrop'), { valid: false, normalized: '', isKnown: false });
    assert.deepStrictEqual(normalizePseudoElement('::before '), { valid: false, normalized: '', isKnown: false });
    assert.deepStrictEqual(normalizePseudoElement('::highlight(1)'), { valid: false, normalized: '', isKnown: false });
    assert.deepStrictEqual(normalizePseudoElement('::highlight()'), { valid: false, normalized: '', isKnown: false });
  });

  it('resolves computed styles for ::before and ::after pseudo-elements', () => {
    const { document } = parseHTML(`
      <style>
        #test { width: 100px; color: green; }
        #test::before { content: " "; width: 50px; color: red; }
      </style>
      <div id="test"></div>
    `);
    const div = document.getElementById('test')!;
    const rules = parseStyleSheet(document.querySelector('style')!.textContent!);

    const elemStyle = getCascadedStyle(div, rules, null);
    assert.strictEqual(elemStyle.getPropertyValue('width'), '100px');
    assert.strictEqual(elemStyle.getPropertyValue('color'), 'rgb(0, 128, 0)');

    const pseudoStyle = getCascadedStyle(div, rules, '::before');
    assert.strictEqual(pseudoStyle.getPropertyValue('width'), '50px');
    assert.strictEqual(pseudoStyle.getPropertyValue('color'), 'rgb(255, 0, 0)');

    const singleColonStyle = getCascadedStyle(div, rules, ':before');
    assert.strictEqual(singleColonStyle.getPropertyValue('width'), '50px');

    // Non-prefixed pseudo name should resolve to originating element
    const ignoredPseudoStyle = getCascadedStyle(div, rules, 'before');
    assert.strictEqual(ignoredPseudoStyle.getPropertyValue('width'), '100px');

    // Invalid pseudo syntax returns empty declaration
    const invalidStyle = getCascadedStyle(div, rules, ':before ');
    assert.strictEqual(invalidStyle.length, 0);
    assert.strictEqual(invalidStyle.getPropertyValue('width'), '');
  });

  it('computed style declarations have empty cssText', () => {
    const { document } = parseHTML('<div style="color: red; font-size: 10pt;"></div>');
    const div = document.querySelector('div')!;
    const style = getCascadedStyle(div);
    assert.strictEqual(style.cssText, '');
  });

  it('resolves min-width and min-height auto to 0px except when preserving auto', () => {
    const { document } = parseHTML(`
      <div id="block-box"></div>
      <div id="aspect" style="aspect-ratio: 1/1"></div>
      <div style="display: flex">
        <div id="flex-item"></div>
      </div>
      <div style="display: none">
        <div id="none-item" style="aspect-ratio: 1/1"></div>
      </div>
    `);

    const blockBox = document.getElementById('block-box')!;
    const aspectBox = document.getElementById('aspect')!;
    const flexItem = document.getElementById('flex-item')!;
    const noneItem = document.getElementById('none-item')!;

    assert.strictEqual(shouldPreserveAutoMinSize(blockBox), false);
    assert.strictEqual(shouldPreserveAutoMinSize(aspectBox), true);
    assert.strictEqual(shouldPreserveAutoMinSize(flexItem), true);
    assert.strictEqual(shouldPreserveAutoMinSize(noneItem), false);

    assert.strictEqual(getCascadedStyle(blockBox).getPropertyValue('min-width'), '0px');
    assert.strictEqual(getCascadedStyle(aspectBox).getPropertyValue('min-width'), 'auto');
    assert.strictEqual(getCascadedStyle(flexItem).getPropertyValue('min-width'), 'auto');
    assert.strictEqual(getCascadedStyle(noneItem).getPropertyValue('min-width'), '0px');
  });
});
