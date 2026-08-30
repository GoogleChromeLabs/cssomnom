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
import { serializeDeclarations, serializeSelectorList } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import { StylePropertyMap } from './typed-om.ts';
import type { Declaration, Rule, SelectorList, ComplexSelector, SimpleSelector } from './types.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { deleteRuleFromArray } from './utils.ts';
import { PropertyRegistry } from './PropertyRegistry.ts';








export interface CSSStyleSheetInit {
  baseURL?: string | null;
  media?: MediaList | string;
  disabled?: boolean;
}
import { StyleSheetList, type LinkStyle, MediaList, CSSRuleList } from './rules/collections.ts';
import { isImportRule, isNamespaceRule, isRegularRule, findParentStyleSheet } from './rules/utils.ts';
import { CSSRule, CSSGroupingRule } from './rules/base.ts';
import type { CSSNamespaceRule } from './rules/at-rules.ts';
export { StyleSheetList, type LinkStyle, MediaList, CSSRuleList, CSSRule, CSSGroupingRule };

export class StyleSheet {
  protected _type: string = 'text/css';
  protected _href: string | null = null;
  protected _ownerNode: unknown | null = null;
  protected _parentStyleSheet: StyleSheet | null = null;
  protected _titleVal: string | null = null;
  private _media: MediaList;
  private _disabledFlag = false;

  get type(): string {
    return this._type;
  }

  get href(): string | null {
    return this._href;
  }

  get ownerNode(): unknown | null {
    return this._ownerNode;
  }

  get parentStyleSheet(): StyleSheet | null {
    return this._parentStyleSheet;
  }

  get title(): string | null {
    if (this.ownerNode && typeof (this.ownerNode as Element).getAttribute === 'function') {
      const t = (this.ownerNode as Element).getAttribute('title');
      return t === null || t === '' ? null : t;
    }
    return this._titleVal ?? null;
  }

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
  protected override _parentStyleSheet: CSSStyleSheet | null = null;
  protected _ownerRule: CSSRule | null = null;
  private _cssRules: CSSRuleList;
  private _rules: Rule[];
  private _parseRule: (text: string) => Rule;
  private _registeredProperties: string[] = [];

  get ownerRule(): CSSRule | null {
    return this._ownerRule;
  }

  override get parentStyleSheet(): CSSStyleSheet | null {
    // cssom-1 § 6.4.3: parentStyleSheet of child stylesheet is ownerRule's parentStyleSheet
    if (this._ownerRule) {
      return this._ownerRule.parentStyleSheet;
    }
    return this._parentStyleSheet;
  }

  get cssRules(): CSSRuleList {
    if (!this._originCleanFlag) {
      throw new DOMException('The stylesheet is not origin-clean', 'SecurityError');
    }
    return this._cssRules;
  }

  private _registerRuleProperties(rule: Rule) {
    if ((rule as { type?: number }).type === 18) {
      const propRule = rule as unknown as { name: string; syntax: string; inherits: boolean; initialValue: string | null };
      try {
        PropertyRegistry.register({
          name: propRule.name,
          syntax: propRule.syntax,
          inherits: propRule.inherits,
          initialValue: propRule.initialValue ?? undefined
        }, 'css');
        this._registeredProperties.push(propRule.name);
      } catch (e) {
        console.warn(`CSS @property warning: Invalid descriptor values for ${propRule.name}. Rule was ignored.`, e);
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
  private _baseURLVal: string | null = null;

  get _baseURL(): string | null {
    return this._baseURLVal;
  }

  get _constructed(): boolean {
    return this._constructedFlag;
  }

  get _isConstructed(): boolean {
    return this._constructedFlag;
  }

  get isConstructed(): boolean {
    return this._constructedFlag;
  }

  constructor(options: CSSStyleSheetInit = {}) {
    const mediaText = options.media instanceof MediaList ? options.media.mediaText : (options.media || '');
    super(mediaText);
    this._rules = [];
    this._constructedFlag = true;
    this._originCleanFlag = true;
    this.disabled = !!options.disabled;
    if (options.baseURL !== undefined && options.baseURL !== null) {
      const baseURI = (typeof globalThis.document !== 'undefined' && globalThis.document.baseURI) || (typeof globalThis.location !== 'undefined' && globalThis.location.href) || 'about:blank';
      try {
        const url = new URL(options.baseURL, baseURI);
        this._baseURLVal = url.href;
      } catch {
        throw new DOMException("Invalid baseURL", "NotAllowedError");
      }
    } else {
      this._baseURLVal = null;
    }

    // Default parseRule for constructed stylesheets
    this._parseRule = (text: string) => {
      const tokens = tokenize(text);
      return ParseHooks.consumeRule(tokens) as unknown as Rule;
    };
    this._cssRules = new CSSRuleList(() => this._rules);
  }

  /** @internal */
  static createInternal(rules: Rule[], parseRule: (text: string) => Rule, originClean: boolean = true): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    sheet._rules.push(...rules);
    sheet._parseRule = parseRule;
    sheet._constructedFlag = false;
    sheet._originCleanFlag = originClean;
    for (const rule of rules) {
      if (rule instanceof CSSRule) {
        rule.parentStyleSheet = sheet;
      }
      sheet._registerRuleProperties(rule);
    }
    return sheet;
  }

  private _replaceRulesFromText(text: string): void {
    const tokens = tokenize(text);
    const rules = ParseHooks.consumeListOfRules(tokens, true);

    const filteredRules = rules.filter(rule => {
      if (isImportRule(rule)) {
        console.warn('CSS Parse Error: @import rules are not allowed in constructed stylesheets and were removed.');
        return false;
      }
      return true;
    });

    for (const rule of this._rules) {
      if (rule instanceof CSSRule) {
        rule.parentRule = null;
        rule.parentStyleSheet = null;
      }
    }

    this._unregisterProperties();
    this._rules = filteredRules;
    for (const rule of this._rules) {
      if (rule instanceof CSSRule) {
        rule.parentStyleSheet = this;
        rule.parentRule = null;
      }
      this._registerRuleProperties(rule);
    }
  }

  // cssom-1 § 6.5.1 #dom-cssstylesheet-replace
  replace(text: string): Promise<CSSStyleSheet> {
    if (!this._constructedFlag || this._disallowModificationFlag) {
      return Promise.reject(new DOMException("Can't call replace or replaceSync on non-constructed stylesheets.", "NotAllowedError"));
    }
    this._disallowModificationFlag = true;

    return new Promise<CSSStyleSheet>((resolve, reject) => {
      queueMicrotask(() => {
        try {
          this._replaceRulesFromText(text);
          this._disallowModificationFlag = false;
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
    if (!this._constructedFlag) {
      throw new DOMException("Can't call replace or replaceSync on non-constructed stylesheets.", "NotAllowedError");
    }
    if (this._disallowModificationFlag) {
      throw new DOMException('Modification is disallowed', 'NotAllowedError');
    }
    this._replaceRulesFromText(text);
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

    if ((rule as { type?: number }).type === 18) {
      const propRule = rule as unknown as { name: string };
      PropertyRegistry.unregister(propRule.name, 'css');
      const idx = this._registeredProperties.indexOf(propRule.name);
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

export * from './rules/at-rules.ts';
