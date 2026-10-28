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
import { unitToBase, unitToPixels } from './data/gen/units.ts';
import { NAMED_COLORS } from './data/gen/colors.ts';
import { tokenize } from './tokenizer.ts';
import { ParseHooks } from './parse-hooks.ts';
import { parseComponentValues, validateCustomPropertyValue } from './parser.ts';
import type { ComponentValue, Token, SimpleBlock, CSSFunction, ParseError } from './types.ts';
import { ArrayTokenStream } from './TokenStream.ts';

export interface PropertyDefinition {
  name: string;
  syntax?: string;
  inherits: boolean;
  initialValue?: string;
  origin?: 'js' | 'css';
  parsedInitialValue?: ComponentValue[];
}

// css-properties-values-api #supported-names
const REGISTERED_PROPERTY_COMPONENTS = new Set([
  'length', 'number', 'percentage', 'length-percentage',
  'color', 'image', 'url', 'integer', 'angle', 'time',
  'resolution', 'transform-function', 'transform-list', 'custom-ident', 'string'
]);

const ALL_SYNTAX_COMPONENTS = new Set([
  ...REGISTERED_PROPERTY_COMPONENTS,
  'flex'
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

// css-properties-values-api #consume-syntax-definition
function parseSyntax(syntax: string, isRegistered = false): SyntaxComponent[] | '*' {
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
    const component = consumeSyntaxComponent(stream, isRegistered);
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

// css-properties-values-api #consume-syntax-component
function consumeSyntaxComponent(stream: ArrayTokenStream, isRegistered = false): SyntaxComponent {
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
    const allowed = isRegistered ? REGISTERED_PROPERTY_COMPONENTS : ALL_SYNTAX_COMPONENTS;
    if (!allowed.has(bareName)) {
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

  // css-properties-values-api #consume-syntax-component
  // css-properties-values-api #multipliers
  const next = stream.peek();
  if (next.type === 'delim' && (next.value === '+' || next.value === '#')) {
    stream.next();
    multiplier = next.value;
  }

  return { name, multiplier };
}

function validateSyntax(syntax: string, isRegistered = false): boolean {
  try {
    parseSyntax(syntax, isRegistered);
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

    let checkItem: (itemTokens: ComponentValue[]) => boolean;

    if (name.startsWith('<') && name.endsWith('>')) {
      const typeName = name.slice(1, -1);

      const VALID_TRANSFORM_FUNCTIONS = new Set([
        'matrix', 'matrix3d',
        'translate', 'translate3d', 'translatex', 'translatey', 'translatez',
        'scale', 'scale3d', 'scalex', 'scaley', 'scalez',
        'rotate', 'rotate3d', 'rotatex', 'rotatey', 'rotatez',
        'skew', 'skewx', 'skewy',
        'perspective'
      ]);

      checkItem = (itemTokens: ComponentValue[]) => {
        if (typeName === 'transform-list') {
          if (itemTokens.length === 0) return false;
          return itemTokens.every(t => {
            if (t.type !== 'function') return false;
            const funcName = (t as CSSFunction).name.toLowerCase();
            return VALID_TRANSFORM_FUNCTIONS.has(funcName);
          });
        }

        if (itemTokens.length !== 1) return false;
        const t = itemTokens[0];
        const MATH_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp', 'round', 'mod', 'rem', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'sqrt', 'hypot', 'log', 'exp', 'abs', 'sign']);
        const isMathFunction = t.type === 'function' && MATH_FUNCTIONS.has((t as CSSFunction).name.toLowerCase());

        if (typeName === 'length') return isMathFunction || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'length') || (t.type === 'number' && t.value === 0);
        if (typeName === 'number') return isMathFunction || t.type === 'number';
        if (typeName === 'percentage') return isMathFunction || t.type === 'percentage';
        if (typeName === 'length-percentage') return isMathFunction || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'length') || t.type === 'percentage' || (t.type === 'number' && t.value === 0);
        if (typeName === 'flex') return isMathFunction || (t.type === 'dimension' && t.unit.toLowerCase() === 'fr');
        if (typeName === 'integer') return isMathFunction || (t.type === 'number' && t.numberType === 'integer');
        if (typeName === 'angle') return isMathFunction || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'angle');
        if (typeName === 'time') return isMathFunction || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'time');
        if (typeName === 'resolution') return isMathFunction || (t.type === 'dimension' && unitToBase[t.unit.toLowerCase()] === 'resolution');

        if (typeName === 'color') {
          if (t.type === 'hash') {
            return /^[0-9a-fA-F]{3,4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(t.value);
          }
          if (t.type === 'function') {
            const funcName = (t as CSSFunction).name.toLowerCase();
            const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
            return COLOR_FUNCTIONS.has(funcName);
          }
          if (t.type === 'ident') {
            const val = (t as Token).value.toString().toLowerCase();
            const SYSTEM_COLORS = new Set([
              'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext',
              'buttonface', 'buttontext', 'buttonborder', 'field', 'fieldtext',
              'highlight', 'highlighttext', 'selecteditem', 'selecteditemtext',
              'mark', 'marktext', 'graytext', 'accentcolor', 'accentcolortext',
              'activeborder', 'activecaption', 'appworkspace', 'background',
              'buttonhighlight', 'buttonshadow', 'captiontext', 'inactiveborder',
              'inactivecaption', 'inactivecaptiontext', 'infobackground', 'infotext',
              'menu', 'menutext', 'scrollbar', 'threeddarkshadow', 'threedface',
              'threedhighlight', 'threedlightshadow', 'threedshadow', 'window',
              'windowframe', 'windowtext', 'currentcolor'
            ]);
            return val in NAMED_COLORS || SYSTEM_COLORS.has(val);
          }
          return false;
        }
        if (typeName === 'url') return t.type === 'url' || (t.type === 'function' && (t as CSSFunction).name === 'url');
        if (typeName === 'image') return t.type === 'url' || t.type === 'function';
        if (typeName === 'custom-ident') {
          if (t.type !== 'ident') return false;
          const val = (t as Token).value.toString().toLowerCase();
          return !['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'].includes(val);
        }
        if (typeName === 'string') return t.type === 'string';
        if (typeName === 'transform-function') {
          if (t.type !== 'function') return false;
          const funcName = (t as CSSFunction).name.toLowerCase();
          return VALID_TRANSFORM_FUNCTIONS.has(funcName);
        }
        return true;
      };
    } else {
      // Ident literal
      checkItem = (itemTokens: ComponentValue[]) => {
        return (
          itemTokens.length === 1 &&
          itemTokens[0].type === 'ident' &&
          (itemTokens[0] as Token).value.toString() === name
        );
      };
    }

    if (multiplier === '#') {
      const items: ComponentValue[][] = [[]];
      for (const t of tokens) {
        if (t.type === 'EOF') continue;
        if (t.type === 'comma') {
          items.push([]);
        } else if (t.type !== 'whitespace' && t.type !== 'comment') {
          items[items.length - 1].push(t);
        }
      }
      if (items.length > 0 && items.every(item => item.length > 0 && checkItem(item))) return true;
    } else if (multiplier === '+') {
      const items: ComponentValue[][] = [];
      let current: ComponentValue[] = [];
      for (const t of tokens) {
        if (t.type === 'EOF') continue;
        if (t.type === 'whitespace' || t.type === 'comment') {
          if (current.length > 0) {
            items.push(current);
            current = [];
          }
        } else {
          current.push(t);
        }
      }
      if (current.length > 0) items.push(current);
      if (items.length > 0 && items.every(item => item.length > 0 && checkItem(item))) return true;
    } else {
      const nonWs = tokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
      if (checkItem(nonWs)) return true;
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
  // css-properties-values-api #register-a-custom-property: WPT enforces Level 1 required inherits and non-universal initialValue
  validate(definition: PropertyDefinition) {
    if (definition.name === undefined) {
      throw new TypeError('The name parameter is required.');
    }
    if (definition.inherits === undefined) {
      throw new TypeError('The inherits flag is required.');
    }
    const nameStr = definition.name.toString();
    const nameTokens = tokenize(nameStr);
    if (nameTokens.length !== 2 || nameTokens[0].type !== 'ident' || !nameTokens[0].value.startsWith('--') || nameTokens[0].value === '--' || nameTokens[1].type !== 'EOF') {
      throw new DOMException('Property name must be a valid <dashed-ident>', 'SyntaxError');
    }
    
    const syntax = definition.syntax || '*';
    if (!validateSyntax(syntax, true)) {
      throw new DOMException(`Invalid syntax string: ${syntax}`, 'SyntaxError');
    }

    if (syntax !== '*' && definition.initialValue === undefined) {
      throw new DOMException('initialValue is required for non-universal syntax', 'SyntaxError');
    }

    if (definition.initialValue !== undefined) {
      const allTokens = tokenize(definition.initialValue);
      let start = 0;
      while (start < allTokens.length && allTokens[start].type === 'whitespace') start++;
      let end = allTokens.length;
      while (end > start && allTokens[end - 1].type === 'whitespace') end--;
      const trimmedTokens = allTokens.slice(start, end);

      const errors: ParseError[] = [];
      const values = parseComponentValues(trimmedTokens, errors);
      definition.parsedInitialValue = values;
      
      if (errors.length > 0) {
        throw new DOMException(`initialValue "${definition.initialValue}" has parse errors`, 'SyntaxError');
      }
      
      if (syntax === '*') {
        if (!validateCustomPropertyValue(values)) {
          throw new DOMException(`initialValue "${definition.initialValue}" is not a valid declaration value`, 'SyntaxError');
        }
      } else {
        const nonWsValues = values.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
        if (!isComputationallyIndependent(nonWsValues)) {
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

ParseHooks.validatePropertyRuleDescriptor = (def) => {
  try {
    PropertyRegistry.validate(def);
    return true;
  } catch {
    return false;
  }
};

ParseHooks.registerPropertyRule = (def) => {
  try {
    PropertyRegistry.register(def, 'css');
    return true;
  } catch (e) {
    console.warn(`CSS @property warning: Invalid descriptor values for ${def.name}. Rule was ignored.`, e);
    return false;
  }
};

ParseHooks.unregisterPropertyRule = (name) => {
  PropertyRegistry.unregister(name, 'css');
};
