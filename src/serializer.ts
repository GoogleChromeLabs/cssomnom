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
import type { Token, ComponentValue, Declaration, CSSFunction, SimpleBlock, SelectorList, ComplexSelector, SimpleSelector } from './types.ts';
import { SHORTHANDS } from './shorthands.ts';
import { formatNumber } from './utils/format.ts';
import { parseAnPlusB } from './SelectorParser.ts';

/**
 * Determines whether two consecutive tokens require an empty comment separator
 * between them to prevent coalescing per CSS Syntax Module Level 3 § 8.
 * @see https://drafts.csswg.org/css-syntax-3/#serialization
 */
export function requiresTokenSeparator(t1: Token, t2: Token): boolean {
  // Extract token categories
  const isIdent1 = t1.type === 'ident';
  const isAtKeyword1 = t1.type === 'at-keyword';
  const isHash1 = t1.type === 'hash';
  const isDimension1 = t1.type === 'dimension';
  const isDelimHash1 = t1.type === 'delim' && t1.value === '#';
  const isDelimDash1 = t1.type === 'delim' && t1.value === '-';
  const isNumber1 = t1.type === 'number';
  const isDelimAt1 = t1.type === 'delim' && t1.value === '@';
  const isDelimDot1 = t1.type === 'delim' && t1.value === '.';
  const isDelimPlus1 = t1.type === 'delim' && t1.value === '+';
  const isDelimSlash1 = t1.type === 'delim' && t1.value === '/';

  if (
    !isIdent1 &&
    !isAtKeyword1 &&
    !isHash1 &&
    !isDimension1 &&
    !isDelimHash1 &&
    !isDelimDash1 &&
    !isNumber1 &&
    !isDelimAt1 &&
    !isDelimDot1 &&
    !isDelimPlus1 &&
    !isDelimSlash1
  ) {
    return false;
  }

  const isIdent2 = t2.type === 'ident';
  const isFunction2 = t2.type === 'function';
  const isUrl2 = t2.type === 'url';
  const isBadUrl2 = t2.type === 'bad-url';
  const isDelimDash2 = t2.type === 'delim' && t2.value === '-';
  const isNumber2 = t2.type === 'number';
  const isPercentage2 = t2.type === 'percentage';
  const isDimension2 = t2.type === 'dimension';
  const isCDC2 = t2.type === 'CDC';
  const isOpenParen2 = t2.type === '(' || (t2.type === 'delim' && t2.value === '(');
  const isDelimStar2 = t2.type === 'delim' && t2.value === '*';
  const isDelimPercent2 = t2.type === 'delim' && t2.value === '%';

  // Group A: matches [ident, function, url, bad url, -, number, percentage, dimension, CDC]
  const inGroupA =
    isIdent2 ||
    isFunction2 ||
    isUrl2 ||
    isBadUrl2 ||
    isDelimDash2 ||
    isNumber2 ||
    isPercentage2 ||
    isDimension2 ||
    isCDC2;

  // Row: ident (css-syntax-3 § 8 #serialization)
  if (isIdent1) {
    return inGroupA || isOpenParen2;
  }

  // Rows: at-keyword, hash, dimension, #, - (css-syntax-3 § 8 #serialization)
  if (isAtKeyword1 || isHash1 || isDimension1 || isDelimHash1 || isDelimDash1) {
    return inGroupA;
  }

  // Row: number (css-syntax-3 § 8 #serialization)
  if (isNumber1) {
    return isIdent2 || isFunction2 || isUrl2 || isBadUrl2 || isNumber2 || isPercentage2 || isDimension2 || isCDC2 || isDelimPercent2;
  }

  // Row: @ (css-syntax-3 § 8 #serialization)
  if (isDelimAt1) {
    return isIdent2 || isFunction2 || isUrl2 || isBadUrl2 || isDelimDash2 || isCDC2;
  }

  // Rows: . and + (css-syntax-3 § 8 #serialization)
  if (isDelimDot1 || isDelimPlus1) {
    return isNumber2 || isPercentage2 || isDimension2;
  }

  // Row: / (css-syntax-3 § 8 #serialization)
  if (isDelimSlash1) {
    return isDelimStar2;
  }

  return false;
}

function getFirstToken(node: ComponentValue): Token | null {
  if (typeof node !== 'object' || node === null) return null;
  if (node.type === 'simple-block') {
    return (node as SimpleBlock).associatedToken;
  }
  if (node.type === 'function' && 'name' in node) {
    return { type: 'function', value: (node as CSSFunction).name } as Token;
  }
  const t = node as Token;
  if (t.type === 'EOF') return null;
  return t;
}

