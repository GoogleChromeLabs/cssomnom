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
  InvalidSelector, IdentToken, DelimToken, HashToken, StringToken,
  NumberToken, DimensionToken
} from './types.ts';
import { 
  PSEUDO_CLASSES, 
  PSEUDO_ELEMENTS 
} from './data/gen/selectors.ts';
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

export function isNumberToken(val: ComponentValue | undefined): val is NumberToken {
  return val !== undefined && val.type === 'number';
}

export function isDimensionToken(val: ComponentValue | undefined): val is DimensionToken {
  return val !== undefined && val.type === 'dimension';
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
  strictSupports?: boolean;
}

/**
 * Selector Parser according to Selectors Level 4.
 *
 * selectors-4 § 16 #grammar
 * selectors-4 § 17.1 #parse-selector
 * selectors-4 § 17.2 #parse-relative-selector
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
  private strictSupports: boolean;

  constructor(values: ComponentValue[], options: SelectorParserOptions = {}) {
    this.cursor = new ComponentValueCursor(values);
    this.allowRelative = options.allowRelative ?? false;
    this.forgiving = options.forgiving ?? false;
    this.insideHas = options.insideHas ?? false;
    this.forbidPseudo = options.forbidPseudo ?? false;
    this.declaredNamespaces = options.declaredNamespaces;
    this.strictSupports = options.strictSupports ?? false;
  }


  private hasAmpersand(values: ComponentValue[]): boolean {
    return values.some(val => {
      if (isDelimToken(val, '&')) return true;
      if (isSimpleBlock(val)) return this.hasAmpersand(val.value);
      if (isCSSFunction(val)) return this.hasAmpersand(val.value);
      return false;
    });
  }

  /**
   * Parses component values into a SelectorList.
   *
   * selectors-4 § 4.1 #grouping (<selector-list>)
   * selectors-4 § 16 #grammar (<complex-selector-list>)
   * selectors-4 § 16.1 #forgiving-selector (parsing forgiving selector list)
   * selectors-4 § 17.1 #parse-selector
   */
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
          throw new DOMException('Unexpected token in selector', 'SyntaxError');
        }
      } catch (e) {
        if (this.forgiving) {
          this.cursor.skipToNextComma();
          
          const rawSlice = this.cursor.slice(start, this.cursor.i);
          let trimmedStart = 0;
          while (trimmedStart < rawSlice.length && rawSlice[trimmedStart].type === 'whitespace') trimmedStart++;
          let trimmedEnd = rawSlice.length - 1;
          while (trimmedEnd >= trimmedStart && rawSlice[trimmedEnd].type === 'whitespace') trimmedEnd--;
          
          const failedTokens = rawSlice.slice(trimmedStart, trimmedEnd + 1);
          if (failedTokens.length > 0) {
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
      throw new DOMException('Selector list cannot be empty', 'SyntaxError');
    }
    
    return { type: 'selector-list', selectors };
  }

  /**
   * Validates namespace prefixes against declared namespaces.
   *
   * selectors-4 § 3.8 #namespaces
   * selectors-4 § 17.1 #parse-selector step 2
   */
  private validateNamespace(namespace: string | undefined): void {
    if (this.declaredNamespaces !== undefined && namespace !== undefined && namespace !== '*' && namespace !== '') {
      if (!this.declaredNamespaces.has(namespace)) {
        throw new DOMException(`Undeclared namespace prefix: "${namespace}"`, 'SyntaxError');
      }
    }
  }
  /**
   * Consumes a complex selector.
   *
   * selectors-4 § 3.1 #structure (<complex-selector>)
   * selectors-4 § 16 #grammar
   */
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
        // selectors-4 § 3.4 #relative: Relative selector allowed only when flag is set
        if (items.length === 0 && !this.allowRelative) {
          throw new DOMException('Relative selector not allowed in this context', 'SyntaxError');
        }
        // selectors-4 § 3.6.1 #pseudo-element-syntax, § 3.6.5 #pseudo-element-structure
        if (seenPseudoElement) {
          throw new DOMException('Pseudo-element must be at the end of the selector', 'SyntaxError');
        }
        // selectors-4 § 16 #grammar: consecutive combinators are not allowed
        if (items.length > 0 && items[items.length - 1].type === 'combinator') {
          throw new DOMException('Consecutive combinators are not allowed', 'SyntaxError');
        }
        items.push(combinator);
        continue;
      }
      
      const compound = this.consumeCompoundSelector();
      if (compound.selectors.length > 0) {
        // selectors-4 § 3.6.1 #pseudo-element-syntax, § 3.6.5 #pseudo-element-structure
        if (seenPseudoElement) {
          throw new DOMException('Pseudo-element must be at the end of the selector', 'SyntaxError');
        }
        
        const hasPseudo = compound.selectors.some(s => s.type === 'pseudo-element-selector');
        
        // selectors-4 § 14.1 #descendant-combinators, § 16 #white-space: implicit descendant combinator between compounds
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
    
    // selectors-4 § 16 #grammar: trailing combinator is not allowed
    if (items.length > 0 && items[items.length - 1].type === 'combinator') {
      throw new DOMException('Trailing combinator is not allowed', 'SyntaxError');
    }
    
    // selectors-4 § 16 #grammar: complex selector cannot be empty
    if (items.length === 0) {
      throw new DOMException('Complex selector cannot be empty', 'SyntaxError');
    }
    
    const end = this.cursor.i;
    const tokens = this.cursor.slice(start, end);
    return { type: 'complex-selector', items, tokens };
  }

  /**
   * selectors-4 § 14 #combinators
   * selectors-5 § #the-column-combinator (||)
   */
  private tryConsumeCombinator(): Combinator | null {
    const token = this.cursor.next;
    if (!token) return null;
    
    if (isDelimToken(token)) {
      const val = token.value;
      // selectors-4 § 14.2 #child-combinators (>), § 14.3 #adjacent-sibling-combinators (+), § 14.4 #general-sibling-combinators (~)
      if (val === '>' || val === '+' || val === '~') {
        this.cursor.consume();
        return { type: 'combinator', value: val as ' ' | '>' | '+' | '~' | '||' };
      }
      // selectors-5 § #the-column-combinator (||)
      if (val === '|' && isDelimToken(this.cursor.peek(1), '|')) {
        this.cursor.consume();
        this.cursor.consume();
        return { type: 'combinator', value: '||' };
      }
    }
    
    return null;
  }

  // selectors-4 § 3.6.3 #pseudo-element-states
  // selectors-4 § 9 #useraction-pseudos
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
        throw new DOMException('Only user-action pseudo-classes are allowed after a pseudo-element', 'SyntaxError');
      }
    } else {
      throw new DOMException('Only user-action pseudo-classes are allowed after a pseudo-element', 'SyntaxError');
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
          if (selectors.length > 0) throw new DOMException('Type selector must be first in compound selector', 'SyntaxError');
          selectors.push(this.consumeTypeOrUniversalSelector());
          continue;
        }
        if (val === '*') {
           if (lastPseudoElement) break;
           if (selectors.length > 0) throw new DOMException('Universal selector must be first in compound selector', 'SyntaxError');
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
          throw new DOMException("ID selector must be an identifier", "SyntaxError");
        }
        if (lastPseudoElement) break;
        selectors.push({ type: 'id-selector', name: token.value });
        this.cursor.consume();
        continue;
      }

      if (isIdentToken(token)) {
        if (lastPseudoElement) break;
        if (selectors.length > 0) throw new DOMException('Type selector must be first in compound selector', 'SyntaxError');
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
              throw new DOMException('Pseudo-elements cannot be nested', 'SyntaxError');
            }
          } else if (selector.type === 'pseudo-class-selector') {
            if (!isSlottedOrPart) {
              this.validateSimpleSelectorAfterPseudo(selector);
            }
          } else {
             throw new DOMException('Unexpected selector after pseudo-element', 'SyntaxError');
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
      throw new DOMException('Unexpected EOF in type selector', 'SyntaxError');
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
      throw new DOMException('Expected identifier or * after namespace pipe', 'SyntaxError');
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
      throw new DOMException('Expected attribute selector block', 'SyntaxError');
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
      const v3 = subCursor.peek(2);
      const isPipeFollowedByEquals = isDelimToken(v2, '|') && isDelimToken(v3, '=');
      if (isIdentToken(v1) && isDelimToken(v2, '|') && !isPipeFollowedByEquals) {
        namespace = v1.value;
        subCursor.i += 2;
      } else if (isDelimToken(v1, '*') && isDelimToken(v2, '|') && !isPipeFollowedByEquals) {
        namespace = '*';
        subCursor.i += 2;
      } else if (isDelimToken(v1, '|') && !isDelimToken(v2, '=')) {
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
        throw new DOMException(`Invalid attribute selector flag: ${flagValue}`, 'SyntaxError');
      }
      flags = flagValue;
      subCursor.consume();
    }
    
    subCursor.skipWhitespace();
    if (subCursor.hasNext) {
      throw new DOMException('Unexpected content in attribute selector', 'SyntaxError');
    }
    
    if (!name) {
      throw new DOMException('Expected attribute name in attribute selector', 'SyntaxError');
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
          throw new DOMException('Pseudo-elements are not allowed in this context', 'SyntaxError');
        }
        if (!(PSEUDO_ELEMENTS as unknown as Set<string>).has(effectiveLowerName) && (this.strictSupports || !effectiveLowerName.startsWith('-webkit-'))) {
          throw new DOMException(`Unknown pseudo-element ::${name}`, 'SyntaxError');
        }
        return { type: 'pseudo-element-selector', name };
      }
      
      // Check for legacy pseudo-elements that use single colon
      if (['before', 'after', 'first-line', 'first-letter'].includes(effectiveLowerName)) {
        if (this.forbidPseudo || this.insideHas) {
          throw new DOMException('Pseudo-elements are not allowed in this context', 'SyntaxError');
        }
        return { type: 'pseudo-element-selector', name };
      }
      
      if (!(PSEUDO_CLASSES as unknown as Set<string>).has(effectiveLowerName) && (this.strictSupports || !effectiveLowerName.startsWith('-webkit-'))) {
        throw new DOMException(`Unknown pseudo-class :${name}`, 'SyntaxError');
      }
      return { type: 'pseudo-class-selector', name };
    } else if (isCSSFunction(token)) {
      const func = token;
      const name = func.name;
      const lowerName = name.toLowerCase();
      
      if (isPseudoElement) {
        if (this.forbidPseudo || this.insideHas) {
          throw new DOMException('Pseudo-elements are not allowed in this context', 'SyntaxError');
        }
        if (!(PSEUDO_ELEMENTS as unknown as Set<string>).has(lowerName)) {
          throw new DOMException(`Unknown pseudo-element ::${name}()`, 'SyntaxError');
        }
        
        if (lowerName === 'slotted') {
          const subParser = new SelectorParser(func.value, {
            insideHas: this.insideHas,
            forbidPseudo: true,
            declaredNamespaces: this.declaredNamespaces,
            strictSupports: this.strictSupports
          });
          subParser.cursor.skipWhitespace();
          const compound = subParser.consumeCompoundSelector();
          subParser.cursor.skipWhitespace();
          if (subParser.cursor.i !== func.value.length || compound.selectors.length === 0) {
            throw new DOMException('Argument to ::slotted() must be a compound selector', 'SyntaxError');
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
        throw new DOMException(`Unknown pseudo-class :${name}()`, 'SyntaxError');
      }
      
      // For functional pseudo-classes, some take selector lists
      if (['is', 'not', 'has', 'where', 'matches'].includes(lowerName)) {
        const isHas = lowerName === 'has';
        if (isHas && this.insideHas) {
          throw new DOMException(':has() cannot be nested', 'SyntaxError');
        }
        const isForgiving = !this.strictSupports && ['is', 'where', 'matches'].includes(lowerName);
        const isLogicalPseudo = ['is', 'where', 'not', 'matches'].includes(lowerName);
        const subParser = new SelectorParser(func.value, {
          allowRelative: isHas,
          forgiving: isForgiving,
          insideHas: isHas || this.insideHas,
          forbidPseudo: isLogicalPseudo || isHas || this.forbidPseudo,
          declaredNamespaces: this.declaredNamespaces,
          strictSupports: this.strictSupports
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
          throw new DOMException(`Argument to :${name}() must be a compound selector`, 'SyntaxError');
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
        for (let k = 0; k < func.value.length; k++) {
          const v = func.value[k];
          if (isIdentToken(v) && v.value.toLowerCase() === 'of') {
            ofIdx = k;
            break;
          }
        }
        if (ofIdx !== -1) {
          if (['nth-of-type', 'nth-last-of-type'].includes(lowerName)) {
            throw new DOMException(`'of' is not allowed in :${name}()`, 'SyntaxError');
          }
          const nth = func.value.slice(0, ofIdx);
          this.validateAnPlusB(nth);
          const subParserOf = new SelectorParser(func.value.slice(ofIdx + 1), {
            insideHas: this.insideHas,
            forbidPseudo: true,
            allowRelative: false,
            declaredNamespaces: this.declaredNamespaces,
            strictSupports: this.strictSupports
          });
          return { type: 'pseudo-class-selector', name, argument: subParserOf.parse(), nth };
        } else {
          this.validateAnPlusB(func.value);
          return { type: 'pseudo-class-selector', name, argument: func.value, nth: func.value };
        }
      }

      if (lowerName === 'dir') {
        this.validateDir(func.value);
      }

      if (lowerName === 'heading') {
        this.validateHeading(func.value);
      }

      if (lowerName === 'lang') {
        this.validateLang(func.value);
      }
      
      return { type: 'pseudo-class-selector', name, argument: func.value };
    }
    
    throw new DOMException('Expected identifier or function after colon in pseudo-selector', 'SyntaxError');
  }

  private validateAnPlusB(values: ComponentValue[]): { a: number; b: number } {
    const res = parseAnPlusB(values);
    if (!res) {
      const text = getOriginalText(values).trim();
      throw new DOMException(`Invalid An+B expression: ${text}`, 'SyntaxError');
    }
    return res;
  }

  private validateHeading(values: ComponentValue[]): void {
    const nonComment = values.filter(v => v.type !== 'comment');
    let start = 0;
    while (start < nonComment.length && nonComment[start].type === 'whitespace') start++;
    let end = nonComment.length - 1;
    while (end >= start && nonComment[end].type === 'whitespace') end--;
    if (start > end) {
      throw new DOMException('Argument to :heading() cannot be empty', 'SyntaxError');
    }
    const tokens = nonComment.slice(start, end + 1);
    let expectInteger = true;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'whitespace') continue;
      if (expectInteger) {
        if (t.type === 'number' && (t as { numberType?: string }).numberType === 'integer') {
          expectInteger = false;
        } else {
          throw new DOMException('Argument to :heading() must be comma-separated integers', 'SyntaxError');
        }
      } else {
        if (t.type === 'comma' || (t.type === 'delim' && t.value === ',')) {
          expectInteger = true;
        } else {
          throw new DOMException('Expected comma in :heading() arguments', 'SyntaxError');
        }
      }
    }
    if (expectInteger) {
      throw new DOMException('Trailing comma in :heading() arguments', 'SyntaxError');
    }
  }

  private validateDir(values: ComponentValue[]): void {
    const nonWs = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    const firstToken = nonWs[0];
    if (nonWs.length !== 1 || !isIdentToken(firstToken)) {
      throw new DOMException('Argument to :dir() must be a single identifier', 'SyntaxError');
    }
    const val = firstToken.value.toLowerCase();

    if (val !== 'ltr' && val !== 'rtl' && val !== 'auto') {
       throw new DOMException('Argument to :dir() must be ltr, rtl, or auto', 'SyntaxError');
    }
  }

  private validateLang(values: ComponentValue[]): void {
    const nonWs = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (nonWs.length === 0) {
      throw new DOMException('Argument to :lang() cannot be empty', 'SyntaxError');
    }
    
    let expectItem = true;
    for (const v of nonWs) {
      if (expectItem) {
        if (!isIdentToken(v) && !isStringToken(v)) {
          throw new DOMException('Argument to :lang() must be identifiers or strings', 'SyntaxError');
        }
        expectItem = false;
      } else {
        if (v.type !== 'comma') {
          throw new DOMException('Expected comma in :lang() argument', 'SyntaxError');
        }
        expectItem = true;
      }
    }
    if (expectItem) {
      throw new DOMException('Trailing comma in :lang() argument', 'SyntaxError');
    }
  }
}

