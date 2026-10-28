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

import { CSSRule, CSSGroupingRule } from './base.ts';
import { CSSStyleDeclaration, CSSKeyframeStyleDeclaration, CSSFontFaceDescriptors, CSSPageDescriptors, PAGE_DESCRIPTORS_INTERNAL, CSSMarginDescriptors } from '../CSSStyleDeclaration.ts';
export { CSSFontFaceDescriptors, CSSPageDescriptors, CSSMarginDescriptors } from '../CSSStyleDeclaration.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { serialize, serializeString, serializeIdentifier } from '../serializer.ts';
import { tokenize } from '../tokenizer.ts';
import type { Declaration, Rule, ComponentValue, CustomMediaQuery, SimpleBlock } from '../types.ts';
import { CSSStyleSheet } from '../CSSOM.ts';
import { MediaList, CSSRuleList } from './collections.ts';
import { serializeGroupingRule } from './utils.ts';
import { INTERNAL_RULE_TOKEN } from '../internal-token.ts';
import { hideInternalFields, applyWebIDLInterface } from '../webidl.ts';
import { parseStyleAttribute, consumeListOfRules, consumeRule, parseComponentValues } from '../parser.ts';

// css-conditional-3 #the-cssconditionrule-interface
export class CSSConditionRule extends CSSGroupingRule {
  get conditionText(): string {
    return '';
  }
}

// css-conditional-3 #the-cssmediarule-interface
// cssom-1 #the-cssmediarule-interface
export class CSSMediaRule extends CSSConditionRule {
  /** @internal */ _media: MediaList;

  constructor(mediaText: string, rules: Rule[], parseRuleInBlock?: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._media = new MediaList(mediaText);
    hideInternalFields(this);
  }

  get media(): MediaList {
    return this._media;
  }

  set media(val: unknown) {
    this._media.mediaText = val === null ? '' : String(val);
  }

  get [Symbol.toStringTag](): string {
    return 'CSSMediaRule';
  }

  override get conditionText(): string {
    return this._media.mediaText;
  }

  get type() { return 4; }

  // cssom-1 #serialize-a-css-rule
  get cssText() {
    return serializeGroupingRule('media', this._media.mediaText, this._rules);
  }

  set cssText(_value: string) {
    // Do nothing as per spec
  }
}

// mediaqueries-5 #custom-mq
export class CSSCustomMediaRule extends CSSRule {
  /** @internal */ _name: string;
  /** @internal */ _query: CustomMediaQuery;

  constructor(name: string, query: CustomMediaQuery) {
    super();
    this._name = name;
    this._query = query;
    hideInternalFields(this);
  }

  get name(): string { return this._name; }
  get query(): CustomMediaQuery { return this._query; }
  get [Symbol.toStringTag](): string { return 'CSSCustomMediaRule'; }

  get cssText(): string {
    const queryStr = typeof this._query === 'boolean' ? String(this._query) : this._query.mediaText;
    return `@custom-media ${this._name}${queryStr ? ' ' + queryStr : ''};`;
  }

  set cssText(_value: string) {}
}

// css-conditional-3 #the-csssupportsrule-interface
export class CSSSupportsRule extends CSSConditionRule {
  /** @internal */ _conditionText: string;

  constructor(conditionText: string, rules: Rule[], parseRuleInBlock?: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._conditionText = conditionText;
    hideInternalFields(this);
  }

  override get conditionText(): string { return this._conditionText; }
  get matches(): boolean { return ParseHooks.supports(this._conditionText); }
  get [Symbol.toStringTag](): string { return 'CSSSupportsRule'; }
  get type() { return 12; }
  get cssText() { return serializeGroupingRule('supports', this._conditionText, this._rules); }
  set cssText(_value: string) {}
}

const CONTAINER_KEYWORDS = new Set(['not', 'and', 'or', 'none']);

function parseContainerPrelude(containerQuery: string, containerName: string): { name: string; query: string } {
  if (containerName || !containerQuery) {
    return { name: containerName, query: containerQuery };
  }
  const trimmed = containerQuery.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace > 0) {
    const potentialName = trimmed.slice(0, firstSpace);
    if (!CONTAINER_KEYWORDS.has(potentialName.toLowerCase()) && !potentialName.startsWith('(')) {
      return { name: potentialName, query: trimmed.slice(firstSpace + 1).trim() };
    }
  } else if (!CONTAINER_KEYWORDS.has(trimmed.toLowerCase()) && !trimmed.startsWith('(')) {
    return { name: trimmed, query: '' };
  }
  return { name: '', query: trimmed };
}

