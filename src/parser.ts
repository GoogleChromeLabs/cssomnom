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
import type { Token, TokenStream, ComponentValue, ComponentValueStream, SimpleBlock, CSSFunction, Declaration, ASTAtRule, Rule, ParseError, StringToken, UrlToken, FunctionToken, UnicodeRangeToken, CustomMediaQuery, RuleSourceLocation, SelectorList } from './types.ts';


import { serialize, getOriginalText, getMirrorToken } from './serializer.ts';

import { tokenize } from './tokenizer.ts';
import { CSSRule, CSSGroupingRule } from './rules/base.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { MediaList } from './rules/collections.ts';
import { CSSFontFaceRule, CSSPageRule, CSSAtRule, CSSMediaRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSLayerStatementRule, CSSStartingStyleRule, CSSViewTransitionRule, CSSKeyframesRule, CSSKeyframeRule, CSSNestedDeclarations, CSSMarginRule, CSSImportRule, CSSNamespaceRule, CSSPropertyRule, CSSScopeRule, CSSCounterStyleRule, CSSFontFeatureValuesRule, CSSCustomMediaRule } from './rules/at-rules.ts';
import { CSSStyleSheet, CSSStyleRule } from './CSSOM.ts';
import { isGrammaticallyValidSupportsCondition } from './rules/utils.ts';
import { INTERNAL_RULE_TOKEN } from './internal-token.ts';
import { ArrayTokenStream, ArrayComponentValueStream, LazyComponentValueStream } from './TokenStream.ts';
import { FONT_FEATURE_VALUE_BLOCKS, MARGIN_RULE_NAMES } from './data/gen/property-list.ts';

export interface ParserOptions {
  atRules?: Record<string, string>;
  allowVendorPseudos?: boolean;
  source?: string;
}

export type SelectorASTOptions = {
  declaredNamespaces?: Set<string>;
  allowRelative?: boolean;
  allowVendorPseudos?: boolean;
};
import { SelectorParser } from './SelectorParser.ts';
import { ParseHooks } from './parse-hooks.ts';

function getComponentValueStartIndex(item?: ComponentValue): number | undefined {
  if (!item) return undefined;
  return item.type === 'simple-block'
    ? item.associatedToken?.startIndex
    : ('startIndex' in item && typeof item.startIndex === 'number' ? item.startIndex : undefined);
}

function getComponentValueEndIndex(item?: ComponentValue): number | undefined {
  if (!item) return undefined;
  return item.type === 'simple-block'
    ? (item.endIndex ?? item.associatedToken?.endIndex)
    : ('endIndex' in item && typeof item.endIndex === 'number' ? item.endIndex : undefined);
}


function trimComponentValues(values: ComponentValue[], trimEof = false): ComponentValue[] {
  let start = 0;
  while (start < values.length && (values[start].type === 'whitespace' || values[start].type === 'comment')) start++;
  let end = values.length - 1;
  while (end >= start && (values[end].type === 'whitespace' || values[end].type === 'comment' || (trimEof && values[end].type === 'EOF'))) end--;
  return start > end ? [] : values.slice(start, end + 1);
}

function splitComponentValuesByComma(values: ComponentValue[], allowDelimComma = false): ComponentValue[][] {
  const result: ComponentValue[][] = [[]];
  for (const v of values) {
    if (v.type === 'comma' || (allowDelimComma && v.type === 'delim' && v.value === ',')) {
      result.push([]);
    } else {
      result[result.length - 1].push(v);
    }
  }
  return result;
}

function extractUriFromComponentValue(token: ComponentValue): string | null {
  if (token.type === 'string') return token.value;
  if (token.type === 'url') return (token as UrlToken).value;
  if (token.type === 'function' && (token as CSSFunction).name === 'url') {
    const fn = token as CSSFunction;
    const urlArg = fn.value.find(v => v.type === 'string');
    if (urlArg) return (urlArg as StringToken).value;
    return fn.value.map(v => serialize([v])).join('').trim();
  }
  return null;
}

function splitLeadingDeclarations(blockContents: Rule[]): { declarations: Declaration[]; nestedRules: Rule[] } {
  const declarations: Declaration[] = [];
  const nestedRules: Rule[] = [];
  for (let i = 0; i < blockContents.length; i++) {
    const item = blockContents[i];
    if (i === 0 && item instanceof CSSNestedDeclarations) {
      declarations.push(...item.style._declarations);
    } else {
      nestedRules.push(item);
    }
  }
  return { declarations, nestedRules };
}

const CSS_WIDE_KEYWORDS = /* @__PURE__ */ new Set('initial,inherit,unset,revert,revert-layer,default'.split(','));
const KEYFRAMES_DISALLOWED_NAMES = /* @__PURE__ */ new Set('none,initial,inherit,unset,revert,default'.split(','));

export function isValidDashedIdent(name: string): boolean {
  return typeof name === 'string' && name.startsWith('--') && name !== '--' && !/\s/.test(name);
}

export function isCustomPropertyDeclaration(prelude: ComponentValue[]): boolean {
  let idx = 0;
  while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
  if (idx >= prelude.length) return false;
  const firstNonWs = prelude[idx++];
  while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
  if (idx >= prelude.length) return false;
  const secondNonWs = prelude[idx++];

  return firstNonWs.type === 'ident' && firstNonWs.value.startsWith('--') && secondNonWs.type === 'colon';
}

/**
 * Skeleton Parser for CSSOM.
 * Implements top-level parsing algorithms from css-syntax-3.
 * // css-syntax-3 #parsing
 * 
 * @note We recommend a more ergonomic entry point like `CSS.parseStylesheet` 
 * or `CSS.parseStylesheetSync` for standard usage.
 */
export class Parser {
  private tokens: TokenStream;
  public errors: ParseError[] = [];
  private declaredNamespaces = new Set<string>();

  private static readonly AT_RULE_HANDLERS: Record<string, (parser: Parser, rule: ASTAtRule, block?: SimpleBlock, nested?: boolean) => Rule | null> = {
    media: (parser, rule, block, nested) => parser.handleGroupingAtRule(rule, block, nested || false, CSSMediaRule),
    'font-face': (parser, rule, block) => block ? parser.handleFontFaceRule(rule, block) : null,
    page: (parser, rule, block) => block ? parser.handlePageRule(rule, block) : null,
    property: (parser, rule, block) => block ? parser.handlePropertyRule(rule, block) : null,
    // css-conditional-3 #at-supports
    supports: (parser, rule, block, nested) => {
      if (!isGrammaticallyValidSupportsCondition(rule.prelude)) return null;
      return parser.handleGroupingAtRule(rule, block, nested || false, CSSSupportsRule);
    },
    container: (parser, rule, block, nested) => parser.handleGroupingAtRule(rule, block, nested || false, CSSContainerRule),
    layer: (parser, rule, block, nested) => parser.handleLayerRule(rule, block, nested || false),
    'starting-style': (parser, rule, block, nested) => parser.handleGroupingAtRule(rule, block, nested || false, CSSStartingStyleRule),
    scope: (parser, rule, block, nested) => parser.handleScopeRule(rule, block, nested || false),
    'view-transition': (parser, rule, block) => block ? parser.handleViewTransitionRule(rule, block) : null,
    import: (parser, rule) => parser.handleImportRule(rule),
    namespace: (parser, rule) => parser.handleNamespaceRule(rule),
    'counter-style': (parser, rule, block) => block ? parser.handleCounterStyleRule(rule, block) : null,
    'font-feature-values': (parser, rule, block) => block ? parser.handleFontFeatureValuesRule(rule, block) : null,
    'custom-media': (parser, rule) => parser.handleCustomMediaRule(rule),
  };

