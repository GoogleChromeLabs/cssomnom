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

import { tokenize } from '../../../../src/tokenizer.ts';
import type { Token } from '../../../../src/types.ts';

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

interface ParsedRuleNode {
  type: 'style-rule' | 'at-rule';
  name?: string;
  header: string;
  prelude: string;
  startIndex: number;
  endIndex: number;
  headerEnd: number;
  bodyStartIndex?: number;
  bodyEndIndex?: number;
  children: ParsedRuleNode[];
  isGrouping: boolean;
  isSpecialPreserve?: boolean;
  isRootOrCustomProp?: boolean;
  hasCustomProperties?: boolean;
}

/**
 * Checks whether the token stream at pos would begin a nested rule or grouping at-rule
 * (i.e. reaches '{' before ';' or '}' or 'EOF').
 */
function wouldStartRule(tokens: Token[], startPos: number): boolean {
  let p = startPos;
  while (p < tokens.length && tokens[p].type === 'whitespace') p++;
  if (p >= tokens.length) return false;
  if (tokens[p].type === 'at-keyword') return true;

  while (p < tokens.length) {
    const t = tokens[p];
    if (t.type === '{') return true;
    if (t.type === 'semicolon' || t.type === '}' || t.type === 'EOF') return false;
    if (t.type === '(' || t.type === '[') {
      const close = t.type === '(' ? ')' : ']';
      p++;
      let d = 1;
      while (p < tokens.length && d > 0) {
        if (tokens[p].type === t.type) d++;
        else if (tokens[p].type === close) d--;
        p++;
      }
      continue;
    }
    p++;
  }
  return false;
}

const GROUPING_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'starting-style',
]);

/**
 * Parses the raw CSS into a hierarchy of rule nodes annotated with exact source indices.
 */
