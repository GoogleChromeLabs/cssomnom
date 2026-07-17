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
import type { 
  SelectorList, ComplexSelector, CompoundSelector, SimpleSelector, 
  Combinator, ComponentValue, Token, SimpleBlock, CSSFunction,
  InvalidSelector, IdentToken, DelimToken, HashToken, StringToken
} from './types.ts';
import { 
  PSEUDO_CLASSES, 
  PSEUDO_ELEMENTS 
} from './data/selectors.ts';
import { getOriginalText } from './serializer.ts';
// Type guards for ComponentValue types
export function isToken(val: ComponentValue | undefined): val is Token {
  return val !== undefined && val.type !== 'simple-block' && val.type !== 'function';
}

export function isIdentToken(val: ComponentValue | undefined): val is IdentToken {
  return val !== undefined && val.type === 'ident';
}

export function isDelimToken(val: ComponentValue | undefined, char?: string): val is DelimToken {
  return val !== undefined && val.type === 'delim' && (char === undefined || (val as DelimToken).value === char);
}

export function isHashToken(val: ComponentValue | undefined): val is HashToken {
  return val !== undefined && val.type === 'hash';
}

export function isStringToken(val: ComponentValue | undefined): val is StringToken {
  return val !== undefined && (val.type === 'string' || val.type === 'bad-string');
}

export function isSimpleBlock(val: ComponentValue | undefined, associatedType?: string): val is SimpleBlock {
  return val !== undefined && val.type === 'simple-block' && (associatedType === undefined || (val as SimpleBlock).associatedToken.type === associatedType);
}

export function isCSSFunction(val: ComponentValue | undefined, name?: string): val is CSSFunction {
  return val !== undefined && val.type === 'function' && (name === undefined || (val as CSSFunction).name.toLowerCase() === name.toLowerCase());
}

export class ComponentValueCursor {
  private values: ComponentValue[];
  private _i: number = 0;

  constructor(values: ComponentValue[]) {
    this.values = values;
  }

  public get hasNext(): boolean {
    return this._i < this.values.length;
  }

  public get i(): number {
    return this._i;
  }

  public set i(pos: number) {
    this._i = pos;
  }

  public get length(): number {
    return this.values.length;
  }

  public get next(): ComponentValue | undefined {
    return this.values[this._i];
  }

  public peek(offset: number = 1): ComponentValue | undefined {
    return this.values[this._i + offset];
  }

  public consume(): ComponentValue {
    return this.values[this._i++] || { type: 'EOF', value: '' } as unknown as ComponentValue;
  }

  public skipWhitespace(): void {
    while (this._i < this.values.length && this.values[this._i].type === 'whitespace') {
      this._i++;
    }
  }

  public skipToNextComma(): void {
    const commaOffset = this.values.slice(this._i).findIndex(v => v.type === 'comma');
    this._i = commaOffset === -1 ? this.values.length : this._i + commaOffset;
  }

  public slice(start: number, end?: number): ComponentValue[] {
    return this.values.slice(start, end ?? this._i);
  }
}

const LEGACY_PSEUDO_CLASS_ALIASES: Record<string, string> = {
  '-webkit-autofill': 'autofill',
};

export interface SelectorParserOptions {
  allowRelative?: boolean;
  forgiving?: boolean;
  insideHas?: boolean;
  forbidPseudo?: boolean;
  declaredNamespaces?: Set<string>;
}

/**
 * Selector Parser according to Selectors Level 4.
 * @see https://drafts.csswg.org/selectors-4/#grammar
 */
export class SelectorParser {
  public static readonly PSEUDO_CLASSES = PSEUDO_CLASSES;
  public static readonly PSEUDO_ELEMENTS = PSEUDO_ELEMENTS;


  private cursor: ComponentValueCursor;
  private allowRelative: boolean;
  private forgiving: boolean;
  private insideHas: boolean;
  private forbidPseudo: boolean;
  private declaredNamespaces?: Set<string>;

