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
import { SHORTHANDS, ALL_SHORTHAND_LONGHANDS, isInitialBorderImage } from './shorthands.ts';
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
    if (node.type === 'EOF') continue;
    const firstToken = getFirstToken(node);
    if (prevLastToken && firstToken && requiresTokenSeparator(prevLastToken, firstToken)) {
      result += '/**/';
    }
    result += serializeNode(node, preserveCase);
    const last = getLastToken(node);
    if (last) {
      prevLastToken = last;
    }
  }
  return result;
}

function trimWhitespaceTokens(tokens: ComponentValue[]): ComponentValue[] {
  let start = 0;
  while (start < tokens.length && tokens[start].type === 'whitespace') start++;
  let end = tokens.length - 1;
  while (end >= start && tokens[end].type === 'whitespace') end--;
  return start <= end ? tokens.slice(start, end + 1) : [];
}

function serializeNode(node: ComponentValue, preserveCase: boolean): string {
  if (typeof node !== 'object' || node === null || !('type' in node)) {
    return '';
  }

  if (node.type === 'simple-block') {
    const start = node.associatedToken.value as string;
    return start + serialize(node.value, preserveCase) + getMirrorToken(start);
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
    } else if (funcName === 'url') {
      args = trimWhitespaceTokens(args);
    } else if (funcName === 'attr') {
      let i = 0;
      while (i < args.length && args[i].type === 'whitespace') i++;
      if (i < args.length && args[i].type === 'delim' && (args[i] as Token).value === '|') {
        args = args.slice(i + 1);
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
      args = trimWhitespaceTokens(args);
    }

    return `${funcName}(${serialize(args, preserveCase)})`;
  }

  return serializeToken(node as Token, preserveCase);
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
    case 'function': {
      const funcName = preserveCase ? token.value : token.value.toLowerCase();
      return serializeIdentifier(funcName) + '(';
    }
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
      text += (val.associatedToken.originalText || '') + getOriginalText(val.value) + getMirrorToken(val.associatedToken.value as string);
    } else if (val.type === 'function') {
      const func = val as CSSFunction;
      text += `${func.name}(${getOriginalText(func.value)})`;
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
  'outline-color': 'outline', 'outline-style': 'outline', 'outline-width': 'outline',
  'list-style-type': 'list-style', 'list-style-position': 'list-style', 'list-style-image': 'list-style',
  'flex-grow': 'flex', 'flex-shrink': 'flex', 'flex-basis': 'flex',
  'font-style': 'font', 'font-variant-caps': 'font', 'font-weight': 'font', 'font-stretch': 'font', 'font-size': 'font', 'line-height': 'font', 'font-family': 'font',
  'font-variant-ligatures': 'font-variant', 'font-variant-alternates': 'font-variant', 'font-variant-numeric': 'font-variant', 'font-variant-east-asian': 'font-variant', 'font-variant-position': 'font-variant', 'font-variant-emoji': 'font-variant',
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
  'outline': ['outline-color', 'outline-style', 'outline-width'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
  'border-image': ['border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat'],
  'line-clamp': ['max-lines', 'block-ellipsis', 'continue'],
};

const genericShorthandsEntries = Object.entries(genericShorthands);

function checkIntervening(decls: Declaration[], allDecls: Declaration[], declIndices: Map<Declaration, number>): boolean {
  const indices = decls.map(d => declIndices.get(d)!);
  const startIdx = Math.min(...indices);
  const endIdx = Math.max(...indices);
  const names = new Set(decls.map(d => d.name));

  const groups = new Set(decls.map(d => propertyToGroup[d.name]).filter(Boolean));
  const isSideShorthand = groups.size > 1;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const intervening = allDecls[i];
    if (names.has(intervening.name)) continue;
    const interveningGroup = propertyToGroup[intervening.name];
    if (!interveningGroup) continue;

    if (isSideShorthand) {
      const sidePrefix = decls[0].name.replace(/-(width|style|color)$/, '');
      if (intervening.name.startsWith(sidePrefix + '-') || ['all', 'border'].includes(intervening.name)) {
        return true;
      }
    } else {
      if (groups.has(interveningGroup)) {
        return true;
      }
      if (['all', 'border'].includes(intervening.name)) {
        return true;
      }
    }
  }
  return false;
}