// css-conditional-5 #the-csscontainerrule-interface
export class CSSContainerRule extends CSSConditionRule {
  /** @internal */ _containerName: string;
  /** @internal */ _containerQuery: string;

  constructor(containerQuery: string, rules: Rule[], parseRuleInBlock?: (text: string) => Rule, containerName: string = '') {
    super(rules, parseRuleInBlock);
    const parsed = parseContainerPrelude(containerQuery, containerName);
    this._containerName = parsed.name;
    this._containerQuery = parsed.query;
    hideInternalFields(this);
  }

  get containerName(): string { return this._containerName; }
  get containerQuery(): string { return this._containerQuery; }

  override get conditionText(): string {
    if (this._containerName) {
      return this._containerQuery ? `${this._containerName} ${this._containerQuery}` : this._containerName;
    }
    return this._containerQuery;
  }

  get [Symbol.toStringTag]() {
    return 'CSSContainerRule';
  }

  get cssText() {
    return serializeGroupingRule('container', this.conditionText, this._rules);
  }

  set cssText(_value: string) {}
}

function serializeLayerName(name: string): string {
  return name ? name.split('.').map(p => serializeIdentifier(p)).join('.') : '';
}

function formatInlineStyleBlock(prefix: string, style: CSSStyleDeclaration): string {
  const body = style.cssText.trim();
  return `${prefix} {${body ? ' ' + body + ' ' : ''}}`;
}

// css-cascade-5 #the-csslayerblockrule-interface
export class CSSLayerBlockRule extends CSSGroupingRule {
  /** @internal */ _name: string;

  constructor(name: string, rules: Rule[], parseRuleInBlock?: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._name = name;
    hideInternalFields(this);
  }

  get name(): string { return this._name; }
  get [Symbol.toStringTag]() { return 'CSSLayerBlockRule'; }
  get cssText() { return serializeGroupingRule('layer', serializeLayerName(this._name), this._rules); }
  set cssText(_value: string) {}
}

// css-cascade-5 #the-csslayerstatementrule-interface
export class CSSLayerStatementRule extends CSSRule {
  /** @internal */ _nameList: readonly string[];

  constructor(nameList?: string[]) {
    if (!nameList || arguments.length === 0) {
      throw new TypeError('Illegal constructor');
    }
    super();
    this._nameList = Object.freeze([...nameList]);
    hideInternalFields(this);
  }

  get nameList(): readonly string[] { return this._nameList; }
  get [Symbol.toStringTag]() { return 'CSSLayerStatementRule'; }
  get cssText() { return `@layer ${this._nameList.map(serializeLayerName).join(', ')};`; }
  set cssText(_value: string) {}
}

export class CSSStartingStyleRule extends CSSGroupingRule {
  constructor(_prelude: string, rules: Rule[], parseRuleInBlock?: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
  }

  get cssText() { return serializeGroupingRule('starting-style', '', this._rules); }
  set cssText(_value: string) {}
}

// css-cascade-6 #the-cssscoperule-interface
export class CSSScopeRule extends CSSGroupingRule {
  /** @internal */ _startSelector: string | null;
  /** @internal */ _endSelector: string | null;

  constructor(startSelector: string | null, endSelector: string | null, rules: CSSRule[], parseRuleInBlock?: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._startSelector = startSelector;
    this._endSelector = endSelector;
    hideInternalFields(this);
  }

  get startSelector(): string | null { return this._startSelector; }
  get endSelector(): string | null { return this._endSelector; }
  get [Symbol.toStringTag]() { return 'CSSScopeRule'; }

  get start(): string | null {
    return this._startSelector ? (this._startSelector.replace(/^\(/, '').replace(/\)$/, '').trim() || null) : null;
  }

  get end(): string | null {
    return this._endSelector ? (this._endSelector.replace(/^\(/, '').replace(/\)$/, '').trim() || null) : null;
  }

  get cssText() {
    let prelude = this._startSelector || '';
    if (this._endSelector) {
      prelude += `${prelude ? ' ' : ''}to ${this._endSelector}`;
    }
    return serializeGroupingRule('scope', prelude, this._rules);
  }

  set cssText(_value: string) {}
}

export class CSSViewTransitionRule extends CSSRule {
  /** @internal */ _navigation: string;

  constructor(declarations: Declaration[]) {
    super();
    const navDecl = declarations.findLast(d => d.name === 'navigation');
    this._navigation = navDecl ? serialize(navDecl.value).trim() : 'none';
    hideInternalFields(this);
  }

