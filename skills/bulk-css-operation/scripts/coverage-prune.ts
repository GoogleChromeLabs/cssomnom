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

import {
  parse,
  CSSRule,
  CSSStyleRule,
  CSSGroupingRule,
  CSSMediaRule,
  CSSLayerStatementRule,
  CSSKeyframesRule,
  CSSFontFaceRule,
  CSSPropertyRule,
  CSSImportRule,
  CSSNamespaceRule,
  CSSScopeRule,
  CSSNestedDeclarations,
} from '../../../src/index.ts';
import { serializeSelectorList } from '../../../src/serializer.ts';
import type {
  SelectorList,
  ComplexSelector,
  CompoundSelector,
  Combinator,
  MediaCondition,
  MediaFeature,
  GeneralEnclosed,
} from '../../../src/types.ts';

export interface CoverageRange {
  start: number;
  end: number;
}

export type ReviewReason =
  | 'UNREFERENCED_KEYFRAMES'
  | 'UNREFERENCED_FONT_FACE'
  | 'DYNAMIC_STATE_PSEUDO'
  | 'INTERACTIVE_WITHOUT_BASE'
  | 'AMBIGUOUS';

export interface ReviewItem {
  header: string;
  reason: ReviewReason;
  description: string;
  rule: CSSRule;
}

export interface CoveragePruneResult {
  prunedCss: string;
  removedRules: string[];
  retainedRules: string[];
  reviewQueue: ReviewItem[];
}

export interface PruneOptions {
  /**
   * When true, comments out ambiguous triage rules in the CSS with @cssom-review annotations
   * instead of removing them, enabling easy visual diff inspection.
   * Defaults to `true`.
   */
  annotateReviewRules?: boolean;
  /**
   * When true, unreferenced @keyframes and @font-face rules are pruned immediately
   * instead of being retained and routed to the Tier 3 review queue.
   * Defaults to `false` (safe mode).
   */
  aggressiveAssetPruning?: boolean;

  // Granular override escape-hatches (all default to safe values: true):
  preserveRootCustomProperties?: boolean;
  preserveKeyframes?: boolean;
  preserveFontFaces?: boolean;
  preserveInteractivePseudoClasses?: boolean;
  preserveEnvironmentalMediaQueries?: boolean;
}

/**
 * Common interactive and dynamic pseudo-classes and environmental media features.
 */
export const INTERACTIVE_PSEUDOS = new Set([
  'focus-visible', 'focus-within', 'popover-open', 'hover', 'focus', 'active', 'target', 'visited',
]);

export const DYNAMIC_STATE_PSEUDOS = new Set([
  'checked', 'disabled', 'enabled', 'valid', 'invalid', 'required',
  'optional', 'read-only', 'read-write', 'empty', 'indeterminate', 'default',
]);

export const ENVIRONMENTAL_FEATURES = new Set([
  'prefers-color-scheme', 'prefers-reduced-motion', 'prefers-contrast', 'forced-colors',
  'dynamic-range', 'inverted-colors', 'prefers-reduced-transparency', 'prefers-reduced-data',
]);

export function hasPseudoClass(ast: SelectorList | null | undefined, targetSet: Set<string>): boolean {
  return Boolean(ast?.selectors.some(sel =>
    sel.type === 'complex-selector' && sel.items.some(it =>
      it.type === 'compound-selector' && it.selectors.some(s =>
        s.type === 'pseudo-class-selector' && (
          targetSet.has(s.name.toLowerCase()) ||
          (typeof s.argument === 'object' && s.argument !== null && 'type' in s.argument &&
            s.argument.type === 'selector-list' && hasPseudoClass(s.argument, targetSet))
        )
      )
    )
  ));
}

export function stripStatefulPseudos(complex: ComplexSelector): ComplexSelector | null {
  const items: (CompoundSelector | Combinator)[] = [];
  for (const item of complex.items) {
    if (item.type === 'combinator') {
      if (items.length > 0 && items[items.length - 1].type !== 'combinator') items.push(item);
      continue;
    }
    const selectors = item.selectors.filter(
      s => s.type !== 'pseudo-class-selector' ||
        (!INTERACTIVE_PSEUDOS.has(s.name.toLowerCase()) && !DYNAMIC_STATE_PSEUDOS.has(s.name.toLowerCase()))
    );
    if (selectors.length > 0) items.push({ type: 'compound-selector', selectors });
  }
  if (items[items.length - 1]?.type === 'combinator') items.pop();
  return items.length > 0 ? { type: 'complex-selector', items, tokens: [] } : null;
}

