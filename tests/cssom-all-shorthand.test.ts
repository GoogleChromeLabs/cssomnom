/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { CSSStyleSheet, CSSStyleRule } from '../src/CSSOM.ts';
import { SHORTHANDS } from '../src/shorthands.ts';

describe('CSSOM: all Shorthand Property Expansion & Contraction (CSSOM § 6.4.3 & CSS Cascading 5 § 6.2)', () => {
  it('SHORTHANDS definition contains all with all longhands', () => {
    assert.ok(SHORTHANDS['all']);
    assert.ok(Array.isArray(SHORTHANDS['all'].longhands));
    assert.ok(SHORTHANDS['all'].longhands.length > 100);
    assert.ok(!SHORTHANDS['all'].longhands.includes('direction'));
    assert.ok(!SHORTHANDS['all'].longhands.includes('unicode-bidi'));
    assert.ok(!SHORTHANDS['all'].longhands.includes('all'));
  });

  it('getPropertyValue("all") returns empty string when not all longhands are set', () => {
    const style = new CSSStyleDeclaration();
    style.cssText = 'width: 50px';
    assert.strictEqual(style.getPropertyValue('all'), '');
  });

  it('getPropertyValue("all") returns css-wide keyword when all is set', () => {
    const style = new CSSStyleDeclaration();
    style.cssText = 'all: revert';
    assert.strictEqual(style.getPropertyValue('all'), 'revert');
    assert.strictEqual(style.getPropertyValue('width'), 'revert');
    assert.strictEqual(style.getPropertyValue('color'), 'revert');
    assert.strictEqual(style.getPropertyValue('font'), 'revert');
    assert.strictEqual(style.getPropertyValue('margin'), 'revert');
  });

  it('getPropertyValue("all") returns empty string when single property is overridden', () => {
    const style = new CSSStyleDeclaration();
    style.cssText = 'all: revert; width: 50px';
    assert.strictEqual(style.getPropertyValue('all'), '');
    assert.strictEqual(style.getPropertyValue('width'), '50px');
    assert.strictEqual(style.getPropertyValue('color'), 'revert');
  });

  it('setProperty("all") expands to all longhand properties', () => {
    const style = new CSSStyleDeclaration();
    style.setProperty('all', 'unset');
    assert.strictEqual(style.getPropertyValue('all'), 'unset');
    assert.strictEqual(style.getPropertyValue('width'), 'unset');
    assert.strictEqual(style.getPropertyValue('color'), 'unset');
    assert.strictEqual(style.getPropertyValue('background-color'), 'unset');
  });

  it('removeProperty("all") removes all longhand declarations except direction and unicode-bidi', () => {
    const style = new CSSStyleDeclaration();
    style.cssText = 'width: 50px; color: green; direction: rtl; unicode-bidi: isolate; --custom: 10px';
    style.removeProperty('all');
    assert.strictEqual(style.getPropertyValue('width'), '');
    assert.strictEqual(style.getPropertyValue('color'), '');
    assert.strictEqual(style.getPropertyValue('direction'), 'rtl');
    assert.strictEqual(style.getPropertyValue('unicode-bidi'), 'isolate');
    assert.strictEqual(style.getPropertyValue('--custom'), '10px');
  });

  it('handles all shorthand with CSSStyleSheet and insertRule', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.foo { all: revert; width: 50px; }');
    const rule = sheet.cssRules[0];
    assert.ok(rule instanceof CSSStyleRule);
    const style = rule.style;
    assert.strictEqual(style.getPropertyValue('width'), '50px');
    assert.strictEqual(style.getPropertyValue('all'), '');
    assert.strictEqual(style.getPropertyValue('color'), 'revert');
  });
});
