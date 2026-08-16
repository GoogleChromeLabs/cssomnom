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
import { ParseHooks } from './parse-hooks.ts';
import { serialize, serializeDeclarations, serializeString, serializeIdentifier, serializeSelectorList } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import { StylePropertyMap } from './typed-om.ts';
import type { Declaration, Rule, ASTAtRule, ComponentValue, MediaQuery, CustomMediaQuery, SelectorList, ComplexSelector, SimpleSelector } from './types.ts';
import { MediaParser, serializeMediaQuery } from './MediaParser.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { createIndexedProxy, deleteRuleFromArray } from './utils.ts';
import { PropertyRegistry } from './PropertyRegistry.ts';

const FONT_FACE_DESCRIPTORS = new Set<string>([
  'font-family', 'src', 'font-display', 'unicode-range', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings', 'font-variation-settings'
]);

const PAGE_DESCRIPTORS = new Set<string>([
  'size', 'marks', 'bleed', 'page-orientation', 'page-margin-safety'
]);







export interface CSSStyleSheetInit {
  baseURL?: string | null;
  media?: MediaList | string;
  disabled?: boolean;
}

export class StyleSheetList {
  private _sheets: CSSStyleSheet[];

  constructor(sheets: CSSStyleSheet[]) {
    this._sheets = sheets;
    return createIndexedProxy(this, (t) => t._sheets) as StyleSheetList;
  }

  get length(): number {
    return this._sheets.length;
  }

  item(index: number): CSSStyleSheet | null {
    return this._sheets[index] || null;
  }

  *[Symbol.iterator](): Iterator<CSSStyleSheet> {
    for (let i = 0; i < this.length; i++) {
      yield this._sheets[i];
    }
  }
}

export interface LinkStyle {
  readonly sheet: CSSStyleSheet | null;
}

// cssom-1 § 6.2 #the-medialist-interface
export class MediaList {
  [index: number]: string;
  private _mediaQueries: MediaQuery[] = [];

  constructor(mediaText: string = '') {
    this.mediaText = mediaText;
    return createIndexedProxy(this, (t) => t._mediaQueries.map(q => serializeMediaQuery(q)));
  }

  get mediaText(): string {
    return this._mediaQueries.map(q => serializeMediaQuery(q)).join(', ');
  }

  set mediaText(value: string) {
    if (!value) {
      this._mediaQueries = [];
      return;
    }
    this._mediaQueries = MediaParser.parse(value);
  }

  get length(): number {
    return this._mediaQueries.length;
  }

  item(index: number): string | null {
    const q = this._mediaQueries[index];
    return q ? serializeMediaQuery(q) : null;
  }

  toString(): string {
    return this.mediaText;
  }

  get mediaQueriesAST(): MediaQuery[] {
    return this._mediaQueries;
  }

  appendMedium(medium: string): void {
    const parsed = MediaParser.parse(medium);
    if (parsed.length !== 1) {
      return;
    }
    const m = parsed[0];
    const mText = serializeMediaQuery(m);
    if (this._mediaQueries.some(q => serializeMediaQuery(q) === mText)) {
      return;
    }
    this._mediaQueries.push(m);
  }

  deleteMedium(medium: string): void {
    const parsed = MediaParser.parse(medium);
    if (parsed.length !== 1) {
      return;
    }
    const mText = serializeMediaQuery(parsed[0]);
    let i = this._mediaQueries.length;
    let found = false;
    while (i--) {
      if (serializeMediaQuery(this._mediaQueries[i]) === mText) {
        this._mediaQueries.splice(i, 1);
        found = true;
      }
    }
    if (!found) {
      throw new DOMException(`The medium '${medium}' does not exist in the MediaList.`, 'NotFoundError');
    }
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.length; i++) {
      yield serializeMediaQuery(this._mediaQueries[i]);
    }
  }
}

export class StyleSheet {
  readonly type: string = 'text/css';
  readonly href: string | null = null;
  readonly ownerNode: unknown | null = null;
  readonly parentStyleSheet: StyleSheet | null = null;
  readonly title: string | null = null;
  private _media: MediaList;
  private _disabledFlag = false;

  constructor(mediaText = '') {
    this._media = new MediaList(mediaText);
  }

  get media(): MediaList {
    return this._media;
  }

  set media(value: string | import('./types.ts').MediaList | null) {
    if (value === null) {
      this._media.mediaText = '';
    } else if (typeof value === 'string') {
      this._media.mediaText = value;
    } else {
      this._media.mediaText = value.mediaText;
    }
  }

  get disabled(): boolean {
    return this._disabledFlag;
  }

  set disabled(value: boolean) {
    this._disabledFlag = value;
  }
}

export class CSSStyleSheet extends StyleSheet {
  readonly parentStyleSheet: CSSStyleSheet | null = null;
  readonly ownerRule: CSSRule | null = null;
  readonly cssRules: CSSRuleList;
  private _rules: Rule[];
  private _parseRule: (text: string) => Rule;
  private _registeredProperties: string[] = [];

  private _registerRuleProperties(rule: Rule) {
    if (rule instanceof CSSPropertyRule) {
      try {
        PropertyRegistry.register({
          name: rule.name,
          syntax: rule.syntax,
          inherits: rule.inherits,
          initialValue: rule.initialValue ?? undefined
        }, 'css');
        this._registeredProperties.push(rule.name);
      } catch (e) {
        console.warn(`CSS @property warning: Invalid descriptor values for ${rule.name}. Rule was ignored.`, e);
      }
    }
  }

  private _unregisterProperties() {
    for (const name of this._registeredProperties) {
      PropertyRegistry.unregister(name, 'css');
    }
    this._registeredProperties = [];
  }

  // Internal flags (cssom-1 #the-cssstylesheet-interface)
  private _alternateFlag = false;
  private _originCleanFlag = true;
  private _constructedFlag = false;
  private _disallowModificationFlag = false;
  private _constructorDocument: unknown = null;
  private _baseURL: string | null = null;

  constructor(options: CSSStyleSheetInit = {}) {
    const mediaText = options.media instanceof MediaList ? options.media.mediaText : (options.media || '');
    super(mediaText);
    this._rules = [];
    this._constructedFlag = true;
    this._originCleanFlag = true;
    this.disabled = !!options.disabled;
    this._baseURL = options.baseURL || null;

    // Default parseRule for constructed stylesheets
    this._parseRule = (text: string) => {
      const tokens = tokenize(text);
      return ParseHooks.consumeRule(tokens) as unknown as Rule;
    };
    this.cssRules = new CSSRuleList(() => this._rules);
  }