function getLastToken(node: ComponentValue): Token | null {
  if (typeof node !== 'object' || node === null) return null;
  if (node.type === 'simple-block') {
    const start = (node as SimpleBlock).associatedToken?.value as string;
    const end = getMirrorToken(start);
    return { type: (end || ')') as import('./types.ts').TokenType, value: end } as Token;
  }
  if (node.type === 'function' && 'name' in node) {
    return { type: ')', value: ')' } as Token;
  }
  const t = node as Token;
  if (t.type === 'EOF') return null;
  return t;
}

export function serialize(nodes: ComponentValue[], preserveCase: boolean = false, propertyName?: string): string {
  if (propertyName === 'font-family') {
    return serializeFontFamily(nodes);
  }
  let result = '';
  let prevLastToken: Token | null = null;

  for (const node of nodes) {
    const firstToken = getFirstToken(node);
    if (prevLastToken && firstToken && requiresTokenSeparator(prevLastToken, firstToken)) {
      result += '/**/';
    }
    result += serializeNode(node, preserveCase);
    prevLastToken = getLastToken(node);
  }
  return result;
}

function serializeNode(node: ComponentValue, preserveCase: boolean): string {
  if (typeof node !== 'object' || node === null) {
    return '';
  }

  if ('type' in node) {
    if (node.type === 'simple-block') {
      const start = node.associatedToken.value as string;
      const end = getMirrorToken(start);

      return start + serialize(node.value, preserveCase) + end;
    }

    if (node.type === 'function' && 'name' in node) {
      let args = node.value;
      const funcName = preserveCase ? node.name : node.name.toLowerCase();
      
      if (funcName === 'counter') {
        let i = args.length - 1;
        while (i >= 0 && args[i].type === 'whitespace') i--;
        if (i >= 0 && args[i].type === 'ident' && (args[i] as Token).value === 'decimal') {
          let j = i - 1;
          while (j >= 0 && args[j].type === 'whitespace') j--;
          if (j >= 0 && args[j].type === 'comma') {
            args = args.slice(0, j);
          }
        }
      }
      
      if (funcName === 'url') {
        let start = 0;
        while (start < args.length && args[start].type === 'whitespace') start++;
        let end = args.length - 1;
        while (end >= start && args[end].type === 'whitespace') end--;
        if (start <= end) {
          args = args.slice(start, end + 1);
        } else {
          args = [];
        }
      }

      if (funcName === 'attr') {
        let hasPipe = false;
        // Remove leading '|'
        let i = 0;
        while (i < args.length && args[i].type === 'whitespace') i++;
        if (i < args.length && args[i].type === 'delim' && (args[i] as Token).value === '|') {
          hasPipe = true;
          args = args.slice(i + 1);
        }
        
        // Remove trailing ', ""' ONLY if hasPipe was true
        if (hasPipe) {
          let k = args.length - 1;
          while (k >= 0 && args[k].type === 'whitespace') k--;
          if (k >= 0 && args[k].type === 'string' && (args[k] as Token).value === '') {
            let l = k - 1;
            while (l >= 0 && args[l].type === 'whitespace') l--;
            if (l >= 0 && args[l].type === 'comma') {
              args = args.slice(0, l);
            }
          }
        }
        
        // Trim whitespace from args (moved to end)
        let start = 0;
        while (start < args.length && args[start].type === 'whitespace') start++;
        let end = args.length - 1;
        while (end >= start && args[end].type === 'whitespace') end--;
        
        if (start <= end) {
          args = args.slice(start, end + 1);
        } else {
          args = [];
        }
      }
      
      let serializedArgs = serialize(args, preserveCase);
      return funcName + '(' + serializedArgs + ')';
    }

    // It's a token
    return serializeToken(node as Token, preserveCase);
  }

  return '';
}