export interface AnPlusBValue {
  a: number;
  b: number;
}

/**
 * Parses An+B microsyntax into { a, b }.
 *
 * selectors-4 § 13.3 #child-index
 * css-syntax-3 § 8 #anb-microsyntax
 * css-syntax-3 § 8.1 #anb-syntax
 * css-syntax-3 § 8.2 #the-anb-type (<a-n-plus-b> production)
 */
export function parseAnPlusB(values: ComponentValue[]): AnPlusBValue | null {
  const nonComment = values.filter(v => v.type !== 'comment');
  let start = 0;
  while (start < nonComment.length && nonComment[start].type === 'whitespace') start++;
  let end = nonComment.length - 1;
  while (end >= start && nonComment[end].type === 'whitespace') end--;

  if (start > end) return null;
  const tokens = nonComment.slice(start, end + 1);

  const isIntegerNumber = (t: ComponentValue | undefined): t is NumberToken => {
    return isNumberToken(t) && t.numberType === 'integer';
  };

  if (tokens.length === 1) {
    const t = tokens[0];
    if (isIdentToken(t)) {
      const lower = t.value.toLowerCase();
      if (lower === 'odd') return { a: 2, b: 1 };
      if (lower === 'even') return { a: 2, b: 0 };
      if (lower === 'n') return { a: 1, b: 0 };
      if (lower === '-n') return { a: -1, b: 0 };
      const matchNdashDigit = lower.match(/^n-(\d+)$/);
      if (matchNdashDigit) return { a: 1, b: -parseInt(matchNdashDigit[1], 10) };
      const matchDashNdashDigit = lower.match(/^-n-(\d+)$/);
      if (matchDashNdashDigit) return { a: -1, b: -parseInt(matchDashNdashDigit[1], 10) };
      return null;
    }
    if (isIntegerNumber(t)) {
      return { a: 0, b: Number(t.value) };
    }
    if (isDimensionToken(t) && t.numberType === 'integer') {
      const unit = (t.unit || '').toLowerCase();
      if (unit === 'n') return { a: Number(t.value), b: 0 };
      const matchDim = unit.match(/^n-(\d+)$/);
      if (matchDim) return { a: Number(t.value), b: -parseInt(matchDim[1], 10) };
      return null;
    }
    return null;
  }

  let idx = 0;
  let plusPrefix = false;
  if (isDelimToken(tokens[0], '+')) {
    plusPrefix = true;
    idx = 1;
    if (tokens[1]?.type === 'whitespace') {
      return null;
    }
  }

  const nextNonWs = (from: number): number => {
    let p = from;
    while (p < tokens.length && tokens[p].type === 'whitespace') p++;
    return p;
  };

  const t1 = tokens[idx];
  if (!t1) return null;

  let a: number | null = null;
  let hasDashAfterN = false;

  if (isIdentToken(t1)) {
    const lower = t1.value.toLowerCase();
    if (lower === 'n') {
      a = 1;
    } else if (lower === '-n' && !plusPrefix) {
      a = -1;
    } else if (lower === 'n-') {
      a = 1;
      hasDashAfterN = true;
    } else if (lower === '-n-' && !plusPrefix) {
      a = -1;
      hasDashAfterN = true;
    } else if (lower.startsWith('n-')) {
      const match = lower.match(/^n-(\d+)$/);
      if (match && idx === tokens.length - 1) return { a: 1, b: -parseInt(match[1], 10) };
    }
  } else if (isDimensionToken(t1) && t1.numberType === 'integer' && !plusPrefix) {
    const unit = (t1.unit || '').toLowerCase();
    if (unit === 'n') {
      a = Number(t1.value);
    } else if (unit === 'n-') {
      a = Number(t1.value);
      hasDashAfterN = true;
    }
  }

  if (a === null) return null;

  const afterT1 = nextNonWs(idx + 1);
  if (afterT1 >= tokens.length) {
    if (!hasDashAfterN) return { a, b: 0 };
    return null;
  }

  const t2 = tokens[afterT1];

  if (hasDashAfterN) {
    if (isIntegerNumber(t2) && !t2.sign) {
      const afterT2 = nextNonWs(afterT1 + 1);
      if (afterT2 < tokens.length) return null;
      return { a, b: -Number(t2.value) };
    }
    return null;
  }

  if (isIntegerNumber(t2) && t2.sign) {
    const afterT2 = nextNonWs(afterT1 + 1);
    if (afterT2 < tokens.length) return null;
    return { a, b: Number(t2.value) };
  }

  if (isDelimToken(t2, '+') || isDelimToken(t2, '-')) {
    const sign = t2.value === '+' ? 1 : -1;
    const afterT2 = nextNonWs(afterT1 + 1);
    if (afterT2 >= tokens.length) return null;
    const t3 = tokens[afterT2];
    if (isIntegerNumber(t3) && !t3.sign) {
      const afterT3 = nextNonWs(afterT2 + 1);
      if (afterT3 < tokens.length) return null;
      return { a, b: sign * Number(t3.value) };
    }
    return null;
  }

  return null;
}
