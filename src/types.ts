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
import type { CSSRule as CSSRuleClass } from './rules/base.ts';
import type { CSSRuleList, MediaList } from './rules/collections.ts';
import type { CSSStyleSheet } from './CSSOM.ts';


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

export interface RuleSourceLocation {
  start: number;
  end: number;
  line: number;
  column: number;
  bodyStart?: number;
  bodyEnd?: number;
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
  slice(start: number, end: number): ComponentValue[];
}

export type ComponentValue = Token | SimpleBlock | CSSFunction;

export interface SimpleBlock {
  type: 'simple-block';
  associatedToken: Token;
  value: ComponentValue[];
  endIndex?: number;
  isClosed?: boolean;
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
  raw?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface ASTAtRule {
  type: 'at-rule';
  name: string;
  prelude: ComponentValue[];
  childRules?: (Rule | Declaration)[];
  cssRules?: CSSRuleList;
  block?: SimpleBlock;
}

export type Rule = CSSRuleClass;

export type CustomMediaQuery = MediaList | boolean;






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

export interface MediaEnvironment {
  mediaType: string;
  width: number;
  height: number;
  deviceWidth: number;
  deviceHeight: number;
  aspectRatio: [number, number];
  deviceAspectRatio: [number, number];
  orientation: 'portrait' | 'landscape';
  resolution: number; // in dpi
  color: number;
  colorIndex: number;
  monochrome: number;
  colorGamut: 'srgb' | 'p3' | 'rec2020';
  videoColorGamut: 'srgb' | 'p3' | 'rec2020';
  pointer: 'none' | 'coarse' | 'fine';
  hover: 'none' | 'hover';
  anyPointer: 'none' | 'coarse' | 'fine';
  anyHover: 'none' | 'hover';
  grid: number;
  scan: 'interlace' | 'progressive';
  update: 'none' | 'slow' | 'fast';
  overflowBlock: 'none' | 'scroll' | 'paged';
  overflowInline: 'none' | 'scroll';
  displayMode: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser' | 'window-controls-overlay' | 'borderless' | 'picture-in-picture';
  displayState: 'fullscreen' | 'maximized' | 'minimized' | 'normal';
  prefersColorScheme: 'light' | 'dark' | 'no-preference';
  uaColorScheme: 'light' | 'dark' | 'no-preference';
  prefersContrast: 'no-preference' | 'more' | 'less' | 'custom';
  prefersReducedMotion: 'no-preference' | 'reduce';
  prefersReducedTransparency: 'no-preference' | 'reduce';
  prefersReducedData: 'no-preference' | 'reduce';
  forcedColors: 'none' | 'active';
  invertedColors: 'none' | 'inverted';
  dynamicRange: 'standard' | 'high';
  videoDynamicRange: 'standard' | 'high';
  scripting: 'none' | 'initial-only' | 'enabled';
  environmentBlending: 'opaque' | 'additive' | 'subtractive';
  navControls: 'none' | 'back';
  resizable?: boolean;
  customMedia?: Record<string, boolean | string | unknown> | Map<string, boolean | string | unknown>;
}

export interface InternalRuleMetadata {
  _assignedLayerName?: string;
  _isScoped?: boolean;
  isScoped?: boolean;
  _scopeStart?: string | null;
  scopeStart?: string | null;
  _scopeEnd?: string | null;
  scopeEnd?: string | null;
  _parentStyleSheet?: CSSStyleSheet | null;
}

export interface InternalStyleSheet {
  _ownerRule?: CSSRule | null;
  _parentStyleSheet?: CSSStyleSheet | null;
  _href?: string | null;
}

export interface InternalStyleDeclaration {
  _readonly?: boolean;
  declarations?: Declaration[];
}

export interface NodeLike {
  nodeType: number;
  ownerDocument: DocumentLike | null;
  parentElement: ElementLike | null;
  parentNode: NodeLike | null;
  childNodes?: ArrayLike<unknown>;
}

export interface DocumentLike extends NodeLike {
  nodeType: 9;
  documentElement: ElementLike | null;
  head: ElementLike | null;
  body: ElementLike | null;
  title?: string;
  contentType?: string;
  location?: { hash?: string } | null;
  defaultView?: unknown;
  querySelectorAll?(selector: string): Iterable<ElementLike>;
  querySelector?(selector: string): ElementLike | null;
  getElementById?(id: string): ElementLike | null;
}

export interface ElementLike extends NodeLike {
  nodeType: 1;
  tagName: string;
  shadowRoot?: unknown;
  getAttribute(name: string): string | null;
  hasAttribute?(name: string): boolean;
  getAttributeNode?(name: string): unknown;
  classList?: { contains(token: string): boolean };
  id?: string;
  className?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  matches?(selector: string): boolean;
}

declare global {
  interface Element {
    readonly nodeType: 1;
  }
  interface Document {
    readonly nodeType: 9;
  }
}