function serializeToken(token: Token, preserveCase: boolean): string {
  switch (token.type) {
    case 'ident':
      return serializeIdentifier(token.value);
    case 'at-keyword':
      return '@' + serializeIdentifier(token.value);
    case 'hash':
      return '#' + token.value;
    case 'string':
      return (preserveCase && token.originalText && !token.originalText.endsWith('\\')) ? token.originalText : serializeString(token.value);
    case 'url':
      return preserveCase ? serializeUrlToken(token.value, token.originalText) : serializeUrl(token.value);
    case 'delim':
      return token.value;
    case 'number':
      return formatNumber(token.value);
    case 'percentage':
      return formatNumber(token.value) + '%';
    case 'dimension':
      return formatNumber(token.value) + (token.unit ? serializeIdentifier(token.unit) : '');

    case 'whitespace':
      return (preserveCase && token.originalText) ? token.originalText : token.value;
    case 'comment':
      return token.value || '/**/';
    case 'CDO':
      return '<!--';
    case 'CDC':
      return '-->';
    case 'colon':
      return ':';
    case 'semicolon':
      return ';';
    case 'comma':
      return ',';
    case '[':
    case ']':
    case '{':
    case '}':
    case '(':
    case ')':
      return token.value;
    case 'function':
      // If it's a raw token, it hasn't been parsed into a function node
      const funcName = preserveCase ? token.value : token.value.toLowerCase();
      return serializeIdentifier(funcName) + '(';
    case 'unicode-range':
      return token.value;
    case 'EOF':
      return '';
    default:
      return token.value || '';
  }
}

export function getMirrorToken(start: string): string {
  if (start === '{') return '}';
  if (start === '[') return ']';
  if (start === '(') return ')';
  return '';
}

export function getOriginalText(values: ComponentValue[]): string {
  let text = '';
  for (const val of values) {
    if (val.type === 'simple-block') {
       text += val.associatedToken.originalText || '';
       text += getOriginalText(val.value);
       const start = val.associatedToken.value;
       if (start === '{') text += '}';
       else if (start === '[') text += ']';
       else if (start === '(') text += ')';
    } else if (val.type === 'function') {
       const func = val as CSSFunction;
       text += func.name + '(';
       text += getOriginalText(func.value);
       text += ')';
    } else {
       text += (val as Token).originalText || (val as Token).value;
    }
  }
  return text;
}



/**
 * @see https://drafts.csswg.org/cssom-1/#serialize-an-identifier
 */
export function serializeIdentifier(id: string): string {
  let result = '';
  for (let i = 0; i < id.length; i++) {
    const charCode = id.charCodeAt(i);
    const char = id[i];

    // 1. NULL (U+0000) -> REPLACEMENT CHARACTER (U+FFFD)
    if (charCode === 0) {
      result += '\uFFFD';
      continue;
    }

    // 2. [\1-\1f] (U+0001 to U+001F) or U+007F -> escaped as code point
    if ((charCode >= 0x0001 && charCode <= 0x001F) || charCode === 0x007F) {
      result += escapeAsCodePoint(charCode);
      continue;
    }

    // 3. first character and is in the range [0-9] -> escaped as code point
    if (i === 0 && charCode >= 0x0030 && charCode <= 0x0039) {
      result += escapeAsCodePoint(charCode);
      continue;
    }

    // 4. second character and is in the range [0-9] and the first character is a "-"
    if (i === 1 && charCode >= 0x0030 && charCode <= 0x0039 && id.charCodeAt(0) === 0x002D) {
      result += escapeAsCodePoint(charCode);
      continue;
    }

    // 5. first character and is a "-" and there is no second character
    if (i === 0 && charCode === 0x002D && id.length === 1) {
      result += '\\-';
      continue;
    }

    // 6. >= U+0080, "-", "_", [0-9], [A-Z], or [a-z] -> itself
    if (
      charCode >= 0x0080 ||
      charCode === 0x002D ||
      charCode === 0x005F ||
      (charCode >= 0x0030 && charCode <= 0x0039) ||
      (charCode >= 0x0041 && charCode <= 0x005A) ||
      (charCode >= 0x0061 && charCode <= 0x007A)
    ) {
      result += char;
      continue;
    }

    // 7. Otherwise -> escaped character
    result += '\\' + char;
  }
  return result;
}

/**
 * @see https://drafts.csswg.org/cssom-1/#serialize-a-string
 */
export function serializeString(s: string): string {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const charCode = s.charCodeAt(i);
    const char = s[i];

    // 1. NULL (U+0000) -> REPLACEMENT CHARACTER (U+FFFD)
    if (charCode === 0) {
      result += '\uFFFD';
      continue;
    }

    // 2. [\1-\1f] (U+0001 to U+001F) or U+007F -> escaped as code point
    if ((charCode >= 0x0001 && charCode <= 0x001F) || charCode === 0x007F) {
      result += escapeAsCodePoint(charCode);
      continue;
    }

    // 3. '"' (U+0022) or "\" (U+005C) -> escaped character
    if (charCode === 0x0022 || charCode === 0x005C) {
      result += '\\' + char;
      continue;
    }

    // 4. Otherwise -> itself
    result += char;
  }
  result += '"';
  return result;
}

