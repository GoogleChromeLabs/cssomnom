/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CSSStyleSheet, CSSStyleRule } from '../src/CSSOM.ts';
import { parseStyleSheet } from '../src/parser.ts';

describe('CSSOM: Namespaced Type Selector Serialization (CSSOM § 6.4.3 #serialize-a-simple-selector)', () => {
  function getSelector(cssText: string): string {
    const parsed = parseStyleSheet(cssText);
    const sheet = CSSStyleSheet.createInternal(parsed, (text) => parseStyleSheet(text)[0]);
    const lastRule = sheet.cssRules[sheet.cssRules.length - 1];
    if (lastRule instanceof CSSStyleRule) {
      return lastRule.selectorText;
    }
    return '';
  }

  it('omits universal selector before class, id, pseudo, attribute when no default namespace', () => {
    const ns = '@namespace ns url(ns);';
    assert.strictEqual(getSelector(`${ns} *.c { color: red; }`), '.c');
    assert.strictEqual(getSelector(`${ns} *#id { color: red; }`), '#id');
    assert.strictEqual(getSelector(`${ns} *:hover { color: red; }`), ':hover');
    assert.strictEqual(getSelector(`${ns} *::before { color: red; }`), '::before');
    assert.strictEqual(getSelector(`${ns} *[attr] { color: red; }`), '[attr]');
    assert.strictEqual(getSelector(`${ns} *|*.c { color: red; }`), '.c');
    assert.strictEqual(getSelector(`${ns} *|*#id { color: red; }`), '#id');
    assert.strictEqual(getSelector(`${ns} *|*:hover { color: red; }`), ':hover');
    assert.strictEqual(getSelector(`${ns} *|*::before { color: red; }`), '::before');
    assert.strictEqual(getSelector(`${ns} *|*[attr] { color: red; }`), '[attr]');
    assert.strictEqual(getSelector(`${ns} *|* { color: red; }`), '*');
    assert.strictEqual(getSelector(`${ns} *|e { color: red; }`), 'e');
  });

  it('preserves universal wildcard and explicit namespace prefixes when default namespace is present', () => {
    const defaultNs = '@namespace url(default_ns); @namespace ns url(ns);';
    assert.strictEqual(getSelector(`${defaultNs} *.c { color: red; }`), '.c');
    assert.strictEqual(getSelector(`${defaultNs} *|*.c { color: red; }`), '*|*.c');
    assert.strictEqual(getSelector(`${defaultNs} *|*#id { color: red; }`), '*|*#id');
    assert.strictEqual(getSelector(`${defaultNs} *|* { color: red; }`), '*|*');
    assert.strictEqual(getSelector(`${defaultNs} *|e { color: red; }`), '*|e');
    assert.strictEqual(getSelector(`${defaultNs} |*.c { color: red; }`), '|*.c');
    assert.strictEqual(getSelector(`${defaultNs} ns|*.c { color: red; }`), 'ns|*.c');
    assert.strictEqual(getSelector(`${defaultNs} ns|e { color: red; }`), 'ns|e');
  });

  it('omits namespace prefix when matching default namespace URI', () => {
    const defaultNsRules = '@namespace url(default_ns); @namespace nsdefault url(default_ns); @namespace ns url(ns);';
    assert.strictEqual(getSelector(`${defaultNsRules} nsdefault|e { color: red; }`), 'e');
    assert.strictEqual(getSelector(`${defaultNsRules} nsdefault|* { color: red; }`), '*');
    assert.strictEqual(getSelector(`${defaultNsRules} nsdefault|e.c { color: red; }`), 'e.c');
    assert.strictEqual(getSelector(`${defaultNsRules} nsdefault|*.c { color: red; }`), '.c');
    assert.strictEqual(getSelector(`${defaultNsRules} nsdefault|*#id { color: red; }`), '#id');
  });
});
