/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { CSSImportRule, CSSNamespaceRule, CSSMarginRule, CSSKeyframesRule, CSSLayerStatementRule, CSSGroupingRule, CSSStyleRule, CSSMediaRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSViewTransitionRule } from '../src/index.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Rule } from '../src/types.ts';

describe('Readonly properties', () => {
  it('should make CSSImportRule properties readonly', () => {
    const rule = new CSSImportRule('http://example.com');
    
    // @ts-expect-error - href should be readonly
    rule.href = 'foo';
    
    
    // @ts-expect-error - styleSheet should be readonly
    rule.styleSheet = null;
    
    // @ts-expect-error - layerName should be readonly
    rule.layerName = 'foo';
    
    // @ts-expect-error - supportsText should be readonly
    rule.supportsText = 'foo';
    
    // We don't assert runtime immutability as we only enforce it in types for now.
    assert.ok(true);
  });

  it('should make CSSNamespaceRule properties readonly', () => {
    const rule = new CSSNamespaceRule('prefix', 'http://namespace.com');
    
    // @ts-expect-error - namespaceURI should be readonly
    rule.namespaceURI = 'foo';
    
    // @ts-expect-error - prefix should be readonly
    rule.prefix = 'foo';
    
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