export function serializeUrl(val: string): string {
  return `url(${serializeString(val)})`;
}

export function serializeUrlToken(val: string, originalText?: string): string {
  if (originalText && !val.includes('\uFFFD') && originalText.endsWith(')')) {
    return originalText;
  }
  let result = '';
  for (let i = 0; i < val.length; i++) {
    const charCode = val.charCodeAt(i);
    const char = val[i];
    if (
      charCode === 0x0022 /* " */ ||
      charCode === 0x0027 /* ' */ ||
      charCode === 0x0028 /* ( */ ||
      charCode === 0x0029 /* ) */ ||
      charCode === 0x005C /* \ */ ||
      charCode <= 0x0020 ||
      charCode === 0x007F
    ) {
      result += '\\' + char;
    } else {
      result += char;
    }
  }
  return `url(${result})`;
}

function escapeAsCodePoint(charCode: number): string {
  const hex = charCode.toString(16);
  return '\\' + hex + ' ';
}

const logicalShorthands: Record<string, { start: string, end: string, allowDifferent: boolean }> = {
  'margin-inline': { start: 'margin-inline-start', end: 'margin-inline-end', allowDifferent: true },
  'padding-inline': { start: 'padding-inline-start', end: 'padding-inline-end', allowDifferent: true },
  'margin-block': { start: 'margin-block-start', end: 'margin-block-end', allowDifferent: true },
  'padding-block': { start: 'padding-block-start', end: 'padding-block-end', allowDifferent: true },
  'inset-inline': { start: 'inset-inline-start', end: 'inset-inline-end', allowDifferent: true },
  'inset-block': { start: 'inset-block-start', end: 'inset-block-end', allowDifferent: true },
  'border-inline-width': { start: 'border-inline-start-width', end: 'border-inline-end-width', allowDifferent: true },
  'border-block-width': { start: 'border-block-start-width', end: 'border-block-end-width', allowDifferent: true },
  'border-inline-style': { start: 'border-inline-start-style', end: 'border-inline-end-style', allowDifferent: true },
  'border-block-style': { start: 'border-block-start-style', end: 'border-block-end-style', allowDifferent: true },
  'border-inline-color': { start: 'border-inline-start-color', end: 'border-inline-end-color', allowDifferent: true },
  'border-block-color': { start: 'border-block-start-color', end: 'border-block-end-color', allowDifferent: true },
  'border-inline': { start: 'border-inline-start', end: 'border-inline-end', allowDifferent: false },
  'border-block': { start: 'border-block-start', end: 'border-block-end', allowDifferent: false },
  'overflow': { start: 'overflow-x', end: 'overflow-y', allowDifferent: true },
  'overscroll-behavior': { start: 'overscroll-behavior-x', end: 'overscroll-behavior-y', allowDifferent: true },
};

const logicalShorthandsEntries = Object.entries(logicalShorthands);