  private getAtRuleHandler(name: string): ((parser: Parser, rule: ASTAtRule, block?: SimpleBlock, nested?: boolean) => Rule | null) | undefined {
    if (MARGIN_RULE_NAMES.has(name)) {
      return (parser, rule, block) => block ? parser.handleMarginRule(rule, block) : null;
    }
    if (name === 'keyframes' || name.endsWith('-keyframes')) {
      return (parser, rule, block) => block ? parser.handleKeyframesRule(rule, block) : null;
    }
    return Parser.AT_RULE_HANDLERS[name];
  }

  private static readonly NESTED_GROUP_AT_RULES = /* @__PURE__ */ new Set('media,supports,container,layer,scope,starting-style,keyframes,property,counter-style,font-feature-values,view-transition'.split(','));

  // css-nesting-1 #conditionals
  // css-syntax-3 #charset-rule & #consume-at-rule
  private isSupportedAtRule(name: string, nested: boolean = false): boolean {
    const lower = name.toLowerCase();
    if (lower === 'charset') return false;
    if (lower === 'mediaall') return false;
    if (lower.startsWith('--')) return false;
    if (MARGIN_RULE_NAMES.has(lower)) return true;
    if (nested) {
      if (lower.endsWith('-keyframes')) return true;
      return Parser.NESTED_GROUP_AT_RULES.has(lower);
    }
    return true;
  }

  public options: ParserOptions;
  private lineStarts?: number[];

  constructor(tokens: TokenStream | Token[], options: ParserOptions = {}) {
    this.options = options;
    this.tokens = Array.isArray(tokens) ? new ArrayTokenStream(tokens) : tokens;
  }

  private getLineStarts(): number[] {
    if (this.lineStarts) return this.lineStarts;
    const starts: number[] = [0];
    if (this.options.source) {
      const s = this.options.source.replace(/\r\n|\r|\f/g, '\n');
      let pos = 0;
      while ((pos = s.indexOf('\n', pos)) !== -1) starts.push(++pos);
    }
    return (this.lineStarts = starts);
  }

  public getLineColumn(start: number): { line: number; column: number } {
    if (start <= 0) return { line: 1, column: 1 };
    const starts = this.getLineStarts();
    let low = 0;
    let high = starts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (starts[mid] <= start) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const lineIdx = high >= 0 ? high : 0;
    return { line: lineIdx + 1, column: (start - starts[lineIdx]) + 1 };
  }

  private makeLocation(start: number, end: number, bodyStart?: number, bodyEnd?: number): RuleSourceLocation {
    const getLineCol = (offset: number) => this.getLineColumn(offset);
    return {
      start,
      end,
      bodyStart,
      bodyEnd,
      get line(): number { return getLineCol(start).line; },
      get column(): number { return getLineCol(start).column; },
    };
  }

  private createBlockLocation(start: number, block: SimpleBlock): RuleSourceLocation {
    const end = block.endIndex ?? block.associatedToken.startIndex ?? start;
    const bodyStart = block.associatedToken.endIndex;
    const bodyEnd = block.endIndex !== undefined ? (block.isClosed ? block.endIndex - 1 : block.endIndex) : undefined;
    return this.makeLocation(start, end, bodyStart, bodyEnd);
  }

  private reportError(message: string, token?: Token): void {
    this.errors.push({ message, token });
  }

  private get nextToken(): Token {
    return this.tokens.peek();
  }

  /** @internal */
  consumeToken(): Token {
    return this.tokens.next();
  }

  private discardToken(): void {
    this.tokens.next();
  }

  private skipWhitespace(): void {
    while (this.nextToken.type === 'whitespace') {
      this.discardToken();
    }
  }

  // css-syntax-3 #parse-list-of-component-values
  public parseComponentValues(): ComponentValue[] {
    const values: ComponentValue[] = [];
    while (this.nextToken.type !== 'EOF') {
      values.push(this.consumeComponentValue());
    }
    return values;
  }

  // css-syntax-3 #parse-comma-separated-list-of-component-values
  public parseCommaSeparatedListOfComponentValues(): ComponentValue[][] {
    return splitComponentValuesByComma(this.parseComponentValues());
  }

  // css-syntax-3 #parse-stylesheet
  public parseStyleSheet(): CSSStyleSheet {
    const rules = this.consumeListOfRules(true);
    return CSSStyleSheet.createInternal(rules, (text: string) => this.parseRule(text));
  }

  public parseRule(ruleString: string): Rule | null {
    const errors: ParseError[] = [];
    const tokens = tokenize(ruleString, false, errors);
    const parser = new Parser(tokens, this.options);
    parser.errors.push(...errors);
    const rule = parser.consumeRule();
    parser.ensureEOF();
    return rule;
  }

  // css-style-attr-1 #syntax
  // css-syntax-3 #consume-block-contents
  public parseStyleAttribute(): CSSStyleDeclaration {
    const declarations = this.consumeDeclarationsFromBlockContents(this.parseComponentValues());
    return new CSSStyleDeclaration(declarations);
  }

  // css-syntax-3 #parse-stylesheet-contents
  public parseStyleSheetContents(): Rule[] {
    return this.consumeListOfRules(true);
  }

  // css-syntax-3 #consume-block-contents
  public parseBlockContents(): Rule[] {
    return this.consumeBlockContents(new ArrayComponentValueStream(this.parseComponentValues()), true, false);
  }

  // css-syntax-3 #parse-declaration
  public parseDeclaration(): Declaration | null {
    this.skipWhitespace();
    if (this.nextToken.type !== 'ident') return null;
    const stream = new LazyComponentValueStream(() => this.consumeComponentValue(), 'EOF');
    const decl = this.consumeDeclarationFromStream(stream);
    if (!decl) return null;
    this.skipWhitespace();
    return (this.nextToken as Token).type === 'EOF' ? decl : null;
  }

  // css-syntax-3 #parse-component-value
  public parseComponentValue(): ComponentValue | null {
    this.skipWhitespace();
    if (this.nextToken.type === 'EOF') return null;
    const value = this.consumeComponentValue();
    this.skipWhitespace();
    return (this.nextToken as Token).type === 'EOF' ? value : null;
  }

  // css-syntax-3 #consume-stylesheet-contents
  public consumeListOfRules(topLevel: boolean): Rule[] {
    const rules: Rule[] = [];
    while (true) {
      const token = this.nextToken;
      if (token.type === 'whitespace') {
        this.discardToken();
      } else if (token.type === 'EOF') {
        return rules;
      } else if ((token.type === 'CDO' || token.type === 'CDC') && topLevel) {
        this.discardToken();
      } else {
        const rule = this.consumeRule();
        if (rule) rules.push(rule);
      }
    }
  }

  // css-syntax-3 #parse-rule
  public consumeRule(nested: boolean = false): Rule | null {
    this.skipWhitespace();
    if (this.nextToken.type === 'EOF') return null;
    return this.nextToken.type === 'at-keyword'
      ? this.consumeAtRule(nested)
      : this.consumeQualifiedRule(nested);
  }

  private finalizeAtRule(
    rule: ASTAtRule,
    block: SimpleBlock | undefined,
    nested: boolean,
    location: RuleSourceLocation,
    isTopLevelTokenStream: boolean
  ): Rule | null {
    if (!this.isSupportedAtRule(rule.name, nested)) return null;
    const handler = this.getAtRuleHandler(rule.name);
    if (handler) {
      const res = handler(this, rule, block, nested);
      if (res instanceof CSSRule && !res.location) {
        res._location = location;
      }
      return res;
    }
    if (nested) return null;

    if (block && isTopLevelTokenStream && this.options?.atRules?.[rule.name]) {
      const type = this.options.atRules[rule.name];
      if (type === 'declaration') {
        const decls = this.consumeDeclarationsFromBlockContents(block.value);
        const atRule = new CSSAtRule(rule.name, rule.prelude, block, undefined, decls);
        atRule._location = location;
        return atRule;
      }
      if (type === 'rule') {
        const childRules = this.consumeNestedRules(block, false);
        const atRule = new CSSAtRule(rule.name, rule.prelude, block, childRules);
        atRule._location = location;
        return atRule;
      }
    }

    let cssRules: CSSRule[] | undefined;
    if (block && !isTopLevelTokenStream) {
      rule.childRules = this.consumeBlockContents(new ArrayComponentValueStream(block.value), nested);
      cssRules = rule.childRules as CSSRule[];
    }
    const atRule = new CSSAtRule(rule.name, rule.prelude, block, cssRules);
    atRule._location = location;
    return atRule;
  }