  constructor(values: ComponentValue[], options: SelectorParserOptions = {}) {
    this.cursor = new ComponentValueCursor(values);
    this.allowRelative = options.allowRelative ?? false;
    this.forgiving = options.forgiving ?? false;
    this.insideHas = options.insideHas ?? false;
    this.forbidPseudo = options.forbidPseudo ?? false;
    this.declaredNamespaces = options.declaredNamespaces;
  }


  private hasAmpersand(values: ComponentValue[]): boolean {
    return values.some(val => {
      if (isDelimToken(val, '&')) return true;
      if (isSimpleBlock(val)) return this.hasAmpersand(val.value);
      if (isCSSFunction(val)) return this.hasAmpersand(val.value);
      return false;
    });
  }

  public parse(): SelectorList {
    const selectors: (ComplexSelector | InvalidSelector)[] = [];
    
    while (this.cursor.hasNext) {
      this.cursor.skipWhitespace();
      if (!this.cursor.hasNext || this.cursor.next?.type === 'EOF') break;
      
      const start = this.cursor.i;
      try {
        const selector = this.consumeComplexSelector();
        this.cursor.skipWhitespace();
        
        const next = this.cursor.next;
        if (!next || next.type === 'comma') {
          selectors.push(selector);
        } else {
          throw new SyntaxError('Unexpected token in selector');
        }
      } catch (e) {
        if (this.forgiving) {
          this.cursor.skipToNextComma();
          
          const failedTokens = this.cursor.slice(start, this.cursor.i);
          if (this.hasAmpersand(failedTokens)) {
            selectors.push({ type: 'invalid-selector', tokens: failedTokens });
          }
        } else {
          throw e;
        }
      }
      
      if (this.cursor.next?.type === 'comma') {
        this.cursor.consume();
      }
    }
    
    if (!this.forgiving && selectors.length === 0) {
      throw new SyntaxError('Selector list cannot be empty');
    }
    
    return { type: 'selector-list', selectors };
  }

  private validateNamespace(namespace: string | undefined): void {
    if (this.declaredNamespaces !== undefined && namespace !== undefined && namespace !== '*' && namespace !== '') {
      if (!this.declaredNamespaces.has(namespace)) {
        throw new DOMException(`Undeclared namespace prefix: "${namespace}"`, 'SyntaxError');
      }
    }
  }
  private consumeComplexSelector(): ComplexSelector {
    const items: (CompoundSelector | Combinator)[] = [];
    const start = this.cursor.i;
    let seenPseudoElement = false;
    
    while (this.cursor.hasNext) {
      this.cursor.skipWhitespace();
      if (!this.cursor.hasNext || this.cursor.next?.type === 'comma') break;
      
      // Check for combinators
      const combinator = this.tryConsumeCombinator();
      if (combinator) {
        if (items.length === 0 && !this.allowRelative) {
          throw new SyntaxError('Relative selector not allowed in this context');
        }
        if (seenPseudoElement) {
          throw new SyntaxError('Pseudo-element must be at the end of the selector');
        }
        if (items.length > 0 && items[items.length - 1].type === 'combinator') {
          throw new SyntaxError('Consecutive combinators are not allowed');
        }
        items.push(combinator);
        continue;
      }
      
      const compound = this.consumeCompoundSelector();
      if (compound.selectors.length > 0) {
        if (seenPseudoElement) {
          throw new SyntaxError('Pseudo-element must be at the end of the selector');
        }
        
        const hasPseudo = compound.selectors.some(s => s.type === 'pseudo-element-selector');
        
        // If the previous item was also a compound selector, insert a descendant combinator
        if (items.length > 0 && items[items.length - 1].type === 'compound-selector') {
          items.push({ type: 'combinator', value: ' ' });
        }
        items.push(compound);
        
        if (hasPseudo) {
          seenPseudoElement = true;
        }
      } else {
        break;
      }
    }
    
    if (items.length > 0 && items[items.length - 1].type === 'combinator') {
      throw new SyntaxError('Trailing combinator is not allowed');
    }
    
    // selectors-4 #grammar
    if (items.length === 0) {
      throw new SyntaxError('Complex selector cannot be empty');
    }
    
    if (this.insideHas && items.length > 0 && items[0].type !== 'combinator') {
      items.unshift({ type: 'combinator', value: ' ' });
    }
    
    const end = this.cursor.i;
    const tokens = this.cursor.slice(start, end);
    return { type: 'complex-selector', items, tokens };
  }


