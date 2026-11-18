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
import { SHORTHANDS, LONGHAND_TO_SHORTHAND, ALL_SHORTHAND_LONGHANDS, isInitialBorderImage, contractTwoValue } from './shorthands.ts';
import { LOGICAL_PROPERTY_INFO } from './data/gen/LogicalMapping.ts';
import { formatNumber } from './utils/format.ts';
import { parseAnPlusB } from './SelectorParser.ts';
import { GENERIC_FONT_FAMILIES } from './data/gen/property-list.ts';
import { CSS_WIDE_AND_DEFAULT_KEYWORDS as CSS_WIDE_AND_DEFAULT } from './utils.ts';

/**
 * Determines whether two consecutive tokens require an empty comment separator
 * between them to prevent coalescing per css-syntax-3 #serialization.
 * // css-syntax-3 #serialization-tables
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

  // Row: ident (css-syntax-3 #serialization)
  if (isIdent1) {
    return inGroupA || isOpenParen2;
  }

  // Rows: at-keyword, hash, dimension, #, - (css-syntax-3 #serialization)
  if (isAtKeyword1 || isHash1 || isDimension1 || isDelimHash1 || isDelimDash1) {
    return inGroupA;
  }

  // Row: number (css-syntax-3 #serialization)
  if (isNumber1) {
    return isIdent2 || isFunction2 || isUrl2 || isBadUrl2 || isNumber2 || isPercentage2 || isDimension2 || isCDC2 || isDelimPercent2;
  }

  // Row: @ (css-syntax-3 #serialization)
  if (isDelimAt1) {
    return isIdent2 || isFunction2 || isUrl2 || isBadUrl2 || isDelimDash2 || isCDC2;
  }

  // Rows: . and + (css-syntax-3 #serialization)
  if (isDelimDot1 || isDelimPlus1) {
    return isNumber2 || isPercentage2 || isDimension2;
  }

  // Row: / (css-syntax-3 #serialization)
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

/**
 * Serializes an array of CSS component values or tokens back into a CSS string,
 * inserting `/** /` comment separators between adjacent tokens that would otherwise merge.
 */
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

export function serializeToken(token: Token, preserveCase: boolean = false): string {
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
      return token.value === '\\' ? '\\\n' : token.value;
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
 * // cssom-1 #serialize-an-identifier
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
 * // cssom-1 #serialize-a-string
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

const PHYSICAL_BORDER_SIDES = ['border-top', 'border-right', 'border-bottom', 'border-left'] as const;
const BORDER_SIDE_SHORTHANDS = /* @__PURE__ */ new Set([
  ...PHYSICAL_BORDER_SIDES,
  'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end',
]);
const GROUP_SHORTHANDS = ['border', 'outline', 'list-style', 'flex', 'font-variant', 'font'] as const;

function getPropertyGroup(name: string): string | undefined {
  const info = LOGICAL_PROPERTY_INFO[name];
  if (info) return info.group;
  if (name === 'font-variant-caps') return 'font';
  const shorthands = LONGHAND_TO_SHORTHAND[name];
  if (shorthands) {
    for (const group of GROUP_SHORTHANDS) {
      if (shorthands.includes(group)) return group;
    }
  }
  if (BORDER_SIDE_SHORTHANDS.has(name)) return 'border';
  return undefined;
}

function checkIntervening(decls: Declaration[], allDecls: Declaration[], declIndices: Map<Declaration, number>): boolean {
  const indices = decls.map(d => declIndices.get(d)!);
  const startIdx = Math.min(...indices);
  const endIdx = Math.max(...indices);
  const names = new Set(decls.map(d => d.name));

  const groups = new Set(decls.map(d => getPropertyGroup(d.name)).filter(Boolean));
  const isSideShorthand = groups.size > 1;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const intervening = allDecls[i];
    if (names.has(intervening.name)) continue;
    const interveningGroup = getPropertyGroup(intervening.name);
    if (!interveningGroup) continue;

    if (isSideShorthand) {
      const sidePrefix = decls[0].name.replace(/-(width|style|color)$/, '');
      if (intervening.name.startsWith(sidePrefix + '-') || intervening.name === 'all' || intervening.name === 'border') {
        return true;
      }
    } else if (groups.has(interveningGroup) || intervening.name === 'all' || intervening.name === 'border') {
      return true;
    }
  }
  return false;
}