  // css-syntax-3 #consume-at-rule
  private consumeAtRule(nested: boolean = false): Rule | null {
    const token = this.consumeToken();
    if (token.type !== 'at-keyword') return null;
    const rule: ASTAtRule = {
      type: 'at-rule',
      name: token.value,
      prelude: [],
      childRules: [],
    };
    const start = token.startIndex ?? 0;

    while (true) {
      const next = this.nextToken;
      if (next.type === 'semicolon' || next.type === 'EOF') {
        const end = next.endIndex ?? next.startIndex ?? start;
        this.discardToken();
        return this.finalizeAtRule(rule, undefined, nested, this.makeLocation(start, end), true);
      } else if (next.type === '}') {
        if (nested) return null;
        this.consumeToken();
        rule.prelude.push(next);
      } else if (next.type === '{') {
        const block = this.consumeBlock(this.consumeToken());
        return this.finalizeAtRule(rule, block, nested, this.createBlockLocation(start, block), true);
      } else {
        rule.prelude.push(this.consumeComponentValue());
      }
    }
  }

  /** @internal */
  scopeContextDepth: number = 0;

  private consumeNestedRules(block: SimpleBlock, isNestedStyleRule: boolean): Rule[] {
    const allowRelative = !isNestedStyleRule && this.scopeContextDepth > 0;
    return this.consumeBlockContents(new ArrayComponentValueStream(block.value), isNestedStyleRule || allowRelative, isNestedStyleRule, allowRelative);
  }

  private handleGroupingAtRule(rule: ASTAtRule, block: SimpleBlock | undefined, nested: boolean, ctor: new (prelude: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) => Rule): Rule | null {
    if (!block) return null;
    const childRules = this.consumeNestedRules(block, nested);
    return new ctor(serialize(rule.prelude).trim(), childRules, parseRuleInBlock);
  }

  private parseLayerNameFromTokens(tokens: ComponentValue[], forbidCssWide = false): string | null {
    const trimmed = trimComponentValues(tokens, true);
    if (trimmed.length === 0 || trimmed.length % 2 === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < trimmed.length; i++) {
      const t = trimmed[i];
      if (i % 2 === 0) {
        if (t.type !== 'ident' || (forbidCssWide && CSS_WIDE_KEYWORDS.has(t.value.toLowerCase()))) return null;
        parts.push(t.value);
      } else {
        if (t.type !== 'delim' || t.value !== '.') return null;
        parts.push('.');
      }
    }
    return parts.join('');
  }

  // css-cascade-5 #layer-declaration
  private handleLayerRule(rule: ASTAtRule, block?: SimpleBlock, nested: boolean = false): Rule | null {
    if (block) {
      const trimmed = trimComponentValues(rule.prelude, true);
      let layerName = '';
      if (trimmed.length > 0) {
        const parsed = this.parseLayerNameFromTokens(trimmed);
        if (parsed === null) return null;
        layerName = parsed;
      }
      return new CSSLayerBlockRule(layerName, this.consumeNestedRules(block, nested), parseRuleInBlock);
    }

    const segments = splitComponentValuesByComma(rule.prelude);
    const nameList: string[] = [];
    for (const seg of segments) {
      const name = this.parseLayerNameFromTokens(seg);
      if (name === null) return null;
      nameList.push(name);
    }
    return nameList.length > 0 ? new CSSLayerStatementRule(nameList) : null;
  }

  private parseScopeSelectorBlock(block: SimpleBlock): string | null {
    try {
      new SelectorParser(block.value, {
        allowRelative: true,
        forbidPseudo: true,
        declaredNamespaces: this.declaredNamespaces
      }).parse();
      const text = serialize(block.value).trim();
      return text ? `(${text})` : '';
    } catch {
      return null;
    }
  }

  // css-nesting-1 #nesting-at-scope (Issue 9740)
  private handleScopeRule(rule: ASTAtRule, block?: SimpleBlock, _nested: boolean = false): Rule | null {
    if (!block) return null;
    this.scopeContextDepth++;
    let childRules: Rule[];
    try {
      childRules = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true, false, true);
    } finally {
      this.scopeContextDepth--;
    }

    let startSelector: string | null = null;
    let endSelector: string | null = null;
    const prelude = rule.prelude;
    let i = 0;
    while (i < prelude.length && prelude[i].type === 'whitespace') i++;

    if (i < prelude.length && prelude[i].type === 'simple-block' && (prelude[i] as SimpleBlock).associatedToken.type === '(') {
      startSelector = this.parseScopeSelectorBlock(prelude[i] as SimpleBlock);
      if (startSelector === null) return null;
      i++;
    }

    while (i < prelude.length && prelude[i].type === 'whitespace') i++;

    if (i < prelude.length && prelude[i].type === 'ident' && String((prelude[i] as Token).value).toLowerCase() === 'to') {
      i++;
      while (i < prelude.length && prelude[i].type === 'whitespace') i++;
      if (i < prelude.length && prelude[i].type === 'simple-block' && (prelude[i] as SimpleBlock).associatedToken.type === '(') {
        endSelector = this.parseScopeSelectorBlock(prelude[i] as SimpleBlock);
        if (endSelector === null) return null;
        i++;
      } else {
        return null;
      }
    }

    while (i < prelude.length && prelude[i].type === 'whitespace') i++;
    if (i < prelude.length) return null;

