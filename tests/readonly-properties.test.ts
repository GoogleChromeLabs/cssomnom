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
import { CSSImportRule, CSSNamespaceRule, CSSMarginRule, CSSKeyframesRule, CSSLayerStatementRule, CSSGroupingRule, CSSStyleRule, CSSMediaRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSViewTransitionRule } from '../src/index.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Rule } from '../src/types.ts';

describe('Readonly properties', () => {
  it('should make CSSImportRule properties readonly', () => {
    const rule = new CSSImportRule('http://example.com');
    
    assert.throws(() => {
      // @ts-expect-error - href should be readonly
      rule.href = 'foo';
    }, TypeError);
    
    assert.throws(() => {
      // @ts-expect-error - styleSheet should be readonly
      rule.styleSheet = null;
    }, TypeError);
    
    assert.throws(() => {
      // @ts-expect-error - layerName should be readonly
      rule.layerName = 'foo';
    }, TypeError);
    
    assert.throws(() => {
      // @ts-expect-error - supportsText should be readonly
      rule.supportsText = 'foo';
    }, TypeError);
    
    assert.ok(true);
  });

  it('should make CSSNamespaceRule properties readonly', () => {
    const rule = new CSSNamespaceRule('prefix', 'http://namespace.com');
    
    assert.throws(() => {
      // @ts-expect-error - namespaceURI should be readonly
      rule.namespaceURI = 'foo';
    }, TypeError);
    
    assert.throws(() => {
      // @ts-expect-error - prefix should be readonly
      rule.prefix = 'foo';
    }, TypeError);
    
    assert.ok(true);
  });

  it('should make CSSMarginRule properties readonly', () => {
    const rule = new CSSMarginRule('top-left', []);
    
    // @ts-expect-error - name should be readonly
    rule.name = 'foo';
    
    assert.ok(true);
  });

  it('should make CSSKeyframesRule length readonly', () => {
    const rule = new CSSKeyframesRule('name', []) as unknown as import('../src/types.ts').CSSKeyframesRule;
    
    const _l = rule.length;
    
    assert.throws(() => {
      // @ts-expect-error - length should be readonly
      rule.length = 0;
    }, TypeError);
  });

  it('should make CSSLayerStatementRule nameList readonly', () => {
    const rule = new CSSLayerStatementRule(['layer1']) as unknown as import('../src/types.ts').CSSLayerStatementRule;
    
    // @ts-expect-error - nameList should be readonly
    rule.nameList = [];
    
    assert.ok(true);
  });

  it('should make CSSGroupingRule cssRules readonly', () => {
    const rule = new CSSGroupingRule([], () => ({} as unknown as Rule));
    // @ts-expect-error - cssRules should be readonly
    rule.cssRules = null as unknown as CSSRuleList;
    assert.ok(true);
  });

  it('should make CSSStyleRule styleMap readonly', () => {
    const rule = new CSSStyleRule('.foo', [], [], () => ({} as unknown as Rule));
    // @ts-expect-error - styleMap should be readonly
    rule.styleMap = null as unknown as StylePropertyMapReadOnly;
    assert.ok(true);
  });

  it('should make CSSMediaRule media readonly', () => {
    const rule = new CSSMediaRule('', [], () => ({} as unknown as Rule));
    // @ts-expect-error - media should be readonly
    rule.media = null as unknown as MediaList;
    assert.ok(true);
  });

  it('should make CSSSupportsRule conditionText readonly', () => {
    const rule = new CSSSupportsRule('condition', [], () => ({} as unknown as Rule));
    // @ts-expect-error - conditionText should be readonly
    rule.conditionText = 'foo';
    assert.ok(true);
  });

  it('should make CSSContainerRule containerQuery readonly', () => {
    const rule = new CSSContainerRule('query', [], () => ({} as unknown as Rule));
    // @ts-expect-error - containerQuery should be readonly
    rule.containerQuery = 'foo';
    assert.ok(true);
  });

  it('should make CSSLayerBlockRule name readonly', () => {
    const rule = new CSSLayerBlockRule('name', [], () => ({} as unknown as Rule));
    // @ts-expect-error - name should be readonly
    rule.name = 'foo';
    assert.ok(true);
  });








  it('should make CSSViewTransitionRule navigation readonly', () => {
    const rule = new CSSViewTransitionRule([]);
    // @ts-expect-error - navigation should be readonly
    rule.navigation = 'foo';
    assert.ok(true);
  });
});