interface CombinerEntry {
  name: string;
  longhands: readonly string[];
  contract: (record: Record<string, ComponentValue[]>) => string | null;
  isPhysicalBorderSide?: boolean;
}

const BOX_SHORTHAND_NAMES = /* @__PURE__ */ new Set(
  'margin,padding,border-width,border-style,border-color,scroll-margin,scroll-padding,inset,overflow-clip-margin,border-radius'.split(',')
);
const GENERIC_COMBINER_NAMES = [
  ...PHYSICAL_BORDER_SIDES,
  'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end',
  'outline', 'list-style', 'flex', 'border-image', 'line-clamp',
] as const;
const TWO_VALUE_COMBINER_NAMES = [
  'margin-inline', 'padding-inline', 'margin-block', 'padding-block',
  'inset-inline', 'inset-block',
  'border-inline-width', 'border-block-width',
  'border-inline-style', 'border-block-style',
  'border-inline-color', 'border-block-color',
  'border-inline', 'border-block',
  'overflow',
] as const;

let cachedCombiners: {
  byLonghand: Map<string, CombinerEntry[]>;
  borderPhysicalLonghands: readonly string[];
  borderImageLonghands: readonly string[];
} | null = null;

function getCombiners() {
  if (cachedCombiners) return cachedCombiners;

  const entries: CombinerEntry[] = [];
  const add = (entry: CombinerEntry) => entries.push(entry);

  // 1. Named composite shorthands (highest precedence after full border)
  for (const name of ['font', 'font-variant', 'background'] as const) {
    const def = SHORTHANDS[name];
    add({ name, longhands: def.longhands, contract: def.contract });
  }
  for (const name of ['border-block', 'border-inline'] as const) {
    const def = SHORTHANDS[name];
    if (def.logicalLonghands) add({ name, longhands: def.logicalLonghands, contract: def.contract });
  }

  // 2. 4-side box shorthands (physical and logical)
  for (const [name, def] of Object.entries(SHORTHANDS)) {
    if (BOX_SHORTHAND_NAMES.has(name) && def.logicalLonghands?.length === 4) {
      add({ name, longhands: def.longhands, contract: def.contract });
      add({ name, longhands: def.logicalLonghands, contract: def.contract });
    }
  }

  // 3. Generic & border-side shorthands
  const physicalBorderSet = new Set<string>(PHYSICAL_BORDER_SIDES);
  for (const name of GENERIC_COMBINER_NAMES) {
    const def = SHORTHANDS[name];
    add({ name, longhands: def.longhands, contract: def.contract, isPhysicalBorderSide: physicalBorderSet.has(name) });
  }

  // 4. Two-value logical/overflow shorthands
  for (const name of TWO_VALUE_COMBINER_NAMES) {
    const def = SHORTHANDS[name];
    add({ name, longhands: def.longhands, contract: def.contract });
  }
  const overscrollLonghands = ['overscroll-behavior-x', 'overscroll-behavior-y'] as const;
  add({
    name: 'overscroll-behavior',
    longhands: overscrollLonghands,
    contract: contractTwoValue(overscrollLonghands),
  });

  const byLonghand = new Map<string, CombinerEntry[]>();
  for (const entry of entries) {
    for (const lh of entry.longhands) {
      let list = byLonghand.get(lh);
      if (!list) {
        list = [];
        byLonghand.set(lh, list);
      }
      list.push(entry);
    }
  }

  cachedCombiners = {
    byLonghand,
    borderPhysicalLonghands: PHYSICAL_BORDER_SIDES.flatMap(side => SHORTHANDS[side].longhands),
    borderImageLonghands: SHORTHANDS['border-image'].longhands,
  };
  return cachedCombiners;
}

