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

import type { Rule, ComponentValue, SimpleBlock, Token } from '../types.ts';
import type { CSSRule, CSSStyleSheet } from '../CSSOM.ts';

export { FONT_FACE_DESCRIPTORS } from '../data/gen/property-list.ts';

export function isImportRule(r: Rule): boolean {
  return r.type === 3; // CSSRule.IMPORT_RULE
}

export function isNamespaceRule(r: Rule): boolean {
  return r.type === 10; // CSSRule.NAMESPACE_RULE
}

export function isRegularRule(r: Rule): boolean {
  return !isImportRule(r) && !isNamespaceRule(r);
}

// cssom-1 #serialize-a-css-rule
export function serializeGroupingRule(atKeyword: string, condition: string, rules: CSSRule[]): string {
  const cond = condition ? ' ' + condition : '';
  const ruleTexts = rules.map(r => r.cssText).filter(p => p !== '');
  if (ruleTexts.length === 0) {
    return atKeyword === 'keyframes' ? `@${atKeyword}${cond} { }` : `@${atKeyword}${cond} {\n}`;
  }
  const body = ruleTexts.map(t => '  ' + t).join('\n');
  return `@${atKeyword}${cond} {\n${body}\n}`;
}

export function findParentStyleSheet(rule: CSSRule): CSSStyleSheet | null {
  let sheet: CSSStyleSheet | null = rule.parentStyleSheet;
  let curr: CSSRule | null = rule.parentRule;
  while (!sheet && curr) {
    sheet = curr.parentStyleSheet;
    curr = curr.parentRule;
  }
  return sheet;
}

/**
 * Validates and evaluates a `<supports-condition>` component-value list.
 * Returns `null` if grammatically invalid, or the boolean result from `evalInParens`.
 * css-conditional-3 #at-supports
 */
export function evaluateSupportsCondition(
  values: ComponentValue[],
  evalInParens: (item: ComponentValue) => boolean,
): boolean | null {
  const items = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (items.length === 0) return null;

  const evalItem = (item: ComponentValue): boolean | null => {
    if (item.type === 'function') return evalInParens(item);
    if (item.type === 'simple-block' && (item as SimpleBlock).associatedToken.value === '(') {
      const blockValues = (item as SimpleBlock).value.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
      if (blockValues.length === 0) return evalInParens(item);
      const hasTopOp = blockValues.some(v => v.type === 'ident' && ['and', 'or', 'not'].includes(String((v as Token).value).toLowerCase()));
      const isNestedParenBlock = blockValues.length === 1 &&
        blockValues[0].type === 'simple-block' &&
        (blockValues[0] as SimpleBlock).associatedToken.value === '(';
      if (hasTopOp || isNestedParenBlock) {
        return evaluateSupportsCondition((item as SimpleBlock).value, evalInParens);
      }
      return evalInParens(item);
    }
    return null;
  };

  const results: boolean[] = [];
  let operator: 'and' | 'or' | null = null;
  let i = 0;

  while (i < items.length) {
    let negated = false;
    if (items[i].type === 'ident' && String((items[i] as Token).value).toLowerCase() === 'not') {
      negated = true;
      i++;
      if (i >= items.length) return null;
    }
    const res = evalItem(items[i]);
    if (res === null) return null;
    results.push(negated ? !res : res);
    i++;

    if (i < items.length) {
      if (items[i].type !== 'ident') return null;
      const op = String((items[i] as Token).value).toLowerCase();
      if (op !== 'and' && op !== 'or') return null;
      if (operator !== null && operator !== op) return null;
      operator = op;
      i++;
      if (i >= items.length) return null;
    }
  }

  if (results.length === 1) return results[0];
  return operator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Validates that component values match <supports-condition> grammar.
 * css-conditional-3 #at-supports
 */
export function isGrammaticallyValidSupportsCondition(values: ComponentValue[]): boolean {
  return evaluateSupportsCondition(values, () => true) !== null;
}
