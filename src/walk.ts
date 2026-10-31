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
  CSSAtRule,
} from './rules/at-rules.ts';
import { CSSStyleSheet, CSSStyleRule } from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { SHORTHANDS, LONGHAND_TO_SHORTHAND } from './shorthands.ts';
import { LOGICAL_MAPPING, PHYSICAL_TO_LOGICAL } from './data/gen/LogicalMapping.ts';
import { serialize } from './serializer.ts';
import { resolveNestedSelector } from './nesting.ts';
import { tokenize } from './tokenizer.ts';
import { parseSelectorAST as parseSelectorStringAST, type SelectorASTOptions } from './parser.ts';
import type { SelectorList } from './types.ts';

/**
 * Valid root containers accepted by `getRules()` and `getDeclaredProperties()`.
 */
export type RuleRoot = CSSStyleSheet | CSSRule | Iterable<CSSRule>;

/**
 * Constructor type matching any `CSSRule` class or subclass (e.g. `CSSStyleRule`, `CSSMediaRule`).
 */
export type AnyRuleConstructor<T extends CSSRule = CSSRule> = abstract new (...args: never[]) => T;

/**
 * Options for `getDeclaredProperties()`.
 */
export interface DeclaredPropertiesOptions {
  /** When `true` (default), includes CSS property names referenced inside `@supports (...)` conditions. */
  includeSupports?: boolean;
}

/**
 * Options for `getPropertyValues()`.
 */
export interface PropertyValueOptions {
  /** When `true` (default), matches logical and physical property equivalents (e.g. `margin-inline-start` ↔ `margin-left` in horizontal-tb LTR). */
  logical?: boolean;
  /** When `true` (default), extracts or falls back to parent shorthands (including unexpanded `var()` shorthands like `border: 1px solid var(--c)`). */
  shorthands?: boolean;
}

/**
 * Recursively collects CSS rules in depth-first pre-order across a `CSSStyleSheet`,
 * `CSSRule` (including nested rules inside `CSSStyleRule`, `CSSGroupingRule`, `CSSKeyframesRule`,
 * and `CSSAtRule`), or any `Iterable<CSSRule>`.
 *
 * When `ruleClass` is provided, filters and narrows the returned array to instances of `ruleClass`
 * (e.g. `getRules(sheet, CSSStyleRule)` returns `CSSStyleRule[]`).
 */
export function getRules(root: RuleRoot): CSSRule[];
export function getRules<T extends CSSRule>(root: RuleRoot, ruleClass: AnyRuleConstructor<T>): T[];
export function getRules<T extends CSSRule>(root: RuleRoot, ruleClass?: AnyRuleConstructor<T>): CSSRule[] {
  const result: CSSRule[] = [];

  function visit(rule: CSSRule): void {
    if (!ruleClass || rule instanceof ruleClass) {
      result.push(rule);
    }
    if (rule instanceof CSSGroupingRule || rule instanceof CSSKeyframesRule) {
      for (const child of rule.cssRules) {
        if (child) visit(child);
      }
    } else if (rule instanceof CSSAtRule && rule.childRules) {
      for (const child of rule.childRules) {
        if (child) visit(child);
      }
    }
  }

  const items = root instanceof CSSStyleSheet
    ? root.cssRules
    : root instanceof CSSRule
      ? [root]
      : root;
  for (const rule of items) {
    if (rule) visit(rule);
  }
  return result;
}

/**
 * Walks strict ancestors of `rule` (`rule.parentRule`) and returns the nearest enclosing
 * rule matching any of `ruleClasses`, or `null` if none matches.
 */
export function closestRule<C extends readonly AnyRuleConstructor[]>(
  rule: CSSRule | null | undefined,
  ...ruleClasses: C
): InstanceType<C[number]> | null {
  for (let curr = rule?.parentRule ?? null; curr; curr = curr.parentRule) {
    if (ruleClasses.some(cls => curr instanceof cls)) return curr as InstanceType<C[number]>;
  }
  return null;
}

function shouldResolveAgainstParent(selector: string, parentSelector: string | null): boolean {
  if (!parentSelector) return selector.includes('&');
  if (parentSelector === ':scope') {
    return selector.includes('&') || /(?:^|,)\s*[>+~]/.test(selector);
  }
  return true;
}