const BOX_SHORTHAND_NAMES = new Set([
  'margin', 'padding', 'border-width', 'border-style', 'border-color',
  'scroll-margin', 'scroll-padding', 'inset', 'overflow-clip-margin', 'border-radius',
]);

const BOX_SHORTHAND_ENTRIES = Object.entries(SHORTHANDS).filter(
  ([shorthand, def]) => BOX_SHORTHAND_NAMES.has(shorthand) && def.logicalLonghands?.length === 4,
);

function tryCombineBoxShorthand(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  for (const [shorthand, def] of BOX_SHORTHAND_ENTRIES) {
    const physical = def.longhands;
    const logical = def.logicalLonghands!;
    const isPhysical = physical.includes(d.name);
    const isLogical = logical.includes(d.name);
    if (!isPhysical && !isLogical) continue;

    const longhands = isPhysical ? physical : logical;
    const allDecls = longhands.map(name => declMap.get(name));
    if (!allDecls.every(other => other && !processed.has(other) && other.important === d.important)) continue;
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) continue;

    const valuesForContract: Record<string, ComponentValue[]> = {};
    for (const other of allDecls) valuesForContract[other!.name] = other!.value;

    const value = def.contract(valuesForContract);
    if (value !== null) {
      for (const other of allDecls) processed.add(other!);
      return `${shorthand}: ${value}${d.important ? ' !important' : ''}`;
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
    if (d.name !== longhands.start && d.name !== longhands.end) continue;
    const otherName = d.name === longhands.start ? longhands.end : longhands.start;
    const otherDecl = declMap.get(otherName);
    if (!otherDecl || processed.has(otherDecl) || d.important !== otherDecl.important) continue;
    if (checkIntervening([d, otherDecl], declarations, declIndices)) continue;

    const startDecl = d.name === longhands.start ? d : otherDecl;
    const endDecl = d.name === longhands.end ? d : otherDecl;
    const valS = serialize(startDecl.value).trim();
    const valE = serialize(endDecl.value).trim();

    if (valS === valE) {
      processed.add(startDecl);
      processed.add(endDecl);
      return `${shorthand}: ${valS}${d.important ? ' !important' : ''}`;
    }
    if (longhands.allowDifferent && !valS.includes('var(') && !valE.includes('var(')) {
      processed.add(startDecl);
      processed.add(endDecl);
      return `${shorthand}: ${valS} ${valE}${d.important ? ' !important' : ''}`;
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
    if (!allDecls.every(other => other && !processed.has(other) && other.important === d.important)) continue;
    if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) continue;

    const record: Record<string, ComponentValue[]> = {};
    for (const other of allDecls) record[other!.name] = other!.value;

    const contracted = SHORTHANDS[shorthand]?.contract(record);
    if (contracted !== null && contracted !== undefined) {
      for (const other of allDecls) processed.add(other!);
      return { name: shorthand, value: contracted, important: d.important };
    }
  }
  return null;
}

const BORDER_PHYSICAL_SIDE_LONGHANDS = [
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-right-width', 'border-right-style', 'border-right-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
  'border-left-width', 'border-left-style', 'border-left-color',
] as const;

const BORDER_IMAGE_LONGHAND_NAMES = [
  'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat',
] as const;