  get navigation(): string { return this._navigation; }
  get [Symbol.toStringTag]() { return 'CSSViewTransitionRule'; }
  get cssText() { return `@view-transition { navigation: ${this._navigation}; }`; }
  set cssText(_value: string) {}
}

function normalizeKeyframeSelector(selector: string): string {
  const normalized: string[] = [];
  for (const part of selector.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === 'from') {
      normalized.push('0%');
    } else if (trimmed === 'to') {
      normalized.push('100%');
    } else {
      if (!trimmed.endsWith('%')) {
        throw new DOMException('Invalid keyframe selector', 'SyntaxError');
      }
      const valStr = trimmed.slice(0, -1).trim();
      const val = Number(valStr);
      if (Number.isNaN(val) || valStr === '' || val < 0 || val > 100) {
        throw new DOMException('Invalid keyframe selector', 'SyntaxError');
      }
      normalized.push(`${val}%`);
    }
  }
  if (normalized.length === 0) {
    throw new DOMException('Invalid keyframe selector', 'SyntaxError');
  }
  return normalized.join(', ');
}

const DISALLOWED_KEYFRAME_NAMES = new Set(['none', 'initial', 'inherit', 'unset', 'revert', 'default']);

export class CSSKeyframesRule extends CSSRule {
  [index: number]: CSSKeyframeRule;
  /** @internal */ _name: string;
  /** @internal */ _rules: CSSKeyframeRule[];
  /** @internal */ _cssRules: CSSRuleList;

  constructor(name: string, rules: CSSKeyframeRule[]) {
    super();
    this._name = name;
    this._rules = rules;
    this._cssRules = new CSSRuleList(() => this._rules);
    hideInternalFields(this);

    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === 'string') {
          const index = Number(prop);
          if (Number.isInteger(index) && index >= 0) {
            return target._rules[index];
          }
        }
        const val = Reflect.get(target, prop, target);
        if (typeof val === 'function') {
          return val.bind(target);
        }
        return val;
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value, target);
      },
      ownKeys() {
        return [];
      },
      getOwnPropertyDescriptor() {
        return undefined;
      }
    });
  }

  get name(): string { return this._name; }
  set name(val: string) { this._name = val; }
  get cssRules(): CSSRuleList { return this._cssRules; }

  get type() { return 7; }

  // css-animations-1 #interface-csskeyframesrule
  get [Symbol.toStringTag](): string {
    return 'CSSKeyframesRule';
  }

  get length(): number {
    return this._rules.length;
  }

  get cssText() {
    const serializedName = DISALLOWED_KEYFRAME_NAMES.has(this._name.toLowerCase())
      ? JSON.stringify(this._name)
      : serializeIdentifier(this._name);
    return serializeGroupingRule('keyframes', serializedName, this._rules);
  }

  set cssText(_value: string) {}

  private _findRuleIndex(select: string): number {
    let normalized: string;
    try {
      normalized = normalizeKeyframeSelector(select);
    } catch {
      return -1;
    }
    for (let i = this._rules.length - 1; i >= 0; i--) {
      if (this._rules[i].keyText === normalized) return i;
    }
    return -1;
  }

  findRule(select: string): CSSKeyframeRule | null {
    const idx = this._findRuleIndex(select);
    return idx !== -1 ? this._rules[idx] : null;
  }

  appendRule(ruleText: string): void {
    const tokens = tokenize(ruleText);
    let openIdx = -1;
    let closeIdx = -1;
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === '{') {
        if (openIdx === -1) {
          openIdx = i;
        }
        depth++;
      } else if (tok.type === '}') {
        depth--;
        if (depth === 0 && openIdx !== -1) {
          closeIdx = i;
          break;
        }
      }
    }
    if (openIdx === -1 || closeIdx === -1) return;
    const preludeTokens = tokens.slice(0, openIdx);
    const preludeText = serialize(preludeTokens).trim();
    let keyText: string;
    try {
      keyText = normalizeKeyframeSelector(preludeText);
    } catch {
      return;
    }
    const bodyTokens = tokens.slice(openIdx + 1, closeIdx);
    const styleDecl = parseStyleAttribute(bodyTokens);
    const keyframe = new CSSKeyframeRule(keyText, styleDecl._declarations);
    keyframe._parentRule = this;
    this._rules.push(keyframe);
  }

  deleteRule(select: string): void {
    const idx = this._findRuleIndex(select);
    if (idx !== -1) this._rules.splice(idx, 1);
  }
}


