/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { unitToBase, unitToPixels } from './data/units.ts';
import { tokenize } from './tokenizer.ts';
import { Parser } from './parser.ts';
import type { ComponentValue, Token, SimpleBlock, CSSFunction } from './types.ts';
import { ArrayTokenStream } from './TokenStream.ts';

export interface PropertyDefinition {
  name: string;
  syntax?: string;
  inherits: boolean;
  initialValue?: string;
}

const VALID_COMPONENTS = new Set([
  'length', 'number', 'percentage', 'length-percentage',
  'color', 'image', 'url', 'integer', 'angle', 'time',
  'resolution', 'transform-function', 'transform-list', 'custom-ident', 'string'
]);

const VIEWPORT_UNITS = new Set([
  'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax',
  'svw', 'svh', 'svi', 'svb', 'svmin', 'svmax',
  'lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax',
  'dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax'
]);



interface SyntaxComponent {
  name: string;
  multiplier: string;
}

function parseSyntax(syntax: string): SyntaxComponent[] | '*' {
  const s = syntax.trim();
  if (s === '*') return '*';
  if (s === '') throw new DOMException('Empty syntax string', 'SyntaxError');

  const tokens = tokenize(s);
  const stream = new ArrayTokenStream(tokens);
  const definition: SyntaxComponent[] = [];

  const skipWhitespace = () => {
    while (stream.peek().type === 'whitespace') {
      stream.next();
    }
  };

  skipWhitespace();

  while (stream.peek().type !== 'EOF') {
    const component = consumeSyntaxComponent(stream);
    definition.push(component);

    skipWhitespace();
    const next = stream.next();
    if (next.type === 'EOF') break;
    if (next.type === 'delim' && next.value === '|') {
      skipWhitespace();
      continue;
    }
    throw new DOMException(`Unexpected token in syntax string: ${next.type}`, 'SyntaxError');
  }

  return definition;
}

function consumeSyntaxComponent(stream: ArrayTokenStream): SyntaxComponent {
  const token = stream.next();
  let name = '';
  let multiplier = '';

  if (token.type === 'delim' && token.value === '<') {
    name = '<';
    while (true) {
      const t = stream.next();
      if (t.type === 'EOF') throw new DOMException('Unterminated data type name', 'SyntaxError');
      if (t.type === 'delim' && t.value === '>') {
        name += '>';
        break;
      }
      if (t.type === 'ident') {
        name += t.value;
      } else {
        throw new DOMException(`Unexpected token in data type name: ${t.type}`, 'SyntaxError');
      }
    }
    const bareName = name.slice(1, -1);
    if (!VALID_COMPONENTS.has(bareName)) {
      throw new DOMException(`Unknown syntax component: ${name}`, 'SyntaxError');
    }
  } else if (token.type === 'ident') {
    name = token.value.toString();
    const lowerName = name.toLowerCase();
    const keywords = ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'];
    if (keywords.includes(lowerName)) {
      throw new DOMException(`CSS-wide keyword "${name}" is not allowed as a literal identifier in syntax string`, 'SyntaxError');
    }
  } else {
    throw new DOMException(`Unexpected token in syntax component: ${token.type}`, 'SyntaxError');
  }

  if (name === '<transform-list>') {
    return { name, multiplier: '' };
  }

  const next = stream.peek();
  if (next.type === 'whitespace') {
    stream.next();
    const afterWs = stream.peek();
    if (afterWs.type === 'delim' && (afterWs.value === '+' || afterWs.value === '#')) {
      stream.next();
      multiplier = afterWs.value;
    }
  } else if (next.type === 'delim' && (next.value === '+' || next.value === '#')) {
    stream.next();
    multiplier = next.value;
  }

  return { name, multiplier };
}

function validateSyntax(syntax: string): boolean {
  try {
    parseSyntax(syntax);
    return true;
  } catch (e) {
    return false;
  }
}

