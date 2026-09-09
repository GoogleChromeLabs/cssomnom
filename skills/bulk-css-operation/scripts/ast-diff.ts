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
  CSSStyleSheet,
  CSSStyleRule,
  CSSGroupingRule,
  type CSSRuleList,
} from '../../../src/index.ts';

export interface RuleRecord {
  context: string;
  selector: string;
  declarations: Map<string, { value: string; priority: string }>;
  originalIndex: number;
}

export interface AstDiffResult {
  valid: boolean;
  beforeCount: number;
  afterCount: number;
  errors: string[];
}

/**
 * Recursively extracts normalized rule records from a CSSRuleList.
 */
export function extractRuleRecords(
  rules: CSSRuleList,
  parentContext = '',
  counter = { index: 0 }
): RuleRecord[] {
  const records: RuleRecord[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    if (rule instanceof CSSStyleRule) {
      const decls = new Map<string, { value: string; priority: string }>();
      const style = rule.style;
      for (let j = 0; j < style.length; j++) {
        const prop = style.item(j);
        decls.set(prop, {
          value: style.getPropertyValue(prop).trim(),
          priority: style.getPropertyPriority(prop).trim(),
        });
      }

      records.push({
        context: parentContext,
        selector: rule.selectorText.trim(),
        declarations: decls,
        originalIndex: counter.index++,
      });
    } else if (rule instanceof CSSGroupingRule || (rule && typeof rule === 'object' && 'cssRules' in rule)) {
      const grouping = rule as CSSGroupingRule;
      const rawText = (rule as { cssText?: string }).cssText || '';
      const header = rawText.split('{')[0]?.trim() || '@group';
      const nestedContext = parentContext ? `${parentContext} > ${header}` : header;
      records.push(...extractRuleRecords(grouping.cssRules, nestedContext, counter));
    }
  }

  return records;
}

/**
 * Level 1 Verification: Compares two stylesheets (or sets of stylesheets)
 * for exact rule and declaration AST set-difference parity.
 */
export function diffCssAst(
  beforeCss: string | string[],
  afterCss: string | string[]
): AstDiffResult {
  const beforeText = Array.isArray(beforeCss) ? beforeCss.join('\n') : beforeCss;
  const afterText = Array.isArray(afterCss) ? afterCss.join('\n') : afterCss;

  const sheetBefore = new CSSStyleSheet();
  sheetBefore.replaceSync(beforeText);

  const sheetAfter = new CSSStyleSheet();
  sheetAfter.replaceSync(afterText);

  const beforeRecords = extractRuleRecords(sheetBefore.cssRules);
  const afterRecords = extractRuleRecords(sheetAfter.cssRules);

  const errors: string[] = [];
  const makeKey = (r: RuleRecord) => `${r.context} ::: ${r.selector}`;

  const beforeMap = new Map<string, RuleRecord[]>();
  const afterMap = new Map<string, RuleRecord[]>();

  for (const r of beforeRecords) {
    const key = makeKey(r);
    const list = beforeMap.get(key) || [];
    list.push(r);
    beforeMap.set(key, list);
  }

  for (const r of afterRecords) {
    const key = makeKey(r);
    const list = afterMap.get(key) || [];
    list.push(r);
    afterMap.set(key, list);
  }

  // 1. Check that all rules in Before exist in After
  for (const [key, bList] of beforeMap.entries()) {
    const aList = afterMap.get(key);
    if (!aList) {
      errors.push(`MISSING RULE: ${key} was dropped in refactored CSS`);
      continue;
    }
    if (aList.length !== bList.length) {
      errors.push(
        `OCCURRENCE MISMATCH: ${key} occurs ${bList.length} times before, but ${aList.length} times after`
      );
    }

    // Compare declarations across occurrences
    for (let idx = 0; idx < Math.min(bList.length, aList.length); idx++) {
      const bDecls = bList[idx].declarations;
      const aDecls = aList[idx].declarations;

      for (const [prop, bVal] of bDecls.entries()) {
        const aVal = aDecls.get(prop);
        if (!aVal) {
          errors.push(`MISSING DECLARATION: ${key} [#${idx + 1}] missing property '${prop}'`);
        } else if (aVal.value !== bVal.value || aVal.priority !== bVal.priority) {
          errors.push(
            `DECLARATION MISMATCH: ${key} [#${idx + 1}] property '${prop}': '${bVal.value}' (${bVal.priority}) !== '${aVal.value}' (${aVal.priority})`
          );
        }
      }

      for (const prop of aDecls.keys()) {
        if (!bDecls.has(prop)) {
          errors.push(
            `EXTRA DECLARATION: ${key} [#${idx + 1}] contains unexpected added property '${prop}'`
          );
        }
      }
    }
  }

  // 2. Check for unexpected rules added in After
  for (const key of afterMap.keys()) {
    if (!beforeMap.has(key)) {
      errors.push(`UNEXPECTED RULE: ${key} was added in refactored CSS`);
    }
  }

  return {
    valid: errors.length === 0,
    beforeCount: beforeRecords.length,
    afterCount: afterRecords.length,
    errors,
  };
}