export class CSSKeyframeRule extends CSSRule {
  /** @internal */ _keyText!: string;
  /** @internal */ _style: CSSStyleDeclaration;

  constructor(keyText: string, styleDeclarations: Declaration[]) {
    super();
    this.keyText = keyText;
    this._style = new CSSKeyframeStyleDeclaration(styleDeclarations);
    this._style._parentRule = this;
    hideInternalFields(this);
  }

  get keyText(): string { return this._keyText; }
  set keyText(value: string) { this._keyText = normalizeKeyframeSelector(value); }

  get style(): CSSStyleDeclaration { return this._style; }
  set style(value: string) { this._style.cssText = value; }

  get type() { return 8; }

  // css-animations-1 #interface-csskeyframerule
  get [Symbol.toStringTag](): string {
    return 'CSSKeyframeRule';
  }

  get cssText() {
    return formatInlineStyleBlock(this.keyText, this._style);
  }

  set cssText(_value: string) {}
}

// css-nesting-1 #the-cssnestrule
export class CSSNestedDeclarations extends CSSRule {
  /** @internal */ _style: CSSStyleDeclaration;

  get [Symbol.toStringTag](): string {
    return 'CSSNestedDeclarations';
  }

  constructor(styleDeclarations: Declaration[]) {
    super();
    this._style = new CSSStyleDeclaration(styleDeclarations);
    this._style._parentRule = this;
    hideInternalFields(this);
  }

  get style(): CSSStyleDeclaration { return this._style; }
  set style(value: string) { this._style.cssText = value; }

  get cssText() {
    return this._style.cssText;
  }

  set cssText(_value: string) {}
}


// css-fonts-4 #om-fontface
export class CSSFontFaceRule extends CSSRule {
  /** @internal */ _style: CSSFontFaceDescriptors;

  constructor(styleDeclarations: Declaration[]) {
    super();
    this._style = new CSSFontFaceDescriptors(styleDeclarations);
    this._style._parentRule = this;
    hideInternalFields(this);
  }

  // css-fonts-4 #dom-cssfontfacerule-style
  get style(): CSSStyleDeclaration { return this._style; }
  set style(value: string) { this._style.cssText = value; }

  get [Symbol.toStringTag](): string {
    return 'CSSFontFaceRule';
  }

  get type() { return 5; }

  get cssText() {
    return formatInlineStyleBlock('@font-face', this._style);
  }

  set cssText(_value: string) {}
}




export class CSSMarginRule extends CSSRule {
  /** @internal */ _name: string;
  /** @internal */ _style: CSSMarginDescriptors;

  constructor(name: string, declarations: Declaration[], internalToken?: symbol) {
    // cssom-1 #the-cssmarginrule-interface
    // WebIDL #interface-prototype-object
    if (internalToken !== INTERNAL_RULE_TOKEN) {
      throw new TypeError('Illegal constructor');
    }
    super();
    this._name = name;
    this._style = new CSSMarginDescriptors(declarations);
    this._style._parentRule = this;
    hideInternalFields(this);
  }

  get name(): string { return this._name; }
  get style(): CSSMarginDescriptors { return this._style; }
  set style(value: string) { this._style.cssText = value; }

  get [Symbol.toStringTag](): string {
    return 'CSSMarginRule';
  }

  get type() { return 9; } // CSSRule.MARGIN_RULE

  get cssText() {
    return formatInlineStyleBlock(`@${this.name}`, this.style);
  }

  set cssText(_value: string) {}
}

function parseDataUrlRules(href: string): Rule[] {
  if (!href || !href.startsWith('data:')) return [];
  const commaIdx = href.indexOf(',');
  if (commaIdx === -1) return [];
  const meta = href.slice(5, commaIdx).toLowerCase();
  const content = href.slice(commaIdx + 1);
  try {
    const rawData = meta.includes(';base64')
      ? (typeof atob === 'function' ? atob(content) : Buffer.from(content, 'base64').toString('utf-8'))
      : decodeURIComponent(content);
    return consumeListOfRules(tokenize(rawData), true);
  } catch {
    return [];
  }
}

export class CSSImportRule extends CSSRule {
  /** @internal */ _href: string;
  /** @internal */ _media: MediaList;
  /** @internal */ _styleSheet: CSSStyleSheet | null = null;
  /** @internal */ _layerName: string | null;
  /** @internal */ _supportsText: string | null;
  /** @internal */ _scopeStart: string | null;
  /** @internal */ _scopeEnd: string | null;
  /** @internal */ _isScoped: boolean;