    return new CSSScopeRule(startSelector, endSelector, childRules, parseRuleInScopeBlock);
  }

  private handleViewTransitionRule(_rule: ASTAtRule, block: SimpleBlock): Rule {
    return new CSSViewTransitionRule(this.consumeDeclarationsFromBlockContents(block.value));
  }

  private parseKeyframeSelector(prelude: ComponentValue[]): string | null {
    const lists = splitComponentValuesByComma(prelude);
    const normalizedParts: string[] = [];
    for (const list of lists) {
      const trimmed = trimComponentValues(list);
      if (trimmed.length !== 1) return null;
      const v = trimmed[0];
      if (v.type === 'ident') {
        const valStr = v.value.toLowerCase();
        if (valStr === 'from') normalizedParts.push('0%');
        else if (valStr === 'to') normalizedParts.push('100%');
        else return null;
      } else if (v.type === 'percentage') {
        const val = (v as import('./types.ts').PercentageToken).value;
        if (val < 0 || val > 100) return null;
        normalizedParts.push(`${val}%`);
      } else {
        return null;
      }
    }
    return normalizedParts.length > 0 ? normalizedParts.join(', ') : null;
  }

  private handleKeyframesRule(rule: ASTAtRule, block: SimpleBlock): Rule | null {
    const preludeClean = rule.prelude.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (preludeClean.length !== 1) return null;
    const first = preludeClean[0];
    let keyframesName = '';
    if (first.type === 'ident') {
      if (KEYFRAMES_DISALLOWED_NAMES.has(first.value.toLowerCase())) return null;
      keyframesName = first.value;
    } else if (first.type === 'string' && first.value !== '') {
      keyframesName = first.value;
    } else {
      return null;
    }

    const keyframeRules: CSSKeyframeRule[] = [];
    const stream = new ArrayComponentValueStream(block.value);

    while (true) {
      const val = stream.peek();
      if (val.type === 'whitespace' || val.type === 'semicolon') {
        stream.next();
        continue;
      }
      if (val.type === 'EOF') break;

      const prelude: ComponentValue[] = [];
      let blockVal: SimpleBlock | null = null;
      while (true) {
        const next = stream.peek();
        if (next.type === 'EOF') break;
        if (next.type === 'simple-block' && (next as SimpleBlock).associatedToken.type === '{') {
          blockVal = stream.next() as SimpleBlock;
          break;
        }
        prelude.push(stream.next());
      }

      if (!blockVal) break;
      const selectorText = this.parseKeyframeSelector(prelude);
      if (selectorText) {
        const declarations = this.consumeDeclarationsFromBlockContents(blockVal.value);
        const keyframeRule = new CSSKeyframeRule(selectorText, declarations);
        const kfStart = getComponentValueStartIndex(prelude[0]) ?? blockVal.associatedToken.startIndex ?? 0;
        keyframeRule._location = this.createBlockLocation(kfStart, blockVal);
        keyframeRules.push(keyframeRule);
      }
    }

    return new CSSKeyframesRule(keyframesName, keyframeRules);
  }

  private handleFontFaceRule(_rule: ASTAtRule, block: SimpleBlock): Rule {
    return new CSSFontFaceRule(this.consumeDeclarationsFromBlockContents(block.value));
  }

  private handlePageRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const blockContents = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
    const { declarations, nestedRules } = splitLeadingDeclarations(blockContents);
    return new CSSPageRule(serialize(rule.prelude).trim(), declarations, nestedRules, parseRule);
  }

  private handleMarginRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    return new CSSMarginRule(rule.name, this.consumeDeclarationsFromBlockContents(block.value), INTERNAL_RULE_TOKEN);
  }

  // css-counter-styles-3 #the-csscounterstylerule-interface
  private handleCounterStyleRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    return new CSSCounterStyleRule(serialize(rule.prelude).trim(), this.consumeDeclarationsFromBlockContents(block.value));
  }

  // css-fonts-4 #om-fontfeaturevalues
  private handleFontFeatureValuesRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const fontFeatureRule = new CSSFontFeatureValuesRule(serialize(rule.prelude).trim());
    const stream = new ArrayComponentValueStream(block.value);
    while (stream.peek().type !== 'EOF') {
      const token = stream.peek();
      if (token.type === 'whitespace' || token.type === 'comment') {
        stream.next();
        continue;
      }
      if (token.type === 'at-keyword') {
        const atToken = stream.next() as import('./types.ts').AtKeywordToken;
        const target = FONT_FEATURE_VALUE_BLOCKS[atToken.value.toLowerCase()];
        while (stream.peek().type === 'whitespace' || stream.peek().type === 'comment') {
          stream.next();
        }
        const next = stream.peek();
        if (next.type === 'simple-block' && (next as SimpleBlock).associatedToken.type === '{') {
          const childBlock = stream.next() as SimpleBlock;
          if (target) {
            for (const d of this.consumeDeclarationsFromBlockContents(childBlock.value)) {
              const values = d.value
                .filter(v => v.type === 'number')
                .map(v => (v as import('./types.ts').NumberToken).value);
              fontFeatureRule[target].set(d.name, values);
            }
          }
        }
      } else {
        stream.next();
      }
    }
    return fontFeatureRule;
  }

  private handlePropertyRule(rule: ASTAtRule, block: SimpleBlock): Rule | null {
    const nonWsPrelude = trimComponentValues(rule.prelude, true);
    if (nonWsPrelude.length !== 1 || nonWsPrelude[0].type !== 'ident') return null;
    const name = nonWsPrelude[0].value;
    if (!name.startsWith('--') || name === '--') return null;

    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    let syntax: string | null = null;
    let inherits: boolean | null = null;
    let initialValue: string | null = null;

    for (const d of declarations) {
      const val = serialize(d.value).trim();
      const descName = d.name.toLowerCase();
      if (descName === 'syntax') {
        const nonWsTokens = trimComponentValues(d.value, true);
        if (nonWsTokens.length === 1 && nonWsTokens[0].type === 'string') {
          syntax = nonWsTokens[0].value;
        }
      } else if (descName === 'inherits') {
        if (val === 'true') inherits = true;
        else if (val === 'false') inherits = false;
      } else if (descName === 'initial-value') {
        initialValue = val;
      }
    }

    if (syntax === null || inherits === null) return null;
    if (ParseHooks.validatePropertyRuleDescriptor) {
      if (!ParseHooks.validatePropertyRuleDescriptor({ name, syntax, inherits, initialValue: initialValue ?? undefined })) {
        return null;
      }
    } else {
      if (!isValidDashedIdent(name) || typeof syntax !== 'string' || syntax.length === 0 || typeof inherits !== 'boolean') {
        return null;
      }
    }
    return new CSSPropertyRule(name, syntax, inherits, initialValue);
  }

  private parseImportScopeArgs(scopeArgs: ComponentValue[]): { scopeStart: string | null; scopeEnd: string | null } {
    let scopeStart: string | null = null;
    let scopeEnd: string | null = null;
    let k = 0;
    while (k < scopeArgs.length && scopeArgs[k].type === 'whitespace') k++;
    if (k < scopeArgs.length && scopeArgs[k].type === 'simple-block' && (scopeArgs[k] as SimpleBlock).associatedToken.type === '(') {
      scopeStart = serialize((scopeArgs[k] as SimpleBlock).value).trim();
      k++;
    } else {
      const startTokens: ComponentValue[] = [];
      while (k < scopeArgs.length) {
        const tok = scopeArgs[k];
        if (tok.type === 'ident' && String(tok.value).toLowerCase() === 'to') break;
        startTokens.push(tok);
        k++;
      }
      const s = serialize(startTokens).trim();
      if (s) scopeStart = s;
    }

    while (k < scopeArgs.length && scopeArgs[k].type === 'whitespace') k++;
    if (k < scopeArgs.length && scopeArgs[k].type === 'ident' && String(scopeArgs[k].value).toLowerCase() === 'to') {
      k++;
      while (k < scopeArgs.length && scopeArgs[k].type === 'whitespace') k++;
      if (k < scopeArgs.length && scopeArgs[k].type === 'simple-block' && (scopeArgs[k] as SimpleBlock).associatedToken.type === '(') {
        scopeEnd = serialize((scopeArgs[k] as SimpleBlock).value).trim();
      } else {
        const e = serialize(scopeArgs.slice(k)).trim();
        if (e) scopeEnd = e;
      }
    }
    if (scopeStart) scopeStart = scopeStart.replace(/^\(/, '').replace(/\)$/, '').trim();
    if (scopeEnd) scopeEnd = scopeEnd.replace(/^\(/, '').replace(/\)$/, '').trim();
    return { scopeStart, scopeEnd };
  }

  private handleImportRule(rule: ASTAtRule): Rule {
    let href = '';
    let layerName: string | null = null;
    let supportsText: string | null = null;
    let isScoped = false;
    let scopeStart: string | null = null;
    let scopeEnd: string | null = null;

    const prelude = rule.prelude;
    let i = 0;
    while (i < prelude.length && prelude[i].type === 'whitespace') i++;

    if (i < prelude.length) {
      const extracted = extractUriFromComponentValue(prelude[i]);
      if (extracted !== null) {
        href = extracted;
        i++;
      }
    }

    // css-cascade-6 #at-import: layer, scope, and supports can appear in any order before media queries
    while (i < prelude.length) {
      while (i < prelude.length && prelude[i].type === 'whitespace') i++;
      if (i >= prelude.length) break;

      const val = prelude[i];
      if (layerName === null && val.type === 'ident' && val.value.toLowerCase() === 'layer') {
        layerName = '';
        i++;
      } else if (layerName === null && val.type === 'function' && (val as CSSFunction).name.toLowerCase() === 'layer') {
        const fnTokens = (val as CSSFunction).value;
        if (fnTokens.some(t => t.type === 'whitespace')) break;
        const parsed = this.parseLayerNameFromTokens(fnTokens, true);
        if (parsed === null) break;
        layerName = parsed;
        i++;
      } else if (supportsText === null && val.type === 'function' && (val as CSSFunction).name.toLowerCase() === 'supports') {
        supportsText = serialize((val as CSSFunction).value).trim();
        i++;
      } else if (!isScoped && val.type === 'ident' && val.value.toLowerCase() === 'scope') {
        isScoped = true;
        i++;
      } else if (!isScoped && val.type === 'function' && (val as CSSFunction).name.toLowerCase() === 'scope') {
        isScoped = true;
        ({ scopeStart, scopeEnd } = this.parseImportScopeArgs((val as CSSFunction).value));
        i++;
      } else {
        break;
      }
    }

    const mediaText = serialize(prelude.slice(i)).trim();
    return new CSSImportRule(href, mediaText, layerName, supportsText, scopeStart, scopeEnd, isScoped, INTERNAL_RULE_TOKEN);
  }

  private handleNamespaceRule(rule: ASTAtRule): Rule {
    const tokens = rule.prelude.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
    let prefix = '';
    let namespaceURI = '';

    if (tokens.length === 1) {
      namespaceURI = extractUriFromComponentValue(tokens[0]) ?? '';
    } else if (tokens.length >= 2) {
      if (tokens[0].type === 'ident') {
        prefix = tokens[0].value;
        namespaceURI = extractUriFromComponentValue(tokens[1]) ?? '';
      } else {
        namespaceURI = extractUriFromComponentValue(tokens[0]) ?? '';
      }
    }

    const nsRule = new CSSNamespaceRule(prefix, namespaceURI, INTERNAL_RULE_TOKEN);
    this.declaredNamespaces.add(nsRule.prefix);
    return nsRule;
  }

  // mediaqueries-5 #custom-mq
  private handleCustomMediaRule(rule: ASTAtRule): Rule | null {
    const prelude = rule.prelude;
    let i = 0;
    while (i < prelude.length && prelude[i].type === 'whitespace') i++;
    if (i >= prelude.length) return null;

    const nameToken = prelude[i];
    if (nameToken.type !== 'ident' || !nameToken.value.startsWith('--')) return null;
    const name = nameToken.value;
    i++;

    const remainingTokens = prelude.slice(i).filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    let query: CustomMediaQuery;
    if (remainingTokens.length === 0) {
      query = new MediaList('');
    } else if (remainingTokens.length === 1 && remainingTokens[0].type === 'ident' && remainingTokens[0].value.toLowerCase() === 'true') {
      query = true;
    } else if (remainingTokens.length === 1 && remainingTokens[0].type === 'ident' && remainingTokens[0].value.toLowerCase() === 'false') {
      query = false;
    } else {
      const mediaText = serialize(prelude.slice(i)).trim();
      const parsed = ParseHooks.parseMediaQueryList(mediaText);
      if (parsed.length === 0 || parsed.some(q => q.invalid)) return null;
      query = new MediaList(mediaText);
    }

    return new CSSCustomMediaRule(name, query);
  }

  // css-syntax-3 #consume-qualified-rule
  private consumeQualifiedRule(nested: boolean = false): CSSStyleRule | null {
    const prelude: ComponentValue[] = [];

    while (true) {
      const next = this.nextToken;
      if (next.type === 'EOF') {
        this.reportError('Unexpected EOF in qualified rule', next);
        return null;
      } else if (next.type === '}') {
        this.reportError('Unexpected } in qualified rule', next);
        if (nested) return null;
        this.consumeToken();
        prelude.push(next);
      } else if (next.type === '{') {
        if (isCustomPropertyDeclaration(prelude)) {
          this.reportError('Qualified rule prelude looks like a custom property', next);
          const blockToken = this.consumeToken(); // Consume '{'
          this.consumeBlock(blockToken);
          return null;
        }
        const blockToken = this.consumeToken(); // Consume '{'
        const start = getComponentValueStartIndex(prelude[0]) ?? blockToken.startIndex ?? 0;
        const stream = new LazyComponentValueStream(() => this.consumeComponentValue(), '}');
        const blockContents = this.consumeBlockContents(stream, true);
        const term = stream.terminator as Token | null;
        let end: number;
        if (term) {
          end = term.endIndex ?? (term.startIndex !== undefined ? term.startIndex + 1 : start);
        } else {
          const eofPos = this.nextToken.startIndex ?? this.nextToken.endIndex;
          if (eofPos !== undefined) {
            end = eofPos;
          } else {
            const buffered = stream.slice(0, stream.position);
            const lastEnd = buffered.length > 0 ? getComponentValueEndIndex(buffered[buffered.length - 1]) : undefined;
            end = lastEnd ?? (blockToken.endIndex ?? blockToken.startIndex ?? start);
          }
        }
        const bodyStart = blockToken.endIndex;
        const bodyEnd = term ? (term.startIndex ?? end) : end;
        const location = this.makeLocation(start, end, bodyStart, bodyEnd);
        return this.createStyleRule(prelude, blockContents, nested, nested, location);

      } else {
        prelude.push(this.consumeComponentValue());
      }
    }
  }

  // css-syntax-3 #consume-block-contents
  public consumeDeclarationsFromBlockContents(values: ComponentValue[]): Declaration[] {
    const stream = new ArrayComponentValueStream(values);
    const decls: Declaration[] = [];
    while (true) {
      const val = stream.peek();
      if (val.type === 'whitespace' || val.type === 'semicolon') {
        stream.next();
      } else if (val.type === 'EOF' || val.type === '}') {
        break;
      } else if (val.type === 'at-keyword') {
        this.consumeAtRuleFromStream(stream);
      } else {
        const decl = this.consumeDeclarationFromStream(stream);
        if (decl) {
          decls.push(decl);
        } else {
          // Bad declaration: consume until semicolon
          while (true) {
            const next = stream.peek();
            if (next.type === 'EOF' || next.type === 'semicolon' || next.type === '}') break;
            stream.next();
          }
        }
      }
    }
    return decls;
  }

  /** @internal */
  consumeBlockContents(stream: ComponentValueStream, nested: boolean = false, isNestedStyleRule: boolean = nested, allowRelative: boolean = false): Rule[] {
    const rules: Rule[] = [];
    let decls: Declaration[] = [];

    const flushDecls = () => {
      if (decls.length > 0) {
        const nestedDecl = new CSSNestedDeclarations(decls);
        const start = decls[0].startIndex ?? 0;
        const end = decls[decls.length - 1].endIndex ?? start;
        nestedDecl._location = this.makeLocation(start, end, start, end);
        rules.push(nestedDecl);
        decls = [];
      }
    };

    while (true) {
      const val = stream.peek();
      if (val.type === 'whitespace' || val.type === 'semicolon') {
        stream.next();
      } else if (val.type === 'EOF' || val.type === '}') {
        break;
      } else if (val.type === 'at-keyword') {
        const atRule = this.consumeAtRuleFromStream(stream, isNestedStyleRule);
        if (atRule) {
          flushDecls();
          rules.push(atRule);
        }
      } else {
        const pos = stream.position;
        const isDecl = nested && this.isNestedDeclarationAhead(stream);
        if (isDecl) {
          const decl = this.consumeDeclarationFromStream(stream);
          if (decl) {
            if (stream.peek().type === 'semicolon') {
              const semi = stream.next() as Token;
              if (semi.endIndex !== undefined) decl.endIndex = semi.endIndex;
            }
            decls.push(decl);
          }
        } else {
          stream.position = pos;
          const rule = this.consumeNestedQualifiedRuleFromStream(stream, isNestedStyleRule, 'semicolon', allowRelative);
          flushDecls();
          if (rule) rules.push(rule);
        }
      }
    }
    flushDecls();
    return rules;
  }

  private isNestedDeclarationAhead(stream: ComponentValueStream): boolean {
    const first = stream.peek();
    if (first.type !== 'ident' || first.value === '--') return false;
    if (first.value.startsWith('--')) return true;

    const lookaheadPos = stream.position;
    try {
      stream.next();
      while (stream.peek().type === 'whitespace') stream.next();
      if (stream.peek().type !== 'colon') return false;
      stream.next();

      const lookaheadTokens: ComponentValue[] = [first, { type: 'colon', value: ':' } as Token];
      while (true) {
        const next = stream.peek();
        if (next.type === 'EOF' || next.type === '}' || next.type === 'semicolon') {
          return true;
        }
        if (next.type === 'simple-block' && (next as SimpleBlock).associatedToken?.type === '{') {
          const selectorCandidate = serialize(lookaheadTokens).trim();
          return Parser.parseSelectorAST(selectorCandidate) === null;
        }
        lookaheadTokens.push(stream.next());
      }
    } finally {
      stream.position = lookaheadPos;
    }
  }

  private consumeDeclarationFromStream(stream: ComponentValueStream): Declaration | null {
    const firstValue = stream.peek();
    if (firstValue.type !== 'ident') return null;
    const startIndex = getComponentValueStartIndex(firstValue) ?? (firstValue as Token).startIndex;
    stream.next();
    const name = firstValue.value;
    if (name === '--') return null;

    while (stream.peek().type === 'whitespace') stream.next();
    if (stream.peek().type !== 'colon') return null;
    stream.next();
    while (stream.peek().type === 'whitespace') stream.next();

    const declValue: ComponentValue[] = [];
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === 'semicolon') break;
      if (
        !name.startsWith('--') &&
        val.type === 'simple-block' &&
        (val as SimpleBlock).associatedToken?.type === '{' &&
        declValue.some(v => v.type !== 'whitespace')
      ) {
        declValue.push(stream.next());
        break;
      }
      declValue.push(stream.next());
    }

    let important = false;
    const lastNonWsIndex = (end: number) => {
      let j = end;
      while (j >= 0 && declValue[j].type === 'whitespace') j--;
      return j;
    };

    const lastNonWs = declValue[lastNonWsIndex(declValue.length - 1)];
    const endIndex = (lastNonWs && (getComponentValueEndIndex(lastNonWs) ?? (lastNonWs as Token).endIndex)) ?? (firstValue as Token).endIndex;

    const i1 = lastNonWsIndex(declValue.length - 1);
    const t1 = declValue[i1];
    if (i1 >= 0 && t1?.type === 'ident' && t1.value.toLowerCase() === 'important') {
      const i2 = lastNonWsIndex(i1 - 1);
      const t2 = declValue[i2];
      if (i2 >= 0 && t2?.type === 'delim' && t2.value === '!') {
        important = true;
        declValue.splice(i2);
      }
    }

    // css-syntax-3 #consume-declaration: step 7 whitespace trimming
    while (declValue.length > 0 && declValue[declValue.length - 1].type === 'whitespace') {
      declValue.pop();
    }

    if (name.startsWith('--')) {
      if (!validateDeclarationValue(declValue, true, true)) return null;
    } else {
      const hasCurlyBlock = declValue.some(v => v.type === 'simple-block' && (v as SimpleBlock).associatedToken.type === '{');
      if (hasCurlyBlock && declValue.reduce((count, v) => v.type !== 'whitespace' ? count + 1 : count, 0) > 1) {
        return null;
      }
      if (!validateDeclarationValue(declValue, true, false)) return null;
    }

    // css-syntax-3 #consume-unicode-range-value: re-tokenizes raw value with unicodeRangesAllowed=true
    if (name.toLowerCase() === 'unicode-range') {
      const text = getOriginalText(declValue);
      const errors: ParseError[] = [];
      const reParser = new Parser(tokenize(text, true, errors));
      reParser.errors.push(...errors);
      const reParsed = reParser.parseComponentValues();
      if (!isValidUnicodeRangeValue(reParsed)) return null;
      this.errors.push(...reParser.errors);
      declValue.splice(0, declValue.length, ...reParsed);
    }

    return {
      type: 'declaration',
      name,
      value: declValue,
      important,
      raw: name.startsWith('--') ? getOriginalText(declValue) : undefined,
      startIndex,
      endIndex,
    };
  }

  private consumeNestedQualifiedRuleFromStream(stream: ComponentValueStream, nested: boolean = true, stopToken?: string, allowRelative: boolean = nested): Rule | null {
    const prelude: ComponentValue[] = [];
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === '}' || (stopToken && val.type === stopToken)) {
        return null;
      }
      if (val.type === 'simple-block' && (val as SimpleBlock).associatedToken.type === '{') {
        stream.next();
        if (isCustomPropertyDeclaration(prelude)) {
          this.consumeRemnantsOfABadDeclaration(stream, nested);
          return null;
        }
        const block = val as SimpleBlock;
        const blockContents = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
        const start = getComponentValueStartIndex(prelude[0]) ?? block.associatedToken.startIndex ?? 0;
        return this.createStyleRule(prelude, blockContents, nested, allowRelative, this.createBlockLocation(start, block));
      }
      prelude.push(stream.next());
    }
  }

  private consumeAtRuleFromStream(stream: ComponentValueStream, nested: boolean = false): Rule | null {
    const token = stream.next();
    if (token.type !== 'at-keyword') return null;
    const rule: ASTAtRule = {
      type: 'at-rule',
      name: token.value,
      prelude: [],
      childRules: [],
    };
    const start = (token as Token).startIndex ?? 0;

    while (true) {
      const val = stream.peek();
      if (val.type === 'semicolon') {
        const semiToken = stream.next() as Token;
        const end = semiToken.endIndex ?? semiToken.startIndex ?? start;
        return this.finalizeAtRule(rule, undefined, nested, this.makeLocation(start, end), false);
      } else if (val.type === 'EOF' || val.type === '}') {
        const end = (val as Token).startIndex ?? start;
        return this.finalizeAtRule(rule, undefined, nested, this.makeLocation(start, end), false);
      } else if (val.type === 'simple-block' && (val as SimpleBlock).associatedToken.type === '{') {
        const block = stream.next() as SimpleBlock;
        return this.finalizeAtRule(rule, block, nested, this.createBlockLocation(start, block), false);
      } else {
        rule.prelude.push(stream.next());
      }
    }
  }

  // css-syntax-3 #consume-the-remnants-of-a-bad-declaration
  private consumeRemnantsOfABadDeclaration(stream: ComponentValueStream, nested: boolean = false): void {
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === 'semicolon') {
        stream.next();
        break;
      } else if (val.type === '}' && nested) {
        break;
      } else {
        stream.next();
      }
    }
  }

  private isValidSelector(prelude: ComponentValue[]): boolean {
    const trimmed = trimComponentValues(prelude);
    if (trimmed.length === 0) return false;

    const lastToken = trimmed[trimmed.length - 1];
    if ((lastToken.type === 'delim' && (lastToken.value === '.' || lastToken.value === '#')) || lastToken.type === 'colon') {
      return false;
    }

    for (let i = 0; i < trimmed.length; i++) {
      const val = trimmed[i];
      if (val.type === 'number' || val.type === 'dimension') return false;
      if (val.type === 'delim') {
        if (val.value === '#') return false;
        if (val.value === '.' && (i + 1 >= trimmed.length || trimmed[i + 1].type !== 'ident')) return false;
      }
      if (val.type === 'colon' && i + 1 < trimmed.length) {
        const nextVal = trimmed[i + 1];
        if (nextVal.type !== 'ident' && nextVal.type !== 'function' && nextVal.type !== 'colon') return false;
      }
    }
    return true;
  }

  private createStyleRule(prelude: ComponentValue[], blockContents: Rule[], isNested: boolean = false, allowRelative: boolean = isNested, location?: RuleSourceLocation): CSSStyleRule | null {
    const { declarations, nestedRules } = splitLeadingDeclarations(blockContents);
    let selectorText = '';
    let selectorAST: SelectorList | null = null;

    if (isNested) {
      selectorText = this.normalizeNestedSelector(prelude);
      if (selectorText === '') return null;
      selectorAST = Parser.parseSelectorAST(selectorText, {
        declaredNamespaces: this.declaredNamespaces,
        allowRelative: true,
        allowVendorPseudos: Boolean(this.options.allowVendorPseudos)
      });
      if (selectorAST === null) return null;
    } else {
      if (!this.isValidSelector(prelude)) return null;
      try {
        selectorAST = new SelectorParser(prelude, {
          declaredNamespaces: this.declaredNamespaces,
          allowRelative,
          allowVendorPseudos: Boolean(this.options.allowVendorPseudos)
        }).parse();
      } catch {
        return null;
      }
      selectorText = serialize(prelude).trim();
    }

    const rule = new CSSStyleRule(selectorText, declarations, nestedRules, parseRuleInBlock, selectorAST);
    if (location) rule._location = location;
    return rule;
  }

  static #consumeSelectorTokens(parser: Parser): ComponentValue[] | null {
    const prelude: ComponentValue[] = [];
    while (true) {
      const next = parser.nextToken;
      if (next.type === 'EOF') break;
      if (next.type === '{' || next.type === '}' || next.type === 'at-keyword') return null;
      prelude.push(parser.consumeComponentValue());
    }
    return prelude;
  }

  public static parseSelectorAST(
    text: string,
    options?: { declaredNamespaces?: Set<string>; allowRelative?: boolean; allowVendorPseudos?: boolean }
  ): SelectorList | null;
  public static parseSelectorAST(
    text: string,
    declaredNamespaces?: Set<string>,
    allowRelative?: boolean,
    allowVendorPseudos?: boolean
  ): SelectorList | null;
  public static parseSelectorAST(
    text: string,
    declaredNamespacesOrOptions?: Set<string> | { declaredNamespaces?: Set<string>; allowRelative?: boolean; allowVendorPseudos?: boolean },
    allowRelative = false,
    allowVendorPseudos = false
  ): SelectorList | null {
    const isOptionsObj = declaredNamespacesOrOptions && !(declaredNamespacesOrOptions instanceof Set);
    const declaredNamespaces = isOptionsObj ? declaredNamespacesOrOptions.declaredNamespaces : declaredNamespacesOrOptions;
    const isRelative = isOptionsObj ? (declaredNamespacesOrOptions.allowRelative ?? false) : allowRelative;
    const vendorPseudos = isOptionsObj ? (declaredNamespacesOrOptions.allowVendorPseudos ?? false) : allowVendorPseudos;

    const parser = new Parser(tokenize(text), { allowVendorPseudos: vendorPseudos });
    const prelude = Parser.#consumeSelectorTokens(parser);
    if (prelude === null) return null;

    try {
      return new SelectorParser(prelude, {
        allowRelative: isRelative,
        declaredNamespaces,
        allowVendorPseudos: vendorPseudos
      }).parse();
    } catch {
      return null;
    }
  }

  // css-nesting-1 #cssom: absolutize relative selector by inserting implied nesting selector
  private normalizeNestedSelector(prelude: ComponentValue[]): string {
    const segments = splitComponentValuesByComma(prelude, true);
    if (segments.length === 1 && segments[0].length === 0) return '';

    const hasAmpersand = (values: ComponentValue[]): boolean =>
      values.some(val =>
        (val.type === 'delim' && (val as Token).value === '&') ||
        (val.type === 'simple-block' && hasAmpersand((val as SimpleBlock).value)) ||
        (val.type === 'function' && hasAmpersand((val as CSSFunction).value))
      );

    const normalizedSegments: string[] = [];
    for (const segment of segments) {
      const trimmed = trimComponentValues(segment);
      if (trimmed.length === 0) return '';

      const firstNode = trimmed[0];
      const secondNode = trimmed[1];
      const startsWithCombinator =
        (firstNode.type === 'delim' && ['>', '+', '~'].includes(firstNode.value)) ||
        (firstNode.type === 'delim' && firstNode.value === '|' && secondNode?.type === 'delim' && secondNode.value === '|');

      const serialized = serialize(trimmed);
      normalizedSegments.push(startsWithCombinator || !hasAmpersand(trimmed) ? `& ${serialized}` : serialized);
    }

    return normalizedSegments.join(', ');
  }

  // css-syntax-3 #consume-simple-block
  /** @internal */
  consumeBlock(startToken: Token): SimpleBlock {
    const block: SimpleBlock = {
      type: 'simple-block',
      associatedToken: startToken,
      value: [],
    };
    const mirror = getMirrorToken(startToken.type);

    while (true) {
      const next = this.nextToken;
      if (next.type === mirror) {
        block.endIndex = next.endIndex ?? next.startIndex;
        block.isClosed = true;
        this.discardToken();
        return block;
      } else if (next.type === 'EOF') {
        block.endIndex = next.startIndex;
        block.isClosed = false;
        this.reportError('Unexpected EOF in block', next);
        return block;
      } else {
        block.value.push(this.consumeComponentValue());
      }
    }
  }

  // css-syntax-3 #consume-function
  private consumeFunction(nameToken: FunctionToken): CSSFunction {
    const func: CSSFunction = {
      type: 'function',
      name: nameToken.value,
      value: [],
    };

    while (true) {
      const next = this.nextToken;
      if (next.type === ')') {
        this.discardToken();
        return func;
      } else if (next.type === 'EOF') {
        this.reportError('Unexpected EOF in function', next);
        return func;
      } else {
        func.value.push(this.consumeComponentValue());
      }
    }
  }

  // css-syntax-3 #consume-component-value
  public consumeComponentValue(): ComponentValue {
    const token = this.consumeToken();
    if (token.type === '{' || token.type === '[' || token.type === '(') {
      return this.consumeBlock(token);
    }
    if (token.type === 'function') {
      return this.consumeFunction(token);
    }
    return token;
  }

  public ensureEOF(): void {
    this.skipWhitespace();
    if (this.nextToken.type !== 'EOF') {
      throw new DOMException('Syntax error', 'SyntaxError');
    }
  }

  public static parseSelector(text: string): string | null {
    const prelude = Parser.#consumeSelectorTokens(new Parser(tokenize(text)));
    if (prelude === null) return null;
    return serialize(prelude).trim() || null;
  }

  public static parseRuleText(text: string): Rule {
    const parser = new Parser(tokenize(text), { source: text });
    const rule = parser.consumeRule();
    if (!rule) throw new DOMException('Syntax error', 'SyntaxError');
    parser.ensureEOF();
    return rule;
  }

  public static parseStyleSheetText(text: string): Rule[] {
    return new Parser(tokenize(text), { source: text }).consumeListOfRules(true);
  }

}

