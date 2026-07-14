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
import type { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import type { StylePropertyMapReadOnly } from './typed-om.ts';


/**
 * CSS Token Types according to CSS Syntax Module Level 3.
 * @see https://drafts.csswg.org/css-syntax-3/#tokenization
 */
export type TokenType =
  | 'ident'
  | 'function'
  | 'at-keyword'
  | 'hash'
  | 'string'
  | 'bad-string'
  | 'url'
  | 'bad-url'
  | 'delim'
  | 'number'
  | 'percentage'
  | 'dimension'
  | 'whitespace'
  | 'CDO'
  | 'CDC'
  | 'colon'
  | 'semicolon'
  | 'comma'
  | '[' | ']' | '{' | '}' | '(' | ')'
  | 'comment'
  | 'unicode-range'
  | 'EOF';

export interface ParseError {
  message: string;
  token?: Token;
}

export interface BaseToken {
  startIndex?: number;
  endIndex?: number;
  originalText?: string;
}

export interface IdentToken extends BaseToken {
  type: 'ident';
  value: string;
}

export interface FunctionToken extends BaseToken {
  type: 'function';
  value: string;
}

export interface AtKeywordToken extends BaseToken {
  type: 'at-keyword';
  value: string;
}

export interface HashToken extends BaseToken {
  type: 'hash';
  value: string;
  hashType: 'id' | 'unrestricted';
}

export interface StringToken extends BaseToken {
  type: 'string' | 'bad-string';
  value: string;
}

export interface UrlToken extends BaseToken {
  type: 'url' | 'bad-url';
  value: string;
}

export interface DelimToken extends BaseToken {
  type: 'delim';
  value: string;
}

export interface NumberToken extends BaseToken {
  type: 'number';
  value: number;
  numberType: 'integer' | 'number';
  sign: '+' | '-' | null;
}

export interface PercentageToken extends BaseToken {
  type: 'percentage';
  value: number;
  sign: '+' | '-' | null;
}

export interface DimensionToken extends BaseToken {
  type: 'dimension';
  value: number;
  unit: string;
  numberType: 'integer' | 'number';
  sign: '+' | '-' | null;
}

export interface SimpleToken extends BaseToken {
  type: 'whitespace' | 'CDO' | 'CDC' | 'colon' | 'semicolon' | 'comma' | '[' | ']' | '{' | '}' | '(' | ')';
  value: string;
}

export interface CommentToken extends BaseToken {
  type: 'comment';
  value: string;
}

export interface UnicodeRangeToken extends BaseToken {
  type: 'unicode-range';
  value: string;
  unicodeRangeStart: number;
  unicodeRangeEnd: number;
}

export interface EOFToken extends BaseToken {
  type: 'EOF';
  value: '';
}

export type Token =
  | IdentToken
  | FunctionToken
  | AtKeywordToken
  | HashToken
  | StringToken
  | UrlToken
  | DelimToken
  | NumberToken
  | PercentageToken
  | DimensionToken
  | SimpleToken
  | CommentToken
  | UnicodeRangeToken
  | EOFToken;


export interface TokenStream {
  next(): Token;
  peek(): Token;
}

export interface ComponentValueStream {
  next(): ComponentValue;
  peek(): ComponentValue;
  position: number;
}

export type ComponentValue = Token | SimpleBlock | CSSFunction;

export interface SimpleBlock {
  type: 'simple-block';
  associatedToken: Token;
  value: ComponentValue[];
}

export interface CSSFunction {
  type: 'function';
  name: string;
  value: ComponentValue[];
}

export interface Declaration {
  type: 'declaration';
  name: string;
  value: ComponentValue[];
  important: boolean;
}

export interface ASTAtRule {
  type: 'at-rule';
  name: string;
  prelude: ComponentValue[];
  childRules?: (ASTAtRule | CSSRule)[];
  cssRules?: CSSRuleList;
  block?: SimpleBlock;
}

export type Rule = ASTAtRule | CSSRule;

/**
 * CSSOM Interfaces according to CSSOM spec.
 * @see https://drafts.csswg.org/cssom-1/
 */

export interface StyleSheet {
  readonly type: string;
  readonly href: string | null;
  readonly ownerNode: unknown | null; // Element or ProcessingInstruction in DOM
  readonly parentStyleSheet: StyleSheet | null;
  readonly title: string | null;
  media: MediaList;
  disabled: boolean;
}

export interface CSSStyleSheet extends StyleSheet {
  readonly ownerRule: CSSRule | null;
  readonly cssRules: CSSRuleList;
  insertRule(rule: string, index?: number): number;
  deleteRule(index: number): void;
  replace(text: string): Promise<CSSStyleSheet>;
  replaceSync(text: string): void;
  
  // Legacy members
  readonly rules: CSSRuleList;
  addRule(selector?: string, style?: string, index?: number): number;
  removeRule(index?: number): void;
}

export interface StyleSheetList {
  readonly length: number;
  item(index: number): CSSStyleSheet | null;
  [index: number]: CSSStyleSheet;
}

export interface LinkStyle {
  readonly sheet: StyleSheet | null;
}

export interface CSSRuleList {
  readonly length: number;
  item(index: number): CSSRule | null;
  [index: number]: CSSRule;
}

export interface CSSRuleConstants {
  readonly STYLE_RULE: number;
  readonly CHARSET_RULE: number;
  readonly IMPORT_RULE: number;
  readonly MEDIA_RULE: number;
  readonly FONT_FACE_RULE: number;
  readonly PAGE_RULE: number;
  readonly KEYFRAMES_RULE: number;
  readonly KEYFRAME_RULE: number;
  readonly MARGIN_RULE: number;
  readonly NAMESPACE_RULE: number;
}

export interface CSSRule extends CSSRuleConstants {
  cssText: string;
  readonly parentRule: CSSRule | null;
  readonly parentStyleSheet: CSSStyleSheet | null;
  readonly type: number; // Historical
}

export interface CSSRuleConstructor extends CSSRuleConstants {
  readonly prototype: CSSRule;
}


export interface CSSGroupingRule extends CSSRule {
  readonly cssRules: CSSRuleList;
  insertRule(rule: string, index?: number): number;
  deleteRule(index: number): void;
}

export interface CSSStyleRule extends CSSGroupingRule {
  selectorText: string;
  readonly style: CSSStyleDeclaration;
  readonly styleMap: StylePropertyMapReadOnly;
}

export interface CSSMediaRule extends CSSGroupingRule {
  readonly media: MediaList;
}

export interface CSSSupportsRule extends CSSGroupingRule {
  readonly conditionText: string;
}

export interface CSSContainerRule extends CSSGroupingRule {
  readonly containerQuery: string;
}

export interface CSSLayerBlockRule extends CSSGroupingRule {
  readonly name: string;
}

export interface CSSLayerStatementRule extends CSSRule {
  readonly nameList: readonly string[];
}

export interface CSSStartingStyleRule extends CSSGroupingRule {}

export interface CSSScopeRule extends CSSGroupingRule {
  readonly startSelector: string | null;
  readonly endSelector: string | null;
}

export interface CSSViewTransitionRule extends CSSRule {
  readonly navigation: string;
}

export interface CSSPropertyRule extends CSSRule {
  readonly name: string;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string | null;
}

export interface MediaList {
  mediaText: string;
  readonly length: number;
  item(index: number): string | null;
  appendMedium(medium: string): void;
  deleteMedium(medium: string): void;
  [index: number]: string;
}

export interface CSSImportRule extends CSSRule {
  readonly href: string;
  media: MediaList;
  readonly styleSheet: CSSStyleSheet | null;
  readonly layerName: string | null;
  readonly supportsText: string | null;
}

export interface CSSNamespaceRule extends CSSRule {
  readonly namespaceURI: string;
  readonly prefix: string;
}

export interface CSSKeyframesRule extends CSSRule {
  name: string;
  readonly cssRules: CSSRuleList;
  readonly length: number;
}

export interface CSSKeyframeRule extends CSSRule {
  keyText: string;
  readonly style: CSSStyleDeclaration;
}

export interface CSSFontFaceDescriptors extends CSSStyleDeclaration {
  src?: string;
  fontDisplay?: string;
  unicodeRange?: string;
}

export interface CSSPageDescriptors extends CSSStyleDeclaration {
  margin: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  'margin-top': string;
  'margin-right': string;
  'margin-bottom': string;
  'margin-left': string;
  size: string;
  pageOrientation: string;
  'page-orientation': string;
  marks: string;
  bleed: string;
  pageMarginSafety?: string;
}

export interface CSSMarginDescriptors extends CSSStyleDeclaration {}

export interface CSSFontFaceRule extends CSSRule {
  readonly style: CSSFontFaceDescriptors;
}

export interface CSSPageRule extends CSSGroupingRule {
  selectorText: string;
  readonly style: CSSPageDescriptors;
}

export interface CSSMarginRule extends CSSRule {
  readonly name: string;
  readonly style: CSSMarginDescriptors;
}

export interface CSSNestedDeclarations extends CSSRule {
  readonly style: CSSStyleDeclaration;
}






/**
 * Structured Selector AST
 * @see https://drafts.csswg.org/selectors-4/#grammar
 */
export interface SelectorList {
  type: 'selector-list';
  selectors: (ComplexSelector | InvalidSelector)[];
}

export interface ComplexSelector {
  type: 'complex-selector';
  items: (CompoundSelector | Combinator)[];
  tokens: ComponentValue[];
}

export interface InvalidSelector {
  type: 'invalid-selector';
  tokens: ComponentValue[];
}


export type Combinator = { type: 'combinator', value: ' ' | '>' | '+' | '~' | '||' };

export interface CompoundSelector {
  type: 'compound-selector';
  selectors: SimpleSelector[];
}

export type SimpleSelector =
  | TypeSelector
  | UniversalSelector
  | IDSelector
  | ClassSelector
  | AttributeSelector
  | PseudoClassSelector
  | PseudoElementSelector
  | NestingSelector;

export interface TypeSelector {
  type: 'type-selector';
  name: string;
  namespace?: string;
}

export interface UniversalSelector {
  type: 'universal-selector';
  namespace?: string;
}

export interface IDSelector {
  type: 'id-selector';
  name: string;
}

export interface ClassSelector {
  type: 'class-selector';
  name: string;
}

export interface AttributeSelector {
  type: 'attribute-selector';
  name: string;
  namespace?: string;
  operator?: string;
  value?: string;
  flags?: string;
}

export interface PseudoClassSelector {
  type: 'pseudo-class-selector';
  name: string;
  argument?: ComponentValue[] | SelectorList;
  nth?: ComponentValue[];
}

export interface PseudoElementSelector {
  type: 'pseudo-element-selector';
  name: string;
  argument?: ComponentValue[] | SelectorList;
  nth?: ComponentValue[];
}

export interface NestingSelector {
  type: 'nesting-selector';
}

/**
 * Structured Media Query AST for <general-enclosed>
 * @see https://drafts.csswg.org/mediaqueries-4/#mq-syntax
 */
export interface GeneralEnclosed {
  type: 'general-enclosed';
  name?: string;
  value: ComponentValue[];
}

export interface MediaFeature {
  type: 'media-feature';
  name: string;
  value?: ComponentValue[];
  operator?: string;
  range?: {
    leftValue: ComponentValue[];
    leftOp: string;
    rightOp: string;
    rightValue: ComponentValue[];
  };
  tokens: ComponentValue[];
}

export interface MediaCondition {
  type: 'media-condition';
  operator?: 'and' | 'or' | 'not';
  children: (MediaCondition | MediaFeature | GeneralEnclosed)[];
}

export interface MediaQuery {
  type: 'media-query';
  modifier?: 'not' | 'only';
  mediaType?: string;
  condition?: MediaCondition | MediaFeature | GeneralEnclosed;
  tokens: ComponentValue[];
  invalid?: boolean;
}

export interface MediaQueryList {
  type: 'media-query-list';
  queries: MediaQuery[];
}