  /** @internal */
  static createInternal(rules: Rule[], parseRule: (text: string) => Rule): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    sheet._rules.push(...rules);
    sheet._parseRule = parseRule;
    sheet._constructedFlag = false;
    for (const rule of rules) {
      if (rule instanceof CSSRule) {
        rule.parentStyleSheet = sheet;
      }
      sheet._registerRuleProperties(rule);
    }
    return sheet;
  }

  // cssom-1 § 6.5.1 #dom-cssstylesheet-replace
  replace(text: string): Promise<CSSStyleSheet> {
    // 1. Let promise be a promise.
    // 2. If the constructed flag is not set, or the disallow modification flag is set, reject promise with a NotAllowedError DOMException and return promise.
    if (!this._constructedFlag || this._disallowModificationFlag) {
      return Promise.reject(new DOMException("Not allowed on non-constructed stylesheets or modification is disallowed", "NotAllowedError"));
    }
    // 3. Set the disallow modification flag.
    this._disallowModificationFlag = true;

    // 4. In parallel, do these steps:
    return new Promise<CSSStyleSheet>((resolve, reject) => {
      queueMicrotask(() => {
        try {
          // 4.1 Let rules be the result of running parse a stylesheet's contents from text.
          const tokens = tokenize(text);
          const rules = ParseHooks.consumeListOfRules(tokens, true);

          // 4.2 If rules contains one or more @import rules, remove those rules from rules.
          const filteredRules = rules.filter(rule => {
            if (isImportRule(rule)) {
              console.warn('CSS Parse Error: @import rules are not allowed in constructed stylesheets and were removed.');
              return false;
            }
            return true;
          });

          // Clear parent references on previously attached rules
          for (const rule of this._rules) {
            if (rule instanceof CSSRule) {
              rule.parentRule = null;
              rule.parentStyleSheet = null;
            }
          }

          this._unregisterProperties();
          // 4.3 Set sheet's CSS rules to rules.
          this._rules = filteredRules;
          for (const rule of this._rules) {
            if (rule instanceof CSSRule) {
              rule.parentStyleSheet = this;
              rule.parentRule = null;
            }
            this._registerRuleProperties(rule);
          }

          // 4.4 Unset sheet's disallow modification flag.
          this._disallowModificationFlag = false;

          // 4.5 Resolve promise with sheet.
          resolve(this);
        } catch (e) {
          this._disallowModificationFlag = false;
          reject(e);
        }
      });
    });
  }

  // cssom-1 § 6.5.1 #dom-cssstylesheet-replacesync
  // cssom-1 § 6.5.1 #synchronously-replace-the-rules-of-a-cssstylesheet
  replaceSync(text: string): void {
    // 1. If the constructed flag is not set, or the disallow modification flag is set, throw a NotAllowedError DOMException.
    if (!this._constructedFlag) {
      throw new DOMException("Not allowed on non-constructed stylesheets", "NotAllowedError");
    }
    if (this._disallowModificationFlag) {
      throw new DOMException('Modification is disallowed', 'NotAllowedError');
    }
    // 2. Let rules be the result of running parse a stylesheet's contents from text.
    const tokens = tokenize(text);
    const rules = ParseHooks.consumeListOfRules(tokens, true);
    
    // 3. If rules contains one or more @import rules, remove those rules from rules.
    const filteredRules = rules.filter(rule => {
      if (isImportRule(rule)) {
        console.warn('CSS Parse Error: @import rules are not allowed in constructed stylesheets and were removed.');
        return false;
      }
      return true;
    });

    // Clear parent references on previously attached rules
    for (const rule of this._rules) {
      if (rule instanceof CSSRule) {
        rule.parentRule = null;
        rule.parentStyleSheet = null;
      }
    }

    this._unregisterProperties();
    // 4. Set sheet's CSS rules to rules.
    this._rules = filteredRules;
    for (const rule of this._rules) {
      if (rule instanceof CSSRule) {
        rule.parentStyleSheet = this;
        rule.parentRule = null;
      }
      this._registerRuleProperties(rule);
    }
  }

  // cssom-1 § 6.3 #dom-cssstylesheet-insertrule
  // cssom-1 § 6.5.3 #insert-a-css-rule
  insertRule(rule: string, index: number = 0): number {
    if (this._disallowModificationFlag) {
      throw new DOMException('Modification is disallowed', 'NotAllowedError');
    }
    if (!this._originCleanFlag) {
      throw new DOMException('The style sheet is not origin-clean.', 'SecurityError');
    }

    // cssom-1 § 6.5.3 #insert-a-css-rule step 1 & 2:
    // 1. Set length to the number of items in list.
    // 2. If index is greater than length (or index < 0), throw IndexSizeError.
    // NOTE: This boundary check MUST precede parsing per CSSOM 1 § 6.5.3 step 2!
    if (index < 0 || index > this._rules.length) {
      throw new DOMException('Index size error', 'IndexSizeError');
    }

    // 3. Set new rule to the results of performing parse a CSS rule on argument rule.
    const parsedRule = this._parseRule(rule);
    // 5. If new rule is a syntax error, throw a SyntaxError exception.
    if (!parsedRule) {
      throw new DOMException('Syntax error', 'SyntaxError');
    }

    const isImport = isImportRule(parsedRule);
    const isNamespace = isNamespaceRule(parsedRule);

    // cssom-1 § 6.3 #dom-cssstylesheet-insertrule step 5:
    // If parsed rule is an @import rule, and the constructed flag is set, throw a SyntaxError DOMException.
    if (isImport && this._constructedFlag) {
      throw new DOMException('HierarchyRequestError: @import rules are not allowed in constructed stylesheets', 'SyntaxError');
    }

    // cssom-1 § 6.5.3 #insert-a-css-rule step 6 & step 7:
    if (isImport) {
      // 6. An @import rule must precede all other rules except @charset / @import
      for (let i = 0; i < index; i++) {
        if (!isImportRule(this._rules[i])) {
          throw new DOMException('HierarchyRequestError: @import rules must precede all other rules', 'HierarchyRequestError');
        }
      }
    } else if (isNamespace) {
      // 7. If new rule is an @namespace at-rule, and list contains anything other than
      // @import at-rules and @namespace at-rules, throw an InvalidStateError exception.
      if (this._rules.some(r => isRegularRule(r))) {
        throw new DOMException('InvalidStateError: @namespace rules must precede all regular rules', 'InvalidStateError');
      }
      // 6. @namespace must follow all @import rules. If any @import rule is at or after index, throw HierarchyRequestError.
      for (let i = index; i < this._rules.length; i++) {
        if (isImportRule(this._rules[i])) {
          throw new DOMException('HierarchyRequestError: @namespace rules must follow all @import rules', 'HierarchyRequestError');
        }
      }
    } else {
      // 6. Regular rules must follow all @import and @namespace rules.
      for (let i = index; i < this._rules.length; i++) {
        if (isImportRule(this._rules[i]) || isNamespaceRule(this._rules[i])) {
          throw new DOMException('HierarchyRequestError: Regular rules must follow all @import and @namespace rules', 'HierarchyRequestError');
        }
      }
    }

    // 8. Insert new rule into list at zero-indexed position index.
    // cssom-1 § 6.4 #the-cssrule-interface: establish parentStyleSheet reference
    if (parsedRule instanceof CSSRule) {
      parsedRule.parentStyleSheet = this;
      parsedRule.parentRule = null;
    }
    this._rules.splice(index, 0, parsedRule);
    this._registerRuleProperties(parsedRule);
    return index;
  }

  // cssom-1 § 6.3 #dom-cssstylesheet-deleterule
  // cssom-1 § 6.5.4 #remove-a-css-rule
  deleteRule(index: number): void {
    if (this._disallowModificationFlag) {
      throw new DOMException('Modification is disallowed', 'NotAllowedError');
    }
    if (!this._originCleanFlag) {
      throw new DOMException('The style sheet is not origin-clean.', 'SecurityError');
    }

    // 1. Set length to the number of items in list.
    // 2. If index is greater than or equal to length (or index < 0), throw IndexSizeError.
    if (index < 0 || index >= this._rules.length) {
      throw new DOMException('Index size error', 'IndexSizeError');
    }

    // 3. Set old rule to the indexth item in list.
    const rule = this._rules[index];

    // 4. If old rule is an @namespace at-rule, and list contains anything other than
    // @import at-rules and @namespace at-rules, throw an InvalidStateError exception.
    if (isNamespaceRule(rule) && this._rules.some(r => isRegularRule(r))) {
      throw new DOMException('InvalidStateError: Cannot remove @namespace rule when regular rules exist', 'InvalidStateError');
    }

    // 5. Remove rule old rule from list at zero-indexed position index.
    // 6. Set old rule's parent CSS rule and parent CSS style sheet to null.
    deleteRuleFromArray(this._rules, index);

    if (rule instanceof CSSPropertyRule) {
      PropertyRegistry.unregister(rule.name, 'css');
      const idx = this._registeredProperties.indexOf(rule.name);
      if (idx !== -1) {
        this._registeredProperties.splice(idx, 1);
      }
    }
  }

  // Legacy members
  get rules(): CSSRuleList {
    return this.cssRules;
  }

  addRule(selector: string = 'undefined', style: string = 'undefined', optionalIndex?: number): number {
    let rule = '';
    rule += selector;
    rule += ' { ';
    if (style !== '') {
      rule += style + ' ';
    }
    rule += '}';
    
    const index = optionalIndex !== undefined ? optionalIndex : this._rules.length;
    this.insertRule(rule, index);
    return -1;
  }

  removeRule(index: number = 0): void {
    this.deleteRule(index);
  }

  
}