// css-syntax-3 #consume-block-contents
function parseRuleInBlockText(text: string, nested = true, inScope = false): Rule {
  const parser = new Parser(tokenize(`{ ${text} }`));
  if (inScope) parser.scopeContextDepth = 1;
  const block = parser.consumeBlock(parser.consumeToken());
  const contents = parser.consumeBlockContents(
    new ArrayComponentValueStream(block.value),
    inScope ? true : nested,
    inScope ? false : nested,
    inScope
  );
  if (contents.length !== 1) {
    throw new DOMException('Syntax error', 'SyntaxError');
  }
  return contents[0];
}

// css-cascade-6 #scoped-styles
function parseRuleInScopeBlockText(text: string): Rule {
  return parseRuleInBlockText(text, true, true);
}

// css-variables-1 #using-variables
function isValidVarArg(func: CSSFunction): boolean {
  const rawName = func.name || ('value' in func && typeof func.value === 'string' ? func.value : '');
  if (rawName.toLowerCase() !== 'var' || !Array.isArray(func.value)) return true;
  const args = func.value;
  const commaIndex = args.findIndex(t => t.type === 'comma');
  const nameTokens = (commaIndex !== -1 ? args.slice(0, commaIndex) : args)
    .filter(t => t.type !== 'whitespace' && t.type !== 'comment');

  if (nameTokens.length === 0) return false;

  if (nameTokens.length === 1 && nameTokens[0].type === 'simple-block' && (nameTokens[0] as SimpleBlock).associatedToken?.type === '{') {
    return (nameTokens[0] as SimpleBlock).value.some(t => t.type !== 'whitespace' && t.type !== 'comment');
  }

  return !nameTokens.some(t => t.type === 'simple-block' && (t as SimpleBlock).associatedToken?.type === '{');
}