  private tryConsumeCombinator(): Combinator | null {
    const token = this.cursor.next;
    if (!token) return null;
    
    if (isDelimToken(token)) {
      const val = token.value;
      if (val === '>' || val === '+' || val === '~') {
        this.cursor.consume();
        return { type: 'combinator', value: val as ' ' | '>' | '+' | '~' | '||' };
      }
      if (val === '|' && isDelimToken(this.cursor.peek(1), '|')) {
        this.cursor.consume();
        this.cursor.consume();
        return { type: 'combinator', value: '||' };
      }
    }
    
    return null;
  }

  private isUserActionPseudoClass(name: string): boolean {
    const lower = name.toLowerCase();
    return ['hover', 'active', 'focus', 'focus-visible', 'focus-within'].includes(lower);
  }

  private validateSimpleSelectorAfterPseudo(selector: SimpleSelector): void {
    if (selector.type === 'pseudo-class-selector') {
      const lowerName = selector.name.toLowerCase();
      if (['not', 'is', 'where', 'has'].includes(lowerName)) {
        return;
      } else if (!this.isUserActionPseudoClass(selector.name)) {
        throw new SyntaxError('Only user-action pseudo-classes are allowed after a pseudo-element');
      }
    } else {
      throw new SyntaxError('Only user-action pseudo-classes are allowed after a pseudo-element');
    }
  }


  private consumeCompoundSelector(): CompoundSelector {
    const selectors: SimpleSelector[] = [];
    let lastPseudoElement: string | null = null;
    
    while (this.cursor.hasNext) {
      const token = this.cursor.next;
      if (!token || token.type === 'whitespace' || token.type === 'comma') break;
      
      if (isDelimToken(token)) {
        const val = token.value;
        if (val === '>' || val === '+' || val === '~') break;
        if (val === '|') {
          if (lastPseudoElement) break;
          // Could be namespace prefix or column combinator
          if (isDelimToken(this.cursor.peek(1), '|')) {
             break; // Combinator ||
          }
          // Namespace prefix |
          if (selectors.length > 0) throw new SyntaxError('Type selector must be first in compound selector');
          selectors.push(this.consumeTypeOrUniversalSelector());
          continue;
        }
        if (val === '*') {
           if (lastPseudoElement) break;
           if (selectors.length > 0) throw new SyntaxError('Universal selector must be first in compound selector');
           selectors.push(this.consumeTypeOrUniversalSelector());
           continue;
        }
        if (val === '.') {
           if (lastPseudoElement) break;
           selectors.push(this.consumeClassSelector());
           continue;
        }
        if (val === '&') {
           if (lastPseudoElement) break;
           this.cursor.consume();
           selectors.push({ type: 'nesting-selector' });
           continue;
        }
      }
      
      if (isHashToken(token)) {
        if (token.hashType !== 'id') {
          throw new SyntaxError("ID selector must be an identifier");
        }
        if (lastPseudoElement) break;
        selectors.push({ type: 'id-selector', name: token.value });
        this.cursor.consume();
        continue;
      }

      if (isIdentToken(token)) {
        if (lastPseudoElement) break;
        if (selectors.length > 0) throw new SyntaxError('Type selector must be first in compound selector');
        selectors.push(this.consumeTypeOrUniversalSelector());
        continue;
      }
      
      if (isSimpleBlock(token, '[')) {
        if (lastPseudoElement) break;
        selectors.push(this.consumeAttributeSelector());
        continue;
      }
      
      if (token.type === 'colon') {
        const selector = this.consumePseudoSelector();
        if (lastPseudoElement) {
          const isSlottedOrPart = ['slotted', 'part'].includes(lastPseudoElement.toLowerCase());
          
          if (selector.type === 'pseudo-element-selector') {
            if (!isSlottedOrPart) {
              throw new SyntaxError('Pseudo-elements cannot be nested');
            }
          } else if (selector.type === 'pseudo-class-selector') {
            if (!isSlottedOrPart) {
              this.validateSimpleSelectorAfterPseudo(selector);
            }
          } else {
             throw new SyntaxError('Unexpected selector after pseudo-element');
          }
        }
        if (selector.type === 'pseudo-element-selector') {
          lastPseudoElement = selector.name;
        }
        selectors.push(selector);
        continue;
      }

      break;
    }
    
    return { type: 'compound-selector', selectors };
  }