function isImportRule(r: Rule) {
  if (typeof r.type === 'number') {
    return r.type === CSSRule.IMPORT_RULE;
  }
  return r.type === 'at-rule' && (r as ASTAtRule).name === 'import';
}
function isNamespaceRule(r: Rule) {
  if (typeof r.type === 'number') {
    return r.type === CSSRule.NAMESPACE_RULE;
  }
  return r.type === 'at-rule' && (r as ASTAtRule).name === 'namespace';
}
function isRegularRule(r: Rule) {
  return !isImportRule(r) && !isNamespaceRule(r);
}

// cssom-1 § 6.4.3 #the-cssgroupingrule-interface
function serializeGroupingRule(atKeyword: string, condition: string, rules: Rule[]): string {
  const cond = condition ? ' ' + condition : '';
  const ruleTexts = rules.map(r => (r as CSSRule).cssText).filter(p => p !== '');
  if (ruleTexts.length === 0) {
    if (atKeyword === 'keyframes' || atKeyword === 'scope') {
      return `@${atKeyword}${cond} { }`;
    }
    return `@${atKeyword}${cond} {\n}`;
  }
  const body = ruleTexts.map(t => '  ' + t).join('\n');
  return `@${atKeyword}${cond} {\n${body}\n}`;
}

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

  set cssText(value: string) {
    // Do nothing
  }
}

export class CSSRuleList {
  [index: number]: CSSRule;
  private _getRules: () => Rule[];

  constructor(rulesOrGetter: Rule[] | (() => Rule[])) {
    this._getRules = typeof rulesOrGetter === 'function' ? rulesOrGetter : () => rulesOrGetter;
    return createIndexedProxy(this, (t) => t._getRules(), (v) => v as unknown as CSSRule);
  }

  get length() {
    return this._getRules().length;
  }

  item(index: number): CSSRule | null {
    return (this._getRules()[index] as unknown as CSSRule) || null;
  }