// css-syntax-3 #consume-declaration
export function validateDeclarationValue(values: ComponentValue[], isTopLevel = true, isCustomProperty = false): boolean {
  for (const v of values) {
    if (v.type === 'bad-string' || v.type === 'bad-url' || v.type === ')' || v.type === ']' || v.type === '}') return false;
    if (isTopLevel && (v.type === 'semicolon' || (v.type === 'delim' && (v as Token).value === '!'))) {
      return false;
    }
    if (v.type === 'simple-block') {
      if (!validateDeclarationValue((v as SimpleBlock).value, false, isCustomProperty)) return false;
    } else if (v.type === 'function') {
      const func = v as CSSFunction;
      if (!isCustomProperty && !isValidVarArg(func)) return false;
      if (Array.isArray(func.value) && !validateDeclarationValue(func.value, false, isCustomProperty)) return false;
    }
  }
  return true;
}


/**
 * Parses a single rule from a string.
 * 
 * @note We recommend a more ergonomic entry point like `CSS.parseRule` 
 * or `CSS.parseRuleSync` for standard usage.
 */
export function parseRule(text: string): Rule {
  return Parser.parseRuleText(text);
}

/**
 * Parses a stylesheet from a string.
 * 
 * @note We recommend a more ergonomic entry point like `CSS.parseStylesheet` 
 * or `CSS.parseStylesheetSync` for standard usage.
 */