function collectDeclGroup(
  longhands: readonly string[],
  important: boolean,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): Declaration[] | null {
  const matched: Declaration[] = [];
  for (const name of longhands) {
    const decl = declMap.get(name);
    if (!decl || processed.has(decl) || decl.important !== important) return null;
    matched.push(decl);
  }
  if (checkIntervening(matched, declarations, declIndices)) return null;
  return matched;
}

function tryCombineBorderFull(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const { borderPhysicalLonghands, borderImageLonghands } = getCombiners();
  if (!borderPhysicalLonghands.includes(d.name)) return null;

  const allDecls = collectDeclGroup(borderPhysicalLonghands, d.important, declMap, processed, declarations, declIndices);
  if (!allDecls) return null;

  const imageDecls = borderImageLonghands
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
  for (const other of allDecls) record[other.name] = other.value;

  const contracted = SHORTHANDS['border']?.contract(record);
  if (contracted === null || contracted === undefined) return null;

  for (const other of allDecls) processed.add(other);
  for (const img of imageDecls) processed.add(img);
  return `border: ${contracted}${d.important ? ' !important' : ''}`;
}

function tryCombineDeclaration(
  d: Declaration,
  declMap: Map<string, Declaration>,
  processed: Set<Declaration>,
  declarations: Declaration[],
  declIndices: Map<Declaration, number>
): string | null {
  const candidates = getCombiners().byLonghand.get(d.name);
  if (!candidates) return null;

  for (const entry of candidates) {
    const matched = collectDeclGroup(entry.longhands, d.important, declMap, processed, declarations, declIndices);
    if (!matched) continue;

    const record: Record<string, ComponentValue[]> = {};
    for (const decl of matched) record[decl.name] = decl.value;
    const value = entry.contract(record);
    if (value === null || value === undefined) continue;

    for (const decl of matched) processed.add(decl);
    const suffix = d.important ? ' !important' : '';

    if (entry.isPhysicalBorderSide) {
      const otherSideDecls: Declaration[] = [];
      let allSidesEqual = true;
      for (const side of PHYSICAL_BORDER_SIDES) {
        if (side === entry.name) continue;
        const existing = declMap.get(side);
        if (existing && !processed.has(existing)) {
          if (existing.important === d.important && serialize(existing.value).trim() === value) {
            otherSideDecls.push(existing);
            continue;
          }
          allSidesEqual = false;
          break;
        }
        const sideMatched = collectDeclGroup(SHORTHANDS[side].longhands, d.important, declMap, processed, declarations, declIndices);
        if (!sideMatched) {
          allSidesEqual = false;
          break;
        }
        const sideRecord: Record<string, ComponentValue[]> = {};
        for (const lh of sideMatched) sideRecord[lh.name] = lh.value;
        if (SHORTHANDS[side].contract(sideRecord) !== value) {
          allSidesEqual = false;
          break;
        }
        otherSideDecls.push(...sideMatched);
      }
      if (allSidesEqual) {
        for (const decl of otherSideDecls) processed.add(decl);
        return `border: ${value}${suffix}`;
      }
    }

    return `${entry.name}: ${value}${suffix}`;
  }
  return null;
}

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

    const combined =
      tryCombineBorderFull(d, declMap, processed, declarations, declIndices) ??
      tryCombineDeclaration(d, declMap, processed, declarations, declIndices);

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

// css-syntax-3 #serializing-anb
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

const NTH_PSEUDO_CLASSES = /* @__PURE__ */ new Set('nth-child,nth-last-child,nth-of-type,nth-last-of-type'.split(','));

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