  constructor(
    href: string,
    mediaText: string = '',
    layerName: string | null = null,
    supportsText: string | null = null,
    scopeStart: string | null = null,
    scopeEnd: string | null = null,
    isScoped: boolean = false,
    internalToken?: symbol
  ) {
    // cssom-1 #the-cssimportrule-interface
    if (internalToken !== INTERNAL_RULE_TOKEN) {
      throw new TypeError('Illegal constructor');
    }
    super();
    this._href = href;
    this._media = new MediaList(mediaText);
    this._layerName = layerName;
    this._supportsText = supportsText;
    this._scopeStart = scopeStart;
    this._scopeEnd = scopeEnd;
    this._isScoped = isScoped || Boolean(scopeStart || scopeEnd);
    hideInternalFields(this);
  }

  get href(): string { return this._href; }

  get media(): MediaList { return this._media; }
  set media(val: unknown) { this._media.mediaText = val === null ? '' : String(val); }

  // cssom-1 #dom-cssimportrule-stylesheet
  get styleSheet(): CSSStyleSheet | null {
    if (!this._styleSheet) {
      this._styleSheet = CSSStyleSheet.createInternal(
        parseDataUrlRules(this._href),
        (text: string) => consumeRule(tokenize(text)),
      );
      this._styleSheet._initImportedSheet(this, this.parentStyleSheet, this._href);
    }
    return this._styleSheet;
  }

  get layerName(): string | null { return this._layerName; }
  get supportsText(): string | null { return this._supportsText; }
  get scopeStart(): string | null { return this._scopeStart; }
  get scopeEnd(): string | null { return this._scopeEnd; }
  get isScoped(): boolean { return this._isScoped; }

  get [Symbol.toStringTag]() { return 'CSSImportRule'; }
  get type() { return 3; } // CSSRule.IMPORT_RULE

  get cssText() {
    let text = `@import url(${serializeString(this.href)})`;
    if (this.layerName !== null) {
      text += this.layerName ? ` layer(${this.layerName})` : ` layer`;
    }
    if (this.supportsText !== null) {
      text += ` supports(${this.supportsText})`;
    }
    if (this._isScoped) {
      if (this._scopeStart || this._scopeEnd) {
        const startPart = this._scopeStart ? `(${this._scopeStart})` : '';
        const endPart = this._scopeEnd ? ` to (${this._scopeEnd})` : '';
        text += ` scope(${(startPart + endPart).trim()})`;
      } else {
        text += ` scope`;
      }
    }
    const mediaStr = this.media.mediaText;
    if (mediaStr) text += ` ${mediaStr}`;
    return text + `;`;
  }

  set cssText(_value: string) {}
}

export class CSSNamespaceRule extends CSSRule {
  /** @internal */ _namespaceURI: string;
  /** @internal */ _prefix: string;

  constructor(prefix: string, namespaceURI: string, internalToken?: symbol) {
    // cssom-1 #the-cssnamespacerule-interface
    if (internalToken !== INTERNAL_RULE_TOKEN) {
      throw new TypeError('Illegal constructor');
    }
    super();
    this._prefix = prefix;
    this._namespaceURI = namespaceURI;
    hideInternalFields(this);
  }

  get namespaceURI(): string { return this._namespaceURI; }
  get prefix(): string { return this._prefix; }
  get [Symbol.toStringTag]() { return 'CSSNamespaceRule'; }
  get type() { return 10; } // CSSRule.NAMESPACE_RULE

  get cssText() {
    const prefixPart = this._prefix ? `${serializeIdentifier(this._prefix)} ` : '';
    return `@namespace ${prefixPart}url("${this._namespaceURI}");`;
  }

  set cssText(_value: string) {}
}

const VALID_PAGE_PSEUDOS = new Set(['left', 'right', 'first', 'blank']);