export function matchesSyntax(tokens: ComponentValue[], syntax: string): boolean {
  if (syntax === '*') return true;
  let components: SyntaxComponent[] | '*';
  try {
    components = parseSyntax(syntax);
  } catch (e) {
    return false;
  }
  if (components === '*') return true;
  
  for (const comp of components) {
    let name = comp.name;
    const multiplier = comp.multiplier;

    if (name.startsWith('<') && name.endsWith('>')) {
      name = name.slice(1, -1);
      
      const VALID_TRANSFORM_FUNCTIONS = new Set([
        'matrix', 'matrix3d',
        'translate', 'translate3d', 'translatex', 'translatey', 'translatez',
        'scale', 'scale3d', 'scalex', 'scaley', 'scalez',
        'rotate', 'rotate3d', 'rotatex', 'rotatey', 'rotatez',
        'skew', 'skewx', 'skewy',
        'perspective'
      ]);

      const checkItem = (itemTokens: ComponentValue[]) => {
        if (name === 'transform-list') {
          if (itemTokens.length === 0) return false;
          return itemTokens.every(t => {
            if (t.type !== 'function') return false;
            const funcName = (t as CSSFunction).name.toLowerCase();
            return VALID_TRANSFORM_FUNCTIONS.has(funcName);
          });
        }

        if (itemTokens.length !== 1) return false;
        const t = itemTokens[0];
        const isCalc = t.type === 'function' && (t as CSSFunction).name.toLowerCase() === 'calc';
        
        if (name === 'length') return isCalc || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'length') || (t.type === 'number' && t.value === 0);
        if (name === 'number') return isCalc || t.type === 'number';
        if (name === 'percentage') return isCalc || t.type === 'percentage';
        if (name === 'length-percentage') return isCalc || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'length') || t.type === 'percentage' || (t.type === 'number' && t.value === 0);
        if (name === 'integer') return t.type === 'number' && t.numberType === 'integer';
        if (name === 'angle') return isCalc || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'angle');
        if (name === 'time') return isCalc || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'time');
        if (name === 'resolution') return isCalc || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'resolution');

        if (name === 'color') return t.type === 'ident' || t.type === 'function' || (t.type === 'hash');
        if (name === 'url') return t.type === 'url' || (t.type === 'function' && (t as CSSFunction).name === 'url');
        if (name === 'image') return t.type === 'url' || t.type === 'function';
        if (name === 'custom-ident') {
          if (t.type !== 'ident') return false;
          const val = (t as Token).value.toString().toLowerCase();
          return !['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'].includes(val);
        }
        if (name === 'string') return t.type === 'string';
        if (name === 'transform-function') {
          if (t.type !== 'function') return false;
          const funcName = (t as CSSFunction).name.toLowerCase();
          return VALID_TRANSFORM_FUNCTIONS.has(funcName);
        }
        return true;
      };

      if (multiplier === '#') {
        const items: ComponentValue[][] = [[]];
        for (const t of tokens) {
          if (t.type === 'comma') items.push([]);
          else items[items.length - 1].push(t);
        }
        if (items.every(item => checkItem(item))) return true;
      } else if (multiplier === '+') {
        if (tokens.length > 0 && tokens.every(t => checkItem([t]))) return true;
      } else {
        if (checkItem(tokens)) return true;
      }
    } else {
      // Ident literal
      if (tokens.length === 1 && tokens[0].type === 'ident' && (tokens[0] as Token).value.toString() === name) return true;
    }
  }
  return false;
}

function isComputationallyIndependent(tokens: ComponentValue[]): boolean {
  for (const t of tokens) {
    if (t.type === 'function') {
      const name = (t as CSSFunction).name.toLowerCase();
      if (['var', 'attr'].includes(name)) return false;
      if (!isComputationallyIndependent((t as CSSFunction).value)) return false;
    }
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();

      if (unit && !(unit in unitToPixels) && !VIEWPORT_UNITS.has(unit) && !['angle', 'time', 'resolution', 'frequency'].includes(unitToBase[unit] as string)) {
        return false;
      }
    }
    if (t.type === 'ident' && t.value.toLowerCase() === 'currentcolor') return false;

    if (t.type === 'simple-block') {
      if (!isComputationallyIndependent((t as SimpleBlock).value)) return false;
    }
  }
  return true;
}

interface PropertyDefinitionInternal extends PropertyDefinition {
  origin: 'js' | 'css';
}

const registry = new Map<string, PropertyDefinitionInternal>();

export const PropertyRegistry = {
  validate(definition: PropertyDefinition) {
    if (definition.inherits === undefined) {
      throw new TypeError('The inherits flag is required.');
    }
    if (!Parser.isValidDashedIdent(definition.name)) {
      throw new DOMException('Property name must be a valid <dashed-ident>', 'SyntaxError');
    }
    
    const syntax = definition.syntax || '*';
    if (!validateSyntax(syntax)) {
      throw new DOMException(`Invalid syntax string: ${syntax}`, 'SyntaxError');
    }

    if (syntax !== '*' && definition.initialValue === undefined) {
      throw new DOMException('initialValue is required for non-universal syntax', 'SyntaxError');
    }

    if (definition.initialValue !== undefined) {
      const tokens = tokenize(definition.initialValue).filter(t => t.type !== 'whitespace');
      const parser = new Parser(tokens);
      const values = parser.parseComponentValues();
      
      if (parser.errors.length > 0) {
        throw new DOMException(`initialValue "${definition.initialValue}" has parse errors`, 'SyntaxError');
      }
      
      if (syntax === '*') {
        if (!Parser.validateCustomPropertyValue(values)) {
          throw new DOMException(`initialValue "${definition.initialValue}" is not a valid declaration value`, 'SyntaxError');
        }
      } else {
        if (!isComputationallyIndependent(values)) {
          throw new DOMException(`initialValue is not computationally independent: ${definition.initialValue}`, 'SyntaxError');
        }
        
        if (!matchesSyntax(values, syntax)) {
          throw new DOMException(`initialValue "${definition.initialValue}" does not match syntax "${syntax}"`, 'SyntaxError');
        }
      }
    }
  },

  register(definition: PropertyDefinition, origin: 'js' | 'css' = 'js') {
    this.validate(definition);
    const existing = registry.get(definition.name);
    if (existing) {
      if (existing.origin === 'js') {
        if (origin === 'js') {
          throw new DOMException(`Property "${definition.name}" is already registered`, 'InvalidModificationError');
        }
        return; // Ignore CSS override of JS registration
      }
    }
    registry.set(definition.name, { ...definition, origin });
  },

  unregister(name: string, origin: 'js' | 'css') {
    const existing = registry.get(name);
    if (existing && existing.origin === origin) {
      registry.delete(name);
    }
  },

  get(name: string): PropertyDefinition | undefined {
    return registry.get(name);
  },

  clear() {
    registry.clear();
  }
};