  private consumeTypeOrUniversalSelector(): SimpleSelector {
    let namespace: string | undefined = undefined;
    const token = this.cursor.next;
    if (!token) {
      throw new SyntaxError('Unexpected EOF in type selector');
    }

    // Check for namespace prefix
    const isNextPipe = isDelimToken(this.cursor.peek(1), '|');
    const isNextNextPipe = isDelimToken(this.cursor.peek(2), '|');
    const isColumnCombinator = isNextPipe && isNextNextPipe;

    if (isIdentToken(token) && isNextPipe && !isColumnCombinator) {
       namespace = token.value;
       this.cursor.i += 2;
    } else if (isDelimToken(token, '*') && isNextPipe && !isColumnCombinator) {
       namespace = '*';
       this.cursor.i += 2;
    } else if (isDelimToken(token, '|') && !isNextPipe) {
       namespace = '';
       this.cursor.i += 1;
    }

    const next = this.cursor.consume();
    if (isDelimToken(next, '*')) {
      this.validateNamespace(namespace);
      return { type: 'universal-selector', namespace };
    }
    if (!isIdentToken(next)) {
      throw new SyntaxError('Expected identifier or * after namespace pipe');
    }
    this.validateNamespace(namespace);
    return { type: 'type-selector', name: next.value, namespace };

  }

  private consumeClassSelector(): SimpleSelector {
    this.cursor.consume(); // .
    const ident = this.cursor.consume();
    if (!isIdentToken(ident)) return { type: 'class-selector', name: '' };
    return { type: 'class-selector', name: ident.value };
  }

  private consumeAttributeSelector(): SimpleSelector {
    const block = this.cursor.consume();
    if (!isSimpleBlock(block, '[')) {
      throw new SyntaxError('Expected attribute selector block');
    }
    
    const subCursor = new ComponentValueCursor(block.value);
    let name = '';
    let namespace: string | undefined = undefined;
    let operator = '';
    let value = '';
    let flags = '';
    
    subCursor.skipWhitespace();
    if (subCursor.hasNext) {
      const v1 = subCursor.next;
      const v2 = subCursor.peek(1);
      if (isIdentToken(v1) && isDelimToken(v2, '|')) {
        namespace = v1.value;
        subCursor.i += 2;
      } else if (isDelimToken(v1, '*') && isDelimToken(v2, '|')) {
        namespace = '*';
        subCursor.i += 2;
      } else if (isDelimToken(v1, '|')) {
        namespace = '';
        subCursor.i += 1;
      }
    }

    const valName = subCursor.next;
    if (isIdentToken(valName)) {
      name = valName.value;
      subCursor.consume();
    }
    
    subCursor.skipWhitespace();
    const valOp = subCursor.next;
    if (isDelimToken(valOp)) {
      operator = valOp.value;
      subCursor.consume();
      const valEq = subCursor.next;
      if (isDelimToken(valEq, '=')) {
        operator += valEq.value;
        subCursor.consume();
      }
    }

    subCursor.skipWhitespace();
    const valVal = subCursor.next;
    if (isStringToken(valVal) || isIdentToken(valVal)) {
      value = valVal.value;
      subCursor.consume();
    }

    subCursor.skipWhitespace();
    const valFlag = subCursor.next;
    if (isIdentToken(valFlag)) {
      const flagValue = valFlag.value;
      const lowerFlag = flagValue.toLowerCase();

      if (lowerFlag !== 'i' && lowerFlag !== 's') {
        throw new SyntaxError(`Invalid attribute selector flag: ${flagValue}`);
      }
      flags = flagValue;
      subCursor.consume();
    }
    
    subCursor.skipWhitespace();
    if (subCursor.hasNext) {
      throw new SyntaxError('Unexpected content in attribute selector');
    }
    
    this.validateNamespace(namespace);
    return { type: 'attribute-selector', name, namespace, operator, value, flags };

  }

