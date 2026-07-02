/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { 
  SelectorList, ComplexSelector, CompoundSelector, SimpleSelector, 
  Combinator, ComponentValue, Token, SimpleBlock, CSSFunction,
  InvalidSelector
} from './types.ts';
import { 
  PSEUDO_CLASSES, 
  PSEUDO_ELEMENTS 
} from './data/selectors.ts';
import { getOriginalText } from './serializer.ts';

const LEGACY_PSEUDO_CLASS_ALIASES: Record<string, string> = {
  '-webkit-autofill': 'autofill',
};

/**
 * Selector Parser according to Selectors Level 4.
 * @see https://drafts.csswg.org/selectors-4/#grammar
 */
export class SelectorParser {
  public static readonly PSEUDO_CLASSES = PSEUDO_CLASSES;
  public static readonly PSEUDO_ELEMENTS = PSEUDO_ELEMENTS;


  private values: ComponentValue[];
  private i: number = 0;
  private allowRelative: boolean;
  private forgiving: boolean;
  private insideHas: boolean;
  private forbidPseudo: boolean;

  constructor(values: ComponentValue[], allowRelative: boolean = false, forgiving: boolean = false, insideHas: boolean = false, forbidPseudo: boolean = false) {
    this.values = values;
    this.allowRelative = allowRelative;
    this.forgiving = forgiving;
    this.insideHas = insideHas;
    this.forbidPseudo = forbidPseudo;
  }

  private get next(): ComponentValue | undefined {
    return this.values[this.i];
  }

  private consume(): ComponentValue {
    return this.values[this.i++] || { type: 'EOF', value: '' } as unknown as ComponentValue;
  }

  private hasAmpersand(values: ComponentValue[]): boolean {
    return values.some(val => {
      if (val.type === 'delim' && (val as Token).value === '&') return true;
      if (val.type === 'simple-block') return this.hasAmpersand((val as SimpleBlock).value);
      if (val.type === 'function') return this.hasAmpersand((val as CSSFunction).value);
      return false;
    });
  }

  public parse(): SelectorList {
    const selectors: (ComplexSelector | InvalidSelector)[] = [];
    
    while (this.i < this.values.length) {
      this.skipWhitespace();
      if (this.i >= this.values.length || this.next?.type === 'EOF') break;
      
      const start = this.i;
      try {
        const selector = this.consumeComplexSelector();
        this.skipWhitespace();
        
        const next = this.next;
        if (!next || next.type === 'comma' || (next as Token).type === 'EOF') {
          selectors.push(selector);

        } else {
          throw new SyntaxError('Unexpected token in selector');
        }
      } catch (e) {
        if (this.forgiving) {
          this.skipToNextComma();
          
          const failedTokens = this.values.slice(start, this.i);
          if (this.hasAmpersand(failedTokens)) {
            selectors.push({ type: 'invalid-selector', tokens: failedTokens });
          }
        } else {
          throw e;
        }
      }
      
      if (this.next?.type === 'comma') {
        this.consume();
      }
    }
    
    if (!this.forgiving && selectors.length === 0) {
      throw new SyntaxError('Selector list cannot be empty');
    }
    
    return { type: 'selector-list', selectors };
  }

  private skipWhitespace() {
    while (this.next?.type === 'whitespace') {
      this.i++;
    }
  }

  private skipToNextComma() {
    const commaOffset = this.values.slice(this.i).findIndex(v => v.type === 'comma');
    this.i = commaOffset === -1 ? this.values.length : this.i + commaOffset;
  }

