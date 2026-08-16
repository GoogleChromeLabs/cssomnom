/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';

function createDom() {
  const dom = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
  patchWindowForTypedOM(dom.window);
  return dom;
}

describe('CSSStyleDeclaration & DOM Style Bridge', () => {
  describe('CSSStyleDeclaration invalid property dropping & case normalization', () => {
    it('drops unsupported non-custom properties when parsing cssText', () => {
      const style = new CSSStyleDeclaration();
      style.cssText = 'color: red; unknown-prop: 10px; --custom-prop: hello; font-size: 14px;';
      assert.equal(style.length, 3);
      assert.equal(style.getPropertyValue('color'), 'red');
      assert.equal(style.getPropertyValue('--custom-prop'), 'hello');
      assert.equal(style.getPropertyValue('font-size'), '14px');
      assert.equal(style.getPropertyValue('unknown-prop'), '');
    });

    it('normalizes property names to lowercase (except custom properties)', () => {
      const style = new CSSStyleDeclaration();
      style.cssText = 'COLOR: red; FONT-SIZE: 12px; --MyCustom: test;';
      assert.equal(style.getPropertyValue('color'), 'red');
      assert.equal(style.getPropertyValue('font-size'), '12px');
      assert.equal(style.getPropertyValue('--MyCustom'), 'test');
      assert.equal(style.item(0), 'color');
      assert.equal(style.item(1), 'font-size');
      assert.equal(style.item(2), '--MyCustom');
    });

    it('handles expando properties on style proxy without mutating CSS declarations', () => {
      const style = new CSSStyleDeclaration();
      style.color = 'red';
      style.COLOR = 'blue';
      style.unknown = 'bar';
      style.fontSize = '16px';

      // CSS declarations should only have color and font-size
      assert.equal(style.length, 2);
      assert.equal(style.getPropertyValue('color'), 'red');
      assert.equal(style.getPropertyValue('font-size'), '16px');
      assert.equal(style.COLOR, 'blue');
      assert.equal(style.unknown, 'bar');
    });
  });

  describe('Custom properties raw indexing and escaping', () => {
    it('preserves raw identifier name for escaped custom properties in item() and getPropertyValue()', () => {
      const { document } = createDom();
      const el = document.createElement('div');
      el.style.cssText = '--a\\;b: value1; --\\61 b: value2;';

      assert.equal(el.style.length, 2);
      assert.equal(el.style.item(0), '--a;b');
      assert.equal(el.style[0], '--a;b');
      assert.equal(el.style.getPropertyValue('--a;b'), 'value1');

      assert.equal(el.style.item(1), '--ab');
      assert.equal(el.style[1], '--ab');
      assert.equal(el.style.getPropertyValue('--ab'), 'value2');
    });

    it('serializes custom properties with proper escaping in cssText', () => {
      const style = new CSSStyleDeclaration();
      style.setProperty('--a;b', 'value1');
      assert.equal(style.cssText, '--a\\;b: value1;');
      assert.equal(style.getPropertyValue('--a;b'), 'value1');
    });
  });

  describe('DOM style attribute synchronization', () => {
    it('syncs element.style mutations to element style attribute with canonical spacing', () => {
      const { document } = createDom();
      const el = document.createElement('div');
      el.style.setProperty('color', 'red');
      el.style.setProperty('font-size', '12px');

      assert.equal(el.getAttribute('style'), 'color: red; font-size: 12px;');
      assert.equal(el.style.cssText, 'color: red; font-size: 12px;');

      el.style.removeProperty('color');
      assert.equal(el.getAttribute('style'), 'font-size: 12px;');
    });

    it('syncs setAttribute("style") changes to element.style', () => {
      const { document } = createDom();
      const el = document.createElement('div');
      el.setAttribute('style', 'margin-top: 10px; z-index: 5;');

      assert.equal(el.style.length, 2);
      assert.equal(el.style.getPropertyValue('margin-top'), '10px');
      assert.equal(el.style.getPropertyValue('z-index'), '5');
      assert.equal(el.style.marginTop, '10px');
      assert.equal(el.style.zIndex, '5');
    });

    it('rejects invalid property values on setProperty without mutating DOM style attribute', () => {
      const { document } = createDom();
      const el = document.createElement('div');
      el.style.setProperty('width', '-100');
      assert.equal(el.hasAttribute('style'), false);
      assert.equal(el.style.length, 0);

      el.style.setProperty('doesntexist', '0');
      assert.equal(el.hasAttribute('style'), false);
      assert.equal(el.style.length, 0);
    });

    it('syncs direct string assignment to element.style', () => {
      const { document } = createDom();
      const el = document.createElement('div');
      (el as unknown as { style: string }).style = 'color: green; background-color: yellow;';
      assert.equal(el.style.getPropertyValue('color'), 'green');
      assert.equal(el.style.getPropertyValue('background-color'), 'yellow');
      assert.equal(el.getAttribute('style'), 'color: green; background-color: yellow;');
    });
  });

  describe('Historical API removals', () => {
    it('does not expose getPropertyCSSValue on CSSStyleDeclaration prototype', () => {
      assert.equal('getPropertyCSSValue' in CSSStyleDeclaration.prototype, false);
      const style = new CSSStyleDeclaration();
      assert.equal('getPropertyCSSValue' in style, false);
    });

    it('does not expose getPropertyCSSValue on element.style or getComputedStyle', () => {
      const { document, window } = createDom();
      const el = document.createElement('div');
      document.body.appendChild(el);
      assert.equal('getPropertyCSSValue' in el.style, false);
      const comp = window.getComputedStyle(el);
      assert.equal('getPropertyCSSValue' in comp, false);
    });
  });

  describe('HTMLStyleElement sheet reparsing', () => {
    it('preserves existing sheet when setting textContent to empty on an empty style element', () => {
      const { document } = createDom();
      const style = document.createElement('style');
      document.head.appendChild(style);
      const sheet = style.sheet;
      assert.ok(sheet);
      sheet.insertRule('div { min-width: 10px; }', 0);
      assert.equal(sheet.cssRules.length, 1);

      style.textContent = '';
      assert.equal(style.sheet, sheet);
      assert.ok(style.sheet);
      assert.equal(style.sheet.cssRules.length, 1);
    });

    it('reparses sheet when mutating textContent or children', () => {
      const { document } = createDom();
      const style = document.createElement('style');
      document.head.appendChild(style);
      const sheet = style.sheet;
      assert.ok(sheet);
      sheet.insertRule('div { min-width: 10px; }', 0);

      style.textContent = ' ';
      assert.ok(style.sheet);
      assert.equal(style.sheet.cssRules.length, 0);

      style.sheet.insertRule('div { min-width: 20px; }', 0);
      assert.equal(style.sheet.cssRules.length, 1);

      style.textContent = '';
      assert.ok(style.sheet);
      assert.equal(style.sheet.cssRules.length, 0);
    });
  });
});
