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

import type { Rule } from '../types.ts';
import type { CSSRule, CSSStyleSheet } from '../CSSOM.ts';

export const FONT_FACE_DESCRIPTORS = new Set<string>([
  'font-family', 'src', 'font-display', 'unicode-range', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings', 'font-variation-settings'
]);

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
