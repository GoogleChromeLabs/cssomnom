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
import type { Token, TokenStream, ComponentValue, ComponentValueStream, SimpleBlock, CSSFunction, Declaration, ASTAtRule, Rule, ParseError, StringToken, UrlToken, FunctionToken, CustomMediaQuery, RuleSourceLocation, ElementLike } from './types.ts';


import { serialize, getOriginalText, getMirrorToken } from './serializer.ts';

import { tokenize } from './tokenizer.ts';
import { CSSFontFaceRule, CSSPageRule, CSSAtRule, CSSStyleSheet, CSSStyleRule, CSSMediaRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSLayerStatementRule, CSSStartingStyleRule, CSSViewTransitionRule, CSSKeyframesRule, CSSKeyframeRule, CSSNestedDeclarations, CSSRule, CSSMarginRule, CSSImportRule, CSSNamespaceRule, CSSPropertyRule, CSSScopeRule, CSSCounterStyleRule, CSSFontFeatureValuesRule, CSSCustomMediaRule, MediaList } from './CSSOM.ts';
import { INTERNAL_RULE_TOKEN } from './internal-token.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { ArrayTokenStream, ArrayComponentValueStream, LazyComponentValueStream } from './TokenStream.ts';

export interface ParserOptions {
  atRules?: Record<string, string>;
  allowVendorPseudos?: boolean;
}
import { SelectorParser } from './SelectorParser.ts';
import { calculateSpecificity } from './specificity.ts';
import { getCascadedStyle } from './cascade.ts';
import { ParseHooks } from './parse-hooks.ts';
import { PropertyRegistry, matchesSyntax } from './PropertyRegistry.ts';

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

function createBlockLocation(start: number, block: SimpleBlock): RuleSourceLocation {
  const end = block.endIndex ?? block.associatedToken.startIndex ?? start;
  const bodyStart = block.associatedToken.endIndex;
  const bodyEnd = block.endIndex !== undefined ? (block.isClosed ? block.endIndex - 1 : block.endIndex) : undefined;
  return { start, end, bodyStart, bodyEnd };
}

