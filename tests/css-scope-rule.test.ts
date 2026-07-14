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