const propertyToGroup: Record<string, string> = {
  'margin-top': 'margin', 'margin-right': 'margin', 'margin-bottom': 'margin', 'margin-left': 'margin',
  'margin-inline-start': 'margin', 'margin-inline-end': 'margin', 'margin-block-start': 'margin', 'margin-block-end': 'margin',
  
  'padding-top': 'padding', 'padding-right': 'padding', 'padding-bottom': 'padding', 'padding-left': 'padding',
  'padding-inline-start': 'padding', 'padding-inline-end': 'padding', 'padding-block-start': 'padding', 'padding-block-end': 'padding',
  
  'top': 'inset', 'right': 'inset', 'bottom': 'inset', 'left': 'inset',
  'inset-inline-start': 'inset', 'inset-inline-end': 'inset', 'inset-block-start': 'inset', 'inset-block-end': 'inset',
  
  'border-top-width': 'border-width', 'border-right-width': 'border-width', 'border-bottom-width': 'border-width', 'border-left-width': 'border-width',
  'border-inline-start-width': 'border-width', 'border-inline-end-width': 'border-width', 'border-block-start-width': 'border-width', 'border-block-end-width': 'border-width',
  
  'border-top-style': 'border-style', 'border-right-style': 'border-style', 'border-bottom-style': 'border-style', 'border-left-style': 'border-style',
  'border-inline-start-style': 'border-style', 'border-inline-end-style': 'border-style', 'border-block-start-style': 'border-style', 'border-block-end-style': 'border-style',
  
  'border-top-color': 'border-color', 'border-right-color': 'border-color', 'border-bottom-color': 'border-color', 'border-left-color': 'border-color',
  'border-inline-start-color': 'border-color', 'border-inline-end-color': 'border-color', 'border-block-start-color': 'border-color', 'border-block-end-color': 'border-color',
  
  'width': 'size', 'height': 'size', 'inline-size': 'size', 'block-size': 'size',
  'min-width': 'min-size', 'min-height': 'min-size', 'min-inline-size': 'min-size', 'min-block-size': 'min-size',
  'max-width': 'max-size', 'max-height': 'max-size', 'max-inline-size': 'max-size', 'max-block-size': 'max-size',
  
  'border-top-left-radius': 'border-radius', 'border-top-right-radius': 'border-radius', 'border-bottom-right-radius': 'border-radius', 'border-bottom-left-radius': 'border-radius',
  'border-start-start-radius': 'border-radius', 'border-start-end-radius': 'border-radius', 'border-end-start-radius': 'border-radius', 'border-end-end-radius': 'border-radius',

  'border-top': 'border', 'border-right': 'border', 'border-bottom': 'border', 'border-left': 'border',
  'border-block-start': 'border', 'border-block-end': 'border', 'border-inline-start': 'border', 'border-inline-end': 'border',

  'overflow-x': 'overflow', 'overflow-y': 'overflow', 'overflow-inline': 'overflow', 'overflow-block': 'overflow',
  'overscroll-behavior-x': 'overscroll-behavior', 'overscroll-behavior-y': 'overscroll-behavior', 'overscroll-behavior-inline': 'overscroll-behavior', 'overscroll-behavior-block': 'overscroll-behavior',
};



const genericShorthands: Record<string, string[]> = {
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  'border-block-start': ['border-block-start-width', 'border-block-start-style', 'border-block-start-color'],
  'border-block-end': ['border-block-end-width', 'border-block-end-style', 'border-block-end-color'],
  'border-inline-start': ['border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color'],
  'border-inline-end': ['border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color'],
};

const genericShorthandsEntries = Object.entries(genericShorthands);

function checkIntervening(decls: Declaration[], allDecls: Declaration[], declIndices: Map<Declaration, number>): boolean {
  const indices = decls.map(d => declIndices.get(d)!);
  const startIdx = Math.min(...indices);
  const endIdx = Math.max(...indices);
  const group = propertyToGroup[decls[0].name];
  const names = new Set(decls.map(d => d.name));

  for (let i = startIdx + 1; i < endIdx; i++) {
    const intervening = allDecls[i];
    if (propertyToGroup[intervening.name] === group && !names.has(intervening.name)) {
      return true;
    }
  }
  return false;
}

function tryCombineBoxShorthand(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  for (const [shorthand, def] of Object.entries(SHORTHANDS)) {
    if (!["margin", "padding", "border-width", "border-style", "border-color", "scroll-margin", "scroll-padding", "inset", "overflow-clip-margin", "border-radius"].includes(shorthand)) continue;
    
    if (!def.logicalLonghands || def.logicalLonghands.length !== 4) continue;
    const physical = def.longhands;
    const logical = def.logicalLonghands;
    
    const isPhysical = physical.includes(d.name);
    const isLogical = logical.includes(d.name);
    if (!isPhysical && !isLogical) continue;

    const longhands = isPhysical ? physical : logical;
    const allDecls = longhands.map(name => declMap.get(name));
    
    if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
      if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) continue;

      const valuesForContract: Record<string, ComponentValue[]> = {};
      allDecls.forEach(other => {
        valuesForContract[other!.name] = other!.value;
      });

      const value = def.contract(valuesForContract);
      if (value !== null) {
        allDecls.forEach(other => processed.add(other!));
        return `${shorthand}: ${value}${d.important ? ' !important' : ''}`;
      }
    }
  }
  return null;
}
function tryCombineLogicalShorthand(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  for (const [shorthand, longhands] of logicalShorthandsEntries) {
    if (d.name === longhands.start || d.name === longhands.end) {
      const otherName = d.name === longhands.start ? longhands.end : longhands.start;
      const otherDecl = declMap.get(otherName);
      
      if (otherDecl && !processed.has(otherDecl) && d.important === otherDecl.important) {
        if (checkIntervening([d, otherDecl], declarations, declIndices)) continue;

        const startDecl = d.name === longhands.start ? d : otherDecl;
        const endDecl = d.name === longhands.end ? d : otherDecl;
        
        const valS = serialize(startDecl.value).trim();
        const valE = serialize(endDecl.value).trim();
        
        if (valS === valE) {
          processed.add(startDecl);
          processed.add(endDecl);
          return `${shorthand}: ${valS}${d.important ? ' !important' : ''}`;
        } else if (longhands.allowDifferent) {
          processed.add(startDecl);
          processed.add(endDecl);
          return `${shorthand}: ${valS} ${valE}${d.important ? ' !important' : ''}`;
        }
      }
    }
  }
  return null;
}