function parsePageSelectorList(text: string): string[] | null {
  if (text.trim() === '') return [''];

  const values = parseComponentValues(tokenize(text));
  const selectorTokensList: ComponentValue[][] = [[]];
  for (const v of values) {
    if (v.type === 'comma') selectorTokensList.push([]);
    else selectorTokensList[selectorTokensList.length - 1].push(v);
  }

  const results: string[] = [];
  for (const selTokens of selectorTokensList) {
    let start = 0;
    let end = selTokens.length;
    while (start < end && (selTokens[start].type === 'whitespace' || selTokens[start].type === 'comment')) start++;
    while (end > start && (selTokens[end - 1].type === 'whitespace' || selTokens[end - 1].type === 'comment')) end--;
    const trimmed = selTokens.slice(start, end);
    if (trimmed.length === 0 || trimmed.some(t => t.type === 'whitespace' || t.type === 'comment')) {
      return null;
    }

    let pos = 0;
    let serialized = '';
    if (trimmed[0].type === 'ident') {
      serialized += serializeIdentifier(trimmed[0].value as string);
      pos = 1;
    }

    while (pos < trimmed.length) {
      const colon = trimmed[pos];
      const ident = trimmed[pos + 1];
      if (colon?.type !== 'colon' || ident?.type !== 'ident') return null;
      const pseudoName = (ident.value as string).toLowerCase();
      if (!VALID_PAGE_PSEUDOS.has(pseudoName)) return null;
      serialized += ':' + serializeIdentifier(pseudoName);
      pos += 2;
    }
    results.push(serialized);
  }

  return results;
}

function formatPageSelectorText(text: string): string | null {
  const parsed = parsePageSelectorList(text);
  if (parsed === null) return null;
  return parsed.length === 1 && parsed[0] === '' ? '' : parsed.join(', ');
}

export class CSSPageRule extends CSSGroupingRule {
  /** @internal */ _selectorText: string;
  /** @internal */ _style: CSSPageDescriptors;

  constructor(selectorText: string, declarations: Declaration[], rules: Rule[], parseRuleInBlock: (text: string) => Rule) {
    super(rules, parseRuleInBlock);
    this._selectorText = formatPageSelectorText(selectorText) ?? selectorText;
    this._style = new CSSPageDescriptors(declarations, PAGE_DESCRIPTORS_INTERNAL);
    this._style._parentRule = this;
    hideInternalFields(this);
  }

  get selectorText(): string { return this._selectorText; }
  set selectorText(value: string) {
    const formatted = formatPageSelectorText(value);
    if (formatted !== null) this._selectorText = formatted;
  }

  get style(): CSSPageDescriptors { return this._style; }
  set style(value: string) { this._style.cssText = value; }

  get [Symbol.toStringTag](): string { return 'CSSPageRule'; }
  get type() { return 6; }

  get cssText() {
    const sel = this.selectorText ? this.selectorText + ' ' : '';
    const declsStr = this.style.cssText.trim();
    const rulesStr = this._rules.map((r: Rule) => (r as CSSRule).cssText).join('\n').trim();
    const bodyText = declsStr && rulesStr ? `${declsStr}\n${rulesStr}` : (declsStr || rulesStr);

    if (!bodyText) return `@page ${sel}{ }`;
    const indentedBody = bodyText.split('\n').map(line => '  ' + line).join('\n');
    return `@page ${sel}{\n${indentedBody}\n}`;
  }

  set cssText(_value: string) {}
}

export class CSSPropertyRule extends CSSRule {
  /** @internal */ _name: string;
  /** @internal */ _syntax: string;
  /** @internal */ _inherits: boolean;
  /** @internal */ _initialValue: string | null;

  constructor(name: string, syntax: string, inherits: boolean, initialValue: string | null) {
    super();
    this._name = name;
    this._syntax = syntax;
    this._inherits = inherits;
    this._initialValue = initialValue;
    hideInternalFields(this);
  }

  get name(): string { return this._name; }
  get syntax(): string { return this._syntax; }
  get inherits(): boolean { return this._inherits; }
  get initialValue(): string | null { return this._initialValue; }

  get [Symbol.toStringTag](): string {
    return 'CSSPropertyRule';
  }

  get cssText() {
    let body = `syntax: ${serializeString(this._syntax)}; inherits: ${this._inherits};`;
    if (this._initialValue !== null) body += `initial-value: ${this._initialValue};`;
    return `@property ${serializeIdentifier(this._name)} {${body}}`;
  }

  set cssText(_value: string) {}
}

const AT_RULE_TYPE_MAP: Record<string, number> = {
  import: CSSRule.IMPORT_RULE,
  charset: CSSRule.CHARSET_RULE,
  namespace: CSSRule.NAMESPACE_RULE,
  page: CSSRule.PAGE_RULE,
  'font-face': CSSRule.FONT_FACE_RULE,
  supports: 12,
};

export class CSSAtRule extends CSSRule {
  /** @internal */ _name: string;
  /** @internal */ _prelude: ComponentValue[];
  /** @internal */ _block?: SimpleBlock | null;
  /** @internal */ _childRules?: CSSRule[];
  /** @internal */ _declarations?: Declaration[];