export function parseStyleSheet(text: string): Rule[] {
  return Parser.parseStyleSheetText(text);
}

export function parseRuleInBlock(text: string, nested = true): Rule {
  return parseRuleInBlockText(text, nested);
}

export function parseRuleInScopeBlock(text: string): Rule {
  return parseRuleInScopeBlockText(text);
}

export function assembleUnicodeRanges(values: ComponentValue[]): ComponentValue[] | null {
  const result: ComponentValue[] = [];
  let i = 0;
  while (i < values.length && (values[i].type === 'whitespace' || values[i].type === 'comment')) i++;
  if (i >= values.length) return null;

  while (i < values.length) {
    // Must start with <urange>
    const v = values[i];
    if (v.type === 'unicode-range') {
      const tok = v as UnicodeRangeToken;
      const start = tok.unicodeRangeStart ?? parseInt(tok.value.slice(2).split('-')[0], 16);
      const end = tok.unicodeRangeEnd ?? (tok.value.includes('-') ? parseInt(tok.value.split('-')[1], 16) : start);
      if (start > 0x10FFFF || end > 0x10FFFF || start > end) {
        return null;
      }
      result.push(v);
      i++;
    } else if (v.type === 'ident' && (v.value.toLowerCase() === 'u' || v.value.toLowerCase().startsWith('u+'))) {
      let text = '';
      if (v.value.toLowerCase() === 'u') {
        i++;
        while (i < values.length && values[i].type === 'comment') i++;
        let hasPlus = false;
        if (i < values.length && values[i].type === 'delim' && (values[i] as Token).value === '+') {
          hasPlus = true;
          i++;
          while (i < values.length && values[i].type === 'comment') i++;
        } else if (i < values.length && (values[i].type === 'number' || values[i].type === 'dimension') && (values[i] as { sign?: string }).sign === '+') {
          hasPlus = true;
        }
        if (hasPlus) {
          let hexPart = '';
          while (i < values.length) {
            const t = values[i];
            if (t.type === 'dimension') {
              const signStr = (t as { sign?: string }).sign === '-' ? '-' : '';
              hexPart += signStr + Math.abs((t as { value: number }).value).toString(16) + ((t as { unit?: string }).unit || '');
              i++;
            } else if (t.type === 'number') {
              const signStr = (t as { sign?: string }).sign === '-' ? '-' : '';
              hexPart += signStr + Math.abs((t as { value: number }).value).toString(16);
              i++;
            } else if (t.type === 'ident' || (t.type === 'delim' && ['?', '-'].includes(String((t as Token).value)))) {
              hexPart += String((t as Token).value);
              i++;
            } else if (t.type === 'comment') {
              i++;
            } else {
              break;
            }
          }
          text = `u+${hexPart}`;
        } else {
          return null;
        }
      } else {
        text = v.value;
        i++;
        while (i < values.length && (values[i].type === 'delim' && (values[i] as Token).value === '?')) {
          text += '?';
          i++;
        }
      }

      const match1 = /^u\+([0-9a-f]{1,6})(-([0-9a-f]{1,6}))?$/i.exec(text);
      if (match1) {
        const startHex = match1[1];
        const endHex = match1[3];
        const startNum = parseInt(startHex, 16);
        if (startNum > 0x10FFFF) return null;
        if (endHex !== undefined) {
          const endNum = parseInt(endHex, 16);
          if (endNum > 0x10FFFF || endNum < startNum) return null;
          result.push({
            type: 'unicode-range',
            value: `U+${startNum.toString(16).toUpperCase()}-${endNum.toString(16).toUpperCase()}`
          } as Token);
        } else {
          result.push({
            type: 'unicode-range',
            value: `U+${startNum.toString(16).toUpperCase()}`
          } as Token);
        }
      } else {
        const match2 = /^u\+([0-9a-f]{0,5})(\?{1,6})$/i.exec(text);
        if (match2 && (match2[1].length + match2[2].length <= 6)) {
          const prefix = match2[1];
          const q = match2[2];
          const startHex = prefix + '0'.repeat(q.length);
          const endHex = prefix + 'F'.repeat(q.length);
          const startNum = parseInt(startHex, 16);
          const endNum = parseInt(endHex, 16);
          if (startNum > 0x10FFFF || endNum > 0x10FFFF) return null;
          result.push({
            type: 'unicode-range',
            value: `U+${startNum.toString(16).toUpperCase()}-${endNum.toString(16).toUpperCase()}`
          } as Token);
        } else {
          return null;
        }
      }
    } else {
      return null;
    }

    while (i < values.length && (values[i].type === 'whitespace' || values[i].type === 'comment')) i++;
    if (i >= values.length || values[i].type === 'EOF') break;
    if (values[i].type === 'comma' || (values[i].type === 'delim' && (values[i] as Token).value === ',')) {
      result.push({ type: 'comma', value: ',' } as Token);
      i++;
      while (i < values.length && (values[i].type === 'whitespace' || values[i].type === 'comment')) i++;
      if (i >= values.length) return null; // Trailing comma is invalid
    } else {
      return null;
    }
  }
  return result;
}

