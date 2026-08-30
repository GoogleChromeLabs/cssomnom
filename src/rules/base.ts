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

import { ParseHooks } from '../parse-hooks.ts';
import type { Declaration, Rule, ASTAtRule } from '../types.ts';
import { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import { deleteRuleFromArray } from '../utils.ts';
import { CSSRuleList } from './collections.ts';
import { isImportRule, isNamespaceRule } from './utils.ts';
import type { CSSStyleSheet } from '../CSSOM.ts';

export class CSSRule {
  private _parentRule: CSSRule | null = null;
  private _parentStyleSheet: CSSStyleSheet | null = null;

  // cssom-1 § 6.4 #dom-cssrule-parentrule
  get parentRule(): CSSRule | null {
    return this._parentRule;
  }

  set parentRule(rule: CSSRule | null) {
    this._parentRule = rule;
  }

  // cssom-1 § 6.4 #dom-cssrule-parentstylesheet
  get parentStyleSheet(): CSSStyleSheet | null {
    if (this._parentStyleSheet) return this._parentStyleSheet;
    if (this._parentRule) return this._parentRule.parentStyleSheet;
    return null;
  }

  set parentStyleSheet(sheet: CSSStyleSheet | null) {
    this._parentStyleSheet = sheet;
  }

  static readonly STYLE_RULE = 1;
  static readonly CHARSET_RULE = 2;
  static readonly IMPORT_RULE = 3;
  static readonly MEDIA_RULE = 4;
  static readonly FONT_FACE_RULE = 5;
  static readonly PAGE_RULE = 6;
  static readonly KEYFRAMES_RULE = 7;
  static readonly KEYFRAME_RULE = 8;
  static readonly MARGIN_RULE = 9;
  static readonly NAMESPACE_RULE = 10;
  static readonly COUNTER_STYLE_RULE = 11;
  static readonly SUPPORTS_RULE = 12;
  static readonly FONT_FEATURE_VALUES_RULE = 14;

  get STYLE_RULE() { return CSSRule.STYLE_RULE; }
  get CHARSET_RULE() { return CSSRule.CHARSET_RULE; }
  get IMPORT_RULE() { return CSSRule.IMPORT_RULE; }
  get MEDIA_RULE() { return CSSRule.MEDIA_RULE; }
  get FONT_FACE_RULE() { return CSSRule.FONT_FACE_RULE; }
  get PAGE_RULE() { return CSSRule.PAGE_RULE; }
  get KEYFRAMES_RULE() { return CSSRule.KEYFRAMES_RULE; }
  get KEYFRAME_RULE() { return CSSRule.KEYFRAME_RULE; }
  get MARGIN_RULE() { return CSSRule.MARGIN_RULE; }
  get NAMESPACE_RULE() { return CSSRule.NAMESPACE_RULE; }
  get COUNTER_STYLE_RULE() { return CSSRule.COUNTER_STYLE_RULE; }
  get SUPPORTS_RULE() { return CSSRule.SUPPORTS_RULE; }
  get FONT_FEATURE_VALUES_RULE() { return CSSRule.FONT_FEATURE_VALUES_RULE; }

  get type(): number {
    throw new Error('Not implemented');
  }

  // 6.13 The CSSRule Interface
  get cssText(): string {
    throw new Error('Not implemented');
  }

  set cssText(_value: string) {
    // Do nothing
  }
}

export class CSSGroupingRule extends CSSRule {
  readonly cssRules: CSSRuleList;
  protected _rules: Rule[];
  private _parseRuleInBlock: (text: string, nested?: boolean) => Rule;

  constructor(rules: Rule[], parseRuleInBlock: (text: string, nested?: boolean) => Rule) {
    super();
    this._rules = rules;
    this.cssRules = new CSSRuleList(() => this._rules);
    this._parseRuleInBlock = parseRuleInBlock;
    for (const rule of rules) {
      if (rule instanceof CSSRule) {
        rule.parentRule = this;
      }
    }
  }

  // cssom-1 § 6.4.3 #the-cssgroupingrule-interface
  // css-nesting-1 § 4.1 #the-cssnesteddeclarations-interface
  insertRule(rule: string, index: number = 0): number {
    // 1. Set length to the number of items in list.
    // 2. If index is greater than length (or index < 0), throw IndexSizeError.
    // NOTE: This boundary check MUST precede parsing per CSSOM 1 § 6.5.3 step 2!
    if (index < 0 || index > this._rules.length) {
      throw new DOMException('Index size error', 'IndexSizeError');
    }

    const isNested = this.constructor.name === 'CSSStyleRule' || this.parentRule !== null;

    // Check if the input rule is a top-level rule to validate hierarchy constraints
    let topRule: Rule | null = null;
    try {
      topRule = ParseHooks.parseRule(rule);
    } catch {}
    if (topRule) {
      if (isImportRule(topRule) || isNamespaceRule(topRule)) {
        throw new DOMException('HierarchyRequestError: @import and @namespace rules are not allowed inside grouping rules', 'HierarchyRequestError');
      }
      if (isNested && !isImportRule(topRule) && !isNamespaceRule(topRule)) {
        const atRuleName = (topRule as ASTAtRule).name || (topRule.constructor.name.replace(/^CSS/, '').replace(/Rule$/, '').toLowerCase());
        const isGroupingRule = topRule instanceof CSSGroupingRule || ['media', 'supports', 'container', 'layer', 'scope', 'starting-style', 'style'].includes(atRuleName);
        if (!isGroupingRule && topRule.constructor.name !== 'CSSStyleRule') {
          throw new DOMException('HierarchyRequestError: This rule cannot be inserted inside a nested rule', 'HierarchyRequestError');
        }
      }
    }

    const parsedRule = this._parseRuleInBlock(rule, isNested);
    if (!parsedRule) {
      // 5. If new rule is a syntax error, throw a SyntaxError exception.
      throw new DOMException('Syntax error', 'SyntaxError');
    }

    // 6. If new rule cannot be inserted into list due to constraints specified by CSS, throw HierarchyRequestError.
    // In CSS, @import and @namespace rules are forbidden inside grouping rules.
    if (isImportRule(parsedRule) || isNamespaceRule(parsedRule)) {
      throw new DOMException('HierarchyRequestError: @import and @namespace rules are not allowed inside grouping rules', 'HierarchyRequestError');
    }

    if ((parsedRule as { constructor?: { name: string } }).constructor?.name === 'CSSNestedDeclarations') {
      if (!isNested) {
        throw new DOMException('Syntax error: CSSNestedDeclarations cannot be inserted into top-level grouping rule', 'SyntaxError');
      }
      const decls = (parsedRule as unknown as { style: { declarations: Declaration[] } }).style.declarations;
      const validDecls = decls.filter((d: Declaration) => {
        const name = d.name.toLowerCase();
        return name.startsWith('--') || CSSStyleDeclaration.prototype._isPropertySupported(name);
      });
      if (validDecls.length === 0) {
        throw new DOMException('Syntax error: CSSNestedDeclarations contains no valid declarations', 'SyntaxError');
      }
    }

    // 8. Insert new rule into list at zero-indexed position index.
    // cssom-1 § 6.4 #the-cssrule-interface: establish parentRule reference
    if (parsedRule instanceof CSSRule) {
      parsedRule.parentRule = this;
      parsedRule.parentStyleSheet = null;
    }
    this._rules.splice(index, 0, parsedRule);
    return index;
  }

  // cssom-1 § 6.16 #the-cssgroupingrule-interface
  // cssom-1 § 6.5.4 #remove-a-css-rule
  deleteRule(index: number): void {
    deleteRuleFromArray(this._rules, index);
  }
}
