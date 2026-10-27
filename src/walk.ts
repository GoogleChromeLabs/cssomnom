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

import { CSSRule, CSSGroupingRule } from './rules/base.ts';
import {
  CSSSupportsRule,
  CSSScopeRule,
  CSSNestedDeclarations,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSPageRule,
  CSSFontFaceRule,
  CSSMarginRule,
} from './rules/at-rules.ts';
import { CSSStyleSheet, CSSStyleRule } from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { LONGHAND_TO_SHORTHAND } from './shorthands.ts';
import { resolveNestedSelector } from './nesting.ts';
import { tokenize } from './tokenizer.ts';

export interface RuleWalkEntry {
  readonly rule: CSSRule;
  readonly ancestors: readonly CSSRule[];
  readonly parentRule: CSSRule | null;
  readonly parentAtRule: string | null;
  readonly line: number;
  readonly column: number;
  readonly selectorText: string | null;
  readonly rawSelectorText: string | null;
  readonly style: CSSStyleDeclaration | null;
  readonly declarations: readonly { property: string; value: string; important: boolean }[];
  getPropertyValue(property: string): string | null;
  hasProperty(property: string): boolean;
}

export interface StyleRuleWalkEntry extends RuleWalkEntry {
  readonly rule: CSSStyleRule | CSSNestedDeclarations | CSSKeyframeRule;
  readonly selectorText: string;
  readonly rawSelectorText: string;
  readonly style: CSSStyleDeclaration;
}

function getRuleStyle(rule: CSSRule): CSSStyleDeclaration | null {
  return (
    rule instanceof CSSStyleRule ||
    rule instanceof CSSNestedDeclarations ||
    rule instanceof CSSKeyframeRule ||
    rule instanceof CSSPageRule ||
    rule instanceof CSSFontFaceRule ||
    rule instanceof CSSMarginRule
  ) ? rule.style : null;
}

export function* walkRules(
  root: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | Iterable<CSSRule>,
): Generator<RuleWalkEntry> {
  function* walkItem(
    rule: CSSRule,
    ancestors: readonly CSSRule[],
    parentRule: CSSRule | null,
    parentAtRule: string | null,
    parentSelector: string | null,
  ): Generator<RuleWalkEntry> {
    let selectorText: string | null = null, rawSelectorText: string | null = null, childSelector = parentSelector;

    if (rule instanceof CSSStyleRule) {
      rawSelectorText = rule.selectorText;
      selectorText = childSelector = parentSelector && parentSelector !== ':scope'
        ? resolveNestedSelector(rule.selectorText, parentSelector)
        : rule.selectorText;
    } else if (rule instanceof CSSScopeRule) {
      childSelector = ':scope';
    } else if (rule instanceof CSSNestedDeclarations) {
      selectorText = rawSelectorText = parentSelector ?? '';
    } else if (rule instanceof CSSKeyframeRule) {
      selectorText = rawSelectorText = rule.keyText;
    } else if (rule instanceof CSSPageRule) {
      selectorText = rawSelectorText = rule.selectorText;
    }

    const style = getRuleStyle(rule);
    let cachedDecls: readonly { property: string; value: string; important: boolean }[] | null = null;

    yield {
      rule,
      ancestors,
      parentRule,
      parentAtRule,
      line: rule.location?.line ?? 1,
      column: rule.location?.column ?? 1,
      selectorText,
      rawSelectorText,
      style,
      get declarations() {
        return cachedDecls ??= style
          ? style._declarations.map(d => ({ property: d.name, value: style.getPropertyValue(d.name), important: d.important }))
          : [];
      },
      getPropertyValue: (p: string) => style ? (style.getPropertyValue(p) || null) : null,
      hasProperty: (p: string) => {
        if (!style) return false;
        const norm = p.startsWith('--') ? p : p.toLowerCase();
        return style._declarations.some(d => d.name === norm) || style.getPropertyValue(norm) !== '';
      },
    };

    if (rule instanceof CSSGroupingRule || rule instanceof CSSKeyframesRule) {
      const brace = rule.cssText.indexOf('{');
      const childAt = !(rule instanceof CSSStyleRule) && brace !== -1 ? rule.cssText.slice(0, brace).trim() : parentAtRule;
      const nextAncestors = [...ancestors, rule];
      for (const child of rule.cssRules) {
        if (child) yield* walkItem(child, nextAncestors, rule, childAt, childSelector);
      }
    }
  }

  const items = root instanceof CSSStyleSheet || root instanceof CSSGroupingRule || root instanceof CSSKeyframesRule
    ? root.cssRules
    : root instanceof CSSRule ? [root] : root;
  for (const rule of items) {
    if (rule) yield* walkItem(rule, [], null, null, null);
  }
}

export function* walkStyleRules(
  root: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | Iterable<CSSRule>,
): Generator<StyleRuleWalkEntry> {
  for (const entry of walkRules(root)) {
    if (
      (entry.rule instanceof CSSStyleRule || entry.rule instanceof CSSNestedDeclarations || entry.rule instanceof CSSKeyframeRule) &&
      entry.style && entry.selectorText !== null && entry.rawSelectorText !== null
    ) {
      yield entry as StyleRuleWalkEntry;
    }
  }
}

export function getDeclaredProperties(
  root: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | Iterable<CSSRule>,
  options?: { includeSupports?: boolean },
): Set<string> {
  const properties = new Set<string>();
  for (const { rule, style } of walkRules(root)) {
    if (style) {
      for (const d of style._declarations) {
        const prop = d.name.startsWith('--') ? d.name : d.name.toLowerCase();
        properties.add(prop);
        const shorthands = LONGHAND_TO_SHORTHAND[prop];
        if (shorthands) {
          for (const sh of shorthands) {
            if (style.getPropertyValue(sh) !== '') properties.add(sh.toLowerCase());
          }
        }
      }
    }
    if (options?.includeSupports !== false && rule instanceof CSSSupportsRule && rule.conditionText) {
      const tokens = tokenize(rule.conditionText);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'function' && t.value.toLowerCase() === 'selector') {
          let depth = 1;
          while (++i < tokens.length && depth > 0) {
            if (tokens[i].type === 'function' || tokens[i].type === '(') depth++;
            else if (tokens[i].type === ')') depth--;
          }
        } else if (t.type === '(') {
          let j = i + 1;
          while (j < tokens.length && tokens[j].type === 'whitespace') j++;
          if (j < tokens.length && tokens[j].type === 'ident') {
            const identTok = tokens[j];
            let k = j + 1;
            while (k < tokens.length && tokens[k].type === 'whitespace') k++;
            if (k < tokens.length && tokens[k].type === 'colon' && typeof identTok.value === 'string') {
              properties.add(identTok.value.startsWith('--') ? identTok.value : identTok.value.toLowerCase());
            }
          }
        }
      }
    }
  }
  return properties;
}