function trimComponentValues(values: ComponentValue[], trimEof = false): ComponentValue[] {
  let start = 0;
  while (start < values.length && values[start].type === 'whitespace') start++;
  let end = values.length - 1;
  while (end >= start && (values[end].type === 'whitespace' || (trimEof && values[end].type === 'EOF'))) end--;
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

const CSS_WIDE_KEYWORDS = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default']);
const KEYFRAMES_DISALLOWED_NAMES = new Set(['none', 'initial', 'inherit', 'unset', 'revert', 'default']);
const FONT_FEATURE_VALUE_BLOCKS: Record<string, 'annotation' | 'ornaments' | 'stylistic' | 'swash' | 'characterVariant' | 'styleset' | 'historicalForms'> = {
  annotation: 'annotation',
  ornaments: 'ornaments',
  stylistic: 'stylistic',
  swash: 'swash',
  'character-variant': 'characterVariant',
  charactervariant: 'characterVariant',
  styleset: 'styleset',
  'historical-forms': 'historicalForms',
  historicalforms: 'historicalForms',
};

/**
 * Skeleton Parser for CSSOM.
 * Implements top-level parsing algorithms from CSS Syntax Module Level 3.
 * @see https://drafts.csswg.org/css-syntax-3/#parsing
 * 
 * @note We recommend a more ergonomic entry point like `CSS.parseStylesheet` 
 * or `CSS.parseStylesheetSync` for standard usage.
 */
export class Parser {
  private tokens: TokenStream;
  public errors: ParseError[] = [];
  private declaredNamespaces = new Set<string>();
  static readonly #customPropertyAstCache = new Map<string, ComponentValue[]>();
  static readonly #MAX_CACHE_SIZE = 1000;



  private static readonly MARGIN_RULE_NAMES = new Set([
    'top-left-corner', 'top-left', 'top-center', 'top-right', 'top-right-corner',
    'bottom-left-corner', 'bottom-left', 'bottom-center', 'bottom-right', 'bottom-right-corner',
    'left-top', 'left-middle', 'left-bottom',
    'right-top', 'right-middle', 'right-bottom'
  ]);

  private static readonly AT_RULE_HANDLERS: Record<string, (parser: Parser, rule: ASTAtRule, block?: SimpleBlock, nested?: boolean) => Rule | null> = {
    media: (parser, rule, block, nested) => parser.handleGroupingAtRule(rule, block, nested || false, CSSMediaRule),
    'font-face': (parser, rule, block) => block ? parser.handleFontFaceRule(rule, block) : null,
    page: (parser, rule, block) => block ? parser.handlePageRule(rule, block) : null,
    property: (parser, rule, block) => block ? parser.handlePropertyRule(rule, block) : null,
    supports: (parser, rule, block, nested) => parser.handleGroupingAtRule(rule, block, nested || false, CSSSupportsRule),
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
    if (Parser.MARGIN_RULE_NAMES.has(name)) {
      return (parser, rule, block) => block ? parser.handleMarginRule(rule, block) : null;
    }
    if (name === 'keyframes' || name.endsWith('-keyframes')) {
      return (parser, rule, block) => block ? parser.handleKeyframesRule(rule, block) : null;
    }
    return Parser.AT_RULE_HANDLERS[name];
  }

  private static readonly NESTED_GROUP_AT_RULES = new Set([
    'media', 'supports', 'container', 'layer', 'scope', 'starting-style',
    'keyframes', 'property', 'counter-style', 'font-feature-values', 'view-transition'
  ]);

  // css-nesting-1 § 3.3 #conditionals
  // css-syntax-3 § 3.2 #charset-rule & § 5.4.4 #consume-at-rule
  private isSupportedAtRule(name: string, nested: boolean = false): boolean {
    const lower = name.toLowerCase();
    if (lower === 'charset') return false;
    if (lower === 'mediaall') return false;
    if (lower.startsWith('--')) return false;
    if (Parser.MARGIN_RULE_NAMES.has(lower)) return true;
    if (nested) {
      if (lower.endsWith('-keyframes')) return true;
      return Parser.NESTED_GROUP_AT_RULES.has(lower);
    }
    return true;
  }

  public options: ParserOptions;

  constructor(tokens: TokenStream | Token[], options: ParserOptions = {}) {
    this.options = options;
    if (Array.isArray(tokens)) {
      this.tokens = new ArrayTokenStream(tokens);
    } else {
      this.tokens = tokens;
    }
  }

  private reportError(message: string, token?: Token): void {
    this.errors.push({ message, token });
  }

  private get nextToken(): Token {
    return this.tokens.peek();
  }

  private consumeToken(): Token {
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

  // 5.4.9 Parse a list of component values https://drafts.csswg.org/css-syntax/#parse-list-of-component-values
  public parseComponentValues(): ComponentValue[] {
    const values: ComponentValue[] = [];
    while (this.nextToken.type !== 'EOF') {
      values.push(this.consumeComponentValue());
    }
    return values;
  }

  // 5.4.10 Parse a comma-separated list of component values https://drafts.csswg.org/css-syntax/#parse-comma-separated-list-of-component-values
  public parseCommaSeparatedListOfComponentValues(): ComponentValue[][] {
    return splitComponentValuesByComma(this.parseComponentValues());
  }

  // 5.4.3 Parse a stylesheet https://drafts.csswg.org/css-syntax/#parse-stylesheet
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

  // 5.4.5 Parse a list of declarations https://drafts.csswg.org/css-syntax/#parse-block-contents
  public parseStyleAttribute(): CSSStyleDeclaration {
    const declarations = this.consumeDeclarationsFromBlockContents(this.parseComponentValues());
    return new CSSStyleDeclaration(declarations);
  }

  // 5.4.4 Parse a stylesheet's contents https://drafts.csswg.org/css-syntax/#parse-stylesheet-contents
  public parseStyleSheetContents(): Rule[] {
    return this.consumeListOfRules(true);
  }

  // 5.4.5 Parse a block's contents https://drafts.csswg.org/css-syntax/#parse-block-contents
  public parseBlockContents(): Rule[] {
    return this.consumeBlockContents(new ArrayComponentValueStream(this.parseComponentValues()), true, false);
  }

  // 5.4.7 Parse a declaration https://drafts.csswg.org/css-syntax/#parse-declaration
  public parseDeclaration(): Declaration | null {
    this.skipWhitespace();
    if (this.nextToken.type !== 'ident') return null;
    const stream = new LazyComponentValueStream(() => this.consumeComponentValue(), 'EOF');
    return this.consumeDeclarationFromStream(stream);
  }

  // 5.4.8 Parse a component value https://drafts.csswg.org/css-syntax/#parse-component-value
  public parseComponentValue(): ComponentValue | null {
    this.skipWhitespace();
    if (this.nextToken.type === 'EOF') return null;
    const value = this.consumeComponentValue();
    this.skipWhitespace();
    return (this.nextToken as Token).type === 'EOF' ? value : null;
  }

  // 5.5.1 Consume a stylesheet's contents https://drafts.csswg.org/css-syntax/#consume-stylesheet-contents
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

  // 5.4.6 https://drafts.csswg.org/css-syntax/#parse-rule
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
        rule.childRules = this.consumeDeclarationsFromBlockContents(block.value);
        return rule;
      }
      if (type === 'rule') {
        rule.childRules = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
        return rule;
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

  // 5.5.2 Consume an at-rule https://drafts.csswg.org/css-syntax/#consume-at-rule
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
        return this.finalizeAtRule(rule, undefined, nested, { start, end }, true);
      } else if (next.type === '}') {
        if (nested) return null;
        this.consumeToken();
        rule.prelude.push(next);
      } else if (next.type === '{') {
        const block = this.consumeBlock(this.consumeToken());
        return this.finalizeAtRule(rule, block, nested, createBlockLocation(start, block), true);
      } else {
        rule.prelude.push(this.consumeComponentValue());
      }
    }
  }

  private scopeContextDepth: number = 0;

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

  // css-cascade-5 § 6.4.4 #declaring-layers
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

  // css-nesting-1 § 4.1 #nesting-at-scope (Issue 9740)
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
        keyframeRule._location = createBlockLocation(kfStart, blockVal);
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

  // css-counter-styles-3 § 8.1 #csscounterstylerule
  private handleCounterStyleRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    return new CSSCounterStyleRule(serialize(rule.prelude).trim(), this.consumeDeclarationsFromBlockContents(block.value));
  }

  // css-fonts-4 § 8 #cssfontfeaturevaluesrule-interface
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
    const nonWsPrelude = trimComponentValues(rule.prelude);
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
        const nonWsTokens = trimComponentValues(d.value);
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
    try {
      PropertyRegistry.validate({ name, syntax, inherits, initialValue: initialValue ?? undefined });
    } catch {
      return null;
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

    // css-cascade-6 § 5 #at-import: layer, scope, and supports can appear in any order before media queries
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

  // Media Queries 5 § 2.3 #custom-mq
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

  /**
   * Consume a qualified rule.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-qualified-rule
   */
  // 5.5.3 Consume a qualified rule https://drafts.csswg.org/css-syntax/#consume-qualified-rule
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
        if (Parser.isCustomPropertyDeclaration(prelude)) {
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
        const location: RuleSourceLocation = { start, end, bodyStart, bodyEnd };
        return this.createStyleRule(prelude, blockContents, nested, nested, location);

      } else {
        prelude.push(this.consumeComponentValue());
      }
    }
  }

  /**
   * Consume a list of declarations.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-list-of-declarations
   */
  // 5.5.5 Consume a block's contents https://drafts.csswg.org/css-syntax/#consume-block-contents
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

  private consumeBlockContents(stream: ComponentValueStream, nested: boolean = false, isNestedStyleRule: boolean = nested, allowRelative: boolean = false): Rule[] {
    const rules: Rule[] = [];
    let decls: Declaration[] = [];

    const flushDecls = () => {
      if (decls.length > 0) {
        rules.push(new CSSNestedDeclarations(decls));
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
          if (decl) decls.push(decl);
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

    // css-syntax-3 § 5.5.5 #consume-a-declaration Step 7
    while (declValue.length > 0 && declValue[declValue.length - 1].type === 'whitespace') {
      declValue.pop();
    }

    if (name.startsWith('--')) {
      if (!Parser.validateCustomPropertyValue(declValue)) return null;
    } else {
      const hasCurlyBlock = declValue.some(v => v.type === 'simple-block' && (v as SimpleBlock).associatedToken.type === '{');
      if (hasCurlyBlock && declValue.reduce((count, v) => v.type !== 'whitespace' ? count + 1 : count, 0) > 1) {
        return null;
      }
      if (!validateDeclarationValue(declValue)) return null;
    }

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
    };
  }

  public static isValidDashedIdent(name: string): boolean {
    return typeof name === 'string' && name.startsWith('--') && name !== '--' && !/\s/.test(name);
  }

  public static isCustomPropertyDeclaration(prelude: ComponentValue[]): boolean {
    let idx = 0;
    while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
    if (idx >= prelude.length) return false;
    const firstNonWs = prelude[idx++];
    while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
    if (idx >= prelude.length) return false;
    const secondNonWs = prelude[idx++];

    return firstNonWs.type === 'ident' && firstNonWs.value.startsWith('--') && secondNonWs.type === 'colon';
  }

  public static validateCustomPropertyValue(values: ComponentValue[], topLevel = true): boolean {
    for (const v of values) {
      if (v.type === 'bad-string' || v.type === 'bad-url') return false;
      if (v.type === ')' || v.type === ']' || v.type === '}') return false;
      if (topLevel && ((v.type === 'delim' && (v as Token).value === '!') || v.type === 'semicolon')) return false;

      if (v.type === 'simple-block' && !Parser.validateCustomPropertyValue((v as SimpleBlock).value, false)) return false;
      if (v.type === 'function' && !Parser.validateCustomPropertyValue((v as CSSFunction).value, false)) return false;
    }
    return true;
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
        if (Parser.isCustomPropertyDeclaration(prelude)) {
          this.consumeRemnantsOfABadDeclaration(stream, nested);
          return null;
        }
        const block = val as SimpleBlock;
        const blockContents = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
        const start = getComponentValueStartIndex(prelude[0]) ?? block.associatedToken.startIndex ?? 0;
        return this.createStyleRule(prelude, blockContents, nested, allowRelative, createBlockLocation(start, block));
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
        return this.finalizeAtRule(rule, undefined, nested, { start, end }, false);
      } else if (val.type === 'EOF' || val.type === '}') {
        const end = (val as Token).startIndex ?? start;
        return this.finalizeAtRule(rule, undefined, nested, { start, end }, false);
      } else if (val.type === 'simple-block' && (val as SimpleBlock).associatedToken.type === '{') {
        const block = stream.next() as SimpleBlock;
        return this.finalizeAtRule(rule, block, nested, createBlockLocation(start, block), false);
      } else {
        rule.prelude.push(stream.next());
      }
    }
  }

  // css-syntax-3 § 5.5.5 #consume-remnants-of-a-bad-declaration
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
    let selectorAST: import('./types.ts').SelectorList | null = null;

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
  ): import('./types.ts').SelectorList | null;
  public static parseSelectorAST(
    text: string,
    declaredNamespaces?: Set<string>,
    allowRelative?: boolean,
    allowVendorPseudos?: boolean
  ): import('./types.ts').SelectorList | null;
  public static parseSelectorAST(
    text: string,
    declaredNamespacesOrOptions?: Set<string> | { declaredNamespaces?: Set<string>; allowRelative?: boolean; allowVendorPseudos?: boolean },
    allowRelative = false,
    allowVendorPseudos = false
  ): import('./types.ts').SelectorList | null {
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

  // css-nesting-1 § 3 #nest-selector & § 4 #cssom
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

  // 5.5.9 Consume a simple block https://drafts.csswg.org/css-syntax/#consume-simple-block
  private consumeBlock(startToken: Token): SimpleBlock {
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

  // 5.5.10 Consume a function https://drafts.csswg.org/css-syntax/#consume-function
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

  // 5.5.8 Consume a component value https://drafts.csswg.org/css-syntax/#consume-component-value
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
    const parser = new Parser(tokenize(text));
    const rule = parser.consumeRule();
    if (!rule) throw new DOMException('Syntax error', 'SyntaxError');
    parser.ensureEOF();
    return rule;
  }

  public static parseStyleSheetText(text: string): Rule[] {
    return new Parser(tokenize(text)).consumeListOfRules(true);
  }

  // css-nesting-1 § 4.1 #the-cssnesteddeclarations-interface
  // cssom-1 § 6.4.3 #the-cssgroupingrule-interface
  public static parseRuleInBlockText(text: string, nested = true, inScope = false): Rule {
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

  // css-cascade-6 § 3 #scoped-styles
  public static parseRuleInScopeBlockText(text: string): Rule {
    return Parser.parseRuleInBlockText(text, true, true);
  }

  public static calculateSpecificity(selector: string | import('./types.ts').SelectorList): [number, number, number][] {
    return calculateSpecificity(selector);
  }

  public static getCascadedStyle(element?: ElementLike | null, rules?: Rule[]): CSSStyleDeclaration {
    return getCascadedStyle(element, rules);
  }

  static #parseValuesFromString(text: string): ComponentValue[] {
    return new Parser(tokenize(text)).parseComponentValues();
  }

  public static resolveVariables(style: CSSStyleDeclaration, property: string, envMap?: Record<string, string>): string {
    const value = style.getPropertyValue(property);
    if (!value) return '';
    return Parser.#resolveVariablesInString(style, value, new Set([property]), envMap);
  }

  static #resolveVariablesInString(style: CSSStyleDeclaration, value: string, seen: Set<string>, envMap?: Record<string, string>): string {
    const resolved = Parser.#resolveVariablesInComponentValues(style, Parser.#parseValuesFromString(value), seen, envMap);
    if (resolved.some(v => v.type === 'ident' && typeof v.value === 'string' && (v.value === '\0guaranteed-invalid' || v.value.startsWith('\0cycle:')))) {
      return '';
    }
    return serialize(resolved);
  }

  static #resolveVariablesInComponentValues(style: CSSStyleDeclaration, values: ComponentValue[], seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    const result: ComponentValue[] = [];
    for (const v of values) {
      result.push(...Parser.#resolveOneVariable(style, v, seen, envMap));
    }
    return result;
  }

  static #resolveOneVariable(style: CSSStyleDeclaration, v: ComponentValue, seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    if (v.type === 'function') {
      const fn = v as CSSFunction;
      if (fn.name === 'var') return Parser.#resolveVarFunction(style, fn, seen, envMap);
      if (fn.name === 'env') return Parser.#resolveEnvFunction(style, fn, seen, envMap);
      return [{ ...fn, value: Parser.#resolveVariablesInComponentValues(style, fn.value, seen, envMap) } as CSSFunction];
    }
    if (v.type === 'simple-block') {
      const block = v as SimpleBlock;
      return [{ ...block, value: Parser.#resolveVariablesInComponentValues(style, block.value, seen, envMap) } as SimpleBlock];
    }
    return [v];
  }

  // https://drafts.csswg.org/css-variables-1/#replace-a-var
  static #resolveVarFunction(style: CSSStyleDeclaration, fn: CSSFunction, seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    const commaIdx = fn.value.findIndex(v => v.type === 'comma');
    const tokensBeforeComma = commaIdx === -1 ? fn.value : fn.value.slice(0, commaIdx);
    const argsBeforeComma = tokensBeforeComma.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (argsBeforeComma.length !== 1) return [];

    const firstArg = argsBeforeComma[0];
    if (firstArg.type !== 'ident' || !Parser.isValidDashedIdent(firstArg.value)) return [];

    const varName = firstArg.value;
    const hasFallback = commaIdx !== -1;
    const fallback = hasFallback ? fn.value.slice(commaIdx + 1) : [];

    if (seen.has(varName)) {
      return [{ type: 'ident', value: '\0cycle:' + varName }];
    }

    const rawValue = style.getPropertyValue(varName);
    if (rawValue && rawValue.trim() !== '') {
      seen.add(varName);
      let componentValues = Parser.#customPropertyAstCache.get(rawValue);
      if (!componentValues) {
        componentValues = Parser.#parseValuesFromString(rawValue);
        if (Parser.#customPropertyAstCache.size >= Parser.#MAX_CACHE_SIZE) {
          const firstKey = Parser.#customPropertyAstCache.keys().next().value;
          if (firstKey !== undefined) Parser.#customPropertyAstCache.delete(firstKey);
        }
        Parser.#customPropertyAstCache.set(rawValue, componentValues);
      }

      const resolved = Parser.#resolveVariablesInComponentValues(style, componentValues, seen, envMap);
      seen.delete(varName);

      const cycleToken = resolved.find(t => t.type === 'ident' && typeof t.value === 'string' && t.value.startsWith('\0cycle:'));
      if (cycleToken) {
        if ((cycleToken.value as string).slice(7) === varName) {
          return hasFallback
            ? Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap)
            : [{ type: 'ident', value: '\0guaranteed-invalid' }];
        }
        return resolved;
      }

      if (resolved.length === 1 && resolved[0].type === 'ident' && resolved[0].value === '\0guaranteed-invalid') {
        return hasFallback ? Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap) : resolved;
      }

      const def = PropertyRegistry.get(varName);
      if (def) {
        const cleanResolved = resolved.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
        const isCSSWideKeyword = cleanResolved.length === 1 && cleanResolved[0].type === 'ident' &&
          ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(cleanResolved[0].value.toLowerCase());
        if (!isCSSWideKeyword && !matchesSyntax(cleanResolved, def.syntax || '*')) {
          return def.initialValue !== undefined
            ? Parser.#parseValuesFromString(def.initialValue)
            : [{ type: 'ident', value: '\0guaranteed-invalid' }];
        }
      }
      return resolved;
    }

    const def = PropertyRegistry.get(varName);
    if (def && def.initialValue !== undefined) {
      return Parser.#parseValuesFromString(def.initialValue);
    }

    return hasFallback
      ? Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap)
      : [{ type: 'ident', value: '\0guaranteed-invalid' }];
  }

  // https://drafts.csswg.org/css-env-1/#env-function
  static #resolveEnvFunction(style: CSSStyleDeclaration, fn: CSSFunction, seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    const identIdx = fn.value.findIndex(v => v.type === 'ident');
    if (identIdx === -1) return [fn];

    const envName = (fn.value[identIdx] as Token).value;
    const indices: string[] = [];
    for (let i = identIdx + 1; i < fn.value.length; i++) {
      const v = fn.value[i];
      if (v.type === 'comma') break;
      if (v.type === 'number') indices.push((v as Token).value.toString());
    }

    const fullKey = indices.length > 0 ? `${envName} ${indices.join(' ')}` : envName;
    const rawValue = envMap?.[fullKey];
    const commaIdx = fn.value.findIndex(v => v.type === 'comma');
    const fallback = commaIdx !== -1 ? fn.value.slice(commaIdx + 1) : [];

    if (rawValue !== undefined) {
      return Parser.#resolveVariablesInComponentValues(style, Parser.#parseValuesFromString(rawValue), seen, envMap);
    }
    return fallback.length > 0
      ? Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap)
      : [];
  }
}

