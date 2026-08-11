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
import type { Token, TokenStream, ComponentValue, ComponentValueStream, SimpleBlock, CSSFunction, Declaration, ASTAtRule, Rule, ParseError, StringToken, FunctionToken } from './types.ts';


import { serialize, getOriginalText, getMirrorToken } from './serializer.ts';

import { tokenize } from './tokenizer.ts';
import { CSSFontFaceRule, CSSPageRule, CSSAtRule, CSSStyleSheet, CSSStyleRule, CSSMediaRule, CSSSupportsRule, CSSContainerRule, CSSLayerBlockRule, CSSLayerStatementRule, CSSStartingStyleRule, CSSViewTransitionRule, CSSKeyframesRule, CSSKeyframeRule, CSSNestedDeclarations, CSSRule, CSSMarginRule, CSSImportRule, CSSNamespaceRule, CSSPropertyRule, CSSScopeRule, CSSCounterStyleRule, CSSFontFeatureValuesRule } from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { ArrayTokenStream, ArrayComponentValueStream, LazyComponentValueStream } from './TokenStream.ts';

export interface ParserOptions {
  atRules?: Record<string, string>;
}
import { SelectorParser } from './SelectorParser.ts';
import { calculateSpecificity } from './specificity.ts';
import { getCascadedStyle } from './cascade.ts';
import { ParseHooks } from './parse-hooks.ts';
import { PropertyRegistry, matchesSyntax } from './PropertyRegistry.ts';



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
    media: (parser, rule, block, nested) => block ? parser.handleMediaRule(rule, block, nested || false) : null,
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

  private isSupportedAtRule(name: string): boolean {
    if (name === 'mediaall') return false;
    if (name.startsWith('--')) return false;
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


  /**
   * Parse a list of component values.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-a-list-of-component-values
   */
  // 5.4.9 Parse a list of component values https://drafts.csswg.org/css-syntax/#parse-list-of-component-values
  public parseComponentValues(): ComponentValue[] {
    const values: ComponentValue[] = [];
    while (this.nextToken.type !== 'EOF') {
      values.push(this.consumeComponentValue());
    }
    return values;
  }

  /**
   * Parse a comma-separated list of component values.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-comma-separated-list-of-component-values
   */
  // 5.4.10 Parse a comma-separated list of component values https://drafts.csswg.org/css-syntax/#parse-comma-separated-list-of-component-values
  public parseCommaSeparatedListOfComponentValues(): ComponentValue[][] {
    const values = this.parseComponentValues();
    const result: ComponentValue[][] = [[]];
    for (const v of values) {
      if (v.type === 'comma') {
        result.push([]);
      } else {
        result[result.length - 1].push(v);
      }
    }
    return result;
  }

  /**
   * Parse a stylesheet.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-a-stylesheet
   */
  // 5.4.3 Parse a stylesheet https://drafts.csswg.org/css-syntax/#parse-stylesheet
  public parseStyleSheet(): CSSStyleSheet {
    const rules = this.consumeListOfRules(true);
    return CSSStyleSheet.createInternal(rules, parseRule);
  }

  public parseRule(ruleString: string): Rule | null {
    const errors: ParseError[] = [];
    const tokens = tokenize(ruleString, false, errors);
    const parser = new Parser(tokens);
    parser.errors.push(...errors);
    const rule = parser.consumeRule();
    
    // Check for trailing garbage
    while (parser.nextToken.type === 'whitespace') {
      parser.discardToken();
    }
    if (parser.nextToken.type !== 'EOF') {
      throw new DOMException('Syntax error', 'SyntaxError');
    }
    
    return rule;
  }

  /**
   * Parse a list of declarations (style attribute value).
   * @see https://drafts.csswg.org/css-syntax-3/#parse-a-list-of-declarations
   */
  // 5.4.5 Parse a list of declarations https://drafts.csswg.org/css-syntax/#parse-block-contents
  public parseStyleAttribute(): CSSStyleDeclaration {
    const componentValues = this.parseComponentValues();
    const declarations = this.consumeDeclarationsFromBlockContents(componentValues);
    
    return new CSSStyleDeclaration(declarations);
  }

  /**
   * Parse a stylesheet's contents.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-stylesheet-contents
   */
  // 5.4.4 Parse a stylesheet's contents https://drafts.csswg.org/css-syntax/#parse-stylesheet-contents
  public parseStyleSheetContents(): Rule[] {
    return this.consumeListOfRules(true);
  }

  /**
   * Parse a block's contents.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-block-contents
   */
  // 5.4.5 Parse a block's contents https://drafts.csswg.org/css-syntax/#parse-block-contents
  public parseBlockContents(): Rule[] {
    const values = this.parseComponentValues();
    return this.consumeBlockContents(new ArrayComponentValueStream(values), true);
  }

  /**
   * Parse a declaration.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-declaration
   */
  // 5.4.7 Parse a declaration https://drafts.csswg.org/css-syntax/#parse-declaration
  public parseDeclaration(): Declaration | null {
    while (this.nextToken.type === 'whitespace') {
      this.discardToken();
    }
    if (this.nextToken.type !== 'ident') {
      return null;
    }
    const stream = new LazyComponentValueStream(() => this.consumeComponentValue(), 'EOF');
    return this.consumeDeclarationFromStream(stream);
  }

  /**
   * Parse a component value.
   * @see https://drafts.csswg.org/css-syntax-3/#parse-component-value
   */
  // 5.4.8 Parse a component value https://drafts.csswg.org/css-syntax/#parse-component-value
  public parseComponentValue(): ComponentValue | null {
    while (true) {
      const token = this.nextToken;
      if (token.type === 'whitespace') {
        this.discardToken();
      } else {
        break;
      }
    }
    
    if (this.nextToken.type === 'EOF') {
      return null;
    }
    
    const value = this.consumeComponentValue();
    
    while (true) {
      const token = this.nextToken;
      if (token.type === 'whitespace') {
        this.discardToken();
      } else {
        break;
      }
    }
    
    const finalToken = this.nextToken;
    if ((finalToken as Token).type === 'EOF') {
      return value;
    }

    return null;
  }

  /**
   * Consume a list of rules.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-list-of-rules
   */
  // 5.5.1 Consume a stylesheet's contents https://drafts.csswg.org/css-syntax/#consume-stylesheet-contents
  public consumeListOfRules(topLevel: boolean): Rule[] {
    const rules: Rule[] = [];
    while (true) {
      const token = this.nextToken;
      if (token.type === 'whitespace') {
        this.discardToken();
      } else if (token.type === 'EOF') {
        return rules;
      } else if (token.type === 'CDO' || token.type === 'CDC') {
        if (topLevel) {
          this.discardToken();
        } else {
          const rule = this.consumeRule();
          if (rule) rules.push(rule);
        }
      } else {
        const rule = this.consumeRule();
        if (rule) rules.push(rule);
      }
    }
  }

  /**
   * Consume a rule.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-rule
   * // 5.4.6 https://drafts.csswg.org/css-syntax/#parse-rule
   */
  public consumeRule(nested: boolean = false): Rule | null {
    while (this.nextToken.type === 'whitespace') {
      this.discardToken();
    }
    if (this.nextToken.type === 'EOF') {
      return null;
    }
    if (this.nextToken.type === 'at-keyword') {
      return this.consumeAtRule(nested);
    } else {
      return this.consumeQualifiedRule(nested);
    }
  }


  /**
   * Consume an at-rule.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-at-rule
   */
  // 5.5.2 Consume an at-rule https://drafts.csswg.org/css-syntax/#consume-at-rule
  private consumeAtRule(nested: boolean = false): Rule | null {
    const token = this.consumeToken();
    if (token.type !== 'at-keyword') return null;
    const atRuleName = token.value;
    const rule: ASTAtRule = {
      type: 'at-rule',
      name: atRuleName,
      prelude: [],
      childRules: [],
    };


    while (true) {
      const next = this.nextToken;
      if (next.type === 'semicolon' || next.type === 'EOF') {
        this.discardToken();
        if (!this.isSupportedAtRule(atRuleName)) return null;
        const handler = this.getAtRuleHandler(atRuleName);
        if (handler) {
          return handler(this, rule);
        }

        return new CSSAtRule(rule.name, rule.prelude);
      } else if (next.type === '}') {
        if (nested) return null;
        this.consumeToken();
        rule.prelude.push(next);
      } else if (next.type === '{') {
        const block = this.consumeBlock(this.consumeToken());
        if (!this.isSupportedAtRule(atRuleName)) return null;
        
        const handler = this.getAtRuleHandler(atRuleName);
        if (handler) {
          return handler(this, rule, block, nested);
        }

        if (this.options?.atRules?.[atRuleName]) {
          const type = this.options.atRules[atRuleName];
          if (type === 'declaration') {
            const decls = this.consumeDeclarationsFromBlockContents(block.value);
            rule.childRules = decls as unknown as Rule[];
            return rule as unknown as Rule;
          } else if (type === 'rule') {
            const rules = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
            rule.childRules = rules;
            return rule as unknown as Rule;
          }
        }
        
        return new CSSAtRule(rule.name, rule.prelude, block);
      } else {
        rule.prelude.push(this.consumeComponentValue());
      }
    }
  }




  private consumeNestedRules(block: SimpleBlock, nested: boolean): Rule[] {
    return this.consumeBlockContents(new ArrayComponentValueStream(block.value), nested);
  }


  private handleMediaRule(rule: ASTAtRule, block: SimpleBlock, nested: boolean): Rule | null {
    return this.handleGroupingAtRule(rule, block, nested, CSSMediaRule);
  }

  private handleGroupingAtRule(rule: ASTAtRule, block: SimpleBlock | undefined, nested: boolean, ctor: new (prelude: string, rules: Rule[], parseRuleInBlock: (text: string) => Rule) => Rule): Rule | null {
    if (!block) return null;
    const childRules = this.consumeNestedRules(block, nested);
    return new ctor(serialize(rule.prelude).trim(), childRules, parseRuleInBlock);
  }

  private handleLayerRule(rule: ASTAtRule, block?: SimpleBlock, nested: boolean = false): Rule | null {
    if (block) {
      return this.handleGroupingAtRule(rule, block, nested, CSSLayerBlockRule);
    }
    const nameList = serialize(rule.prelude).trim().split(',').map(s => s.trim()).filter(s => s.length > 0);
    return new CSSLayerStatementRule(nameList);
  }

  private handleScopeRule(rule: ASTAtRule, block?: SimpleBlock, nested: boolean = false): Rule | null {
    if (!block) return null;
    const childRules = this.consumeNestedRules(block, nested);
    
    let startSelector: string | null = null;
    let endSelector: string | null = null;
    
    const prelude = rule.prelude;
    let i = 0;
    while (i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    if (i < prelude.length && prelude[i].type === 'simple-block' && (prelude[i] as SimpleBlock).associatedToken.type === '(') {
      const block = prelude[i] as SimpleBlock;
      try {
        new SelectorParser(block.value, {
          allowRelative: nested,
          declaredNamespaces: this.declaredNamespaces
        }).parse();
        startSelector = serialize(block.value).trim();
      } catch (e) {
        return null;
      }
      if (startSelector) {
        startSelector = `(${startSelector})`;
      }
      i++;
    }
    
    while (i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    if (i < prelude.length && prelude[i].type === 'ident' && String((prelude[i] as Token).value).toLowerCase() === 'to') {
      i++;
      while (i < prelude.length && prelude[i].type === 'whitespace') i++;
      if (i < prelude.length && prelude[i].type === 'simple-block' && (prelude[i] as SimpleBlock).associatedToken.type === '(') {
        const block = prelude[i] as SimpleBlock;
        try {
          new SelectorParser(block.value, {
            declaredNamespaces: this.declaredNamespaces
          }).parse();
          endSelector = serialize(block.value).trim();
        } catch (e) {
          return null;
        }
        if (endSelector) {
          endSelector = `(${endSelector})`;
        }
        i++;
      }
    }
    
    return new CSSScopeRule(startSelector, endSelector, childRules as unknown as Rule[], parseRuleInBlock);
  }

  private handleViewTransitionRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    return new CSSViewTransitionRule(declarations);
  }

  private handleKeyframesRule(rule: ASTAtRule, block: SimpleBlock): Rule | null {
    const preludeClean = rule.prelude.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (preludeClean.length !== 1) {
      return null;
    }
    const first = preludeClean[0];
    let keyframesName = '';
    if (first.type === 'ident') {
      const valLower = first.value.toLowerCase();
      const disallowed = ['none', 'initial', 'inherit', 'unset', 'revert', 'default'];
      if (disallowed.includes(valLower)) {
        return null;
      }
      keyframesName = first.value;
    } else if (first.type === 'string') {
      if (first.value === '') {
        return null;
      }
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
          stream.next();
          blockVal = next as SimpleBlock;
          break;
        } else {
          prelude.push(stream.next());
        }
      }
      
      if (blockVal) {
        const lists: ComponentValue[][] = [[]];
        for (const v of prelude) {
          if (v.type === 'comma') {
            lists.push([]);
          } else {
            lists[lists.length - 1].push(v);
          }
        }
        
        let valid = true;
        const normalizedParts: string[] = [];
        for (const list of lists) {
          let start = 0;
          while (start < list.length && list[start].type === 'whitespace') start++;
          let end = list.length - 1;
          while (end >= start && list[end].type === 'whitespace') end--;
          
          const trimmed = list.slice(start, end + 1);
          if (trimmed.length !== 1) {
            valid = false;
            break;
          }
          const v = trimmed[0];
          if (v.type === 'ident') {
            const valStr = v.value.toLowerCase();
            if (valStr === 'from') {
              normalizedParts.push('0%');
            } else if (valStr === 'to') {
              normalizedParts.push('100%');
            } else {
              valid = false;
              break;
            }
          } else if (v.type === 'percentage') {
            const val = (v as import('./types.ts').PercentageToken).value;
            if (val < 0 || val > 100) {
              valid = false;
              break;
            }
            normalizedParts.push(`${val}%`);
          } else {
            valid = false;
            break;
          }
        }
        
        if (valid && normalizedParts.length > 0) {
          const selectorText = normalizedParts.join(', ');
          const declarations = this.consumeDeclarationsFromBlockContents(blockVal.value);
          keyframeRules.push(new CSSKeyframeRule(selectorText, declarations));
        }
      } else {
        break;
      }
    }

    return new CSSKeyframesRule(keyframesName, keyframeRules);
  }

  private handleFontFaceRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    return new CSSFontFaceRule(declarations);
  }

  private handlePageRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const blockContents = this.consumeBlockContents(new ArrayComponentValueStream(block.value), true);
    const declarations: import('./types.ts').Declaration[] = [];
    const nestedRules: Rule[] = [];
    
    let isFirst = true;
    for (const item of blockContents) {
      if (isFirst && item instanceof CSSNestedDeclarations) {
        declarations.push(...item.style.declarations);
      } else {
        nestedRules.push(item);
      }
      isFirst = false;
    }
    
    return new CSSPageRule(serialize(rule.prelude).trim(), declarations, nestedRules, parseRule);
  }

  private handleMarginRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    return new CSSMarginRule(rule.name, declarations);
  }

  // css-counter-styles-3 § 8.1 #csscounterstylerule
  private handleCounterStyleRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const name = serialize(rule.prelude).trim();
    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    return new CSSCounterStyleRule(name, declarations);
  }

  // css-fonts-4 § 8 #cssfontfeaturevaluesrule-interface
  private handleFontFeatureValuesRule(rule: ASTAtRule, block: SimpleBlock): Rule {
    const fontFamily = serialize(rule.prelude).trim();
    const fontFeatureRule = new CSSFontFeatureValuesRule(fontFamily);

    // Consume feature value blocks inside @font-feature-values body
    const stream = new ArrayComponentValueStream(block.value);
    while (stream.peek().type !== 'EOF') {
      const token = stream.peek();
      if (token.type === 'whitespace' || token.type === 'comment') {
        stream.next();
        continue;
      }
      if (token.type === 'at-keyword') {
        const atToken = stream.next() as import('./types.ts').AtKeywordToken;
        const blockName = atToken.value.toLowerCase();
        // Skip whitespace
        while (stream.peek().type === 'whitespace' || stream.peek().type === 'comment') {
          stream.next();
        }
        const next = stream.peek();
        if (next.type === 'simple-block' && (next as SimpleBlock).associatedToken.type === '{') {
          const childBlock = stream.next() as SimpleBlock;
          const decls = this.consumeDeclarationsFromBlockContents(childBlock.value);
          for (const d of decls) {
            const values = d.value
              .filter(v => v.type === 'number')
              .map(v => (v as import('./types.ts').NumberToken).value);

            if (blockName === 'annotation') {
              fontFeatureRule.annotation.set(d.name, values);
            } else if (blockName === 'ornaments') {
              fontFeatureRule.ornaments.set(d.name, values);
            } else if (blockName === 'stylistic') {
              fontFeatureRule.stylistic.set(d.name, values);
            } else if (blockName === 'swash') {
              fontFeatureRule.swash.set(d.name, values);
            } else if (blockName === 'character-variant' || blockName === 'charactervariant') {
              fontFeatureRule.characterVariant.set(d.name, values);
            } else if (blockName === 'styleset') {
              fontFeatureRule.styleset.set(d.name, values);
            } else if (blockName === 'historical-forms' || blockName === 'historicalforms') {
              fontFeatureRule.historicalForms.set(d.name, values);
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
    const prelude = rule.prelude;
    let name = '';
    let hasName = false;
    
    for (const v of prelude) {
      if (v.type === 'whitespace') continue;
      if (!hasName && v.type === 'ident' && v.value.startsWith('--') && v.value !== '--') {
        name = v.value;
        hasName = true;
      } else {
        return null;
      }
    }
    
    if (!hasName) return null;

    const declarations = this.consumeDeclarationsFromBlockContents(block.value);
    let syntax: string | null = null;
    let inherits: boolean | null = null;
    let initialValue: string | null = null;

    for (const d of declarations) {
      const val = serialize(d.value).trim();
      const descName = d.name.toLowerCase();
      if (descName === 'syntax') {
        const nonWsTokens = d.value.filter(v => v.type !== 'whitespace');
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
      PropertyRegistry.validate({
        name,
        syntax,
        inherits,
        initialValue: initialValue ?? undefined
      });
    } catch (e) {
      // @property rule is invalid if validation fails
      return null;
    }

    return new CSSPropertyRule(name, syntax, inherits, initialValue);
  }

  private handleImportRule(rule: ASTAtRule): Rule {
    let href = '';
    let mediaText = '';
    let layerName: string | null = null;
    let supportsText: string | null = null;
    
    const prelude = rule.prelude;
    let i = 0;
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    if (i < prelude.length) {
      const first = prelude[i];
      if (first.type === 'string') {
        href = first.value;
        i++;
      } else if (first.type === 'function' && (first as CSSFunction).name === 'url') {
         // handle url()
         const urlArg = (first as CSSFunction).value.find(v => v.type === 'string');
         if (urlArg) href = (urlArg as StringToken).value;

         else {
            // raw url
            const raw = (first as CSSFunction).value.map(v => serialize([v])).join('');
            href = raw.trim();
         }
         i++;
      }
    }
    
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    // Parse layer
    if (i < prelude.length) {
      const val = prelude[i];
      if (val.type === 'ident' && val.value.toLowerCase() === 'layer') {
        layerName = '';
        i++;

      } else if (val.type === 'function' && (val as CSSFunction).name.toLowerCase() === 'layer') {
        layerName = serialize((val as CSSFunction).value).trim();
        i++;
      }
    }
    
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    // Parse supports
    if (i < prelude.length) {
      const val = prelude[i];
      if (val.type === 'function' && (val as CSSFunction).name.toLowerCase() === 'supports') {
        supportsText = serialize((val as CSSFunction).value).trim();
        i++;
      }
    }
    
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    // The rest is media query list
    let remaining = '';
    while (i < prelude.length) {
       remaining += serialize([prelude[i]]);
       i++;
    }
    mediaText = remaining.trim();
    
    return new CSSImportRule(href, mediaText, layerName, supportsText);
  }

  private handleNamespaceRule(rule: ASTAtRule): Rule {
    let prefix = '';
    let namespaceURI = '';
    const prelude = rule.prelude;
    let i = 0;
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    const val = prelude[i];
    if (val && val.type === 'ident') {
      prefix = val.value;
      i++;
    }


    
    while(i < prelude.length && prelude[i].type === 'whitespace') i++;
    
    if (i < prelude.length) {
      const val = prelude[i];
      if (val.type === 'string') {
        namespaceURI = val.value;
      } else if (val.type === 'function' && (val as CSSFunction).name === 'url') {
         const urlArg = (val as CSSFunction).value.find(v => v.type === 'string');
         if (urlArg) namespaceURI = (urlArg as StringToken).value;

         else {
            const raw = (val as CSSFunction).value.map(v => serialize([v])).join('');
            namespaceURI = raw.trim();
         }
      }
    }
    const nsRule = new CSSNamespaceRule(prefix, namespaceURI);
    this.declaredNamespaces.add(nsRule.prefix);
    return nsRule;
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
        this.consumeToken(); // Consume '{'
        const stream = new LazyComponentValueStream(() => this.consumeComponentValue(), '}');
        const blockContents = this.consumeBlockContents(stream, true);
        return this.createStyleRule(prelude, blockContents, nested);

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
    const rules = this.consumeBlockContents(new ArrayComponentValueStream(values), true);
    const declarations: Declaration[] = [];
    for (const rule of rules) {
      if (rule instanceof CSSNestedDeclarations) {
        declarations.push(...rule.style.declarations);
      }
    }
    return declarations;
  }

  private consumeBlockContents(stream: ComponentValueStream, nested: boolean = false, isNestedStyleRule: boolean = nested): Rule[] {
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
        const pos = stream.position;
        const atRule = this.consumeAtRuleFromStream(stream, nested);
        if (atRule) {
          flushDecls();
          rules.push(atRule);
        } else {
          if (stream.position > pos) {
            flushDecls();
          }
        }
      } else {
        const pos = stream.position;
        const decl = nested ? this.consumeDeclarationFromStream(stream) : null;
        if (decl) {
          decls.push(decl);
        } else {
          stream.position = pos;
          const rule = this.consumeNestedQualifiedRuleFromStream(stream, isNestedStyleRule, 'semicolon');
          if (rule) {
            flushDecls();
            rules.push(rule);
          } else {
            const consumedTokens = stream.slice(pos, stream.position);
            const hasRealTokens = consumedTokens.some(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'semicolon');
            if (hasRealTokens) {
              flushDecls();
            }
          }
        }
      }
    }
    flushDecls();
    return rules;
  }

  private consumeDeclarationFromStream(stream: ComponentValueStream): Declaration | null {
    const firstValue = stream.peek();
    if (firstValue.type !== 'ident') return null;
    stream.next();
    const name = firstValue.value;

    
    if (name === '--') {
      return null;
    }
    
    while (stream.peek().type === 'whitespace') {
      stream.next();
    }
    
    if (stream.peek().type !== 'colon') {
      return null;
    }
    stream.next();
    
    while (stream.peek().type === 'whitespace') {
      stream.next();
    }
    
    const declValue: ComponentValue[] = [];
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === 'semicolon') {
        break;
      }
      declValue.push(stream.next());
    }
    
    let important = false;
    let lastIndex = declValue.length - 1;
    
    const lastNonWsIndex = (end: number) => {
      let j = end;
      while (j >= 0 && declValue[j].type === 'whitespace') {
        j--;
      }
      return j;
    };
    
    const i1 = lastNonWsIndex(lastIndex);
    const t1 = declValue[i1];
    if (i1 >= 0 && t1 && t1.type === 'ident' && t1.value.toLowerCase() === 'important') {
      const i2 = lastNonWsIndex(i1 - 1);
      const t2 = declValue[i2];
      if (i2 >= 0 && t2 && t2.type === 'delim' && t2.value === '!') {

        important = true;
        declValue.splice(i2);
        while (declValue.length > 0 && declValue[declValue.length - 1].type === 'whitespace') {
          declValue.pop();
        }
      }
    }

    if (!name.startsWith('--')) {
      const hasCurlyBlock = declValue.some(v => v.type === 'simple-block' && (v as SimpleBlock).associatedToken.type === '{');
      if (hasCurlyBlock) {
        const nonWsCount = declValue.reduce((count, v) => v.type !== 'whitespace' ? count + 1 : count, 0);
        if (nonWsCount > 1) {
          return null;
        }
      }
    }
    if (name.startsWith('--')) {
      if (!Parser.validateCustomPropertyValue(declValue)) {
        return null;
      }
    } else if (name.toLowerCase() === 'unicode-range') {
      const text = getOriginalText(declValue);
      const errors: ParseError[] = [];
      const reTokens = tokenize(text, true, errors);
      const reParser = new Parser(reTokens);
      reParser.errors.push(...errors);
      const reParsed = reParser.parseComponentValues();
      this.errors.push(...reParser.errors);
      declValue.splice(0, declValue.length, ...reParsed);
    }

    return {
      type: 'declaration',
      name: name,
      value: declValue,
      important: important,
    };
  }
  public static isValidDashedIdent(name: string): boolean {
    if (!name.startsWith('--') || name === '--') return false;
    const tokens = tokenize(name);
    return tokens.length === 2 && tokens[0].type === 'ident' && tokens[0].value === name && tokens[1].type === 'EOF';
  }

  public static isCustomPropertyDeclaration(prelude: ComponentValue[]): boolean {
    let idx = 0;
    while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
    if (idx >= prelude.length) return false;
    const firstNonWs = prelude[idx++];
    while (idx < prelude.length && prelude[idx].type === 'whitespace') idx++;
    if (idx >= prelude.length) return false;
    const secondNonWs = prelude[idx++];

    return (
      firstNonWs.type === 'ident' &&
      firstNonWs.value.startsWith('--') &&
      secondNonWs.type === 'colon'
    );

  }

  public static validateCustomPropertyValue(values: ComponentValue[], topLevel = true): boolean {
    for (const v of values) {
      if (v.type === 'bad-string' || v.type === 'bad-url') return false;
      if (v.type === ')' || v.type === ']' || v.type === '}') return false;
      if (topLevel && v.type === 'delim' && (v as Token).value === '!') return false;
      if (topLevel && v.type === 'semicolon') return false;
      
      if (v.type === 'simple-block') {
        if (!Parser.validateCustomPropertyValue((v as SimpleBlock).value, false)) return false;
      } else if (v.type === 'function') {
        const func = v as CSSFunction;
        if (!Parser.validateCustomPropertyValue(func.value, false)) return false;
        

      }
    }
    return true;
  }

  private consumeNestedQualifiedRuleFromStream(stream: ComponentValueStream, nested: boolean = true, stopToken?: string): Rule | null {
    const prelude: ComponentValue[] = [];
    
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === '}') {
        return null;
      }
      if (stopToken && val.type === stopToken) {
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
        const rule = this.createStyleRule(prelude, blockContents, nested);
        if (!rule) return null;
        return rule;
      } else {
        prelude.push(stream.next());
      }
    }
  }

  private consumeAtRuleFromStream(stream: ComponentValueStream, nested: boolean = false): Rule | null {
    const token = stream.next();
    if (token.type !== 'at-keyword') return null;
    const atRuleName = token.value;

    const rule: ASTAtRule = {
      type: 'at-rule',
      name: atRuleName,
      prelude: [],
      childRules: [],
    };
    
    while (true) {
      const val = stream.peek();
      if (val.type === 'semicolon') {
        stream.next();
        if (!this.isSupportedAtRule(atRuleName)) return null;
        const handler = this.getAtRuleHandler(atRuleName);
        if (handler) {
            const handledRule = handler(this, rule);
            if (!handledRule) return null;
            return handledRule;
        }

        return new CSSAtRule(rule.name, rule.prelude);
      } else if (val.type === 'EOF' || val.type === '}') {
        if (!this.isSupportedAtRule(atRuleName)) return null;
        const handler = this.getAtRuleHandler(atRuleName);
        if (handler) {
            const handledRule = handler(this, rule);
            if (!handledRule) return null;
            return handledRule;
        }

        return new CSSAtRule(rule.name, rule.prelude);
      } else if (val.type === 'simple-block' && (val as SimpleBlock).associatedToken.type === '{') {
        stream.next();
        const block = val as SimpleBlock;
        if (!this.isSupportedAtRule(atRuleName)) return null;
        
        const handler = this.getAtRuleHandler(atRuleName);
        if (handler) {
            const handledRule = handler(this, rule, block, nested);
            if (!handledRule) return null;
            return handledRule;
        }
        
        rule.childRules = this.consumeBlockContents(new ArrayComponentValueStream(block.value), nested);
        const cssRules = rule.childRules.map(r => r as CSSRule);
        return new CSSAtRule(rule.name, rule.prelude, block, cssRules);
      } else {
        rule.prelude.push(stream.next());
      }
    }
  }

  private skipToNextSemicolonOrBlock(stream: ComponentValueStream): void {
    while (true) {
      const val = stream.next();
      if (val.type === 'EOF' || val.type === 'semicolon') {
        break;
      }
    }
  }

  /**
   * Consume the remnants of a bad declaration.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-remnants-of-a-bad-declaration
   */
  private consumeRemnantsOfABadDeclaration(stream: ComponentValueStream, nested: boolean = false): void {
    while (true) {
      const val = stream.peek();
      if (val.type === 'EOF' || val.type === 'semicolon') {
        stream.next();
        break;
      } else if (val.type === '}') {
        if (nested) {
          break;
        } else {
          stream.next();
        }
      } else {
        stream.next();
      }
    }
  }

  private isValidSelector(prelude: ComponentValue[]): boolean {
    let start = 0;
    let end = prelude.length - 1;
    while (start <= end && prelude[start].type === 'whitespace') start++;
    while (end >= start && prelude[end].type === 'whitespace') end--;
    
    if (start > end) return false;

    for (let i = start; i <= end; i++) {
      const val = prelude[i];
      if (val.type === 'number' || val.type === 'dimension') {
        return false;
      }

    }

    const lastToken = prelude[end];
    if (lastToken.type === 'delim' && (lastToken.value === '.' || lastToken.value === '#')) {
      return false;
    }
    if (lastToken.type === 'colon') {
      return false;
    }

    for (let i = start; i <= end; i++) {
      const val = prelude[i];
      if (val.type === 'delim' && val.value === '.') {
        let next = i + 1;
        if (next > end || prelude[next].type !== 'ident') {
          return false;
        }
      }
      if (val.type === 'delim' && val.value === '#') {
        return false;
      }
      if (val.type === 'colon') {
        let next = i + 1;
        if (next <= end) {
           const nextVal = prelude[next];
           if (nextVal.type !== 'ident' && nextVal.type !== 'function' && nextVal.type !== 'colon') {
             return false;
           }
        }
      }
    }

    return true;
  }

  private createStyleRule(prelude: ComponentValue[], blockContents: Rule[], isNested: boolean = false): CSSStyleRule | null {
    const declarations: Declaration[] = [];
    const nestedRules: Rule[] = [];
    
    let isFirst = true;
    for (const item of blockContents) {
      if (isFirst && item instanceof CSSNestedDeclarations) {
        declarations.push(...item.style.declarations);
      } else {
        nestedRules.push(item);
      }
      isFirst = false;
    }

    let selectorText = '';
    let selectorAST: import('./types.ts').SelectorList | null = null;
    if (isNested) {
      selectorText = this.normalizeNestedSelector(prelude);
      if (selectorText === '') return null;
      selectorAST = Parser.parseSelectorAST(selectorText, this.declaredNamespaces);
      if (selectorAST === null) return null;
    } else {
      if (!this.isValidSelector(prelude)) return null;
      try {
        selectorAST = new SelectorParser(prelude, { declaredNamespaces: this.declaredNamespaces }).parse();
      } catch (e) {
        return null;
      }
      selectorText = serialize(prelude).trim();
    }
    return new CSSStyleRule(selectorText, declarations, nestedRules, parseRuleInBlock, selectorAST);
  }

  // ... (normalizeNestedSelector, consumeBlock, etc.)

  static #consumeSelectorTokens(parser: Parser): ComponentValue[] | null {
    const prelude: ComponentValue[] = [];
    while (true) {
      const next = parser.nextToken;
      if (next.type === 'EOF') {
        break;
      } else if (next.type === '{' || next.type === '}' || next.type === 'at-keyword') {
        return null;
      } else {
        prelude.push(parser.consumeComponentValue());
      }
    }
    return prelude;
  }

  public static parseSelectorAST(text: string, declaredNamespaces?: Set<string>, allowRelative = false): import('./types.ts').SelectorList | null {
    const tokens = tokenize(text);
    const parser = new Parser(tokens);
    const prelude = Parser.#consumeSelectorTokens(parser);
    
    if (prelude === null) return null;
    
    try {
      return new SelectorParser(prelude, { allowRelative, declaredNamespaces }).parse();
    } catch (e) {
      return null;
    }
  }


  private normalizeNestedSelector(prelude: ComponentValue[]): string {
    const segments: ComponentValue[][] = [];
    let currentSegment: ComponentValue[] = [];
    
    for (const val of prelude) {
      if (val.type === 'delim' && val.value === ',') {
        segments.push(currentSegment);
        currentSegment = [];
      } else {
        currentSegment.push(val);
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
    const hasAmpersand = (values: ComponentValue[]): boolean => {
      return values.some(val => {
        if (val.type === 'delim' && (val as Token).value === '&') {
          return true;
        }
        if (val.type === 'simple-block') {
          return hasAmpersand((val as SimpleBlock).value);
        }
        if (val.type === 'function') {
          return hasAmpersand((val as CSSFunction).value);
        }
        return false;
      });
    };

    const normalizedSegments = segments.map(segment => {
      let start = 0;
      while (start < segment.length && segment[start].type === 'whitespace') {
        start++;
      }
      let end = segment.length - 1;
      while (end >= start && segment[end].type === 'whitespace') {
        end--;
      }
      const trimmed = segment.slice(start, end + 1);
      
      if (trimmed.length === 0) return null;
      
      const containsAmpersand = hasAmpersand(trimmed);
      
      const firstNode = trimmed[0];
      const secondNode = trimmed[1];
      const startsWithCombinator = trimmed.length > 0 && (
        (firstNode.type === 'delim' && (['>', '+', '~'].includes(firstNode.value))) ||
        (firstNode.type === 'delim' && firstNode.value === '|' && secondNode?.type === 'delim' && secondNode.value === '|')
      );

        
      if (startsWithCombinator) {
        return '& ' + serialize(trimmed);
      } else if (!containsAmpersand) {
        return '& ' + serialize(trimmed);
      } else {
        return serialize(trimmed);
      }
    });
    
    if (normalizedSegments.some(s => s === null)) return '';
    return normalizedSegments.join(', ');
  }

  /**
   * Consume a simple block.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-block
   */
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
        this.discardToken();
        return block;
      } else if (next.type === 'EOF') {
        this.reportError('Unexpected EOF in block', next);
        return block;
      } else {
        block.value.push(this.consumeComponentValue());
      }
    }
  }

  /**
   * Consume a function.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-function
   */
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




  /**
   * Consume a component value.
   * @see https://drafts.csswg.org/css-syntax-3/#consume-component-value
   */
  // 5.5.8 Consume a component value https://drafts.csswg.org/css-syntax/#consume-component-value
  public consumeComponentValue(): ComponentValue {
    const token = this.consumeToken();
    if (token.type === '{' || token.type === '[' || token.type === '(') {
      return this.consumeBlock(token);
    } else if (token.type === 'function') {
      return this.consumeFunction(token);
    } else {
      return token;
    }
  }

  public ensureEOF(): void {
    while (this.nextToken.type === 'whitespace') {
      this.discardToken();
    }
    if (this.nextToken.type !== 'EOF') {
      throw new DOMException('Syntax error', 'SyntaxError');
    }
  }

  public static parseSelector(text: string): string | null {
    const tokens = tokenize(text);
    const parser = new Parser(tokens);
    const prelude = Parser.#consumeSelectorTokens(parser);
    
    if (prelude === null) return null;
    
    const selector = serialize(prelude).trim();
    
    return selector || null;
  }

  public static parseRuleText(text: string): Rule {
    const tokens = tokenize(text);
    const parser = new Parser(tokens);
    const rule = parser.consumeRule();
    if (!rule) throw new DOMException('Syntax error', 'SyntaxError');
    
    // Check for trailing garbage
    while (parser.nextToken.type === 'whitespace') {
      parser.discardToken();
    }
    if (parser.nextToken.type !== 'EOF') {
      throw new DOMException('Syntax error', 'SyntaxError');
    }
    
    return rule;
  }

  public static parseStyleSheetText(text: string): Rule[] {
    const tokens = tokenize(text);
    const parser = new Parser(tokens);
    return parser.consumeListOfRules(true);
  }

  public static parseRuleInBlockText(text: string, nested = true): Rule {
    const wrapped = `{ ${text} }`;
    const tokens = tokenize(wrapped);
    const parser = new Parser(tokens);
    const block = parser.consumeBlock(parser.consumeToken());
    const contents = parser.consumeBlockContents(new ArrayComponentValueStream(block.value), true, nested);
    if (contents.length !== 1) {
      throw new DOMException('Syntax error', 'SyntaxError');
    }
    return contents[0];
  }

  public static calculateSpecificity(selector: string | import('./types.ts').SelectorList): [number, number, number][] {
    return calculateSpecificity(selector);
  }

  public static getCascadedStyle(element: unknown, rules?: Rule[]): CSSStyleDeclaration {
    return getCascadedStyle(element, rules);
  }

  /**
   * Resolves a CSS value string by expanding var() functions using the provided style declaration.
   * @see https://drafts.csswg.org/css-variables-1/#using-variables
   */
  public static resolveVariables(style: CSSStyleDeclaration, property: string, envMap?: Record<string, string>): string {
    const value = style.getPropertyValue(property);
    if (!value) return '';
    return Parser.#resolveVariablesInString(style, value, new Set([property]), envMap);
  }

  static #resolveVariablesInString(style: CSSStyleDeclaration, value: string, seen: Set<string>, envMap?: Record<string, string>): string {
    const tokens = tokenize(value);
    const parser = new Parser(tokens);
    const componentValues = parser.parseComponentValues();
    const resolved = Parser.#resolveVariablesInComponentValues(style, componentValues, seen, envMap);
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
    if (v.type === 'function' && (v as CSSFunction).name === 'var') {
      return Parser.#resolveVarFunction(style, v as CSSFunction, seen, envMap);
    }
    if (v.type === 'function' && (v as CSSFunction).name === 'env') {
      return Parser.#resolveEnvFunction(style, v as CSSFunction, seen, envMap);
    }
    if (v.type === 'function') {
      const fn = v as CSSFunction;
      return [{
        ...fn,
        value: Parser.#resolveVariablesInComponentValues(style, fn.value, seen, envMap)
      } as CSSFunction];
    }
    if (v.type === 'simple-block') {
      const block = v as SimpleBlock;
      return [{
        ...block,
        value: Parser.#resolveVariablesInComponentValues(style, block.value, seen, envMap)
      } as SimpleBlock];
    }
    return [v];
  }

  /**
   * @see https://drafts.csswg.org/css-variables-1/#replace-a-var
   */
  static #resolveVarFunction(style: CSSStyleDeclaration, fn: CSSFunction, seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    const commaIdx = fn.value.findIndex(v => v.type === 'comma');
    const tokensBeforeComma = commaIdx === -1 ? fn.value : fn.value.slice(0, commaIdx);
    const argsBeforeComma = tokensBeforeComma.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    
    if (argsBeforeComma.length !== 1) {
      return []; // Invalid var() function
    }
    
    const firstArg = argsBeforeComma[0];
    if (firstArg.type !== 'ident' || !Parser.isValidDashedIdent(firstArg.value)) {
      return []; // Invalid var() function
    }
    
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
        const tokens = tokenize(rawValue);
        const parser = new Parser(tokens);
        componentValues = parser.parseComponentValues();
        
        if (Parser.#customPropertyAstCache.size >= Parser.#MAX_CACHE_SIZE) {
          const firstKey = Parser.#customPropertyAstCache.keys().next().value;
          if (firstKey !== undefined) {
            Parser.#customPropertyAstCache.delete(firstKey);
          }
        }
        Parser.#customPropertyAstCache.set(rawValue, componentValues);
      }

      const resolved = Parser.#resolveVariablesInComponentValues(style, componentValues, seen, envMap);
      seen.delete(varName);

      // Check for cycles
      const cycleToken = resolved.find(t => t.type === 'ident' && typeof t.value === 'string' && t.value.startsWith('\0cycle:'));
      if (cycleToken) {
        const target = (cycleToken.value as string).slice(7);
        if (target === varName) {
          if (hasFallback) {
            return Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap);
          }
          return [{ type: 'ident', value: '\0guaranteed-invalid' }];
        }
        return resolved;
      }

      // Check if resolved to guaranteed-invalid
      if (resolved.length === 1 && resolved[0].type === 'ident' && resolved[0].value === '\0guaranteed-invalid') {
        if (hasFallback) {
          return Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap);
        }
        return resolved;
      }

      // Validate syntax
      const def = PropertyRegistry.get(varName);
      if (def) {
        const syntax = def.syntax || '*';
        const cleanResolved = resolved.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
        const isCSSWideKeyword = cleanResolved.length === 1 && cleanResolved[0].type === 'ident' &&
          ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(cleanResolved[0].value.toLowerCase());
        
        if (!isCSSWideKeyword && !matchesSyntax(cleanResolved, syntax)) {
          if (def.initialValue !== undefined) {
            const tokens = tokenize(def.initialValue);
            const parser = new Parser(tokens);
            return parser.parseComponentValues();
          }
          return [{ type: 'ident', value: '\0guaranteed-invalid' }];
        }
      }

      return resolved;
    }

    const def = PropertyRegistry.get(varName);
    if (def && def.initialValue !== undefined) {
      const tokens = tokenize(def.initialValue);
      const parser = new Parser(tokens);
      return parser.parseComponentValues();
    }

    if (hasFallback) {
      return Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap);
    }
    return [{ type: 'ident', value: '\0guaranteed-invalid' }];}

  /**
   * @see https://drafts.csswg.org/css-env-1/#env-function
   */
  static #resolveEnvFunction(style: CSSStyleDeclaration, fn: CSSFunction, seen: Set<string>, envMap?: Record<string, string>): ComponentValue[] {
    // env( <custom-ident> <integer [0,∞]>*, <declaration-value>? )
    const identIdx = fn.value.findIndex(v => v.type === 'ident');
    if (identIdx === -1) return [fn];

    const envName = (fn.value[identIdx] as Token).value;
    const indices: string[] = [];
    for (let i = identIdx + 1; i < fn.value.length; i++) {
      const v = fn.value[i];
      if (v.type === 'comma') break;
      if (v.type === 'number') {
        indices.push((v as Token).value.toString());
      }
    }

    const fullKey = indices.length > 0 ? `${envName} ${indices.join(' ')}` : envName;
    const rawValue = envMap?.[fullKey];

    const commaIdx = fn.value.findIndex(v => v.type === 'comma');
    const fallback = commaIdx !== -1 ? fn.value.slice(commaIdx + 1) : [];

    if (rawValue !== undefined) {
      const tokens = tokenize(rawValue);
      const parser = new Parser(tokens);
      const componentValues = parser.parseComponentValues();
      return Parser.#resolveVariablesInComponentValues(style, componentValues, seen, envMap);
    }

    if (fallback.length > 0) {
      return Parser.#resolveVariablesInComponentValues(style, fallback, seen, envMap);
    }

    return [];
  }
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

// Inject Parser implementations into ParseHooks to break circular dependencies
ParseHooks.parseStyleAttribute = (tokens) => new Parser(tokens).parseStyleAttribute();
ParseHooks.consumeRule = (tokens) => new Parser(tokens).consumeRule() as unknown as Rule;
ParseHooks.consumeListOfRules = (tokens, topLevel) => new Parser(tokens).consumeListOfRules(topLevel);
ParseHooks.parseComponentValues = (tokens) => new Parser(tokens).parseComponentValues();
ParseHooks.parseSelector = (text) => Parser.parseSelector(text);
ParseHooks.parseSelectorAST = (text, declaredNamespaces, allowRelative) => Parser.parseSelectorAST(text, declaredNamespaces, allowRelative);
ParseHooks.validateCustomPropertyValue = (values) => Parser.validateCustomPropertyValue(values);
ParseHooks.isValidDashedIdent = (name) => Parser.isValidDashedIdent(name);

export function parse(css: string): CSSStyleSheet {
  return new Parser(tokenize(css)).parseStyleSheet();
}