  private consumeComplexSelector(): ComplexSelector {
    const items: (CompoundSelector | Combinator)[] = [];
    const start = this.i;
    let seenPseudoElement = false;
    
    while (this.i < this.values.length) {
      this.skipWhitespace();
      if (this.i >= this.values.length || this.next?.type === 'comma') break;
      
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
    
    const end = this.i;
    const tokens = this.values.slice(start, end);
    return { type: 'complex-selector', items, tokens };

  }


  private tryConsumeCombinator(): Combinator | null {
    const token = this.next;
    if (!token) return null;
    
    if (token.type === 'delim') {
      const val = (token as Token).value;
      if (val === '>' || val === '+' || val === '~') {
        this.consume();
        return { type: 'combinator', value: val as ' ' | '>' | '+' | '~' | '||' };
      }
      if (val === '|' && this.values[this.i + 1]?.type === 'delim' && (this.values[this.i + 1] as Token).value === '|') {
        this.consume();
        this.consume();
        return { type: 'combinator', value: '||' };
      }
    }
    
    return null;
  }

  private isUserActionPseudoClass(name: string): boolean {
    const lower = name.toLowerCase();
    return ['hover', 'active', 'focus', 'focus-visible', 'focus-within'].includes(lower);
  }

  private validateSelectorListAfterPseudo(selectorList: SelectorList): void {
    for (const selector of selectorList.selectors) {
      if (selector.type === 'invalid-selector') {
        throw new SyntaxError('Invalid selector in :not()');
      }
      if (selector.items.length !== 1 || selector.items[0].type !== 'compound-selector') {
        throw new SyntaxError('Only compound selectors are allowed in :not() after a pseudo-element');
      }
      const compound = selector.items[0] as CompoundSelector;
      for (const simple of compound.selectors) {
        this.validateSimpleSelectorAfterPseudo(simple);
      }
    }
  }

  private validateSimpleSelectorAfterPseudo(selector: SimpleSelector): void {
    if (selector.type === 'pseudo-class-selector') {
      const lowerName = selector.name.toLowerCase();
      if (lowerName === 'not') {
        if (selector.argument && !Array.isArray(selector.argument) && selector.argument.type === 'selector-list') {
          this.validateSelectorListAfterPseudo(selector.argument);
        }
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
    
    while (this.i < this.values.length) {
      const token = this.next;
      if (!token || token.type === 'whitespace' || token.type === 'comma') break;
      
      if (token.type === 'delim') {
        const val = (token as Token).value;
        if (val === '>' || val === '+' || val === '~') break;
        if (val === '|') {
          if (lastPseudoElement) break;
          // Could be namespace prefix or column combinator
          if (this.values[this.i + 1]?.type === 'delim' && (this.values[this.i + 1] as Token).value === '|') {
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
           this.consume();
           selectors.push({ type: 'nesting-selector' });
           continue;
        }
      }
      
      if (token.type === 'hash') {
        if (token.hashType !== 'id') {
          throw new SyntaxError("ID selector must be an identifier");
        }
        if (lastPseudoElement) break;
        selectors.push({ type: 'id-selector', name: token.value });
        this.consume();
        continue;
      }

      
      if (token.type === 'ident') {
        if (lastPseudoElement) break;
        if (selectors.length > 0) throw new SyntaxError('Type selector must be first in compound selector');
        selectors.push(this.consumeTypeOrUniversalSelector());
        continue;
      }
      
      if (token.type === 'simple-block' && (token as SimpleBlock).associatedToken.type === '[') {
        if (lastPseudoElement) break;
        selectors.push(this.consumeAttributeSelector());
        continue;
      }
      
      if (token.type === 'colon') {
        const selector = this.consumePseudoSelector();
        if (lastPseudoElement) {
          const isSlottedOrPart = ['slotted', 'part'].includes(lastPseudoElement.toLowerCase());
          
          if (selector.type === 'pseudo-element-selector') {
            const isTreeAbiding = ['before', 'after', 'marker', 'placeholder'].includes(selector.name.toLowerCase());
            if (!isSlottedOrPart || !isTreeAbiding) {
              throw new SyntaxError('Only tree-abiding pseudo-elements are allowed after ::slotted() or ::part()');
            }
          } else if (selector.type === 'pseudo-class-selector') {
            this.validateSimpleSelectorAfterPseudo(selector);
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
    const token = this.next as Token;

    // Check for namespace prefix
    const isNextPipe = this.values[this.i + 1]?.type === 'delim' && (this.values[this.i + 1] as Token).value === '|';
    const isNextNextPipe = this.values[this.i + 2]?.type === 'delim' && (this.values[this.i + 2] as Token).value === '|';
    const isColumnCombinator = isNextPipe && isNextNextPipe;

    if (token.type === 'ident' && isNextPipe && !isColumnCombinator) {
       namespace = token.value;
       this.i += 2;
    } else if (token.type === 'delim' && token.value === '*' && isNextPipe && !isColumnCombinator) {
       namespace = '*';
       this.i += 2;
    } else if (token.type === 'delim' && token.value === '|' && !isNextPipe) {
       namespace = '';
       this.i += 1;
    }

    const next = this.consume() as Token;
    if (next.type === 'delim' && next.value === '*') {
      return { type: 'universal-selector', namespace };
    }
    if (next.type !== 'ident') {
      throw new SyntaxError('Expected identifier or * after namespace pipe');
    }
    return { type: 'type-selector', name: next.value, namespace };
  }

  private consumeClassSelector(): SimpleSelector {
    this.consume(); // .
    const ident = this.consume();
    if (ident.type !== 'ident') return { type: 'class-selector', name: '' };
    return { type: 'class-selector', name: ident.value };

  }

  private consumeAttributeSelector(): SimpleSelector {
    const block = this.consume() as SimpleBlock;
    const vals = block.value;
    let name = '';
    let namespace: string | undefined = undefined;
    let operator = '';
    let value = '';
    let flags = '';
    
    let j = 0;
    while (j < vals.length && vals[j].type === 'whitespace') j++;
    if (j < vals.length) {
      const v1 = vals[j];
      const v2 = vals[j+1];
      if (v1.type === 'ident' && v2?.type === 'delim' && v2.value === '|') {
        namespace = v1.value;
        j += 2;
      } else if (v1.type === 'delim' && v1.value === '*' && v2?.type === 'delim' && v2.value === '|') {
        namespace = '*';
        j += 2;
      } else if (v1.type === 'delim' && v1.value === '|') {
        namespace = '';
        j++;
      }
    }

    
    const valName = vals[j];
    if (valName && valName.type === 'ident') {
      name = valName.value;
      j++;
    }

    
    while (j < vals.length && vals[j].type === 'whitespace') j++;
    const valOp = vals[j];
    if (valOp && valOp.type === 'delim') {
      operator = valOp.value;
      j++;
      const valEq = vals[j];
      if (valEq && valEq.type === 'delim' && valEq.value === '=') {
        operator += valEq.value;
        j++;
      }
    }

    
    while (j < vals.length && vals[j].type === 'whitespace') j++;
    const valVal = vals[j];
    if (valVal && (valVal.type === 'string' || valVal.type === 'ident')) {
      value = valVal.value;
      j++;
    }

    
    while (j < vals.length && vals[j].type === 'whitespace') j++;
    const valFlag = vals[j];
    if (valFlag && valFlag.type === 'ident') {
      const flagValue = valFlag.value;
      const lowerFlag = flagValue.toLowerCase();

      if (lowerFlag !== 'i' && lowerFlag !== 's') {
        throw new SyntaxError(`Invalid attribute selector flag: ${flagValue}`);
      }
      flags = flagValue;
      j++;
    }
    
    while (j < vals.length && vals[j].type === 'whitespace') j++;
    if (j < vals.length) {
      throw new SyntaxError('Unexpected content in attribute selector');
    }
    
    return { type: 'attribute-selector', name, namespace, operator, value, flags };
  }

  private consumePseudoSelector(): SimpleSelector {
    this.consume(); // :
    let isPseudoElement = false;
    if (this.next?.type === 'colon') {
      this.consume();
      isPseudoElement = true;
    }
    
    const token = this.consume();
    if (!token) return { type: 'pseudo-class-selector', name: '' };
    if (token.type === 'ident') {
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
    } else if (token.type === 'function') {
      const func = token as CSSFunction;
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
          const subParser = new SelectorParser(func.value, false, false, this.insideHas, true);
          subParser.skipWhitespace();
          const compound = subParser.consumeCompoundSelector();
          subParser.skipWhitespace();
          if (subParser.i !== func.value.length || compound.selectors.length === 0) {
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
        const subParser = new SelectorParser(func.value, isHas, isForgiving, isHas || this.insideHas, isLogicalPseudo || isHas || this.forbidPseudo);
        return { type: 'pseudo-class-selector', name, argument: subParser.parse() };
      }

      if (['host', 'host-context'].includes(lowerName)) {
        const subParser = new SelectorParser(func.value, false, false, this.insideHas, true);
        subParser.skipWhitespace();
        const compound = subParser.consumeCompoundSelector();
        subParser.skipWhitespace();
        if (subParser.i !== func.value.length || compound.selectors.length === 0) {
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
             if (v.type === 'ident' && v.value.toLowerCase() === 'of') {
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
             const subParserOf = new SelectorParser(func.value.slice(ofIdx + 1), false, false, this.insideHas, true);
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
    if (nonWs.length !== 1 || !firstToken || firstToken.type !== 'ident') {
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
        if (v.type !== 'ident' && v.type !== 'string') {
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