/**
 * Resolves the effective selector string for a rule by walking its `parentRule` chain,
 * expanding nested `&` and relative selectors against enclosing `CSSStyleRule` and `@scope` rules.
 *
 * - `CSSStyleRule`: returns the resolved selector (e.g. `":is(.card) .title"`).
 * - `CSSNestedDeclarations`: returns the enclosing style rule's resolved selector (or `":scope"` inside `@scope`).
 * - `CSSKeyframeRule`: returns `rule.keyText`.
 * - `CSSPageRule`: returns `rule.selectorText`.
 * - All other rules: returns `null`.
 */
export function resolveSelector(rule: CSSRule): string | null {
  if (rule instanceof CSSKeyframeRule) return rule.keyText;
  if (rule instanceof CSSPageRule) return rule.selectorText;
  if (!(rule instanceof CSSStyleRule) && !(rule instanceof CSSNestedDeclarations)) return null;

  const chain: (CSSStyleRule | CSSScopeRule)[] = [];
  for (let p = closestRule(rule, CSSStyleRule, CSSScopeRule); p; p = closestRule(p, CSSStyleRule, CSSScopeRule)) {
    chain.push(p);
  }

  let parentSelector: string | null = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const anc = chain[i];
    if (anc instanceof CSSScopeRule) {
      parentSelector = ':scope';
    } else {
      parentSelector = shouldResolveAgainstParent(anc.selectorText, parentSelector)
        ? resolveNestedSelector(anc.selectorText, parentSelector ?? '')
        : anc.selectorText;
    }
  }

  if (rule instanceof CSSNestedDeclarations) {
    return parentSelector ?? '';
  }
  return shouldResolveAgainstParent(rule.selectorText, parentSelector)
    ? resolveNestedSelector(rule.selectorText, parentSelector ?? '')
    : rule.selectorText;
}

/**
 * Parses a selector string or `CSSRule` into a structured Selectors Level 4 `SelectorList` AST.
 *
 * When passed a `CSSStyleRule` or `CSSNestedDeclarations`, resolves nested `&` selectors against
 * enclosing ancestor rules by default (`resolveNesting: true`), or returns the rule's own raw
 * selector AST when `resolveNesting: false`.
 */
export function parseSelectorAST(
  input: string | CSSRule,
  options?: SelectorASTOptions,
): SelectorList | null {
  if (typeof input === 'string') {
    return parseSelectorStringAST(input, options);
  }
  const raw = options?.resolveNesting === false;
  if (
    input instanceof CSSStyleRule &&
    input._selectorAST &&
    !options?.allowVendorPseudos &&
    !options?.allowUnknownPseudos &&
    !options?.declaredNamespaces &&
    (raw || (input.parentRule === null && !input.selectorText.includes('&')))
  ) {
    return input._selectorAST;
  }
  const selector = raw
    ? (input instanceof CSSStyleRule ? input.selectorText : null)
    : resolveSelector(input);
  if (!selector) return null;
  return parseSelectorStringAST(selector, {
    allowRelative: input.parentRule !== null,
    ...options,
  });
}

/**
 * Collects a `Set<string>` of all declared CSS property names across `root`, including
 * parent shorthands (when all constituent longhands are declared) and `@supports` feature queries.
 */
