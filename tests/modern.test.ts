/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tokenize } from '../src/tokenizer.ts';
import { Parser } from '../src/parser.ts';
import { CSSStyleRule, CSSLayerBlockRule } from '../src/index.ts';

test('parse modern CSS and verify content', () => {
  const filePath = path.resolve(process.cwd(), 'tests/fixtures/modern.css');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const tokens = tokenize(content);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  
  assert.ok(stylesheet, 'Should return a stylesheet');
  
  // Verify some key rules to make the test stronger
  const rules = stylesheet.cssRules;
  assert.ok(rules.length > 50, `Should have many rules, found ${rules.length}`);
  
  // Rule 0: .card
  const cardRule = rules.item(0) as CSSStyleRule;
  assert.strictEqual(cardRule.type, 1); // STYLE_RULE
  assert.strictEqual(cardRule.selectorText.trim(), '.card');
  assert.strictEqual(cardRule.style.getPropertyValue('container').trim(), '--my-card / inline-size');
  
  // Find :root rule
  const rootRule = Array.from(rules as unknown as ArrayLike<CSSStyleRule>).find(r => r.type === 1 && r.selectorText.trim() === ':root');
  assert.ok(rootRule, 'Should find :root rule');
  if (!rootRule) throw new Error('Expected rootRule to exist');
  assert.strictEqual(rootRule.style.getPropertyValue('--surface-1').trim(), 'light-dark(white, #222)');
  
  // Find the @layer components.card rule
  const layerRule = Array.from(rules as unknown as ArrayLike<unknown>).find(r => (r as { constructor: { name: string } }).constructor.name === 'CSSLayerBlockRule' && (r as CSSLayerBlockRule).name === 'components.card') as CSSLayerBlockRule | undefined;
  assert.ok(layerRule, 'Should find @layer components.card rule');
  if (!layerRule) throw new Error('Expected layerRule to exist');
  assert.ok(layerRule.cssRules, 'Layer rule should have cssRules');
  assert.ok(layerRule.cssRules.length > 0, 'Layer rule should have children');
});