  private consumePseudoSelector(): SimpleSelector {
    this.cursor.consume(); // :
    let isPseudoElement = false;
    if (this.cursor.next?.type === 'colon') {
      this.cursor.consume();
      isPseudoElement = true;
    }
    
    const token = this.cursor.consume();
    if (!token) return { type: 'pseudo-class-selector', name: '' };
    
    if (isIdentToken(token)) {
      const originalName = token.value;
      const lowerName = originalName.toLowerCase();

      const name = LEGACY_PSEUDO_CLASS_ALIASES[lowerName] || originalName;
      const effectiveLowerName = name.toLowerCase();
      
      if (isPseudoElement) {
        if (this.forbidPseudo || this.insideHas) {
          throw new SyntaxError('Pseudo-elements are not allowed in this context');
        }
        if (!(PSEUDO_ELEMENTS as unknown as Set<string>).has(effectiveLowerName) && !effectiveLowerName.startsWith('-webkit-')) {
          throw new SyntaxError(`Unknown pseudo-element ::${name}`);
        }
        return { type: 'pseudo-element-selector', name };
      }
      
      // Check for legacy pseudo-elements that use single colon
      if (['before', 'after', 'first-line', 'first-letter'].includes(effectiveLowerName)) {
        if (this.forbidPseudo || this.insideHas) {
          throw new SyntaxError('Pseudo-elements are not allowed in this context');
        }
        return { type: 'pseudo-element-selector', name };
      }
      
      if (!(PSEUDO_CLASSES as unknown as Set<string>).has(effectiveLowerName) && !effectiveLowerName.startsWith('-webkit-')) {
        throw new SyntaxError(`Unknown pseudo-class :${name}`);
      }
      return { type: 'pseudo-class-selector', name };
    } else if (isCSSFunction(token)) {
      const func = token;
      const name = func.name;
      const lowerName = name.toLowerCase();
      
      if (isPseudoElement) {
        if (this.forbidPseudo || this.insideHas) {
          throw new SyntaxError('Pseudo-elements are not allowed in this context');
        }
        if (!(PSEUDO_ELEMENTS as unknown as Set<string>).has(lowerName)) {
          throw new SyntaxError(`Unknown pseudo-element ::${name}()`);
        }
        
        if (lowerName === 'slotted') {
          const subParser = new SelectorParser(func.value, {
            insideHas: this.insideHas,
            forbidPseudo: true,
            declaredNamespaces: this.declaredNamespaces
          });
          subParser.cursor.skipWhitespace();
          const compound = subParser.consumeCompoundSelector();
          subParser.cursor.skipWhitespace();
          if (subParser.cursor.i !== func.value.length || compound.selectors.length === 0) {
            throw new SyntaxError('Argument to ::slotted() must be a compound selector');
          }
          return { 
            type: 'pseudo-element-selector', 
            name, 
            argument: { 
              type: 'selector-list', 
              selectors: [{ type: 'complex-selector', items: [compound], tokens: func.value }] 
            } 
          };
        }
        
        return { type: 'pseudo-element-selector', name, argument: func.value };
      }
      
      if (!(PSEUDO_CLASSES as unknown as Set<string>).has(lowerName) && lowerName !== 'matches') {
        throw new SyntaxError(`Unknown pseudo-class :${name}()`);
      }
      
      // For functional pseudo-classes, some take selector lists
      if (['is', 'not', 'has', 'where', 'matches'].includes(lowerName)) {
        const isHas = lowerName === 'has';
        if (isHas && this.insideHas) {
          throw new SyntaxError(':has() cannot be nested');
        }
        const isForgiving = ['is', 'where', 'matches'].includes(lowerName);
        const isLogicalPseudo = ['is', 'where', 'not', 'matches'].includes(lowerName);
        const subParser = new SelectorParser(func.value, {
          allowRelative: isHas,
          forgiving: isForgiving,
          insideHas: isHas || this.insideHas,
          forbidPseudo: isLogicalPseudo || isHas || this.forbidPseudo,
          declaredNamespaces: this.declaredNamespaces
        });
        return { type: 'pseudo-class-selector', name, argument: subParser.parse() };
      }

      if (['host', 'host-context'].includes(lowerName)) {
        const subParser = new SelectorParser(func.value, {
          insideHas: this.insideHas,
          forbidPseudo: true,
          declaredNamespaces: this.declaredNamespaces
        });
        subParser.cursor.skipWhitespace();
        const compound = subParser.consumeCompoundSelector();
        subParser.cursor.skipWhitespace();
        if (subParser.cursor.i !== func.value.length || compound.selectors.length === 0) {
          throw new SyntaxError(`Argument to :${name}() must be a compound selector`);
        }
        return { 
          type: 'pseudo-class-selector', 
          name, 
          argument: { 
            type: 'selector-list', 
            selectors: [{ type: 'complex-selector', items: [compound], tokens: func.value }] 
          } 
        };
      }

      if (['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type'].includes(lowerName)) {
           let ofIdx = -1;
           for(let k=0; k<func.value.length; k++) {
             const v = func.value[k];
             if (isIdentToken(v) && v.value.toLowerCase() === 'of') {
               ofIdx = k;
               break;
             }
           }
           if (ofIdx !== -1) {
             if (['nth-of-type', 'nth-last-of-type'].includes(lowerName)) {
               throw new SyntaxError(`'of' is not allowed in :${name}()`);
             }
             const nth = func.value.slice(0, ofIdx);
             this.validateAnPlusB(nth);
             const subParserOf = new SelectorParser(func.value.slice(ofIdx + 1), {
               insideHas: this.insideHas,
               forbidPseudo: true,
               declaredNamespaces: this.declaredNamespaces
             });
             return { type: 'pseudo-class-selector', name, argument: subParserOf.parse(), nth };
           } else {
             this.validateAnPlusB(func.value);
           }
      }

      if (lowerName === 'dir') {
        this.validateDir(func.value);
      }

      if (lowerName === 'lang') {
        this.validateLang(func.value);
      }
      
      return { type: 'pseudo-class-selector', name, argument: func.value };
    }
    
    throw new SyntaxError('Expected identifier or function after colon in pseudo-selector');
  }