  *[Symbol.iterator](): Iterator<CSSRule> {
    const rules = this._getRules();
    for (let i = 0; i < rules.length; i++) {
      yield rules[i] as unknown as CSSRule;
    }
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

    const isNested = this instanceof CSSStyleRule || this.parentRule !== null;

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
        if (!isGroupingRule && !(topRule instanceof CSSStyleRule)) {
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

    if (parsedRule instanceof CSSNestedDeclarations) {
      if (!isNested) {
        throw new DOMException('Syntax error: CSSNestedDeclarations cannot be inserted into top-level grouping rule', 'SyntaxError');
      }
      const validDecls = parsedRule.style.declarations.filter(d => {
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

function findParentStyleSheet(rule: CSSRule): CSSStyleSheet | null {
  let sheet: CSSStyleSheet | null = rule.parentStyleSheet;
  let curr: CSSRule | null = rule.parentRule;
  while (!sheet && curr) {
    sheet = curr.parentStyleSheet;
    curr = curr.parentRule;
  }
  return sheet;
}

export class CSSStyleRule extends CSSGroupingRule {
  private _selectorText: string;
  private _selectorAST: import('./types.ts').SelectorList | null = null;
  private _style: CSSStyleDeclaration;
  readonly styleMap: StylePropertyMap;

  constructor(selectorText: string, styleDeclarations: Declaration[], rules: Rule[], parseRuleInBlock: (text: string) => Rule, selectorAST: import('./types.ts').SelectorList | null = null) {
    super(rules, parseRuleInBlock);
    this._selectorText = selectorText;
    this._selectorAST = selectorAST;
    this._style = new CSSStyleDeclaration(styleDeclarations);
    this._style.parentRule = this;
    this.styleMap = new StylePropertyMap(this._style);
  }

  get style(): CSSStyleDeclaration {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  private _getNamespaceContext(): { hasDefaultNamespace: boolean; defaultNamespacePrefixes: Set<string> } {
    let hasDefaultNamespace = false;
    const defaultNamespacePrefixes = new Set<string>();
    const sheet = this.parentStyleSheet || (this.parentRule ? findParentStyleSheet(this.parentRule) : null);
    if (sheet) {
      let defaultUri: string | null = null;
      for (const rule of sheet.cssRules) {
        if (rule.type === 10) {
          const ns = rule as CSSNamespaceRule;
          if (ns.prefix === '') {
            hasDefaultNamespace = true;
            defaultUri = ns.namespaceURI;
          }
        }
      }
      if (defaultUri !== null) {
        for (const rule of sheet.cssRules) {
          if (rule.type === 10) {
            const ns = rule as CSSNamespaceRule;
            if (ns.namespaceURI === defaultUri && ns.prefix !== '') {
              defaultNamespacePrefixes.add(ns.prefix);
            }
          }
        }
      }
    }
    return { hasDefaultNamespace, defaultNamespacePrefixes };
  }

  get selectorText(): string {
    if (this._selectorAST) {
      const nsContext = this._getNamespaceContext();
      return serializeSelectorList(this._selectorAST, nsContext);
    }
    return this._selectorText;
  }

  set selectorText(value: string) {
    const declaredNamespaces = new Set<string>();
    const sheet = this.parentStyleSheet || (this.parentRule ? findParentStyleSheet(this.parentRule) : null);
    if (sheet) {
      for (const rule of sheet.cssRules) {
        if (rule.type === 10) {
          const prefix = (rule as CSSNamespaceRule).prefix;
          declaredNamespaces.add(prefix);
        }
      }
    }
    const nsContext = this._getNamespaceContext();
    let isNested = false;
    let currParent: CSSRule | null = this.parentRule;
    while (currParent !== null) {
      if (currParent.type === 1 || currParent.constructor.name === 'CSSStyleRule') {
        isNested = true;
        break;
      }
      currParent = currParent.parentRule;
    }
    let selectorAST: SelectorList | null = null;
    try {
      selectorAST = ParseHooks.parseSelectorAST(value, declaredNamespaces, isNested);
    } catch {
      return;
    }
    if (selectorAST !== null) {
      if (isNested) {
        for (const selector of selectorAST.selectors) {
          if (selector.type === 'complex-selector') {
            if (selector.items.length > 0 && selector.items[0].type === 'combinator') {
              selector.items.unshift({
                type: 'compound-selector',
                selectors: [{ type: 'nesting-selector' }]
              });
            } else {
              const hasAmp = selector.items.some((item: ComplexSelector['items'][number]) => {
                if (item.type === 'compound-selector') {
                  return item.selectors.some((s: SimpleSelector) => s.type === 'nesting-selector');
                }
                return false;
              });
              if (!hasAmp) {
                selector.items.unshift(
                  { type: 'compound-selector', selectors: [{ type: 'nesting-selector' }] },
                  { type: 'combinator', value: ' ' }
                );
              }
            }
          }
        }
      }
      this._selectorAST = selectorAST;
      this._selectorText = serializeSelectorList(selectorAST, nsContext);
    }
  }

  get selectorAST(): import('./types.ts').SelectorList | null {
    return this._selectorAST;
  }


  get type() { return 1; }

  // 6.14 The CSSStyleRule Interface & css-nesting-1 § 4.1 #the-cssnesteddeclarations-interface
  get cssText() {
    const declsStr = serializeDeclarations(this.style.declarations);
    
    if (this._rules.length > 0) {
      const bodyParts: string[] = [];
      if (declsStr) {
        bodyParts.push('  ' + declsStr);
      }
      for (const r of this._rules) {
        const text = (r as CSSRule).cssText;
        if (text !== '') {
          bodyParts.push('  ' + text);
        }
      }
      
      if (bodyParts.length === 0) {
        return `${this.selectorText} { }`;
      }
      return `${this.selectorText} {\n${bodyParts.join('\n')}\n}`;
    } else {
      const bodyText = declsStr.trim();
      return `${this.selectorText} {${bodyText ? ' ' + bodyText + ' ' : ' '}}`;
    }
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

// css-conditional-3 § 3 #the-cssconditionrule-interface
export class CSSConditionRule extends CSSGroupingRule {
  get conditionText(): string {
    return '';
  }
}

// css-conditional-3 § 4 #the-cssmediarule-interface
export class CSSMediaRule extends CSSConditionRule {
  readonly media: MediaList;

  constructor(mediaText: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this.media = new MediaList(mediaText);
  }

  override get conditionText(): string {
    return this.media.mediaText;
  }

  set conditionText(value: string) {
    this.media.mediaText = value;
  }

  get type() { return 4; }

  // 6.17 The CSSMediaRule Interface
  get cssText() {
    return serializeGroupingRule('media', this.media.mediaText, this._rules);
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

// Media Queries 5 § 2.3 #custom-mq
export class CSSCustomMediaRule extends CSSRule {
  readonly name: string;
  readonly query: CustomMediaQuery;

  constructor(name: string, query: CustomMediaQuery) {
    super();
    this.name = name;
    this.query = query;
  }

  get type() { return 0; }

  get cssText(): string {
    const queryStr = typeof this.query === 'boolean' ? String(this.query) : this.query.mediaText;
    return `@custom-media ${this.name}${queryStr ? ' ' + queryStr : ''};`;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

// css-conditional-3 § 5 #the-csssupportsrule-interface
export class CSSSupportsRule extends CSSConditionRule {
  private _conditionText: string;

  constructor(conditionText: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._conditionText = conditionText;
  }

  override get conditionText(): string {
    return this._conditionText;
  }

  get type() { return 12; }

  get cssText() {
    return serializeGroupingRule('supports', this._conditionText, this._rules);
  }

  set cssText(_value: string) {}
}

// css-conditional-5 § 4 #the-csscontainerrule-interface
export class CSSContainerRule extends CSSConditionRule {
  readonly containerName: string;
  readonly containerQuery: string;

  constructor(containerQuery: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule, containerName: string = '') {
    super(rules, parseRuleInBlock);
    this.containerName = containerName;
    this.containerQuery = containerQuery;
  }

  override get conditionText(): string {
    if (this.containerName) {
      return `${this.containerName} ${this.containerQuery}`;
    }
    return this.containerQuery;
  }

  get type() { return 0; }

  get cssText() {
    return serializeGroupingRule('container', this.conditionText, this._rules);
  }

  set cssText(_value: string) {}
}

export class CSSLayerBlockRule extends CSSGroupingRule {
  readonly name: string;

  constructor(name: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this.name = name;
  }

  get type() { return 0; }

  get cssText() {
    return serializeGroupingRule('layer', this.name, this._rules);
  }

  set cssText(_value: string) {}
}

export class CSSLayerStatementRule extends CSSRule {
  readonly nameList: readonly string[];

  constructor(nameList: string[]) {
    super();
    this.nameList = nameList;
  }

  get type() { return 0; }

  get cssText() {
    return `@layer ${this.nameList.join(', ')};`;
  }

  set cssText(_value: string) {}
}

export class CSSStartingStyleRule extends CSSGroupingRule {
  constructor(_prelude: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
  }

  get type() { return 0; }

  get cssText() {
    return serializeGroupingRule('starting-style', '', this._rules);
  }

  set cssText(_value: string) {}
}

export class CSSScopeRule extends CSSGroupingRule {
  readonly startSelector: string | null;
  readonly endSelector: string | null;

  constructor(startSelector: string | null, endSelector: string | null, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this.startSelector = startSelector;
    this.endSelector = endSelector;
  }

  get type() { return 0; }

  get cssText() {
    let prelude = '';
    if (this.startSelector) {
      prelude += this.startSelector;
    }
    if (this.endSelector) {
      if (prelude) prelude += ' ';
      prelude += `to ${this.endSelector}`;
    }
    return serializeGroupingRule('scope', prelude, this._rules);
  }

  set cssText(_value: string) {}
}

export class CSSViewTransitionRule extends CSSRule {
  readonly navigation: string;

  constructor(declarations: Declaration[]) {
    super();
    let navigation = 'none';
    for (const decl of declarations) {
      if (decl.name === 'navigation') {
        navigation = serialize(decl.value).trim();
      }
    }
    this.navigation = navigation;
  }

  get type() { return 0; }

  get cssText() {
    return `@view-transition { navigation: ${this.navigation}; }`;
  }

  set cssText(_value: string) {}
}

function normalizeKeyframeSelector(selector: string): string {
  const parts = selector.split(',');
  const normalized: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === 'from') {
      normalized.push('0%');
    } else if (trimmed === 'to') {
      normalized.push('100%');
    } else {
      if (!trimmed.endsWith('%')) {
        throw new DOMException(`Invalid keyframe selector`, 'SyntaxError');
      }
      const valStr = trimmed.slice(0, -1).trim();
      const val = Number(valStr);
      if (Number.isNaN(val) || valStr === '' || val < 0 || val > 100) {
        throw new DOMException(`Invalid keyframe selector`, 'SyntaxError');
      }
      normalized.push(`${val}%`);
    }
  }
  if (normalized.length === 0) {
    throw new DOMException(`Invalid keyframe selector`, 'SyntaxError');
  }
  return normalized.join(', ');
}

export class CSSKeyframesRule extends CSSRule {
  [index: number]: CSSKeyframeRule;
  name: string;
  readonly cssRules: CSSRuleList;
  private _rules: CSSKeyframeRule[];

  constructor(name: string, rules: CSSKeyframeRule[]) {
    super();
    this.name = name;
    this._rules = rules;
    this.cssRules = new CSSRuleList(() => this._rules);

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          const index = Number(prop);
          if (Number.isInteger(index) && index >= 0) {
            return target._rules[index];
          }
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  get type() { return 7; }

  get length(): number {
    return this._rules.length;
  }

  // The CSSKeyframesRule Interface
  get cssText() {
    const isDisallowed = ['none', 'initial', 'inherit', 'unset', 'revert', 'default'].includes(this.name.toLowerCase());
    const serializedName = isDisallowed ? JSON.stringify(this.name) : serializeIdentifier(this.name);
    return serializeGroupingRule('keyframes', serializedName, this._rules);
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }

  findRule(select: string): CSSKeyframeRule | null {
    let normalized: string;
    try {
      normalized = normalizeKeyframeSelector(select);
    } catch {
      return null;
    }
    for (let i = this._rules.length - 1; i >= 0; i--) {
      if (this._rules[i].keyText === normalized) {
        return this._rules[i];
      }
    }
    return null;
  }

  appendRule(ruleText: string): void {
    const openBrace = ruleText.indexOf('{');
    const closeBrace = ruleText.lastIndexOf('}');
    if (openBrace === -1 || closeBrace === -1 || closeBrace < openBrace) {
      return;
    }
    const selectorText = ruleText.slice(0, openBrace).trim();
    let keyText: string;
    try {
      keyText = normalizeKeyframeSelector(selectorText);
    } catch {
      return;
    }
    const body = ruleText.slice(openBrace + 1, closeBrace);
    const styleDecl = ParseHooks.parseStyleAttribute(tokenize(body));
    const keyframe = new CSSKeyframeRule(keyText, styleDecl.declarations);
    keyframe.parentRule = this;
    this._rules.push(keyframe);
  }

  deleteRule(select: string): void {
    let normalized: string;
    try {
      normalized = normalizeKeyframeSelector(select);
    } catch {
      return;
    }
    for (let i = this._rules.length - 1; i >= 0; i--) {
      if (this._rules[i].keyText === normalized) {
        this._rules.splice(i, 1);
        break;
      }
    }
  }
}

export class CSSKeyframeRule extends CSSRule {
  private _keyText!: string;
  private _style: CSSStyleDeclaration;

  constructor(keyText: string, styleDeclarations: Declaration[]) {
    super();
    this.keyText = keyText;
    this._style = new CSSStyleDeclaration(styleDeclarations);
    this._style.parentRule = this;
  }

  get keyText(): string {
    return this._keyText;
  }

  set keyText(value: string) {
    this._keyText = normalizeKeyframeSelector(value);
  }

  get style(): CSSStyleDeclaration {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  get type() { return 8; }

  // The CSSKeyframeRule Interface
  get cssText() {
    const body = this._style.cssText.trim();
    return `${this.keyText} {${body ? ' ' + body + ' ' : ''}}`;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

export class CSSNestedDeclarations extends CSSRule {
  private _style: CSSStyleDeclaration;

  constructor(styleDeclarations: Declaration[]) {
    super();
    this._style = new CSSStyleDeclaration(styleDeclarations);
    this._style.parentRule = this;
  }

  get style(): CSSStyleDeclaration {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  get type() { return 0; }

  // The CSSNestedDeclarations Interface
  get cssText() {
    return this._style.cssText;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

export class CSSFontFaceDescriptors extends CSSStyleDeclaration {
  declare src?: string;
  declare fontDisplay?: string;
  declare unicodeRange?: string;

  override _isPropertySupported(property: string): boolean {
    return super._isPropertySupported(property) || FONT_FACE_DESCRIPTORS.has(property);
  }
}

export class CSSFontFaceRule extends CSSRule {
  private _style: CSSFontFaceDescriptors;

  constructor(styleDeclarations: Declaration[]) {
    super();
    this._style = new CSSFontFaceDescriptors(styleDeclarations);
    this._style.parentRule = this;
  }

  get style(): CSSFontFaceDescriptors {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  get type() { return 5; }

  get cssText() {
    const body = this._style.cssText.trim();
    return `@font-face {${body ? ' ' + body + ' ' : ''}}`;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}
export class CSSPageDescriptors extends CSSStyleDeclaration {
  declare margin: string;
  declare marginTop: string;
  declare marginRight: string;
  declare marginBottom: string;
  declare marginLeft: string;
  declare 'margin-top': string;
  declare 'margin-right': string;
  declare 'margin-bottom': string;
  declare 'margin-left': string;
  declare size: string;
  declare pageOrientation: string;
  declare 'page-orientation': string;
  declare marks: string;
  declare bleed: string;
  declare pageMarginSafety?: string;

  override _isPropertySupported(property: string): boolean {
    return super._isPropertySupported(property) || PAGE_DESCRIPTORS.has(property);
  }
}
export class CSSMarginDescriptors extends CSSStyleDeclaration {
}

export class CSSMarginRule extends CSSRule {
  readonly name: string;
  private _style: CSSMarginDescriptors;

  constructor(name: string, declarations: import('./types.ts').Declaration[]) {
    super();
    this.name = name;
    this._style = new CSSMarginDescriptors(declarations);
    this._style.parentRule = this;
  }

  get style(): CSSMarginDescriptors {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  get type() { return 9; } // CSSRule.MARGIN_RULE

  get cssText() {
    const body = this.style.cssText.trim();
    return `@${this.name} {${body ? ' ' + body + ' ' : ''}}`;
  }

  set cssText(_value: string) {}
}

export class CSSImportRule extends CSSRule {
  private _href: string;
  private _media: MediaList;
  private _styleSheet: CSSStyleSheet | null = null;
  private _layerName: string | null = null;
  private _supportsText: string | null = null;

  constructor(href: string, mediaText: string = '', layerName: string | null = null, supportsText: string | null = null) {
    super();
    this._href = href;
    this._media = new MediaList(mediaText);
    this._layerName = layerName;
    this._supportsText = supportsText;
  }

  // cssom-1 § 6.4.3 #dom-cssimportrule-href
  get href(): string {
    return this._href;
  }

  // cssom-1 § 6.4.3 #dom-cssimportrule-media
  get media(): MediaList {
    return this._media;
  }

  set media(value: string | import('./types.ts').MediaList | null) {
    if (value === null) {
      this._media.mediaText = '';
    } else if (typeof value === 'string') {
      this._media.mediaText = value;
    } else {
      this._media.mediaText = value.mediaText;
    }
  }

  // cssom-1 § 6.4.3 #dom-cssimportrule-stylesheet
  get styleSheet(): CSSStyleSheet | null {
    return this._styleSheet;
  }

  // cssom-1 § 6.4.3 #dom-cssimportrule-layername
  get layerName(): string | null {
    return this._layerName;
  }

  // cssom-1 § 6.4.3 #dom-cssimportrule-supportstext
  get supportsText(): string | null {
    return this._supportsText;
  }

  get [Symbol.toStringTag]() {
    return 'CSSImportRule';
  }

  get type() { return 3; } // CSSRule.IMPORT_RULE


  get cssText() {
    let text = `@import url(${serializeString(this.href)})`;
    if (this.layerName !== null) {
      text += this.layerName ? ` layer(${this.layerName})` : ` layer`;
    }
    if (this.supportsText !== null) {
      text += ` supports(${this.supportsText})`;
    }
    const mediaStr = this.media.mediaText;
    if (mediaStr) {
      text += ` ${mediaStr}`;
    }
    return text + `;`;
  }

  set cssText(_value: string) {}
}

export class CSSNamespaceRule extends CSSRule {
  private _namespaceURI: string;
  private _prefix: string;

  constructor(prefix: string, namespaceURI: string) {
    super();
    this._prefix = prefix;
    this._namespaceURI = namespaceURI;
  }

  // cssom-1 § 6.4.5 #dom-cssnamespacerule-namespaceuri
  get namespaceURI(): string {
    return this._namespaceURI;
  }

  // cssom-1 § 6.4.5 #dom-cssnamespacerule-prefix
  get prefix(): string {
    return this._prefix;
  }

  get [Symbol.toStringTag]() {
    return 'CSSNamespaceRule';
  }

  get type() { return 10; } // CSSRule.NAMESPACE_RULE

  get cssText() {
    if (this._prefix) {
      return `@namespace ${serializeIdentifier(this._prefix)} url("${this._namespaceURI}");`;
    }
    return `@namespace url("${this._namespaceURI}");`;
  }

  set cssText(_value: string) {}
}

function parsePageSelectorList(text: string): string[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];

  const tokens = tokenize(text);
  const values = ParseHooks.parseComponentValues(tokens);
  
  const selectorTokensList: ComponentValue[][] = [];
  let current: ComponentValue[] = [];
  for (const v of values) {
    if (v.type === 'comma') {
      selectorTokensList.push(current);
      current = [];
    } else {
      current.push(v);
    }
  }
  selectorTokensList.push(current);

  const results: string[] = [];

  for (const selTokens of selectorTokensList) {
    const filtered = selTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
    if (filtered.length === 0) {
      return null;
    }

    let hasIdent = false;
    let pos = 0;
    
    if (filtered[0].type === 'ident') {
      hasIdent = true;
      pos = 1;
    }
    
    while (pos < filtered.length) {
      const colon = filtered[pos];
      const ident = filtered[pos + 1];
      if (colon && colon.type === 'colon' && ident && ident.type === 'ident') {
        const pseudoName = ident.value.toLowerCase();
        if (['left', 'right', 'first', 'blank'].includes(pseudoName)) {
          pos += 2;
          continue;
        }
      }
      return null;
    }
    
    let serialized = '';
    if (hasIdent) {
      serialized += serializeIdentifier(filtered[0].value as string);
    }
    let p = hasIdent ? 1 : 0;
    while (p < filtered.length) {
      serialized += ':' + serializeIdentifier(filtered[p + 1].value as string);
      p += 2;
    }
    results.push(serialized);
  }

  return results;
}

export class CSSPageRule extends CSSGroupingRule {
  private _selectorText: string;
  private _style: CSSPageDescriptors;
 
  constructor(selectorText: string, declarations: import('./types.ts').Declaration[], rules: import('./types.ts').Rule[], parseRuleInBlock: (text: string) => import('./types.ts').Rule) {
    super(rules, parseRuleInBlock);
    const parsed = parsePageSelectorList(selectorText);
    this._selectorText = parsed ? parsed.join(', ') : selectorText;
    this._style = new CSSPageDescriptors(declarations);
    this._style.parentRule = this;
  }

  get selectorText(): string {
    return this._selectorText;
  }

  set selectorText(value: string) {
    const parsed = parsePageSelectorList(value);
    if (parsed !== null) {
      this._selectorText = parsed.join(', ');
    }
  }

  get style(): CSSPageDescriptors {
    return this._style;
  }

  set style(value: string) {
    this._style.cssText = value;
  }

  get type() { return 6; }

  get cssText() {
    const sel = this.selectorText ? this.selectorText + ' ' : '';
    const declsStr = this.style.cssText.trim();
    const rulesStr = this._rules.map((r: import('./types.ts').Rule) => (r as CSSRule).cssText).join('\n').trim();
    
    let bodyText = '';
    if (declsStr && rulesStr) {
      bodyText = declsStr + '\n' + rulesStr;
    } else {
      bodyText = declsStr || rulesStr;
    }

    if (!bodyText) return `@page ${sel}{ }`;
    
    const indentedBody = bodyText.split('\n').map(line => '  ' + line).join('\n');
    return `@page ${sel}{\n${indentedBody}\n}`;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

export class CSSPropertyRule extends CSSRule {
  readonly name: string;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string | null;

  constructor(name: string, syntax: string, inherits: boolean, initialValue: string | null) {
    super();
    this.name = name;
    this.syntax = syntax;
    this.inherits = inherits;
    this.initialValue = initialValue;
  }

  get type() { return 18; }

  get cssText() {
    let body = `syntax: ${serializeString(this.syntax)}; inherits: ${this.inherits};`;
    if (this.initialValue !== null) {
      body += `initial-value: ${this.initialValue};`;
    }
    return `@property ${serializeIdentifier(this.name)} {${body}}`;
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}


export class CSSAtRule extends CSSRule {
  public name: string;
  public prelude: unknown[]; // ComponentValue[] is handled dynamically
  public block?: unknown;    // SimpleBlock
  public childRules?: CSSRule[];

  constructor(name: string, prelude: unknown[], block?: unknown, childRules?: CSSRule[]) {
    super();
    this.name = name;
    this.prelude = prelude;
    this.block = block;
    this.childRules = childRules;
  }


  override get type(): number {
    switch (this.name) {
      case 'import': return CSSRule.IMPORT_RULE;
      case 'charset': return CSSRule.CHARSET_RULE;
      case 'namespace': return CSSRule.NAMESPACE_RULE;
      case 'page': return CSSRule.PAGE_RULE;
      case 'font-face': return CSSRule.FONT_FACE_RULE;
      case 'supports': return 12;
      case 'layer': return 0; // Not strictly defined in old CSSOM
      default: return 0; // UNKNOWN_RULE
    }
  }

  get cssText(): string {
    const cond = this.prelude.length > 0 ? ' ' + serialize(this.prelude as unknown as ComponentValue[]).trim() : '';
    if (!this.block) return `@${this.name}${cond};`;
    
    const childRules = this.childRules || [];
    if (childRules.length > 0) {
      return serializeGroupingRule(this.name, cond.trim(), childRules as unknown as Rule[]);
    }
    
    const blockContentText = serialize((this.block as {value: ComponentValue[]}).value).trim();
    if (!blockContentText) return `@${this.name}${cond} { }`;
    
    const indentedBody = blockContentText.split('\n').map(line => '  ' + line).join('\n');
    return `@${this.name}${cond} {\n${indentedBody}\n}`;
  }
}

// css-counter-styles-3 § 8.1 #csscounterstylerule
export class CSSCounterStyleRule extends CSSRule {
  private _name: string;
  private _system: string = '';
  private _symbols: string = '';
  private _additiveSymbols: string = '';
  private _negative: string = '';
  private _prefix: string = '';
  private _suffix: string = '';
  private _range: string = '';
  private _pad: string = '';
  private _speakAs: string = '';
  private _fallback: string = '';
  private _declarations: import('./types.ts').Declaration[] = [];

  constructor(name: string, declarations: import('./types.ts').Declaration[] = []) {
    super();
    this._name = name;
    this._declarations = declarations;
    for (const d of declarations) {
      const valStr = Array.isArray(d.value) ? serialize(d.value).trim() : (typeof d.value === 'string' ? d.value : '');
      if (d.name === 'system') this._system = valStr;
      else if (d.name === 'symbols') this._symbols = valStr;
      else if (d.name === 'additive-symbols') this._additiveSymbols = valStr;
      else if (d.name === 'negative') this._negative = valStr;
      else if (d.name === 'prefix') this._prefix = valStr;
      else if (d.name === 'suffix') this._suffix = valStr;
      else if (d.name === 'range') this._range = valStr;
      else if (d.name === 'pad') this._pad = valStr;
      else if (d.name === 'speak-as') this._speakAs = valStr;
      else if (d.name === 'fallback') this._fallback = valStr;
    }
  }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-name
  get name(): string { return this._name; }
  set name(value: string) { this._name = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-system
  get system(): string { return this._system; }
  set system(value: string) { this._system = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-symbols
  get symbols(): string { return this._symbols; }
  set symbols(value: string) { this._symbols = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-additivesymbols
  get additiveSymbols(): string { return this._additiveSymbols; }
  set additiveSymbols(value: string) { this._additiveSymbols = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-negative
  get negative(): string { return this._negative; }
  set negative(value: string) { this._negative = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-prefix
  get prefix(): string { return this._prefix; }
  set prefix(value: string) { this._prefix = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-suffix
  get suffix(): string { return this._suffix; }
  set suffix(value: string) { this._suffix = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-range
  get range(): string { return this._range; }
  set range(value: string) { this._range = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-pad
  get pad(): string { return this._pad; }
  set pad(value: string) { this._pad = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-speakas
  get speakAs(): string { return this._speakAs; }
  set speakAs(value: string) { this._speakAs = value; }

  // css-counter-styles-3 § 8.1 #dom-csscounterstylerule-fallback
  get fallback(): string { return this._fallback; }
  set fallback(value: string) { this._fallback = value; }

  get [Symbol.toStringTag]() {
    return 'CSSCounterStyleRule';
  }

  get type() { return 11; }

  // css-counter-styles-3 § 8.1 #csscounterstylerule
  get cssText() {
    const decls = this._declarations.map(d => {
      const valStr = Array.isArray(d.value) ? serialize(d.value).trim() : (typeof d.value === 'string' ? d.value : '');
      return `${d.name}: ${valStr};`;
    }).join(' ');
    if (decls.length > 0) {
      return `@counter-style ${this._name} { ${decls} }`;
    }
    return `@counter-style ${this._name} {}`;
  }
  set cssText(_value: string) {}
}

// css-fonts-4 § 8 #om-fontfeaturevalues
export class CSSFontFeatureValuesMap {
  private _map = new Map<string, number[]>();

  get size(): number {
    return this._map.size;
  }

  get(featureValueName: string): number[] | undefined {
    return this._map.get(featureValueName);
  }

  set(featureValueName: string, values: number | number[]): void {
    const arr = Array.isArray(values) ? values.map(Number) : [Number(values)];
    this._map.set(featureValueName, arr);
  }

  has(featureValueName: string): boolean {
    return this._map.has(featureValueName);
  }

  delete(featureValueName: string): boolean {
    return this._map.delete(featureValueName);
  }

  clear(): void {
    this._map.clear();
  }

  entries(): IterableIterator<[string, number[]]> {
    return this._map.entries();
  }

  keys(): IterableIterator<string> {
    return this._map.keys();
  }

  values(): IterableIterator<number[]> {
    return this._map.values();
  }

  [Symbol.iterator](): IterableIterator<[string, number[]]> {
    return this._map[Symbol.iterator]();
  }

  get [Symbol.toStringTag]() {
    return 'CSSFontFeatureValuesMap';
  }
}

// css-fonts-4 § 8 #cssfontfeaturevaluesrule-interface
export class CSSFontFeatureValuesRule extends CSSRule {
  private _fontFamily: string;
  readonly annotation = new CSSFontFeatureValuesMap();
  readonly ornaments = new CSSFontFeatureValuesMap();
  readonly stylistic = new CSSFontFeatureValuesMap();
  readonly swash = new CSSFontFeatureValuesMap();
  readonly characterVariant = new CSSFontFeatureValuesMap();
  readonly styleset = new CSSFontFeatureValuesMap();
  readonly historicalForms = new CSSFontFeatureValuesMap();

  constructor(fontFamily: string) {
    super();
    this._fontFamily = fontFamily;
  }

  // css-fonts-4 § 8 #om-fontfeaturevalues
  get fontFamily(): string {
    return this._fontFamily;
  }

  set fontFamily(value: string) {
    this._fontFamily = value;
  }

  get [Symbol.toStringTag]() {
    return 'CSSFontFeatureValuesRule';
  }

  get type() { return 14; }

  get cssText(): string {
    const blocks: string[] = [];
    const serializeMap = (name: string, map: CSSFontFeatureValuesMap) => {
      if (map.size === 0) return;
      const entries: string[] = [];
      for (const [k, v] of map.entries()) {
        entries.push(`${k}: ${v.join(' ')};`);
      }
      blocks.push(`@${name} { ${entries.join(' ')} }`);
    };
    serializeMap('annotation', this.annotation);
    serializeMap('ornaments', this.ornaments);
    serializeMap('stylistic', this.stylistic);
    serializeMap('swash', this.swash);
    serializeMap('character-variant', this.characterVariant);
    serializeMap('styleset', this.styleset);
    serializeMap('historical-forms', this.historicalForms);

    if (blocks.length > 0) {
      return `@font-feature-values ${this._fontFamily} { ${blocks.join(' ')} }`;
    }
    return `@font-feature-values ${this._fontFamily} {}`;
  }
  set cssText(_value: string) {}
}