  constructor(
    name: string,
    prelude: ComponentValue[],
    block?: SimpleBlock | null,
    childRules?: CSSRule[],
    declarations?: Declaration[]
  ) {
    super();
    this._name = name;
    this._prelude = prelude;
    this._block = block;
    this._childRules = childRules;
    this._declarations = declarations;
    hideInternalFields(this);
  }

  get name(): string { return this._name; }
  set name(val: string) { this._name = val; }
  get prelude(): ComponentValue[] { return this._prelude; }
  set prelude(val: ComponentValue[]) { this._prelude = val; }
  get block(): SimpleBlock | null | undefined { return this._block; }
  set block(val: SimpleBlock | null | undefined) { this._block = val; }
  get childRules(): CSSRule[] | undefined { return this._childRules; }
  set childRules(val: CSSRule[] | undefined) { this._childRules = val; }
  get declarations(): Declaration[] | undefined { return this._declarations; }
  set declarations(val: Declaration[] | undefined) { this._declarations = val; }

  override get type(): number {
    return AT_RULE_TYPE_MAP[this._name] ?? 0;
  }

  get cssText(): string {
    const serializedPrelude = serialize(this._prelude).trim();
    const cond = serializedPrelude.length > 0 ? ' ' + serializedPrelude : '';
    if (!this._block) return `@${this._name}${cond};`;

    const childRules = this._childRules || [];
    if (childRules.length > 0) {
      return serializeGroupingRule(this._name, cond.trim(), childRules);
    }

    const blockContentText = serialize(this._block.value).trim();
    if (!blockContentText) return `@${this._name}${cond} { }`;

    const indentedBody = blockContentText.split('\n').map(line => '  ' + line).join('\n');
    return `@${this._name}${cond} {\n${indentedBody}\n}`;
  }
}

const COUNTER_STYLE_DESCRIPTORS: ReadonlyArray<readonly [string, string]> = [
  ['system', 'system'],
  ['symbols', 'symbols'],
  ['additive-symbols', 'additiveSymbols'],
  ['negative', 'negative'],
  ['prefix', 'prefix'],
  ['suffix', 'suffix'],
  ['range', 'range'],
  ['pad', 'pad'],
  ['speak-as', 'speakAs'],
  ['fallback', 'fallback'],
];

const COUNTER_STYLE_PROP_BY_DESCRIPTOR = new Map<string, string>(COUNTER_STYLE_DESCRIPTORS);

// css-counter-styles-3 #the-csscounterstylerule-interface
export class CSSCounterStyleRule extends CSSRule {
  /** @internal */ _name: string;
  /** @internal */ _declarations: Declaration[] = [];
  /** @internal */ _descriptors: Record<string, string> = {
    system: '',
    symbols: '',
    additiveSymbols: '',
    negative: '',
    prefix: '',
    suffix: '',
    range: '',
    pad: '',
    speakAs: '',
    fallback: '',
  };

  declare system: string;
  declare symbols: string;
  declare additiveSymbols: string;
  declare negative: string;
  declare prefix: string;
  declare suffix: string;
  declare range: string;
  declare pad: string;
  declare speakAs: string;
  declare fallback: string;

  constructor(name: string, declarations: Declaration[] = []) {
    super();
    this._name = name;
    this._declarations = declarations;
    for (const d of declarations) {
      const prop = COUNTER_STYLE_PROP_BY_DESCRIPTOR.get(d.name);
      if (prop) {
        this._descriptors[prop] = Array.isArray(d.value)
          ? serialize(d.value).trim()
          : (typeof d.value === 'string' ? d.value : '');
      }
    }
    hideInternalFields(this);
  }

  // css-counter-styles-3 #dom-csscounterstylerule-name
  get name(): string { return this._name; }
  set name(value: string) { this._name = value; }

  get [Symbol.toStringTag]() { return 'CSSCounterStyleRule'; }
  get type() { return 11; }

  // css-counter-styles-3 #the-csscounterstylerule-interface
  get cssText() {
    const decls = this._declarations.map(d => {
      const valStr = Array.isArray(d.value) ? serialize(d.value).trim() : (typeof d.value === 'string' ? d.value : '');
      return `${d.name}: ${valStr};`;
    }).join(' ');
    return decls.length > 0 ? `@counter-style ${this._name} { ${decls} }` : `@counter-style ${this._name} {}`;
  }
  set cssText(_value: string) {}
}

for (const [, prop] of COUNTER_STYLE_DESCRIPTORS) {
  Object.defineProperty(CSSCounterStyleRule.prototype, prop, {
    get(this: CSSCounterStyleRule): string { return this._descriptors[prop]; },
    set(this: CSSCounterStyleRule, value: string) { this._descriptors[prop] = value; },
    enumerable: true,
    configurable: true,
  });
}