function tryCombineGenericShorthand(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): { name: string, value: string, important: boolean } | null {
  for (const [shorthand, longhands] of genericShorthandsEntries) {
    if (!longhands.includes(d.name)) continue;

    const allDecls = longhands.map(name => declMap.get(name));
    if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
      if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) continue;

      const vals = allDecls.map(other => serialize(other!.value).trim());
      
      // For border-* shorthands that combine sides (block, inline), values must be identical to combine
      if (shorthand === 'border-block' || shorthand === 'border-inline') {
        if (!vals.every(v => v === vals[0])) continue;
      }
      
      // Join values with space
      const combinedValue = vals.filter(v => v !== '').join(' ');
      
      allDecls.forEach(other => processed.add(other!));
      return { name: shorthand, value: combinedValue, important: d.important };
    }
  }
  return null;
}

function tryCombineBorderFull(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const longhands = [
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'border-left-width', 'border-left-style', 'border-left-color'
  ];
  if (!longhands.includes(d.name)) return null;

  const allDecls = longhands.map(name => declMap.get(name));
  if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

    const vals = allDecls.map(other => serialize(other!.value).trim());
    // Check if all widths are same, all styles are same, all colors are same
    const sameWidth = vals[0] === vals[3] && vals[0] === vals[6] && vals[0] === vals[9];
    const sameStyle = vals[1] === vals[4] && vals[1] === vals[7] && vals[1] === vals[10];
    const sameColor = vals[2] === vals[5] && vals[2] === vals[8] && vals[2] === vals[11];

    if (sameWidth && sameStyle && sameColor) {
      const combinedValue = [vals[0], vals[1], vals[2]].filter(v => v !== '').join(' ');
      allDecls.forEach(other => processed.add(other!));
      return `border: ${combinedValue}${d.important ? ' !important' : ''}`;
    }
  }
  return null;
}

function tryCombineBackground(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const longhands = [
    'background-image', 'background-position', 'background-size', 'background-repeat',
    'background-attachment', 'background-origin', 'background-clip', 'background-color'
  ];
  if (!longhands.includes(d.name)) return null;

  const allDecls = longhands.map(name => declMap.get(name));
  if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

    const record: Record<string, ComponentValue[]> = {};
    for (const name of longhands) {
      record[name] = declMap.get(name)!.value;
    }

    const contracted = SHORTHANDS['background'].contract(record);
    if (contracted !== null) {
      allDecls.forEach(other => processed.add(other!));
      return `background: ${contracted}${d.important ? ' !important' : ''}`;
    }
  }
  return null;
}

function tryCombineBorderBlock(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const longhands = [
    'border-block-start-width', 'border-block-start-style', 'border-block-start-color',
    'border-block-end-width', 'border-block-end-style', 'border-block-end-color'
  ];
  if (!longhands.includes(d.name)) return null;

  const allDecls = longhands.map(name => declMap.get(name));
  if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

    const vals = allDecls.map(other => serialize(other!.value).trim());
    const sameWidth = vals[0] === vals[3];
    const sameStyle = vals[1] === vals[4];
    const sameColor = vals[2] === vals[5];

    if (sameWidth && sameStyle && sameColor) {
      const combinedValue = [vals[0], vals[1], vals[2]].filter(v => v !== '').join(' ');
      allDecls.forEach(other => processed.add(other!));
      return `border-block: ${combinedValue}${d.important ? ' !important' : ''}`;
    }
  }
  return null;
}

