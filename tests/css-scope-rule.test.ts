/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSScopeRule, CSSGroupingRule, CSSStyleRule } from '../src/index.ts';
import type { Rule } from '../src/types.ts';
import { parseStyleSheet } from '../src/parser.ts';

test('CSSScopeRule should be a subclass of CSSGroupingRule', () => {
  const rule = new CSSScopeRule('(.start)', '(.end)', [], (_text: string) => ({} as Rule));
  assert.ok(rule instanceof CSSGroupingRule);
});

test('CSSScopeRule should have startSelector and endSelector properties', () => {
  const rule = new CSSScopeRule('(.start)', '(.end)', [], (_text: string) => ({} as Rule));
  assert.strictEqual(rule.startSelector, '(.start)');
  assert.strictEqual(rule.endSelector, '(.end)');
});

test('CSSScopeRule should serialize correctly with both selectors', () => {
  const rule = new CSSScopeRule('(.start)', '(.end)', [], (_text: string) => ({} as Rule));
  assert.strictEqual(rule.cssText, '@scope (.start) to (.end) { }');
});

test('CSSScopeRule should serialize correctly with only start selector', () => {
  const rule = new CSSScopeRule('(.start)', null, [], (_text: string) => ({} as Rule));
  assert.strictEqual(rule.cssText, '@scope (.start) { }');
});

test('CSSScopeRule should preserve implied nesting selector in nested @scope', () => {
  const css = `
    .card {
      @scope (.content) {
        :scope { color: red; }
      }
    }
  `;
  const stylesheet = parseStyleSheet(css);
  const cardRule = stylesheet[0];
  assert.ok(cardRule instanceof CSSStyleRule);
  const scopeRule = cardRule.cssRules[0] as CSSScopeRule;
  assert.strictEqual(scopeRule.startSelector, '(.content)');
});

test('CSSScopeRule should preserve relative selector in nested @scope', () => {
  const css = `
    .card {
      @scope (> .content) {
        :scope { color: red; }
      }
    }
  `;
  const stylesheet = parseStyleSheet(css);
  const cardRule = stylesheet[0];
  assert.ok(cardRule instanceof CSSStyleRule);
  const scopeRule = cardRule.cssRules[0] as CSSScopeRule;
  assert.strictEqual(scopeRule.startSelector, '(> .content)');
});

