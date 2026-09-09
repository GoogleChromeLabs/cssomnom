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
  CSSKeyframesRule,
  CSSFontFaceRule,
  CSSPropertyRule,
  CSSImportRule,
  CSSNamespaceRule,
} from '../../../../src/index.ts';

export interface CoverageRange {
  start: number;
  end: number;
}

export interface CoveragePruneResult {
  prunedCss: string;
  removedRules: string[];
  retainedRules: string[];
}

export interface PruneOptions {
  preserveRootCustomProperties?: boolean;
  preserveKeyframes?: boolean;
  preserveFontFaces?: boolean;
}

/**
 * Determines whether any range intersects with [start, end).
 */
function isCovered(start: number, end: number, ranges: CoverageRange[]): boolean {
  for (const r of ranges) {
    if (Math.max(start, r.start) < Math.min(end, r.end)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts the rule header (selector or at-rule prelude) verbatim from source text.
 */
function getRuleHeader(rule: CSSRule, source: string): string {
  const loc = rule.location;
  if (!loc) return '';
  if (loc.bodyStart !== undefined) {
    return source.slice(loc.start, loc.bodyStart).replace(/\s*\{$/, '').trim();
  }
  return source.slice(loc.start, loc.end).trim();
}

/**
 * Returns prunable child CSS rules that have source locations.
 */
function getChildRules(rule: CSSRule): CSSRule[] {
  if ('cssRules' in rule && rule.cssRules) {
    const list = (rule as CSSGroupingRule).cssRules;
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
  if (
    rule instanceof CSSKeyframesRule ||
    rule instanceof CSSFontFaceRule ||
    rule instanceof CSSPropertyRule
  ) {
    return false;
  }
  if ('cssRules' in rule && rule.cssRules) {
    return getChildRules(rule).length > 0;
  }
  return false;
}

/**
 * Coverage-guided CSS dead-code pruner.
 *
 * Takes raw CSS stylesheet text and coverage ranges produced by Chrome DevTools / Puppeteer
 * (`CSS.startRuleUsageTracking` / `CSS.stopRuleUsageTracking`) and strips unused rules while
 * maintaining grouping at-rules, comments, and configurable declarations.
 */
export function pruneUnusedCss(
  css: string,
  coverageRanges: CoverageRange[],
  options?: PruneOptions
): CoveragePruneResult {
  const preserveRootCustomProperties = options?.preserveRootCustomProperties ?? true;
  const preserveKeyframes = options?.preserveKeyframes ?? true;
  const preserveFontFaces = options?.preserveFontFaces ?? true;

  const sheet = parse(css);
  const removedRules: string[] = [];
  const retainedRules: string[] = [];
  const retainedSet = new Set<CSSRule>();

  function evaluateRuleUsage(rule: CSSRule): boolean {
    const loc = rule.location;
    if (!loc) return false;
    const header = getRuleHeader(rule, css);

    // 1. Mandatory preserves for meta at-rules
    if (
      rule instanceof CSSImportRule ||
      rule instanceof CSSNamespaceRule ||
      rule.constructor.name === 'CSSCharsetRule'
    ) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    }

    // 2. Options-based preservation: @keyframes
    if (preserveKeyframes && rule instanceof CSSKeyframesRule) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    }

    // 3. Options-based preservation: @font-face
    if (preserveFontFaces && rule instanceof CSSFontFaceRule) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    }

    // 4. Options-based preservation: :root / custom properties
    if (preserveRootCustomProperties) {
      if (rule instanceof CSSPropertyRule) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      if (rule instanceof CSSStyleRule && (header === ':root' || header.includes(':root'))) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
    }

    // 5. Grouping rules: used if any child is used, or if rule itself is covered
    if (isGroupingRule(rule)) {
      const children = getChildRules(rule);
      let anyChildUsed = false;
      for (const child of children) {
        if (evaluateRuleUsage(child)) {
          anyChildUsed = true;
        }
      }
      const selfCovered = isCovered(loc.start, loc.bodyStart ?? loc.end, coverageRanges);
      if (anyChildUsed || selfCovered) {
        retainedRules.push(header);
        retainedSet.add(rule);
        return true;
      }
      removedRules.push(header);
      return false;
    }

    // 6. Normal rules: covered if range intersects [start, end)
    const used = isCovered(loc.start, loc.end, coverageRanges);
    if (used) {
      retainedRules.push(header);
      retainedSet.add(rule);
      return true;
    } else {
      removedRules.push(header);
      return false;
    }
  }

  // Evaluate all top-level rules
  for (let i = 0; i < sheet.cssRules.length; i++) {
    evaluateRuleUsage(sheet.cssRules[i]);
  }

  // Recursive slice/splicing to preserve comments and layout accurately
  function serializeKeptSlice(rule: CSSRule): string {
    const loc = rule.location!;
    const children = isGroupingRule(rule) ? getChildRules(rule) : [];

    // If not a grouping rule with children, return verbatim original text
    if (children.length === 0 || loc.bodyStart === undefined || loc.bodyEnd === undefined) {
      return css.slice(loc.start, loc.end);
    }

    // If grouping rule, preserve the header up to bodyStart ('{')
    const headerPrefix = css.slice(loc.start, loc.bodyStart);
    const closingSuffix = css.slice(loc.bodyEnd, loc.end);

    let innerContent = '';
    let lastPos = loc.bodyStart;

    for (const child of children) {
      const childLoc = child.location!;
      if (retainedSet.has(child)) {
        // Retain whitespace/comments between lastPos and child.start
        innerContent += css.slice(lastPos, childLoc.start);
        innerContent += serializeKeptSlice(child);
        lastPos = childLoc.end;
      } else {
        // Skip child text, move lastPos to child.end
        lastPos = childLoc.end;
      }
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
  };
}