function tryCombineBorderInline(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const longhands = [
    'border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color',
    'border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color'
  ];
  if (!longhands.includes(d.name)) return null;

  const allDecls = longhands.map(name => declMap.get(name));
  if (allDecls.every(other => other && !processed.has(other) && other.important === d.important)) {
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

    const vals = allDecls.map(other => serialize(other!.value).trim());
    const sameWidth = vals[0] === vals[3];
    const sameStyle = vals[1] === vals[4];
    const sameColor = vals[2] === vals[5];

    if (sameWidth && sameStyle && sameColor) {
      const combinedValue = [vals[0], vals[1], vals[2]].filter(v => v !== '').join(' ');
      allDecls.forEach(other => processed.add(other!));
      return `border-inline: ${combinedValue}${d.important ? ' !important' : ''}`;
    }
  }
  return null;
}

function serializeFontFamily(values: ComponentValue[]): string {
  let result = '';
  for (const val of values) {
    if (val.type === 'string') {
      let valStr = val.value;

      // Strip quotes if preserved by parser
      if ((valStr.startsWith("'") && valStr.endsWith("'")) || (valStr.startsWith('"') && valStr.endsWith('"'))) {
        valStr = valStr.slice(1, -1);
      }
      const parts = valStr.split(/\s+/);
      if (parts.length > 1 && parts.every(p => p !== '' && serializeIdentifier(p) === p)) {
        result += valStr;
        continue;
      }
    }
    result += serializeNode(val, false);
  }
  return result.trim();
}

export function serializeDeclarations(declarations: Declaration[]): string {
  if (declarations.length === 0) return '';
  
  const declMap = new Map<string, Declaration>();
  const declIndices = new Map<Declaration, number>();
  for (let i = 0; i < declarations.length; i++) {
    const d = declarations[i];
    declMap.set(d.name, d);
    declIndices.set(d, i);
  }
  
  const processed = new Set<Declaration>();
  const result: string[] = [];
  
  for (const d of declarations) {
    if (processed.has(d)) continue;
    
    let combined = tryCombineBorderFull(d, declMap, processed, declarations, declIndices);
    if (!combined) {
      combined = tryCombineBackground(d, declMap, processed, declarations, declIndices);
    }
    if (!combined) {
      combined = tryCombineBorderBlock(d, declMap, processed, declarations, declIndices);
    }
    if (!combined) {
      combined = tryCombineBorderInline(d, declMap, processed, declarations, declIndices);
    }
    if (!combined) {
      combined = tryCombineBoxShorthand(d, declMap, processed, declarations, declIndices);
    }
    
    if (!combined) {
      const generic = tryCombineGenericShorthand(d, declMap, processed, declarations, declIndices);
      if (generic) {
        const sides = ['border-top', 'border-right', 'border-bottom', 'border-left'];
        if (sides.includes(generic.name)) {
          const sideResults = sides.map(side => {
            if (side === generic.name) return generic;
            const existing = declMap.get(side);
            if (existing && !processed.has(existing)) return { name: side, value: serialize(existing.value).trim(), important: existing.important, decl: existing };

            const longhands = genericShorthands[side];
            if (!longhands) return null;
            const sideLonghands = longhands.map(lh => declMap.get(lh));
            if (sideLonghands.every(lh => lh && !processed.has(lh) && lh.important === generic.important)) {
              if (checkIntervening(sideLonghands as Declaration[], declarations, declIndices)) return null;
              const vals = sideLonghands.map(lh => serialize(lh!.value).trim());
              return { name: side, value: vals.filter(v => v !== '').join(' '), important: generic.important, longhands: sideLonghands };
            }
            return null;
          });

          if (sideResults.every(r => r !== null && r.value === generic.value && r.important === generic.important)) {
            sideResults.forEach(r => {
              if (r && 'longhands' in r) (r.longhands as Declaration[]).forEach(lh => processed.add(lh));
              else if (r && 'decl' in r) processed.add(r.decl as Declaration);
            });
            combined = `border: ${generic.value}${generic.important ? ' !important' : ''}`;
          } else {
            combined = `${generic.name}: ${generic.value}${generic.important ? ' !important' : ''}`;
          }
        } else {
          combined = `${generic.name}: ${generic.value}${generic.important ? ' !important' : ''}`;
        }
      }
    }

    if (!combined) {
      combined = tryCombineLogicalShorthand(d, declMap, processed, declarations, declIndices);
    }
    
    if (combined) {
      result.push(combined);
    } else {
      const isCustom = d.name.startsWith('--');
      let val = serialize(d.value, isCustom, d.name).trim();
      result.push(`${d.name}: ${val}${d.important ? ' !important' : ''}`);
      processed.add(d);
    }
  }
  
  return result.join('; ') + ';';
}