function getEnclosingRuleContext(rule: CSSRule): CSSStyleRule | CSSScopeRule | null {
  for (let curr = rule.parentRule; curr; curr = curr.parentRule) {
    if (curr instanceof CSSStyleRule || curr instanceof CSSScopeRule) return curr;
  }
  return null;
}

function getStrippedBaseSelectors(rule: CSSStyleRule): string[] {
  const bases: string[] = [];
  for (const sel of rule.selectorAST?.selectors ?? []) {
    if (sel.type !== 'complex-selector') continue;
    const stripped = stripStatefulPseudos(sel);
    if (stripped) bases.push(serializeSelectorList({ type: 'selector-list', selectors: [stripped] }));
  }
  return bases;
}

function hasEnvironmentalFeature(node?: MediaCondition | MediaFeature | GeneralEnclosed): boolean {
  if (!node) return false;
  if (node.type === 'media-feature' || node.type === 'general-enclosed') {
    return Boolean(node.name && ENVIRONMENTAL_FEATURES.has(node.name.toLowerCase()));
  }
  return node.children.some(hasEnvironmentalFeature);
}

export function isEnvironmentalMediaRule(rule: CSSMediaRule): boolean {
  return Boolean(rule.media.mediaQueriesAST?.some(
    q => (q.mediaType?.toLowerCase() === 'print' && q.modifier?.toLowerCase() !== 'not') || hasEnvironmentalFeature(q.condition)
  ));
}

function isCovered(
  start: number,
  end: number,
  ranges: CoverageRange[],
  parentSpan?: { start: number; end: number; bodyStart?: number }
): boolean {
  for (const r of ranges) {
    if (
      parentSpan &&
      r.end >= parentSpan.end &&
      (r.start <= parentSpan.start || (parentSpan.bodyStart !== undefined && r.start <= parentSpan.bodyStart))
    ) {
      continue;
    }
    if (Math.max(start, r.start) < Math.min(end, r.end)) return true;
  }
  return false;
}

export function getRuleHeader(rule: CSSRule, source?: string): string {
  if (rule instanceof CSSStyleRule) return rule.selectorText;
  const loc = rule.location;
  if (loc && source) {
    return source.slice(loc.start, loc.bodyStart !== undefined ? loc.bodyStart - 1 : loc.end).replace(/;$/, '').trim();
  }
  const braceIdx = rule.cssText.indexOf('{');
  return (braceIdx !== -1 ? rule.cssText.slice(0, braceIdx) : rule.cssText.replace(/;$/, '')).trim();
}

function getChildRules(rule: CSSRule): CSSRule[] {
  return rule instanceof CSSGroupingRule ? Array.from(rule.cssRules).filter(r => Boolean(r.location)) : [];
}

function isGroupingRule(rule: CSSRule): boolean {
  return rule instanceof CSSGroupingRule && getChildRules(rule).length > 0;
}

function extractFontFamilies(tokens: { type: string; value?: unknown }[]): string[] {
  const families: string[] = [];
  let idents: string[] = [];
  for (const t of tokens) {
    if (t.type === 'string') families.push(String(t.value));
    else if (t.type === 'ident') idents.push(String(t.value));
    else if (t.type === 'comma' && idents.length) { families.push(idents.join(' ')); idents = []; }
  }
  if (idents.length) families.push(idents.join(' '));
  return families;
}

function collectActiveAssetReferences(
  rules: CSSRule[],
  isRetained: (r: CSSRule) => boolean
): { animations: Set<string>; fonts: Set<string> } {
  const animations = new Set<string>();
  const fonts = new Set<string>();

  function walk(rule: CSSRule) {
    if (isRetained(rule) && rule instanceof CSSStyleRule) {
      for (const d of rule.style._declarations) {
        if (d.name === 'animation-name' || d.name === 'animation') {
          for (const t of d.value) {
            if (t.type === 'ident' || t.type === 'string') animations.add(String(t.value));
          }
        } else if (d.name === 'font-family' || d.name === 'font') {
          for (const f of extractFontFamilies(d.value)) fonts.add(f);
        }
      }
    }
    if (rule instanceof CSSGroupingRule) {
      for (let i = 0; i < rule.cssRules.length; i++) walk(rule.cssRules[i]);
    }
  }

  for (const r of rules) {
    walk(r);
  }

  return { animations, fonts };
}