function tryCombineBorderFull(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  if (!BORDER_PHYSICAL_SIDE_LONGHANDS.includes(d.name as typeof BORDER_PHYSICAL_SIDE_LONGHANDS[number])) return null;

  const allDecls = BORDER_PHYSICAL_SIDE_LONGHANDS.map(name => declMap.get(name));
  if (!allDecls.every(other => other && !processed.has(other) && other.important === d.important)) return null;
  if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

  const imageDecls = BORDER_IMAGE_LONGHAND_NAMES
    .map(name => declMap.get(name))
    .filter((img): img is Declaration => Boolean(img && !processed.has(img)));
  if (imageDecls.length === 0) return null;

  const imageRecord: Record<string, ComponentValue[]> = {
    'border-image-source': [{ type: 'ident', value: 'none' }],
    'border-image-slice': [{ type: 'percentage', value: 100, sign: null }],
    'border-image-width': [{ type: 'number', value: 1, sign: null, numberType: 'integer' }],
    'border-image-outset': [{ type: 'number', value: 0, sign: null, numberType: 'integer' }],
    'border-image-repeat': [{ type: 'ident', value: 'stretch' }],
  };
  for (const img of imageDecls) imageRecord[img.name] = img.value;
  if (!isInitialBorderImage(imageRecord)) return null;

  const record: Record<string, ComponentValue[]> = { ...imageRecord };
  for (const other of allDecls) record[other!.name] = other!.value;

  const contracted = SHORTHANDS['border']?.contract(record);
  if (contracted !== null && contracted !== undefined) {
    for (const other of allDecls) processed.add(other!);
    for (const img of imageDecls) processed.add(img);
    return `border: ${contracted}${d.important ? ' !important' : ''}`;
  }
  return null;
}

const ORDERED_SHORTHAND_COMBINERS: readonly { name: string; longhands: readonly string[] }[] = [
  { name: 'font', longhands: SHORTHANDS['font'].longhands },
  { name: 'font-variant', longhands: SHORTHANDS['font-variant'].longhands },
  {
    name: 'background',
    longhands: [
      'background-image', 'background-position', 'background-size', 'background-repeat',
      'background-attachment', 'background-origin', 'background-clip', 'background-color',
    ],
  },
  {
    name: 'border-block',
    longhands: [
      'border-block-start-width', 'border-block-start-style', 'border-block-start-color',
      'border-block-end-width', 'border-block-end-style', 'border-block-end-color',
    ],
  },
  {
    name: 'border-inline',
    longhands: [
      'border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color',
      'border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color',
    ],
  },
];

function tryCombineNamedShorthand(
  shorthandName: string,
  longhands: readonly string[],
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  if (!longhands.includes(d.name)) return null;

  const allDecls = longhands.map(name => declMap.get(name));
  if (!allDecls.every(other => other && !processed.has(other) && other.important === d.important)) return null;
  if (checkIntervening(allDecls as Declaration[], declarations, declIndices)) return null;

  const record: Record<string, ComponentValue[]> = {};
  for (const other of allDecls) record[other!.name] = other!.value;

  const contracted = SHORTHANDS[shorthandName]?.contract(record);
  if (contracted !== null && contracted !== undefined) {
    for (const other of allDecls) processed.add(other!);
    return `${shorthandName}: ${contracted}${d.important ? ' !important' : ''}`;
  }
  return null;
}

const GENERIC_FONT_FAMILIES = new Set([
  'serif', 'sans-serif', 'cursive', 'fantasy', 'monospace',
  'system-ui', 'math', 'emoji', 'fangsong', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded'
]);

const CSS_WIDE_AND_DEFAULT = new Set([
  'initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'
]);

function serializeFontFamilyItem(tokens: ComponentValue[]): string {
  const nonWs = tokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
  if (nonWs.length === 1 && nonWs[0].type === 'string') {
    let strVal = nonWs[0].value;
    if ((strVal.startsWith("'") && strVal.endsWith("'")) || (strVal.startsWith('"') && strVal.endsWith('"'))) {
      strVal = strVal.slice(1, -1);
    }
    const lower = strVal.toLowerCase();
    if (GENERIC_FONT_FAMILIES.has(lower) || CSS_WIDE_AND_DEFAULT.has(lower)) {
      return `"${strVal}"`;
    }
    if (strVal !== strVal.trim() || /\s{2,}|\t|\n|\r/.test(strVal)) {
      return `"${strVal}"`;
    }
    const words = strVal.split(' ');
    const isValidIdentSequence = words.length > 0 && words.every(word => (
      word.length > 0 && !/^[0-9]|^--|^-[0-9]/.test(word) && /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(word)
    ));
    return isValidIdentSequence ? strVal : `"${strVal}"`;
  }
  if (nonWs.every(t => t.type === 'ident')) {
    return nonWs.map(t => serializeNode(t, false)).join(' ');
  }
  return tokens.map(t => serializeNode(t, false)).join('');
}

