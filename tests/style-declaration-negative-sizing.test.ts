/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// css-sizing-3 § 5.1 #propdef-width
// css-box-3 § 4 #padding-physical
// css-backgrounds-3 § 4.3 #border-width
// cssom-1 § 6.7.1 #set-a-css-declaration

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';

function createDom() {
  const dom = parseHTML('<!DOCTYPE html><html><head></head><body><div id="target"></div></body></html>');
  patchWindowForTypedOM(dom.window);
  return dom;
}

describe('CSS Sizing and Box Property Validation (Non-negative check)', () => {
  it('rejects negative lengths on width, height, min/max-width, min/max-height', () => {
    const style = new CSSStyleDeclaration();

    style.setProperty('width', '-100px');
    assert.equal(style.getPropertyValue('width'), '');

    style.setProperty('height', '-50px');
    assert.equal(style.getPropertyValue('height'), '');

    style.setProperty('min-width', '-10px');
    assert.equal(style.getPropertyValue('min-width'), '');

    style.setProperty('min-height', '-20px');
    assert.equal(style.getPropertyValue('min-height'), '');

    style.setProperty('max-width', '-100px');
    assert.equal(style.getPropertyValue('max-width'), '');

    style.setProperty('max-height', '-100px');
    assert.equal(style.getPropertyValue('max-height'), '');

    // Percentage rejection
    style.setProperty('width', '-20%');
    assert.equal(style.getPropertyValue('width'), '');

    // Valid non-negative values are accepted
    style.setProperty('width', '100px');
    assert.equal(style.getPropertyValue('width'), '100px');

    style.setProperty('width', '0px');
    assert.equal(style.getPropertyValue('width'), '0px');
  });

  it('rejects negative lengths on logical sizing properties', () => {
    const style = new CSSStyleDeclaration();

    style.setProperty('inline-size', '-100px');
    assert.equal(style.getPropertyValue('inline-size'), '');

    style.setProperty('block-size', '-50px');
    assert.equal(style.getPropertyValue('block-size'), '');

    style.setProperty('min-inline-size', '-10px');
    assert.equal(style.getPropertyValue('min-inline-size'), '');

    style.setProperty('min-block-size', '-20px');
    assert.equal(style.getPropertyValue('min-block-size'), '');

    // Valid values are accepted
    style.setProperty('inline-size', '200px');
    assert.equal(style.getPropertyValue('inline-size'), '200px');
  });

  it('rejects negative lengths on padding and border-width (longhands and shorthands)', () => {
    const style = new CSSStyleDeclaration();

    style.setProperty('padding-top', '-10px');
    assert.equal(style.getPropertyValue('padding-top'), '');

    style.setProperty('padding', '-10px');
    assert.equal(style.getPropertyValue('padding-top'), '');
    assert.equal(style.getPropertyValue('padding'), '');

    style.setProperty('padding', '10px -5px 20px 5px');
    assert.equal(style.getPropertyValue('padding-top'), '');
    assert.equal(style.getPropertyValue('padding'), '');

    style.setProperty('border-top-width', '-2px');
    assert.equal(style.getPropertyValue('border-top-width'), '');

    style.setProperty('border-width', '-5px');
    assert.equal(style.getPropertyValue('border-top-width'), '');

    style.setProperty('border-inline-width', '-3px');
    assert.equal(style.getPropertyValue('border-inline-width'), '');

    // Valid values are accepted
    style.setProperty('padding', '10px 20px');
    assert.equal(style.getPropertyValue('padding-top'), '10px');
    assert.equal(style.getPropertyValue('padding-right'), '20px');
  });

  it('rejects negative lengths on svg radii, column-width, tab-size, and gap', () => {
    const style = new CSSStyleDeclaration();

    style.setProperty('r', '-5px');
    assert.equal(style.getPropertyValue('r'), '');

    style.setProperty('rx', '-10px');
    assert.equal(style.getPropertyValue('rx'), '');

    style.setProperty('ry', '-15px');
    assert.equal(style.getPropertyValue('ry'), '');

    style.setProperty('column-width', '-100px');
    assert.equal(style.getPropertyValue('column-width'), '');

    style.setProperty('tab-size', '-4');
    assert.equal(style.getPropertyValue('tab-size'), '');

    style.setProperty('gap', '-10px');
    assert.equal(style.getPropertyValue('gap'), '');

    style.setProperty('row-gap', '-10px');
    assert.equal(style.getPropertyValue('row-gap'), '');
  });

  it('permits negative values on properties that legitimately accept them (margin, offsets)', () => {
    const style = new CSSStyleDeclaration();

    style.setProperty('margin', '-10px');
    assert.equal(style.getPropertyValue('margin-top'), '-10px');

    style.setProperty('margin-left', '-50px');
    assert.equal(style.getPropertyValue('margin-left'), '-50px');

    style.setProperty('top', '-20px');
    assert.equal(style.getPropertyValue('top'), '-20px');

    style.setProperty('left', '-10%');
    assert.equal(style.getPropertyValue('left'), '-10%');

    style.setProperty('bottom', '-5px');
    assert.equal(style.getPropertyValue('bottom'), '-5px');

    style.setProperty('right', '-15px');
    assert.equal(style.getPropertyValue('right'), '-15px');
  });

  it('does not mutate inline element style or queue mutation records when setting invalid negative width', async () => {
    const { document, window } = createDom();
    const target = document.getElementById('target') as HTMLElement;
    assert.ok(target);

    target.style.width = '150px';
    assert.equal(target.style.width, '150px');
    assert.equal(target.getAttribute('style'), 'width: 150px;');

    let mutationFired = false;
    const observer = new (window as unknown as { MutationObserver: new (cb: () => void) => { observe: (t: unknown, o: unknown) => void } }).MutationObserver(() => {
      mutationFired = true;
    });
    observer.observe(target, { attributes: true });

    // Setting negative width should be a silent no-op
    target.style.width = '-100px';

    assert.equal(target.style.width, '150px');
    assert.equal(target.getAttribute('style'), 'width: 150px;');

    await new Promise<void>(resolve => {
      (window as unknown as { requestAnimationFrame: (cb: () => void) => void }).requestAnimationFrame(() => {
        resolve();
      });
    });

    assert.equal(mutationFired, false, 'MutationRecord was not queued for invalid negative sizing');
  });
});