export function isValidUnicodeRangeValue(values: ComponentValue[]): boolean {
  return assembleUnicodeRanges(values) !== null;
}

export function parseStyleAttribute(tokens: Token[]): CSSStyleDeclaration {
  return new Parser(tokens).parseStyleAttribute();
}

export function consumeRule(tokens: Token[]): Rule | null {
  return new Parser(tokens).consumeRule();
}

export function consumeListOfRules(tokens: Token[], topLevel: boolean): Rule[] {
  return new Parser(tokens).consumeListOfRules(topLevel);
}

export function parseComponentValues(tokens: TokenStream | Token[], errors?: ParseError[]): ComponentValue[] {
  const p = new Parser(tokens);
  const res = p.parseComponentValues();
  if (errors) {
    errors.push(...p.errors);
  }
  return res;
}

export const parseSelector = Parser.parseSelector;
export const parseSelectorAST = Parser.parseSelectorAST;

export function validateCustomPropertyValue(values: ComponentValue[]): boolean {
  return validateDeclarationValue(values, true, true);
}

export function parse(css: string, options?: ParserOptions): CSSStyleSheet {
  return new Parser(tokenize(css), { source: css, ...options }).parseStyleSheet();
}

CSSGroupingRule._parser = { parseRule, parseRuleInBlock, parseRuleInScopeBlock };