export function serializeFontFamily(values: ComponentValue[]): string {
  const groups: ComponentValue[][] = [];
  let current: ComponentValue[] = [];

  for (const token of values) {
    if (token.type === 'comma') {
      groups.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.map(g => serializeFontFamilyItem(g).trim()).filter(s => s.length > 0).join(', ');
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

  if (declarations.length >= ALL_SHORTHAND_LONGHANDS.length) {
    const firstDecl = declMap.get(ALL_SHORTHAND_LONGHANDS[0]);
    if (firstDecl) {
      const firstVal = serialize(firstDecl.value).trim();
      const firstValLower = firstVal.toLowerCase();
      const firstImportant = firstDecl.important;
      if (CSS_WIDE_AND_DEFAULT.has(firstValLower) || firstValLower.startsWith('var(')) {
        const allMatch = ALL_SHORTHAND_LONGHANDS.every(lh => {
          const d = declMap.get(lh);
          return d && serialize(d.value).trim().toLowerCase() === firstValLower && d.important === firstImportant;
        });
        if (allMatch) {
          const allLonghandsSet = new Set(ALL_SHORTHAND_LONGHANDS as readonly string[]);
          const allDecl: Declaration = {
            type: 'declaration',
            name: 'all',
            value: firstDecl.value,
            important: firstImportant,
          };
          const newDecls: Declaration[] = [];
          let inserted = false;
          for (const d of declarations) {
            if (allLonghandsSet.has(d.name)) {
              if (!inserted) {
                newDecls.push(allDecl);
                inserted = true;
              }
            } else {
              newDecls.push(d);
            }
          }
          return serializeDeclarations(newDecls);
        }
      }
    }
  }

  const processed = new Set<Declaration>();
  const result: string[] = [];

  for (const d of declarations) {
    if (processed.has(d)) continue;

    let combined = tryCombineBorderFull(d, declMap, processed, declarations, declIndices);
    if (!combined) {
      for (const spec of ORDERED_SHORTHAND_COMBINERS) {
        combined = tryCombineNamedShorthand(spec.name, spec.longhands, d, declMap, processed, declarations, declIndices);
        if (combined) break;
      }
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
            if (existing && !processed.has(existing)) {
              return { name: side, value: serialize(existing.value).trim(), important: existing.important, decl: existing };
            }
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
            for (const r of sideResults) {
              if (r && 'longhands' in r) (r.longhands as Declaration[]).forEach(lh => processed.add(lh));
              else if (r && 'decl' in r) processed.add(r.decl as Declaration);
            }
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
      let val: string;
      if (d.name === 'font-family') {
        val = serializeFontFamily(d.value);
      } else if (d.name === 'flex-basis' && serialize(d.value).trim() === '0') {
        val = '0px';
      } else {
        val = (d.raw && !d.raw.includes('var(')) ? d.raw : serialize(d.value, isCustom, d.name).trim();
      }
      result.push(`${serializeIdentifier(d.name)}: ${val}${d.important ? ' !important' : ''}`);
      processed.add(d);
    }
  }

  return result.join('; ') + ';';
}

export interface NamespaceContext {
  hasDefaultNamespace?: boolean;
  defaultNamespacePrefixes?: Set<string>;
}

export function serializeSelectorList(list: SelectorList, nsContext?: boolean | NamespaceContext): string {
  const hasDefaultNamespace = typeof nsContext === 'boolean' ? nsContext : Boolean(nsContext?.hasDefaultNamespace);
  const defaultNamespacePrefixes = typeof nsContext === 'object' && nsContext !== null ? nsContext.defaultNamespacePrefixes : undefined;
  const context = { hasDefaultNamespace, defaultNamespacePrefixes };
  return list.selectors.map(s => (
    s.type === 'invalid-selector' ? serialize(s.tokens) : serializeComplexSelector(s, context)
  )).join(', ');
}

function serializeComplexSelector(complex: ComplexSelector, nsContext: { hasDefaultNamespace: boolean; defaultNamespacePrefixes?: Set<string> }): string {
  const { hasDefaultNamespace, defaultNamespacePrefixes } = nsContext;
  return complex.items.map((item, idx) => {
    if (item.type === 'combinator') {
      if (item.value === ' ') return ' ';
      return idx === 0 ? `${item.value} ` : ` ${item.value} `;
    }
    const selectors = item.selectors.filter((s, sIdx) => {
      if (s.type === 'universal-selector' && item.selectors.length > 1 && sIdx === 0) {
        const isDefaultNs = s.namespace !== undefined && s.namespace !== '' && defaultNamespacePrefixes?.has(s.namespace);
        if (s.namespace === undefined || isDefaultNs || (s.namespace === '*' && !hasDefaultNamespace)) {
          return false;
        }
      }
      return true;
    });
    return selectors.map(s => serializeSimpleSelector(s, nsContext)).join('');
  }).join('');
}

function formatAnPlusB(tokens: ComponentValue[]): string {
  const parsed = parseAnPlusB(tokens);
  if (parsed === null) return serialize(tokens).trim();
  const { a, b } = parsed;
  if (a === 0) return b.toString();
  const partA = a === 1 ? 'n' : a === -1 ? '-n' : `${a}n`;
  if (b === 0) return partA;
  return b > 0 ? `${partA}+${b}` : `${partA}${b}`;
}

function formatSelectorNamespacePrefix(
  namespace: string | undefined,
  nsContext: { hasDefaultNamespace: boolean; defaultNamespacePrefixes?: Set<string> },
  isElementSelector: boolean,
): string {
  if (namespace === undefined) return '';
  if (isElementSelector && namespace !== '' && nsContext.defaultNamespacePrefixes?.has(namespace)) {
    return '';
  }
  if (namespace === '*') {
    return (!isElementSelector || nsContext.hasDefaultNamespace) ? '*|' : '';
  }
  if (namespace === '') {
    return isElementSelector ? '|' : '';
  }
  return `${serializeIdentifier(namespace)}|`;
}

const NTH_PSEUDO_CLASSES = new Set(['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type']);

function serializeSimpleSelector(simple: SimpleSelector, nsContext: { hasDefaultNamespace: boolean; defaultNamespacePrefixes?: Set<string> }): string {
  switch (simple.type) {
    case 'type-selector':
      return formatSelectorNamespacePrefix(simple.namespace, nsContext, true) + serializeIdentifier(simple.name);
    case 'universal-selector':
      return formatSelectorNamespacePrefix(simple.namespace, nsContext, true) + '*';
    case 'id-selector':
      return '#' + serializeIdentifier(simple.name);
    case 'class-selector':
      return '.' + serializeIdentifier(simple.name);
    case 'attribute-selector': {
      let attr = '[' + formatSelectorNamespacePrefix(simple.namespace, nsContext, false) + serializeIdentifier(simple.name);
      if (simple.operator) attr += simple.operator + serializeString(simple.value || '');
      if (simple.flags) attr += ' ' + simple.flags;
      return attr + ']';
    }
    case 'pseudo-class-selector': {
      let pc = `:${simple.name}`;
      const isNth = NTH_PSEUDO_CLASSES.has(simple.name.toLowerCase());
      if (simple.argument) {
        if ('type' in simple.argument && simple.argument.type === 'selector-list') {
          const selStr = serializeSelectorList(simple.argument, nsContext);
          pc += isNth && simple.nth ? `(${formatAnPlusB(simple.nth)} of ${selStr})` : `(${selStr})`;
        } else {
          const tokens = simple.argument as ComponentValue[];
          pc += `(${isNth ? formatAnPlusB(tokens) : serialize(tokens).trim()})`;
        }
      }
      return pc;
    }
    case 'pseudo-element-selector': {
      let pe = `::${simple.name}`;
      if (simple.argument) {
        pe += ('type' in simple.argument && simple.argument.type === 'selector-list')
          ? `(${serializeSelectorList(simple.argument, nsContext)})`
          : `(${serialize(simple.argument as ComponentValue[]).trim()})`;
      }
      return pe;
    }
    case 'nesting-selector':
      return '&';
    default:
      return '';
  }
}

