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
  CSSMediaRule,
  CSSSupportsRule,
  CSSContainerRule,
  CSSStartingStyleRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSLayerBlockRule,
  CSSScopeRule,
  CSSNestedDeclarations,
} from './rules/at-rules.ts';
import { CSSStyleSheet, CSSStyleRule } from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { LONGHAND_TO_SHORTHAND } from './shorthands.ts';
import { resolveNestedSelector } from './cascade/rule-filter.ts';

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

function formatAtRule(rule: CSSRule): string | null {
  if (rule instanceof CSSMediaRule) return `@media ${rule.conditionText}`;
  if (rule instanceof CSSSupportsRule) return `@supports ${rule.conditionText}`;
  if (rule instanceof CSSContainerRule) return `@container ${rule.conditionText}`;
  if (rule instanceof CSSStartingStyleRule) return '@starting-style';
  if (rule instanceof CSSKeyframesRule) return `@keyframes ${rule.name}`.trim();
  if (rule instanceof CSSLayerBlockRule) return `@layer ${rule.name}`.trim();
  if (rule instanceof CSSScopeRule) {
    const s = rule.startSelector ? (rule.startSelector.startsWith('(') ? ` ${rule.startSelector}` : ` (${rule.startSelector})`) : '';
    const e = rule.endSelector ? (rule.endSelector.startsWith('(') ? ` to ${rule.endSelector}` : ` to (${rule.endSelector})`) : '';
    return `@scope${s}${e}`;
  }
  return null;
}

function findParentStyleSelector(ancestors: readonly CSSRule[], map: WeakMap<CSSRule, string>): string | null {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a instanceof CSSStyleRule) return map.get(a) ?? a.selectorText;
  }
  return null;
}

export function* walkRules(
  root: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | Iterable<CSSRule>,
): Generator<RuleWalkEntry> {
  const resolvedSelectorMap = new WeakMap<CSSRule, string>();

  function* walkItem(
    rule: CSSRule,
    ancestors: readonly CSSRule[],
    parentRule: CSSRule | null,
    parentAtRule: string | null,
  ): Generator<RuleWalkEntry> {
    let selectorText: string | null = null;
    let rawSelectorText: string | null = null;

    if (rule instanceof CSSStyleRule) {
      rawSelectorText = rule.selectorText;
      const parent = findParentStyleSelector(ancestors, resolvedSelectorMap);
      selectorText = parent ? resolveNestedSelector(rule.selectorText, parent) : rule.selectorText;
      resolvedSelectorMap.set(rule, selectorText);
    } else if (rule instanceof CSSNestedDeclarations) {
      selectorText = findParentStyleSelector(ancestors, resolvedSelectorMap) ?? (ancestors.some(a => a instanceof CSSScopeRule) ? ':scope' : '');
      rawSelectorText = selectorText;
    } else if (rule instanceof CSSKeyframeRule) {
      selectorText = rule.keyText;
      rawSelectorText = rule.keyText;
    } else if ('selectorText' in rule && typeof (rule as { selectorText?: unknown }).selectorText === 'string') {
      selectorText = (rule as { selectorText: string }).selectorText;
      rawSelectorText = selectorText;
    }

    const style = 'style' in rule && (rule as { style?: unknown }).style instanceof CSSStyleDeclaration
      ? ((rule as { style: CSSStyleDeclaration }).style)
      : null;

    const declarations = style
      ? style._declarations.map(d => ({ property: d.name, value: style.getPropertyValue(d.name), important: d.important }))
      : [];

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
      declarations,
      getPropertyValue: (property: string) => style ? (style.getPropertyValue(property) || null) : null,
      hasProperty: (property: string) => {
        if (!style) return false;
        const norm = property.startsWith('--') ? property : property.toLowerCase();
        return style._declMap.has(norm) || style.getPropertyValue(norm) !== '';
      },
    };

    if (rule instanceof CSSGroupingRule || rule instanceof CSSKeyframesRule) {
      const childAtRule = formatAtRule(rule) ?? parentAtRule;
      const nextAncestors = [...ancestors, rule];
      for (const child of rule.cssRules) {
        if (child) yield* walkItem(child, nextAncestors, rule, childAtRule);
      }
    }
  }

  const items = root instanceof CSSStyleSheet || root instanceof CSSGroupingRule || root instanceof CSSKeyframesRule
    ? root.cssRules
    : root instanceof CSSRule
      ? [root]
      : root;
  for (const rule of items) {
    if (rule) yield* walkItem(rule, [], null, null);
  }
}

export function* walkStyleRules(
  root: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | Iterable<CSSRule>,
): Generator<StyleRuleWalkEntry> {
  for (const entry of walkRules(root)) {
    if (
      (entry.rule instanceof CSSStyleRule ||
       entry.rule instanceof CSSNestedDeclarations ||
       entry.rule instanceof CSSKeyframeRule) &&
      entry.style !== null &&
      entry.selectorText !== null &&
      entry.rawSelectorText !== null
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
  const includeSupports = options?.includeSupports !== false;

  for (const entry of walkRules(root)) {
    const { rule, style } = entry;
    if (style) {
      for (const d of style._declarations) {
        const prop = d.name.startsWith('--') ? d.name : d.name.toLowerCase();
        properties.add(prop);
        const parentShorthands = LONGHAND_TO_SHORTHAND[prop];
        if (parentShorthands) {
          for (const sh of parentShorthands) {
            if (style.getPropertyValue(sh) !== '') properties.add(sh.toLowerCase());
          }
        }
      }
    }
    if (includeSupports && rule instanceof CSSSupportsRule && rule.conditionText) {
      const matches = rule.conditionText.matchAll(/\(\s*([a-zA-Z-][a-zA-Z0-9-]*)\s*:/g);
      for (const m of matches) {
        if (m[1]) properties.add(m[1].toLowerCase());
      }
    }
  }

  return properties;
}