// css-fonts-4 #om-fontfeaturevalues
export class CSSFontFeatureValuesMap {
  private _map = new Map<string, number[]>();

  get size(): number { return this._map.size; }
  get(featureValueName: string): number[] | undefined { return this._map.get(featureValueName); }
  set(featureValueName: string, values: number | number[]): void {
    this._map.set(featureValueName, Array.isArray(values) ? values.map(Number) : [Number(values)]);
  }
  has(featureValueName: string): boolean { return this._map.has(featureValueName); }
  delete(featureValueName: string): boolean { return this._map.delete(featureValueName); }
  clear(): void { this._map.clear(); }
  entries(): IterableIterator<[string, number[]]> { return this._map.entries(); }
  keys(): IterableIterator<string> { return this._map.keys(); }
  values(): IterableIterator<number[]> { return this._map.values(); }
  [Symbol.iterator](): IterableIterator<[string, number[]]> { return this._map[Symbol.iterator](); }
  get [Symbol.toStringTag]() { return 'CSSFontFeatureValuesMap'; }
}

const FONT_FEATURE_VALUE_MAP_DEFS = [
  ['annotation', 'annotation'],
  ['ornaments', 'ornaments'],
  ['stylistic', 'stylistic'],
  ['swash', 'swash'],
  ['character-variant', 'characterVariant'],
  ['styleset', 'styleset'],
  ['historical-forms', 'historicalForms'],
] as const;

// css-fonts-4 #om-fontfeaturevalues
export class CSSFontFeatureValuesRule extends CSSRule {
  [key: string]: unknown;
  /** @internal */ _fontFamily: string;
  declare readonly annotation: CSSFontFeatureValuesMap;
  declare readonly ornaments: CSSFontFeatureValuesMap;
  declare readonly stylistic: CSSFontFeatureValuesMap;
  declare readonly swash: CSSFontFeatureValuesMap;
  declare readonly characterVariant: CSSFontFeatureValuesMap;
  declare readonly styleset: CSSFontFeatureValuesMap;
  declare readonly historicalForms: CSSFontFeatureValuesMap;

  constructor(fontFamily: string) {
    super();
    this._fontFamily = fontFamily;
    for (const [, prop] of FONT_FEATURE_VALUE_MAP_DEFS) {
      (this as Record<string, CSSFontFeatureValuesMap>)[`_${prop}`] = new CSSFontFeatureValuesMap();
    }
    hideInternalFields(this);
  }

  get fontFamily(): string { return this._fontFamily; }
  set fontFamily(value: string) { this._fontFamily = value; }
  get [Symbol.toStringTag]() { return 'CSSFontFeatureValuesRule'; }
  get type() { return 14; }

  get cssText(): string {
    const blocks: string[] = [];
    for (const [atName, prop] of FONT_FEATURE_VALUE_MAP_DEFS) {
      const map = (this as Record<string, CSSFontFeatureValuesMap>)[prop];
      if (map && map.size > 0) {
        const entries = Array.from(map.entries(), ([k, v]) => `${k}: ${v.join(' ')};`).join(' ');
        blocks.push(`@${atName} { ${entries} }`);
      }
    }
    const body = blocks.length > 0 ? ` { ${blocks.join(' ')} }` : ' {}';
    return `@font-feature-values ${this._fontFamily}${body}`;
  }
  set cssText(_value: string) {}
}

for (const [, prop] of FONT_FEATURE_VALUE_MAP_DEFS) {
  Object.defineProperty(CSSFontFeatureValuesRule.prototype, prop, {
    get(this: Record<string, CSSFontFeatureValuesMap>) { return this[`_${prop}`]; },
    enumerable: true,
    configurable: true,
  });
}

for (const ctor of [
  CSSAtRule, CSSConditionRule, CSSFontFeatureValuesMap, CSSMediaRule, CSSSupportsRule, CSSContainerRule,
  CSSLayerBlockRule, CSSLayerStatementRule, CSSStartingStyleRule, CSSViewTransitionRule, CSSKeyframesRule,
  CSSKeyframeRule, CSSNestedDeclarations, CSSMarginRule, CSSImportRule, CSSNamespaceRule, CSSPropertyRule,
  CSSScopeRule, CSSCounterStyleRule, CSSFontFeatureValuesRule, CSSCustomMediaRule, CSSFontFaceRule, CSSPageRule,
]) {
  applyWebIDLInterface(ctor as Function);
}