export function getDeclaredProperties(
  root: RuleRoot,
  options?: DeclaredPropertiesOptions,
): Set<string> {
  const properties = new Set<string>();
  for (const rule of getRules(root)) {
    if ('style' in rule && rule.style instanceof CSSStyleDeclaration) {
      const { style } = rule;
      for (const d of style._declarations) {
        const prop = d.name.startsWith('--') ? d.name : d.name.toLowerCase();
        properties.add(prop);
        const shorthands = LONGHAND_TO_SHORTHAND[prop];
        if (shorthands) {
          for (const sh of shorthands) {
            if (style.getPropertyValue(sh) !== '') properties.add(sh.toLowerCase());
          }
        }
        const shorthandDef = SHORTHANDS[prop];
        if (shorthandDef && prop !== 'all') {
          for (const lh of shorthandDef.longhands) {
            properties.add(lh);
            const parentShs = LONGHAND_TO_SHORTHAND[lh];
            if (parentShs) {
              for (const sh of parentShs) properties.add(sh);
            }
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

/**
 * Returns all authored values for `property` in declaration order on a `CSSRule` or `CSSStyleDeclaration`.
 *
 * Preserves multiple declarations of the same property within a single rule (such as progressive-enhancement
 * fallbacks like `grid-template-rows: auto; grid-template-rows: subgrid;`), resolves logical↔physical
 * property aliases (`logical: true` by default), and inspects expanded or `var()`-bearing parent shorthands
 * (`shorthands: true` by default).
 */
export function getPropertyValues(
  target: CSSRule | CSSStyleDeclaration | null | undefined,
  property: string,
  options?: PropertyValueOptions,
): string[] {
  const style = target instanceof CSSStyleDeclaration
    ? target
    : (target && 'style' in target && target.style instanceof CSSStyleDeclaration ? target.style : null);
  if (!style) return [];

  const prop = property.startsWith('--') ? property : property.toLowerCase();
  const useLogical = options?.logical !== false && !prop.startsWith('--');
  const useShorthands = options?.shorthands !== false && !prop.startsWith('--');

  const targetProps = new Set<string>([prop]);
  const addLogicalEquivalents = (p: string) => {
    const phys = (LOGICAL_MAPPING as Record<string, string>)[p];
    if (phys) targetProps.add(phys);
    const logs = PHYSICAL_TO_LOGICAL[p];
    if (logs) {
      for (const l of logs) targetProps.add(l);
    }
    const sh = SHORTHANDS[p];
    if (sh) {
      for (const lh of sh.longhands) {
        targetProps.add(lh);
        const lhPhys = (LOGICAL_MAPPING as Record<string, string>)[lh];
        if (lhPhys) targetProps.add(lhPhys);
      }
    }
  };

  if (useLogical) {
    addLogicalEquivalents(prop);
  }

  const parentShorthands = new Set<string>();
  if (useShorthands) {
    for (const tp of Array.from(targetProps)) {
      for (const sh of LONGHAND_TO_SHORTHAND[tp] ?? []) parentShorthands.add(sh);
      const shDef = SHORTHANDS[tp];
      if (shDef) {
        for (const lh of shDef.longhands) {
          if (useLogical) addLogicalEquivalents(lh);
          for (const sh of LONGHAND_TO_SHORTHAND[lh] ?? []) {
            if (sh !== tp) parentShorthands.add(sh);
          }
        }
      }
    }
  }

  const values: string[] = [];
  for (const d of style._rawDeclarations) {
    const isCustom = d.name.startsWith('--');
    if (targetProps.has(d.name)) {
      const v = isCustom && d.raw !== undefined && d.raw.includes('/*')
        ? d.raw.trim()
        : serialize(d.value, isCustom).trim();
      if (v) values.push(v);
      continue;
    }
    if (!useShorthands) continue;
    const shDef = SHORTHANDS[d.name];
    if (!shDef || d.name === 'all') continue;

    const rawText = serialize(d.value).trim();
    const hasVar = rawText.includes('var(') || rawText.includes('env(');
    const expanded = !hasVar ? shDef.expand(d.value) : null;
    if (expanded) {
      let matched = false;
      for (const tp of targetProps) {
        if (tp in expanded) {
          const v = serialize(expanded[tp]).trim();
          if (v) {
            values.push(v);
            matched = true;
            break;
          }
        }
      }
      if (!matched && SHORTHANDS[prop]) {
        const subSh = SHORTHANDS[prop];
        if (subSh.longhands.every(lh => lh in expanded)) {
          const contracted = subSh.contract(expanded);
          if (contracted) values.push(contracted.trim());
        }
      }
    } else if (parentShorthands.has(d.name) && rawText) {
      values.push(rawText);
    }
  }

  if (values.length === 0) {
    for (const tp of targetProps) {
      const v = style.getPropertyValue(tp).trim();
      if (v) {
        values.push(v);
        break;
      }
    }
  }

  return values;
}
