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
import type { Declaration, Rule, ASTAtRule, RuleSourceLocation } from '../types.ts';
import { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import { deleteRuleFromArray } from '../utils.ts';
import { CSSRuleList } from './collections.ts';
import { isImportRule, isNamespaceRule } from './utils.ts';
import type { CSSStyleSheet } from '../CSSOM.ts';
import type { CSSNestedDeclarations } from './at-rules.ts';
import { applyWebIDLConstants } from '../webidl.ts';
export type { InternalRuleMetadata } from '../types.ts';

const RULE_CONSTANTS = {
  STYLE_RULE: 1,
  CHARSET_RULE: 2,
  IMPORT_RULE: 3,
  MEDIA_RULE: 4,
  FONT_FACE_RULE: 5,
  PAGE_RULE: 6,
  KEYFRAMES_RULE: 7,
  KEYFRAME_RULE: 8,
  MARGIN_RULE: 9,
  NAMESPACE_RULE: 10,
  COUNTER_STYLE_RULE: 11,
  SUPPORTS_RULE: 12,
  FONT_FEATURE_VALUES_RULE: 14,
} as const;

export class CSSRule {
  /** @internal */
  _parentRule: CSSRule | null = null;
  /** @internal */
  _parentStyleSheet: CSSStyleSheet | null = null;
  /** @internal */
  _location?: RuleSourceLocation;

  // Tooling extension: original character offsets from source CSS
  get location(): RuleSourceLocation | undefined {
    return this._location;
  }

  // cssom-1 § 6.4 #dom-cssrule-parentrule
  get parentRule(): CSSRule | null {
    return this._parentRule;
  }

  // cssom-1 § 6.4 #dom-cssrule-parentstylesheet
  get parentStyleSheet(): CSSStyleSheet | null {
    if (this._parentStyleSheet) return this._parentStyleSheet;
    if (this._parentRule) return this._parentRule.parentStyleSheet;
    return null;
  }

  // WebIDL § 3.6.4 #es-constants & WebIDL § 3.6.5 #constants-on-interface-prototype-object
  declare static readonly STYLE_RULE: 1;
  declare static readonly CHARSET_RULE: 2;
  declare static readonly IMPORT_RULE: 3;
  declare static readonly MEDIA_RULE: 4;
  declare static readonly FONT_FACE_RULE: 5;
  declare static readonly PAGE_RULE: 6;
  declare static readonly KEYFRAMES_RULE: 7;
  declare static readonly KEYFRAME_RULE: 8;
  declare static readonly MARGIN_RULE: 9;
  declare static readonly NAMESPACE_RULE: 10;
  declare static readonly COUNTER_STYLE_RULE: 11;
  declare static readonly SUPPORTS_RULE: 12;
  declare static readonly FONT_FEATURE_VALUES_RULE: 14;

  declare readonly STYLE_RULE: 1;
  declare readonly CHARSET_RULE: 2;
  declare readonly IMPORT_RULE: 3;
  declare readonly MEDIA_RULE: 4;
  declare readonly FONT_FACE_RULE: 5;
  declare readonly PAGE_RULE: 6;
  declare readonly KEYFRAMES_RULE: 7;
  declare readonly KEYFRAME_RULE: 8;
  declare readonly MARGIN_RULE: 9;
  declare readonly NAMESPACE_RULE: 10;
  declare readonly COUNTER_STYLE_RULE: 11;
  declare readonly SUPPORTS_RULE: 12;
  declare readonly FONT_FEATURE_VALUES_RULE: 14;

  // cssom-1 § 6.4 #dom-cssrule-type: returns 0 if no legacy constant matches
  get type(): number {
    return 0;
  }

  // 6.13 The CSSRule Interface
  get cssText(): string {
    throw new Error('Not implemented');
  }

  set cssText(_value: string) {
    // Do nothing
  }
}

// WebIDL § 3.6.4, § 3.6.5: constants on CSSRule interface and prototype
applyWebIDLConstants(CSSRule, RULE_CONSTANTS);

export class CSSGroupingRule extends CSSRule {
  private _cssRules!: CSSRuleList;
  protected _rules: (Rule | CSSRule)[];
  private _parseRuleInBlock: (text: string, nested?: boolean) => Rule;

  // cssom-1 § 6.4.3 #dom-cssgroupingrule-cssrules
  get cssRules(): CSSRuleList {
    if (!this._cssRules) {
      this._cssRules = new CSSRuleList(() => this._rules);
    }
    return this._cssRules;
  }

  constructor(rules: (Rule | CSSRule)[], parseRuleInBlock: (text: string, nested?: boolean) => Rule) {
    super();
    this._rules = rules;
    this._cssRules = new CSSRuleList(() => this._rules);
    this._parseRuleInBlock = parseRuleInBlock;
    for (const rule of rules) {
      if (rule instanceof CSSRule) {
        rule._parentRule = this;
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

    const isNested = this.constructor.name === 'CSSStyleRule' || this.constructor.name === 'CSSScopeRule' || this.parentRule !== null;

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
      const decls = (parsedRule as CSSNestedDeclarations).style._declarations;
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
      parsedRule._parentRule = this;
      parsedRule._parentStyleSheet = null;
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