  private validateAnPlusB(values: ComponentValue[]): void {
    const text = getOriginalText(values).trim();
    const oddEven = /^(?:odd|even)$/i;
    const integer = /^[+-]?\d+$/;
    const anPlusB = /^[+-]?\d*n\s*(?:[+-]\s*\d+)?$/i;

    if (oddEven.test(text) || integer.test(text) || anPlusB.test(text)) {
      return;
    }
    throw new SyntaxError(`Invalid An+B expression: ${text}`);
  }

  private validateDir(values: ComponentValue[]): void {
    const nonWs = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    const firstToken = nonWs[0];
    if (nonWs.length !== 1 || !isIdentToken(firstToken)) {
      throw new SyntaxError('Argument to :dir() must be a single identifier');
    }
    const val = firstToken.value.toLowerCase();

    if (val !== 'ltr' && val !== 'rtl') {
       throw new SyntaxError('Argument to :dir() must be ltr or rtl');
    }
  }

  private validateLang(values: ComponentValue[]): void {
    const nonWs = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (nonWs.length === 0) {
      throw new SyntaxError('Argument to :lang() cannot be empty');
    }
    
    let expectItem = true;
    for (const v of nonWs) {
      if (expectItem) {
        if (!isIdentToken(v) && !isStringToken(v)) {
          throw new SyntaxError('Argument to :lang() must be identifiers or strings');
        }
        expectItem = false;
      } else {
        if (v.type !== 'comma') {
          throw new SyntaxError('Expected comma in :lang() argument');
        }
        expectItem = true;
      }
    }
    if (expectItem) {
      throw new SyntaxError('Trailing comma in :lang() argument');
    }
  }
}