export function serializeSelectorList(list: SelectorList, hasDefaultNamespace = false): string {
  return list.selectors.map(s => {
    if (s.type === 'invalid-selector') {
      return serialize(s.tokens);
    }
    return serializeComplexSelector(s, hasDefaultNamespace);
  }).join(', ');
}

function serializeComplexSelector(complex: ComplexSelector, hasDefaultNamespace = false): string {
  return complex.items.map((item, idx) => {
    if (item.type === 'combinator') {
      if (item.value === ' ') return ' ';
      if (idx === 0) return `${item.value} `;
      return ` ${item.value} `;
    }
    return item.selectors.map(s => serializeSimpleSelector(s, hasDefaultNamespace)).join('');
  }).join('');
}

function formatAnPlusB(tokens: ComponentValue[]): string {
  const parsed = parseAnPlusB(tokens);
  if (parsed !== null) {
    const { a, b } = parsed;
    if (a === 0) {
      return b.toString();
    }
    let partA = '';
    if (a === 1) {
      partA = 'n';
    } else if (a === -1) {
      partA = '-n';
    } else {
      partA = a + 'n';
    }

    if (b === 0) {
      return partA;
    } else if (b > 0) {
      return partA + '+' + b;
    } else {
      return partA + b;
    }
  }
  return serialize(tokens).trim();
}

function serializeSimpleSelector(simple: SimpleSelector, hasDefaultNamespace = false): string {
  switch (simple.type) {
    case 'type-selector': {
      let name = serializeIdentifier(simple.name);
      if (simple.namespace !== undefined) {
        if (simple.namespace === '*') {
          if (hasDefaultNamespace) {
            name = '*|' + name;
          }
        } else if (simple.namespace === '') {
          name = '|' + name;
        } else {
          name = serializeIdentifier(simple.namespace) + '|' + name;
        }
      }
      return name;
    }
    case 'universal-selector':
      if (simple.namespace !== undefined) {
        if (simple.namespace === '*') {
          return hasDefaultNamespace ? '*|*' : '*';
        } else if (simple.namespace === '') {
          return '|*';
        } else {
          return serializeIdentifier(simple.namespace) + '|*';
        }
      }
      return '*';
    case 'id-selector': return '#' + serializeIdentifier(simple.name);
    case 'class-selector': return '.' + serializeIdentifier(simple.name);
    case 'attribute-selector': {
      let attr = '[';
      if (simple.namespace !== undefined) {
        if (simple.namespace === '*') {
          attr += '*|';
        } else if (simple.namespace === '') {
          // Null namespace omits pipe in attribute selectors
        } else {
          attr += serializeIdentifier(simple.namespace) + '|';
        }
      }
      attr += serializeIdentifier(simple.name);
      if (simple.operator) {
        attr += simple.operator + serializeString(simple.value || '');
      }
      if (simple.flags) {
        attr += ' ' + simple.flags;
      }
      return attr + ']';
    }
    case 'pseudo-class-selector':
      let pc = `:${simple.name}`;
      const lowerName = simple.name.toLowerCase();
      const isNth = ['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type'].includes(lowerName);
      if (simple.argument) {
        if ('type' in simple.argument && simple.argument.type === 'selector-list') {
          if (isNth && simple.nth) {
            pc += `(${formatAnPlusB(simple.nth)} of ${serializeSelectorList(simple.argument, hasDefaultNamespace)})`;
          } else {
            pc += `(${serializeSelectorList(simple.argument, hasDefaultNamespace)})`;
          }
        } else {
          if (isNth) {
            pc += `(${formatAnPlusB(simple.argument as ComponentValue[])})`;
          } else {
            pc += `(${serialize(simple.argument as ComponentValue[]).trim()})`;
          }
        }
      }
      return pc;
    case 'pseudo-element-selector':
      let pe = `::${simple.name}`;
      if (simple.argument) {
        if ('type' in simple.argument && simple.argument.type === 'selector-list') {
          pe += `(${serializeSelectorList(simple.argument, hasDefaultNamespace)})`;
        } else {
          pe += `(${serialize(simple.argument as ComponentValue[]).trim()})`;
        }
      }
      return pe;
    case 'nesting-selector': return '&';
    default: return '';
  }
}