function parseCssRuleTree(tokens: Token[], source: string): ParsedRuleNode[] {
  let pos = 0;

  function skipWhitespace() {
    while (pos < tokens.length && tokens[pos].type === 'whitespace') pos++;
  }

  function parseSingleRule(): ParsedRuleNode | null {
    skipWhitespace();
    if (pos >= tokens.length || tokens[pos].type === 'EOF') return null;

    const startTok = tokens[pos];
    const startIndex = startTok.startIndex ?? 0;

    if (startTok.type === 'at-keyword') {
      const name = (startTok.value || '').toLowerCase();
      pos++; // consume at-keyword

      // Consume prelude until ';' or '{'
      while (
        pos < tokens.length &&
        tokens[pos].type !== 'semicolon' &&
        tokens[pos].type !== '{' &&
        tokens[pos].type !== 'EOF'
      ) {
        if (tokens[pos].type === '(' || tokens[pos].type === '[') {
          const closeType = tokens[pos].type === '(' ? ')' : ']';
          pos++;
          let d = 1;
          while (pos < tokens.length && d > 0) {
            if (tokens[pos].type === '(' || tokens[pos].type === '[') d++;
            else if (tokens[pos].type === closeType) d--;
            pos++;
          }
          continue;
        }
        pos++;
      }

      if (pos >= tokens.length || tokens[pos].type === 'EOF') return null;

      // Semicolon-terminated at-rule (e.g. @charset, @import, @namespace, @layer a, b;)
      if (tokens[pos].type === 'semicolon') {
        const endIndex = tokens[pos].endIndex ?? startIndex;
        const headerEnd = endIndex;
        pos++; // consume ';'
        return {
          type: 'at-rule',
          name,
          header: source.slice(startIndex, endIndex),
          prelude: source.slice(startIndex, endIndex),
          startIndex,
          endIndex,
          headerEnd,
          children: [],
          isGrouping: false,
          isSpecialPreserve: ['charset', 'import', 'namespace'].includes(name),
        };
      }

      // Block-delimited at-rule
      if (tokens[pos].type === '{') {
        const headerEnd = tokens[pos].startIndex ?? startIndex;
        pos++; // consume '{'
        const bodyStartIndex = tokens[pos - 1].endIndex ?? headerEnd;
        const children: ParsedRuleNode[] = [];
        const isGrouping = GROUPING_AT_RULES.has(name);

        if (isGrouping) {
          while (pos < tokens.length && tokens[pos].type !== '}' && tokens[pos].type !== 'EOF') {
            skipWhitespace();
            if (tokens[pos].type === '}' || tokens[pos].type === 'EOF') break;
            if (wouldStartRule(tokens, pos)) {
              const child = parseSingleRule();
              if (child) children.push(child);
              else pos++;
            } else {
              // skip declaration inside grouping rule
              while (
                pos < tokens.length &&
                tokens[pos].type !== 'semicolon' &&
                tokens[pos].type !== '}' &&
                tokens[pos].type !== '{'
              ) {
                pos++;
              }
              if (tokens[pos]?.type === 'semicolon') pos++;
            }
          }
        } else {
          // Leaf at-rule block (e.g. @keyframes, @font-face, @property, @page)
          let depth = 1;
          while (pos < tokens.length && depth > 0) {
            if (tokens[pos].type === '{') depth++;
            else if (tokens[pos].type === '}') {
              depth--;
              if (depth === 0) break;
            }
            pos++;
          }
        }

        let endIndex = pos < tokens.length ? (tokens[pos].endIndex ?? source.length) : source.length;
        let bodyEndIndex = pos < tokens.length ? (tokens[pos].startIndex ?? source.length) : source.length;
        if (pos < tokens.length && tokens[pos].type === '}') {
          endIndex = tokens[pos].endIndex ?? endIndex;
          pos++;
        }

        const prelude = source.slice(startIndex, headerEnd).trim();
        const ruleText = source.slice(startIndex, endIndex);

        return {
          type: 'at-rule',
          name,
          header: prelude,
          prelude,
          startIndex,
          endIndex,
          headerEnd,
          bodyStartIndex,
          bodyEndIndex,
          children,
          isGrouping,
          isSpecialPreserve: ['keyframes', 'font-face', 'property'].includes(name) || name.endsWith('-keyframes'),
          hasCustomProperties: ruleText.includes('--'),
        };
      }
    } else {
      // Qualified rule (Style rule)
      while (pos < tokens.length && tokens[pos].type !== '{' && tokens[pos].type !== 'EOF') {
        if (tokens[pos].type === '(' || tokens[pos].type === '[') {
          const closeType = tokens[pos].type === '(' ? ')' : ']';
          pos++;
          let d = 1;
          while (pos < tokens.length && d > 0) {
            if (tokens[pos].type === '(' || tokens[pos].type === '[') d++;
            else if (tokens[pos].type === closeType) d--;
            pos++;
          }
          continue;
        }
        pos++;
      }

      if (pos >= tokens.length || tokens[pos].type !== '{') return null;

      const headerEnd = tokens[pos].startIndex ?? startIndex;
      pos++; // consume '{'
      const bodyStartIndex = tokens[pos - 1].endIndex ?? headerEnd;
      const children: ParsedRuleNode[] = [];

      while (pos < tokens.length && tokens[pos].type !== '}' && tokens[pos].type !== 'EOF') {
        skipWhitespace();
        if (tokens[pos].type === '}' || tokens[pos].type === 'EOF') break;
        if (wouldStartRule(tokens, pos)) {
          const child = parseSingleRule();
          if (child) children.push(child);
          else pos++;
        } else {
          // declaration
          while (
            pos < tokens.length &&
            tokens[pos].type !== 'semicolon' &&
            tokens[pos].type !== '}' &&
            tokens[pos].type !== '{'
          ) {
            pos++;
          }
          if (tokens[pos]?.type === 'semicolon') pos++;
        }
      }

      let endIndex = pos < tokens.length ? (tokens[pos].endIndex ?? source.length) : source.length;
      let bodyEndIndex = pos < tokens.length ? (tokens[pos].startIndex ?? source.length) : source.length;
      if (pos < tokens.length && tokens[pos].type === '}') {
        endIndex = tokens[pos].endIndex ?? endIndex;
        pos++;
      }

      const prelude = source.slice(startIndex, headerEnd).trim();
      const ruleText = source.slice(startIndex, endIndex);
      const isRoot = prelude === ':root' || prelude.includes(':root');
      const hasCustomProps = ruleText.includes('--');

      return {
        type: 'style-rule',
        header: prelude,
        prelude,
        startIndex,
        endIndex,
        headerEnd,
        bodyStartIndex,
        bodyEndIndex,
        children,
        isGrouping: children.length > 0,
        isRootOrCustomProp: isRoot || hasCustomProps,
        hasCustomProperties: hasCustomProps,
      };
    }
    return null;
  }

  const rootRules: ParsedRuleNode[] = [];
  while (pos < tokens.length && tokens[pos].type !== 'EOF') {
    skipWhitespace();
    if (pos >= tokens.length || tokens[pos].type === 'EOF') break;
    const r = parseSingleRule();
    if (r) rootRules.push(r);
    else pos++;
  }
  return rootRules;
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
 * Coverage-guided CSS dead-code pruner prototype.
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

  const tokens = tokenize(css);
  const ruleTree = parseCssRuleTree(tokens, css);

  const removedRules: string[] = [];
  const retainedRules: string[] = [];

  // Identify custom property names defined in :root or top-level rules
  // If preserveRootCustomProperties is true, any rule containing :root or defining --* is preserved
  function evaluateRuleUsage(rule: ParsedRuleNode): boolean {
    // 1. Mandatory preserves for meta at-rules
    if (rule.type === 'at-rule' && ['charset', 'import', 'namespace'].includes(rule.name || '')) {
      retainedRules.push(rule.header);
      return true;
    }

    // 2. Options-based preservation: @keyframes
    if (
      preserveKeyframes &&
      rule.type === 'at-rule' &&
      (rule.name === 'keyframes' || (rule.name || '').endsWith('-keyframes'))
    ) {
      retainedRules.push(rule.header);
      return true;
    }

    // 3. Options-based preservation: @font-face
    if (preserveFontFaces && rule.type === 'at-rule' && rule.name === 'font-face') {
      retainedRules.push(rule.header);
      return true;
    }

    // 4. Options-based preservation: :root / custom properties
    if (preserveRootCustomProperties) {
      if (rule.type === 'at-rule' && rule.name === 'property') {
        retainedRules.push(rule.header);
        return true;
      }
      if (rule.type === 'style-rule' && (rule.header.includes(':root') || rule.header === ':root')) {
        retainedRules.push(rule.header);
        return true;
      }
    }

    // 5. Grouping rules: used if any child is used, or if condition itself is covered
    if (rule.isGrouping && rule.children.length > 0) {
      let anyChildUsed = false;
      for (const child of rule.children) {
        if (evaluateRuleUsage(child)) {
          anyChildUsed = true;
        }
      }
      if (anyChildUsed) {
        retainedRules.push(rule.header);
        return true;
      }
      removedRules.push(rule.header);
      return false;
    }

    // 6. Normal rules: covered if range intersects [startIndex, endIndex)
    const used = isCovered(rule.startIndex, rule.endIndex, coverageRanges);
    if (used) {
      retainedRules.push(rule.header);
      return true;
    } else {
      removedRules.push(rule.header);
      return false;
    }
  }

  // Pre-evaluate all rules to populate retained/removed sets
  for (const rootRule of ruleTree) {
    evaluateRuleUsage(rootRule);
  }

  // Recursive slice/splicing to preserve comments and layout accurately
  function serializeKeptSlice(rule: ParsedRuleNode): string {
    // If not a grouping rule with children, return verbatim original text
    if (!rule.isGrouping || rule.children.length === 0) {
      return css.slice(rule.startIndex, rule.endIndex);
    }

    // If grouping rule, preserve the header up to bodyStartIndex ('{')
    const headerPrefix = css.slice(rule.startIndex, rule.bodyStartIndex!);
    const closingSuffix = css.slice(rule.bodyEndIndex!, rule.endIndex);

    let innerContent = '';
    let lastPos = rule.bodyStartIndex!;

    for (const child of rule.children) {
      const childUsed = retainedRules.includes(child.header);
      if (childUsed) {
        // Retain whitespace/comments between lastPos and child.startIndex
        innerContent += css.slice(lastPos, child.startIndex);
        innerContent += serializeKeptSlice(child);
        lastPos = child.endIndex;
      } else {
        // Skip child text, but preserve lastPos at child.endIndex
        lastPos = child.endIndex;
      }
    }

    // Retain any trailing whitespace/comments between last child and closing brace
    innerContent += css.slice(lastPos, rule.bodyEndIndex!);

    return `${headerPrefix}${innerContent}${closingSuffix}`;
  }

  // Build top-level pruned text
  let prunedCss = '';
  let lastPos = 0;

  for (const rootRule of ruleTree) {
    const isRetained = retainedRules.includes(rootRule.header);
    if (isRetained) {
      prunedCss += css.slice(lastPos, rootRule.startIndex);
      prunedCss += serializeKeptSlice(rootRule);
      lastPos = rootRule.endIndex;
    } else {
      lastPos = rootRule.endIndex;
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