// css-variables-1 § 3 Using Cascading Variables: The var() Notation #using-variables
function validateVarFunction(func: CSSFunction): boolean {
  if (func.name.toLowerCase() !== 'var') return true;
  const args = func.value;
  const commaIndex = args.findIndex(t => t.type === 'comma');
  const nameTokens = commaIndex !== -1 ? args.slice(0, commaIndex) : args;
  const nonWsNameTokens = nameTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');

  if (nonWsNameTokens.length === 0) {
    return false;
  }

  if (nonWsNameTokens.length === 1 && nonWsNameTokens[0].type === 'simple-block' && (nonWsNameTokens[0] as SimpleBlock).associatedToken?.type === '{') {
    const innerTokens = (nonWsNameTokens[0] as SimpleBlock).value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
    if (innerTokens.length === 0) {
      return false;
    }
    return true;
  }

  const hasSimpleCurlyBlock = nonWsNameTokens.some(t => t.type === 'simple-block' && (t as SimpleBlock).associatedToken?.type === '{');
  if (hasSimpleCurlyBlock) {
    return false;
  }

  return true;
}

// css-syntax-3 § 5.4.5 Consume a declaration #consume-declaration
export function validateDeclarationValue(values: ComponentValue[]): boolean {
  for (const v of values) {
    if (v.type === 'bad-string' || v.type === 'bad-url') return false;
    if (v.type === 'simple-block') {
      if (!validateDeclarationValue((v as SimpleBlock).value)) return false;
    } else if (v.type === 'function') {
      const func = v as CSSFunction;
      if (!validateVarFunction(func)) return false;
      if (!validateDeclarationValue(func.value)) return false;
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
  return Parser.parseRuleInBlockText(text, nested);
}

export function parseRuleInScopeBlock(text: string): Rule {
  return Parser.parseRuleInScopeBlockText(text);
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
    if (i >= values.length) break;
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

// Inject Parser implementations into ParseHooks to break circular dependencies
ParseHooks.parseStyleAttribute = (tokens) => new Parser(tokens).parseStyleAttribute();
ParseHooks.consumeRule = (tokens) => new Parser(tokens).consumeRule();
ParseHooks.consumeListOfRules = (tokens, topLevel) => new Parser(tokens).consumeListOfRules(topLevel);
ParseHooks.parseRule = (text) => parseRule(text);
ParseHooks.parseRuleInBlock = (text, nested) => Parser.parseRuleInBlockText(text, nested);
ParseHooks.parseRuleInScopeBlock = (text) => Parser.parseRuleInScopeBlockText(text);
ParseHooks.parseComponentValues = (tokens) => new Parser(tokens).parseComponentValues();
ParseHooks.parseSelector = (text) => Parser.parseSelector(text);
ParseHooks.parseSelectorAST = (text, declaredNamespacesOrOptions, allowRelative, allowVendorPseudos) => {
  if (declaredNamespacesOrOptions instanceof Set) {
    return Parser.parseSelectorAST(text, declaredNamespacesOrOptions, allowRelative, allowVendorPseudos);
  }
  return Parser.parseSelectorAST(text, declaredNamespacesOrOptions);
};
ParseHooks.validateCustomPropertyValue = (values) => Parser.validateCustomPropertyValue(values);
ParseHooks.validateDeclarationValue = (values) => validateDeclarationValue(values);
ParseHooks.isValidUnicodeRangeValue = (values) => isValidUnicodeRangeValue(values);
ParseHooks.assembleUnicodeRanges = (values) => assembleUnicodeRanges(values);
ParseHooks.isValidDashedIdent = (name) => Parser.isValidDashedIdent(name);

export function parse(css: string, options?: ParserOptions): CSSStyleSheet {
  return new Parser(tokenize(css), options).parseStyleSheet();
}