/**
 * Coverage-guided CSS dead-code pruner with Human-in-the-Loop Triage and Guaranteed Preserves.
 *
 * Takes raw CSS stylesheet text and coverage ranges produced by Chrome DevTools / Puppeteer
 * and prunes unused rules while maintaining structural ordering, active animations,
 * interactive states, and surfacing ambiguous rules into a review queue.
 */
export function pruneUnusedCss(
  css: string,
  coverageRanges: CoverageRange[],
  options?: PruneOptions
): CoveragePruneResult {
  const annotateReview = options?.annotateReviewRules ?? true;
  const aggressiveAssetPruning = options?.aggressiveAssetPruning ?? false;
  const preserveRootCustomProperties = options?.preserveRootCustomProperties ?? true;
  const preserveKeyframes = options?.preserveKeyframes ?? (!aggressiveAssetPruning);
  const preserveFontFaces = options?.preserveFontFaces ?? (!aggressiveAssetPruning);
  const preserveInteractive = options?.preserveInteractivePseudoClasses ?? true;
  const preserveEnvironmental = options?.preserveEnvironmentalMediaQueries ?? true;

  const sheet = parse(css);
  const removedRules: string[] = [];
  const retainedRules: string[] = [];
  const retainedSet = new Set<CSSRule>();
  const reviewQueue: ReviewItem[] = [];
  const annotatedReviewMap = new Map<CSSRule, ReviewItem>();

  // Set of active style rules and scoped base selectors from confirmed coverage
  const activeContextRules = new Set<CSSStyleRule>();
  const activeScopedSelectors = new Map<CSSStyleRule | CSSScopeRule | null, Set<string>>();

  // First pass: identify all high-confidence used rules from coverage
  function identifyActiveRules(rule: CSSRule, parentSpan?: { start: number; end: number }) {
    const loc = rule.location;
    if (!loc) return;

    if (rule instanceof CSSStyleRule) {
      if (isCovered(loc.start, loc.end, coverageRanges, parentSpan)) {
        activeContextRules.add(rule);
        const ctx = getEnclosingRuleContext(rule);
        let scopedSet = activeScopedSelectors.get(ctx);
        if (!scopedSet) {
          scopedSet = new Set<string>();
          activeScopedSelectors.set(ctx, scopedSet);
        }
        for (const b of getStrippedBaseSelectors(rule)) {
          if (b) {
            scopedSet.add(b);
          }
        }
      }
    }

    if (isGroupingRule(rule)) {
      const mySpan = { start: loc.start, end: loc.end, bodyStart: loc.bodyStart };
      for (const child of getChildRules(rule)) {
        identifyActiveRules(child, mySpan);
      }
    }
  }

  for (let i = 0; i < sheet.cssRules.length; i++) {
    identifyActiveRules(sheet.cssRules[i]);
  }

  // Pre-scan for active animation and font references
  const activeAssets = collectActiveAssetReferences(
    Array.from(sheet.cssRules),
    (r) => {
      const loc = r.location;
      if (!loc) return false;
      return isCovered(loc.start, loc.end, coverageRanges);
    }
  );

  function isRootOrHtmlRule(rule: CSSStyleRule): boolean {
    return Boolean(rule.selectorAST?.selectors.some(s =>
      s.type === 'complex-selector' && s.items[0]?.type === 'compound-selector' &&
      s.items[0].selectors.some(p =>
        (p.type === 'pseudo-class-selector' && (p.name === 'root' || p.name === 'host')) ||
        (p.type === 'type-selector' && p.name.toLowerCase() === 'html')
      )
    ));
  }

  // Main rule evaluation pass
  function evaluateRuleUsage(rule: CSSRule, parentSpan?: { start: number; end: number }): boolean {
    const loc = rule.location;
    if (!loc) return false;
    const header = getRuleHeader(rule, css);

    // 0. Declarations inside an active rule belong to their enclosing rule
    if (rule instanceof CSSNestedDeclarations) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    }

    // 1. TIER 2: Guaranteed Preserves - Structural at-rules
    if (
      rule instanceof CSSImportRule ||
      rule instanceof CSSNamespaceRule ||
      rule instanceof CSSLayerStatementRule
    ) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    }

    // 2. TIER 2: Guaranteed Preserves - Environmental media queries (print, dark mode)
    if (preserveEnvironmental && rule instanceof CSSMediaRule && isEnvironmentalMediaRule(rule)) {
      const children = getChildRules(rule);
      const activeChildren = children.filter(
        child => preserveRootCustomProperties || !(child instanceof CSSStyleRule && isRootOrHtmlRule(child))
      );

      if (activeChildren.length > 0) {
        retainedRules.push(header);
        retainedSet.add(rule);
        for (const child of activeChildren) {
          retainedSet.add(child);
          retainedRules.push(getRuleHeader(child, css));
        }
        return true;
      }
    }

    // 3. TIER 2: Guaranteed Preserves - Custom properties & design tokens
    if (preserveRootCustomProperties) {
      if (rule instanceof CSSPropertyRule) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      if (rule instanceof CSSStyleRule) {
        const hasCustomProps = rule.style._declarations.some(d => d.name.startsWith('--'));
        if (hasCustomProps && isRootOrHtmlRule(rule)) {
          retainedRules.push(header);
          retainedSet.add(rule);
          return true;
        }
      }
    }

    // 4. AST-linked Asset Resolution: @keyframes
    if (rule instanceof CSSKeyframesRule) {
      if (!preserveKeyframes) {
        removedRules.push(header);
        return false;
      }
      const isReferenced = activeAssets.animations.has(rule.name);
      if (isReferenced) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      // Kept via blanket option, but surface to review queue as ambiguous
      retainedRules.push(header);
      retainedSet.add(rule);
      reviewQueue.push({
        header,
        reason: 'UNREFERENCED_KEYFRAMES',
        description: `@keyframes ${rule.name} was not referenced by any active CSS animation declaration.`,
        rule,
      });
      return true;
    }

    // 5. AST-linked Asset Resolution: @font-face
    if (rule instanceof CSSFontFaceRule) {
      if (!preserveFontFaces) {
        removedRules.push(header);
        return false;
      }
      const fontFam = extractFontFamilies(rule.style._declarations.find(d => d.name === 'font-family')?.value ?? [])[0] ?? '';
      const isReferenced = fontFam ? activeAssets.fonts.has(fontFam) : false;
      if (isReferenced) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      retainedRules.push(header);
      retainedSet.add(rule);
      reviewQueue.push({
        header,
        reason: 'UNREFERENCED_FONT_FACE',
        description: `@font-face '${fontFam || 'unknown'}' was not referenced by any active font-family.`,
        rule,
      });
      return true;
    }

    // 6. Interactive & Dynamic State Pseudo-Classes
    if (rule instanceof CSSStyleRule) {
      const isInteractive = hasPseudoClass(rule.selectorAST, INTERACTIVE_PSEUDOS);
      const isDynamicState = hasPseudoClass(rule.selectorAST, DYNAMIC_STATE_PSEUDOS);

      if (isInteractive || isDynamicState) {
        const ctx = getEnclosingRuleContext(rule);
        const bases = getStrippedBaseSelectors(rule);
        const baseActive = bases.some(
          b =>
            b !== '' &&
            ((b === '&' && ctx instanceof CSSStyleRule && activeContextRules.has(ctx)) ||
              (activeScopedSelectors.get(ctx)?.has(b) ?? false))
        );
        const primaryBase = bases.find(b => b !== '') || '';

        if (preserveInteractive && isInteractive && baseActive) {
          // Guaranteed preserve: base selector is actively in use
          retainedRules.push(header);
          retainedSet.add(rule);
          return true;
        }

        if (isDynamicState && baseActive) {
          const item: ReviewItem = {
            header,
            reason: 'DYNAMIC_STATE_PSEUDO',
            description: `Dynamic state pseudo-class on active base selector '${primaryBase || rule.selectorText}'.`,
            rule,
          };
          reviewQueue.push(item);
          if (annotateReview) {
            annotatedReviewMap.set(rule, item);
          }
        } else if (isInteractive && !baseActive) {
          const item: ReviewItem = {
            header,
            reason: 'INTERACTIVE_WITHOUT_BASE',
            description: `Interactive pseudo-class without active base selector '${primaryBase || rule.selectorText}'.`,
            rule,
          };
          reviewQueue.push(item);
          if (annotateReview) {
            annotatedReviewMap.set(rule, item);
          }
        }
      }
    }

    // 7. Grouping rules (@media, @layer, @supports, @container, @scope)
    if (isGroupingRule(rule)) {
      const mySpan = { start: loc.start, end: loc.end, bodyStart: loc.bodyStart };
      const children = getChildRules(rule);
      let anyChildUsed = false;
      for (const child of children) {
        if (evaluateRuleUsage(child, mySpan)) {
          anyChildUsed = true;
        }
      }
      const selfCovered = isCovered(loc.start, loc.bodyStart ?? loc.end, coverageRanges, parentSpan);
      if (anyChildUsed || selfCovered) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      removedRules.push(header);
      return false;
    }

    // 8. Normal style rules: checked against coverage with parent span exclusion
    const used = isCovered(loc.start, loc.end, coverageRanges, parentSpan);
    if (used) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    } else {
      if (!annotatedReviewMap.has(rule)) {
        removedRules.push(header);
      }
      return false;
    }
  }

  // Evaluate all top-level rules
  for (let i = 0; i < sheet.cssRules.length; i++) {
    evaluateRuleUsage(sheet.cssRules[i]);
  }

  function formatReviewAnnotation(item: ReviewItem | undefined, rawText: string): string {
    const reason = item?.reason || 'AMBIGUOUS';
    const desc = item?.description ? ` (${item.description})` : '';
    return `/* @cssom-review: ${reason}${desc}\n${rawText}\n*/`;
  }

  // Recursive slice/splicing to preserve comments and layout accurately
  function serializeKeptSlice(rule: CSSRule): string {
    const loc = rule.location!;
    const children = isGroupingRule(rule) ? getChildRules(rule) : [];

    // If not a grouping rule with children, return verbatim original text
    if (children.length === 0 || loc.bodyStart === undefined || loc.bodyEnd === undefined) {
      if (annotatedReviewMap.has(rule)) {
        return formatReviewAnnotation(annotatedReviewMap.get(rule), css.slice(loc.start, loc.end));
      }
      return css.slice(loc.start, loc.end);
    }

    // Grouping rule: preserve header up to bodyStart ('{')
    const headerPrefix = css.slice(loc.start, loc.bodyStart);
    const closingSuffix = css.slice(loc.bodyEnd, loc.end);

    let innerContent = '';
    let lastPos = loc.bodyStart;

    for (const child of children) {
      const childLoc = child.location!;
      const gap = css.slice(lastPos, childLoc.start);

      if (retainedSet.has(child)) {
        innerContent += gap;
        innerContent += serializeKeptSlice(child);
      } else if (annotatedReviewMap.has(child)) {
        innerContent += gap;
        innerContent += formatReviewAnnotation(annotatedReviewMap.get(child), css.slice(childLoc.start, childLoc.end));
      } else {
        const trimmedGap = gap.replace(/(?:\r?\n[ \t]*)+$/, '');
        if (/[^\s]/.test(trimmedGap)) {
          innerContent += trimmedGap;
        }
      }
      lastPos = childLoc.end;
    }

    // Retain trailing whitespace/comments between last child and closing brace
    innerContent += css.slice(lastPos, loc.bodyEnd);

    return `${headerPrefix}${innerContent}${closingSuffix}`;
  }

  // Build top-level pruned text
  let prunedCss = '';
  let lastPos = 0;

  for (let i = 0; i < sheet.cssRules.length; i++) {
    const rootRule = sheet.cssRules[i];
    const loc = rootRule.location;
    if (!loc) continue;

    if (retainedSet.has(rootRule)) {
      prunedCss += css.slice(lastPos, loc.start);
      prunedCss += serializeKeptSlice(rootRule);
      lastPos = loc.end;
    } else if (annotatedReviewMap.has(rootRule)) {
      prunedCss += css.slice(lastPos, loc.start);
      prunedCss += formatReviewAnnotation(annotatedReviewMap.get(rootRule), css.slice(loc.start, loc.end));
      lastPos = loc.end;
    } else {
      lastPos = loc.end;
    }
  }

  // Append remaining text (trailing comments/whitespace)
  prunedCss += css.slice(lastPos);

  // Clean up excess blank lines (>2 newlines) while preserving formatting
  const cleanedCss = prunedCss.replace(/\n{3,}/g, '\n\n').trim();

  return {
    prunedCss: cleanedCss,
    removedRules,
    retainedRules,
    reviewQueue,
  };
}
