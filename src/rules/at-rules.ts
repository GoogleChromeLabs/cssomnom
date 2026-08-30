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
import { serialize, serializeString, serializeIdentifier } from '../serializer.ts';
import { tokenize } from '../tokenizer.ts';
import type { Declaration, Rule, ComponentValue, CustomMediaQuery } from '../types.ts';
import { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import { CSSRule, CSSGroupingRule } from './base.ts';
import { CSSStyleSheet, StyleSheet } from '../CSSOM.ts';
import { MediaList, CSSRuleList } from './collections.ts';
import { serializeGroupingRule, FONT_FACE_DESCRIPTORS, PAGE_DESCRIPTORS } from './utils.ts';

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
    if (!containerName && containerQuery) {
      const trimmed = containerQuery.trim();
      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace > 0) {
        const potentialName = trimmed.slice(0, firstSpace);
        const lower = potentialName.toLowerCase();
        if (!['not', 'and', 'or', 'none'].includes(lower) && !potentialName.startsWith('(')) {
          this.containerName = potentialName;
          this.containerQuery = trimmed.slice(firstSpace + 1).trim();
        } else {
          this.containerName = '';
          this.containerQuery = trimmed;
        }
      } else if (!['not', 'and', 'or', 'none'].includes(trimmed.toLowerCase()) && !trimmed.startsWith('(')) {
        this.containerName = trimmed;
        this.containerQuery = '';
      } else {
        this.containerName = '';
        this.containerQuery = trimmed;
      }
    } else {
      this.containerName = containerName;
      this.containerQuery = containerQuery;
    }
  }

  override get conditionText(): string {
    if (this.containerName) {
      return this.containerQuery ? `${this.containerName} ${this.containerQuery}` : this.containerName;
    }
    return this.containerQuery;
  }

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

  get cssText() {
    return `@layer ${this.nameList.join(', ')};`;
  }

  set cssText(_value: string) {}
}

export class CSSStartingStyleRule extends CSSGroupingRule {
  constructor(_prelude: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
  }

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

  constructor(name: string, declarations: Declaration[]) {
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

  set media(value: string | import('../types.ts').MediaList | null) {
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
    if (!this._styleSheet) {
      this._styleSheet = CSSStyleSheet.createInternal([], (text: string) => {
        const tokens = tokenize(text);
        return ParseHooks.consumeRule(tokens) as unknown as Rule;
      });
      (this._styleSheet as unknown as { _ownerRule: CSSRule | null })._ownerRule = this;
      (this._styleSheet as unknown as { _parentStyleSheet: StyleSheet | null })._parentStyleSheet = this.parentStyleSheet;
      (this._styleSheet as unknown as { _href: string | null })._href = this._href;
    }
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
  if (trimmed === '') return [''];

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
    let start = 0;
    while (start < selTokens.length && (selTokens[start].type === 'whitespace' || selTokens[start].type === 'comment')) {
      start++;
    }
    let end = selTokens.length;
    while (end > start && (selTokens[end - 1].type === 'whitespace' || selTokens[end - 1].type === 'comment')) {
      end--;
    }
    const trimmedTokens = selTokens.slice(start, end);
    if (trimmedTokens.length === 0) {
      return null;
    }

    if (trimmedTokens.some(t => t.type === 'whitespace' || t.type === 'comment')) {
      return null;
    }

    let hasIdent = false;
    let pos = 0;
    
    if (trimmedTokens[0].type === 'ident') {
      hasIdent = true;
      pos = 1;
    }
    
    while (pos < trimmedTokens.length) {
      const colon = trimmedTokens[pos];
      const ident = trimmedTokens[pos + 1];
      if (colon && colon.type === 'colon' && ident && ident.type === 'ident') {
        const pseudoName = (ident.value as string).toLowerCase();
        if (['left', 'right', 'first', 'blank'].includes(pseudoName)) {
          pos += 2;
          continue;
        }
      }
      return null;
    }
    
    let serialized = '';
    if (hasIdent) {
      serialized += serializeIdentifier(trimmedTokens[0].value as string);
    }
    let p = hasIdent ? 1 : 0;
    while (p < trimmedTokens.length) {
      serialized += ':' + serializeIdentifier((trimmedTokens[p + 1].value as string).toLowerCase());
      p += 2;
    }
    results.push(serialized);
  }

  return results;
}

export class CSSPageRule extends CSSGroupingRule {
  private _selectorText: string;
  private _style: CSSPageDescriptors;
 
  constructor(selectorText: string, declarations: Declaration[], rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    const parsed = parsePageSelectorList(selectorText);
    this._selectorText = parsed ? (parsed.length === 1 && parsed[0] === '' ? '' : parsed.join(', ')) : selectorText;
    this._style = new CSSPageDescriptors(declarations);
    this._style.parentRule = this;
  }

  get selectorText(): string {
    return this._selectorText;
  }

  set selectorText(value: string) {
    const parsed = parsePageSelectorList(value);
    if (parsed !== null) {
      this._selectorText = (parsed.length === 1 && parsed[0] === '') ? '' : parsed.join(', ');
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
    const rulesStr = this._rules.map((r: Rule) => (r as CSSRule).cssText).join('\n').trim();
    
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
  public prelude: unknown[];
  public block?: unknown;
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
      case 'layer': return 0;
      default: return 0;
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
  private _declarations: Declaration[] = [];

  constructor(name: string, declarations: Declaration[] = []) {
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
    const maps: [string, CSSFontFeatureValuesMap][] = [
      ['annotation', this.annotation],
      ['ornaments', this.ornaments],
      ['stylistic', this.stylistic],
      ['swash', this.swash],
      ['character-variant', this.characterVariant],
      ['styleset', this.styleset],
      ['historical-forms', this.historicalForms],
    ];
    for (const [name, map] of maps) {
      if (map.size > 0) {
        const entries = Array.from(map.entries(), ([k, v]) => `${k}: ${v.join(' ')};`).join(' ');
        blocks.push(`@${name} { ${entries} }`);
      }
    }
    const body = blocks.length > 0 ? ` { ${blocks.join(' ')} }` : ' {}';
    return `@font-feature-values ${this._fontFamily}${body}`;
  }
  set cssText(_value: string) {}
}
