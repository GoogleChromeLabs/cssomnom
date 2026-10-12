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
  CSSSupportsRule,
  CSSContainerRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSKeyframesRule,
  CSSFontFaceRule,
  CSSPropertyRule,
  CSSImportRule,
  CSSNamespaceRule,
  CSSStartingStyleRule,
  CSSScopeRule,
  CSSPageRule,
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
  'focus-visible',
  'focus-within',
  'popover-open',
  'hover',
  'focus',
  'active',
  'target',
  'visited',
]);

export const DYNAMIC_STATE_PSEUDOS = new Set([
  'checked',
  'disabled',
  'enabled',
  'valid',
  'invalid',
  'required',
  'optional',
  'read-only',
  'read-write',
  'empty',
  'indeterminate',
  'default',
]);

export const ENVIRONMENTAL_FEATURES = new Set([
  'prefers-color-scheme',
  'prefers-reduced-motion',
  'prefers-contrast',
  'forced-colors',
  'dynamic-range',
  'inverted-colors',
  'prefers-reduced-transparency',
  'prefers-reduced-data',
]);

const ANIMATION_KEYWORDS = new Set([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'infinite',
  'none',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'ease',
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

export function hasPseudoClass(
  selectorAST: SelectorList | null | undefined,
  targetSet: Set<string>
): boolean {
  if (!selectorAST || !selectorAST.selectors) return false;
  for (const sel of selectorAST.selectors) {
    if (sel.type !== 'complex-selector') continue;
    if (hasPseudoClassInComplex(sel, targetSet)) return true;
  }
  return false;
}

function hasPseudoClassInComplex(
  complex: ComplexSelector,
  targetSet: Set<string>
): boolean {
  for (const item of complex.items) {
    if (item.type !== 'compound-selector') continue;
    for (const simple of item.selectors) {
      if (simple.type === 'pseudo-class-selector') {
        if (targetSet.has(simple.name.toLowerCase())) {
          return true;
        }
        if (
          simple.argument &&
          typeof simple.argument === 'object' &&
          'type' in simple.argument &&
          simple.argument.type === 'selector-list'
        ) {
          if (hasPseudoClass(simple.argument, targetSet)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function stripStatefulPseudos(complex: ComplexSelector): ComplexSelector | null {
  const newItems: (CompoundSelector | Combinator)[] = [];

  for (const item of complex.items) {
    if (item.type === 'combinator') {
      newItems.push({ ...item });
    } else if (item.type === 'compound-selector') {
      const remainingSelectors: CompoundSelector['selectors'] = [];
      for (const s of item.selectors) {
        if (s.type === 'pseudo-class-selector') {
          const name = s.name.toLowerCase();
          if (INTERACTIVE_PSEUDOS.has(name) || DYNAMIC_STATE_PSEUDOS.has(name)) {
            continue;
          }
          if (
            s.argument &&
            typeof s.argument === 'object' &&
            'type' in s.argument &&
            s.argument.type === 'selector-list'
          ) {
            const strippedArgs = s.argument.selectors
              .map(sub => (sub.type === 'complex-selector' ? stripStatefulPseudos(sub) : sub))
              .filter((sub): sub is NonNullable<typeof sub> => sub !== null);
            if (strippedArgs.length === 0) {
              continue;
            }
            remainingSelectors.push({
              ...s,
              argument: { type: 'selector-list', selectors: strippedArgs },
            });
            continue;
          }
        }
        remainingSelectors.push({ ...s });
      }
      if (remainingSelectors.length > 0) {
        newItems.push({
          type: 'compound-selector',
          selectors: remainingSelectors,
        });
      }
    }
  }

  while (newItems.length > 0 && newItems[0].type === 'combinator') {
    newItems.shift();
  }
  while (newItems.length > 0 && newItems[newItems.length - 1].type === 'combinator') {
    newItems.pop();
  }

  const cleanedItems: (CompoundSelector | Combinator)[] = [];
  for (const it of newItems) {
    if (
      it.type === 'combinator' &&
      cleanedItems.length > 0 &&
      cleanedItems[cleanedItems.length - 1].type === 'combinator'
    ) {
      cleanedItems[cleanedItems.length - 1] = it;
    } else {
      cleanedItems.push(it);
    }
  }

  if (!cleanedItems.some(it => it.type === 'compound-selector')) {
    return null;
  }

  return {
    type: 'complex-selector',
    items: cleanedItems,
    tokens: [],
  };
}

/**
 * Walks up parentRule through intermediate conditional grouping rules (@media, @supports, etc.)
 * to find the nearest enclosing CSSStyleRule or CSSScopeRule (or null at top-level).
 */
function getEnclosingRuleContext(rule: CSSRule): CSSStyleRule | CSSScopeRule | null {
  let curr: CSSRule | null = rule.parentRule;
  while (curr) {
    if (curr instanceof CSSStyleRule || curr instanceof CSSScopeRule) return curr;
    curr = curr.parentRule;
  }
  return null;
}

function getStrippedBaseSelectors(rule: CSSStyleRule): string[] {
  const selectors = rule.selectorAST?.selectors ?? [];
  const bases: string[] = [];
  for (const sel of selectors) {
    if (sel.type !== 'complex-selector') continue;
    const stripped = stripStatefulPseudos(sel);
    if (!stripped) continue;
    bases.push(serializeSelectorList({ type: 'selector-list', selectors: [stripped] }));
  }
  return bases;
}

function hasEnvironmentalFeature(
  node: MediaCondition | MediaFeature | GeneralEnclosed | undefined
): boolean {
  if (!node) return false;
  if (node.type === 'media-feature') {
    return ENVIRONMENTAL_FEATURES.has(node.name.toLowerCase());
  }
  if (node.type === 'media-condition') {
    return node.children.some(child => hasEnvironmentalFeature(child));
  }
  if (node.type === 'general-enclosed') {
    if (node.name && ENVIRONMENTAL_FEATURES.has(node.name.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Environmental media queries that should be guaranteed preserved because point-in-time
 * browser capture does not evaluate alternative color schemes or print output.
 */
export function isEnvironmentalMediaRule(rule: CSSMediaRule): boolean {
  const queries = rule.media.mediaQueriesAST;
  if (!queries || queries.length === 0) return false;
  return queries.some(q => {
    if (q.mediaType && q.mediaType.toLowerCase() === 'print' && q.modifier?.toLowerCase() !== 'not') {
      return true;
    }
    if (q.condition && hasEnvironmentalFeature(q.condition)) return true;
    return false;
  });
}

/**
 * Determines whether any range intersects with [start, end).
 * If parentSpan is provided, ranges that envelop the entire parent span are ignored
 * so that outer grouping at-rules (@layer, .parent) do not swallow unused children.
 */
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
      (r.start <= parentSpan.start ||
        (parentSpan.bodyStart !== undefined &&
          r.start <= parentSpan.bodyStart))
    ) {
      continue;
    }
    if (Math.max(start, r.start) < Math.min(end, r.end)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts the canonical rule header (selector or at-rule prelude) cleanly.
 */
export function getRuleHeader(rule: CSSRule, source?: string): string {
  if (rule instanceof CSSStyleRule) {
    return rule.selectorText;
  }
  if (rule instanceof CSSMediaRule) {
    return `@media ${rule.conditionText}`;
  }
  if (rule instanceof CSSSupportsRule) {
    return `@supports ${rule.conditionText}`;
  }
  if (rule instanceof CSSContainerRule) {
    return `@container ${rule.conditionText}`;
  }
  if (rule instanceof CSSLayerBlockRule) {
    return rule.name ? `@layer ${rule.name}` : '@layer';
  }
  if (rule instanceof CSSLayerStatementRule) {
    return `@layer ${rule.nameList.join(', ')}`;
  }
  if (rule instanceof CSSKeyframesRule) {
    return `@keyframes ${rule.name}`;
  }
  if (rule instanceof CSSFontFaceRule) {
    return '@font-face';
  }
  if (rule instanceof CSSPropertyRule) {
    return `@property ${rule.name}`;
  }
  if (rule instanceof CSSStartingStyleRule) {
    return '@starting-style';
  }
  if (rule instanceof CSSScopeRule) {
    let prelude = rule.startSelector || '';
    if (rule.endSelector) {
      prelude += `${prelude ? ' ' : ''}to ${rule.endSelector}`;
    }
    return prelude ? `@scope ${prelude}` : '@scope';
  }
  if (rule instanceof CSSPageRule) {
    return rule.selectorText ? `@page ${rule.selectorText}` : '@page';
  }
  if (rule instanceof CSSImportRule || rule instanceof CSSNamespaceRule) {
    return rule.cssText.replace(/;$/, '').trim();
  }
  const loc = rule.location;
  if (!loc || !source) {
    const text = rule.cssText;
    const braceIdx = text.indexOf('{');
    return braceIdx !== -1 ? text.slice(0, braceIdx).trim() : text.replace(/;$/, '').trim();
  }
  if (loc.bodyStart !== undefined) {
    const braceIdx = source.lastIndexOf('{', loc.bodyStart);
    const headerEnd = braceIdx >= loc.start ? braceIdx : loc.bodyStart;
    return source.slice(loc.start, headerEnd).trim();
  }
  const semiIdx = source.lastIndexOf(';', loc.end);
  const headerEnd = semiIdx >= loc.start ? semiIdx : loc.end;
  return source.slice(loc.start, headerEnd).trim();
}

/**
 * Returns prunable child CSS rules that have source locations.
 */
function getChildRules(rule: CSSRule): CSSRule[] {
  if (rule instanceof CSSGroupingRule) {
    const list = rule.cssRules;
    const children: CSSRule[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.location) {
        children.push(item);
      }
    }
    return children;
  }
  return [];
}

/**
 * Checks if a rule is a grouping rule with nested child rules that can be pruned individually.
 */
function isGroupingRule(rule: CSSRule): boolean {
  return rule instanceof CSSGroupingRule && getChildRules(rule).length > 0;
}

export function extractFontFamilyName(rule: CSSFontFaceRule): string {
  const decl = rule.style._declarations.find(d => d.name === 'font-family');
  if (!decl) return '';
  return decl.value
    .filter(t => t.type === 'string' || t.type === 'ident')
    .map(t => String(t.value))
    .join(' ')
    .trim();
}

/**
 * Recursively walks rules and collects all referenced animation names and font family names
 * declared across all active style rules.
 */
function collectActiveAssetReferences(
  rules: CSSRule[],
  isRetained: (r: CSSRule) => boolean
): { animations: Set<string>; fonts: Set<string> } {
  const animations = new Set<string>();
  const fonts = new Set<string>();

  function walk(rule: CSSRule) {
    if (isRetained(rule)) {
      if (rule instanceof CSSStyleRule) {
        for (const d of rule.style._declarations) {
          if (d.name === 'animation-name' || d.name === 'animation') {
            for (const t of d.value) {
              if (t.type === 'ident' || t.type === 'string') {
                const val = String(t.value);
                if (!ANIMATION_KEYWORDS.has(val.toLowerCase())) {
                  animations.add(val);
                }
              }
            }
          } else if (d.name === 'font-family' || d.name === 'font') {
            let currentFamily: string[] = [];
            for (const t of d.value) {
              if (t.type === 'comma') {
                if (currentFamily.length > 0) {
                  fonts.add(currentFamily.join(' '));
                  currentFamily = [];
                }
              } else if (t.type === 'string') {
                fonts.add(String(t.value));
              } else if (t.type === 'ident') {
                if (d.name === 'font') {
                  fonts.add(String(t.value));
                }
                currentFamily.push(String(t.value));
              }
            }
            if (currentFamily.length > 0) {
              fonts.add(currentFamily.join(' '));
            }
          }
        }
      }
    }
    if (rule instanceof CSSGroupingRule) {
      const list = rule.cssRules;
      for (let i = 0; i < list.length; i++) {
        walk(list[i]);
      }
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
    if (!rule.selectorAST) {
      const sel = rule.selectorText.trim();
      return sel === ':root' || sel.startsWith(':root') || sel === 'html' || sel.startsWith('html') || sel === ':host';
    }
    for (const s of rule.selectorAST.selectors) {
      if (s.type !== 'complex-selector') continue;
      const firstCompound = s.items.find(it => it.type === 'compound-selector');
      if (firstCompound && firstCompound.type === 'compound-selector') {
        const isRoot = firstCompound.selectors.some(
          simple =>
            (simple.type === 'pseudo-class-selector' && (simple.name === 'root' || simple.name === 'host')) ||
            (simple.type === 'type-selector' && simple.name.toLowerCase() === 'html')
        );
        if (isRoot) return true;
      }
    }
    return false;
  }

  // Main rule evaluation pass
  function evaluateRuleUsage(rule: CSSRule, parentSpan?: { start: number; end: number }): boolean {
    const loc = rule.location;
    if (!loc) return false;
    const header = getRuleHeader(rule, css);

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
      const activeChildren = children.filter((child) => {
        if (!preserveRootCustomProperties && child instanceof CSSStyleRule) {
          if (isRootOrHtmlRule(child)) {
            return false;
          }
        }
        return true;
      });

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
      const fontFam = extractFontFamilyName(rule);
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
