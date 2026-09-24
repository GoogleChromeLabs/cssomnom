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
import { tokenize } from './tokenizer.ts';
import { Parser } from './parser.ts';
import { serialize, getMirrorToken, serializeIdentifier } from './serializer.ts';
import type { ComponentValue, Token, CSSFunction, GeneralEnclosed, MediaFeature, MediaCondition, MediaQuery, MediaEnvironment } from './types.ts';
import { unitToBase } from './data/gen/units.ts';
import { parseMathFunction, simplify } from './math-parser.ts';
import { CSSUnitValue } from './typed-om.ts';
import { ParseHooks } from './parse-hooks.ts';
import { 
  KNOWN_FEATURES, 
  RANGE_FEATURES,
  FEATURE_VALUE_TYPES, 
  FEATURE_ALLOWED_IDENTS
} from './data/gen/media-features.ts';

// mediaqueries-4 § 2 #structure
// mediaqueries-4 § 3 #media-types
// mediaqueries-4 § 4 #evaluating-features
// mediaqueries-5 § 2 #syntax
export class MediaParser {
  /**
   * Parse a media query list string into an array of normalized media queries.
   * Invalid queries are replaced with 'not all'.
   * // mediaqueries-4 § 2.1 #mq-syntax
   * // mediaqueries-4 § 3.2 #evaluating-mq-list
   */
  public static parse(mediaText: string): MediaQuery[] {
    if (!mediaText || mediaText.trim() === '') {
      return [];
    }

    const tokens = tokenize(mediaText);
    const parser = new Parser(tokens);
    const values = parser.parseComponentValues();

    const queries: MediaQuery[] = [];
    let currentQuery: ComponentValue[] = [];
    let seenComma = false;

    for (const val of values) {
      if (val.type === 'comma') {
        queries.push(this.normalizeAndValidate(currentQuery));
        currentQuery = [];
        seenComma = true;
      } else {
        currentQuery.push(val);
      }
    }

    if (currentQuery.length > 0 || seenComma) {
      queries.push(this.normalizeAndValidate(currentQuery));
    }

    return queries;
  }

  /**
   * Evaluate a media query or media query list against a media environment.
   * Uses Kleene 3-valued logic, converting 'unknown' to false in boolean context.
   */
  public static evaluate(query: string | MediaQuery | MediaQuery[], env?: Partial<MediaEnvironment>): boolean {
    const fullEnv: MediaEnvironment = { ...DEFAULT_MEDIA_ENV, ...env };
    let queries: MediaQuery[];
    if (typeof query === 'string') {
      queries = this.parse(query);
    } else if (Array.isArray(query)) {
      queries = query;
    } else {
      queries = [query];
    }
    const result = evaluateMediaQueries(queries, fullEnv);
    return result === true;
  }

  private static normalizeAndValidate(values: ComponentValue[]): MediaQuery {
    const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (filtered.length === 0) {
      return {
        type: 'media-query',
        invalid: true,
        tokens: values
      };
    }

    const canonical = this.canonicalSerialize(values);
    const tokens = tokenize(canonical);
    const parser = new Parser(tokens);
    const canonicalValues = parser.parseComponentValues();

    const validator = new MediaQueryValidator(canonicalValues);
    const queryNode = validator.validate();
    if (!queryNode) {
      return {
        type: 'media-query',
        invalid: true,
        tokens: values
      };
    }

    return queryNode;
  }

  public static canonicalSerialize(values: ComponentValue[]): string {
    let result = '';
    let lastType: string | null = null;

    const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');

    let startIndex = 0;
    if (filtered.length >= 2 && 
        filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'all' &&
        filtered[1].type === 'ident' && filtered[1].value.toLowerCase() === 'and') {
      startIndex = 2;
    }

    for (let i = startIndex; i < filtered.length; i++) {
      const v = filtered[i];
      let serialized = '';

      if (v.type === 'simple-block') {
        const start = v.associatedToken.value as string;
        const end = getMirrorToken(start);
        serialized = start + this.canonicalSerialize(v.value as ComponentValue[]) + end;

      } else if (v.type === 'function') {
        const fn = v as CSSFunction;
        let mathVal: ReturnType<typeof parseMathFunction> = null;
        try {
          mathVal = parseMathFunction(fn.name, fn.value);
        } catch {
          mathVal = null;
        }
        if (mathVal && fn.name.toLowerCase() === 'calc') {
          const simp = simplify(mathVal);
          if (simp instanceof CSSUnitValue) {
            let val = simp;
            if (val.unit === 'dpi' || val.unit === 'dpcm' || val.unit === 'dppx' || val.unit === 'x') {
              try {
                val = val.to('dppx');
              } catch {}
            }
            let unit: string = val.unit;
            if (unit === 'x') unit = 'dppx';
            if (unit === 'number') unit = '';
            serialized = `calc(${val.value}${unit})`;
          } else {
            serialized = fn.name.toLowerCase() + '(' + this.canonicalSerialize(fn.value as ComponentValue[]) + ')';
          }
        } else {
          serialized = fn.name.toLowerCase() + '(' + this.canonicalSerialize(fn.value as ComponentValue[]) + ')';
        }
      } else if (v.type === 'ident') {
        const val = v.value;
        if (val.startsWith('--')) {
          serialized = serializeIdentifier(val);
        } else {
          serialized = serializeIdentifier(val.toLowerCase());
        }
      } else if (v.type === 'at-keyword') {
        serialized = '@' + v.value.toLowerCase();
      } else if (v.type === 'dimension') {
        const unit = v.unit;
        serialized = v.value.toString() + (unit ? serializeIdentifier(unit.toLowerCase()) : '');

      } else {
        serialized = serialize([v]).trim();
      }

      const isOperator = v.type === 'delim' && (v.value === '>' || v.value === '<' || v.value === '=' || v.value === '+' || v.value === '-');
      const isRatioSlash = v.type === 'delim' && v.value === '/' && (lastType === 'number' || lastType === 'function') && (filtered[i + 1]?.type === 'number' || filtered[i + 1]?.type === 'function');
      const lastWasOperator = lastType === 'delim' && (result.endsWith('>') || result.endsWith('<') || result.endsWith('=') || result.endsWith('+') || result.endsWith('-'));

      if (isRatioSlash) {
        if (!result.endsWith(' ')) result += ' ';
        result += '/ ';
        lastType = 'delim';
        continue;
      }

      // Add space between idents or between ident and other things if needed
      if ((lastType === 'ident' || lastType === 'dimension' || lastType === 'function' || lastType === 'number') && (v.type === 'ident' || v.type === 'number' || v.type === 'dimension' || (v.type === 'delim' && isOperator) || v.type === 'simple-block')) {
        result += ' ';
      } else if (lastType === 'simple-block' && v.type === 'ident') {
        result += ' ';
      } else if (lastType === 'delim' && lastWasOperator && v.type === 'ident') {
        if (!result.endsWith(' ')) result += ' ';
      } else if (lastType === 'colon') {
        result += ' ';
      } else if (lastType === 'comma') {
        result += ' ';
      } else if (lastType === 'number' && v.type === 'number') {
        result += ' ';
      } else if (isOperator && !lastWasOperator) {
        // Add space before operators if not already there and not part of a combined operator
        if (!result.endsWith(' ') && result.length > 0 && !result.endsWith('(')) result += ' ';
      }

      result += serialized;
      
      // Add space after operators if not the first part of a combined operator
      if (isOperator) {
        const next = filtered[i + 1];
        const nextIsOperator = next && next.type === 'delim' && (next.value === '>' || next.value === '<' || next.value === '=');
        if (!nextIsOperator) {
          result += ' ';
        } else if ((v.value === '<' || v.value === '>') && next.value === '=') {
          const vToken = v as Token;
          const nextToken = next as Token;
          if (vToken.endIndex === undefined || nextToken.startIndex === undefined || vToken.endIndex !== nextToken.startIndex) {
            result += ' ';
          }
        }
      }
      
      lastType = v.type;
    }

    return result.trim();
  }


}




function filterSignificant(tokens: ComponentValue[]): ComponentValue[] {
  return tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
}

function normalizeAspectRatioTokens(featureName: string, valueTokens: ComponentValue[]): ComponentValue[] {
  if (!featureName.includes('aspect-ratio')) return valueTokens;
  const filtered = filterSignificant(valueTokens);
  if (filtered.length !== 1) return valueTokens;
  return [
    filtered[0],
    { type: 'delim', value: '/' } as Token,
    { type: 'number', value: 1, valueText: '1', numberType: 'integer', sign: null } as Token,
  ];
}

const INVERT_COMPARISON_OP: Record<string, string> = {
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
};

export class MediaQueryValidator {
  private stream: ComponentValue[];
  private pos: number;

  private static readonly KNOWN_FEATURES = KNOWN_FEATURES;
  private static readonly RANGE_FEATURES = RANGE_FEATURES;
  private static readonly FEATURE_VALUE_TYPES = FEATURE_VALUE_TYPES;
  private static readonly FEATURE_ALLOWED_IDENTS = FEATURE_ALLOWED_IDENTS;

  constructor(stream: ComponentValue[]) {
    this.stream = filterSignificant(stream);
    this.pos = 0;
  }

  private peek(): ComponentValue | undefined {
    return this.stream[this.pos];
  }

  private consume(): ComponentValue | undefined {
    return this.stream[this.pos++];
  }

  private eof(): boolean {
    return this.pos >= this.stream.length;
  }

  private isIdent(val?: string): boolean {
    const t = this.peek();
    if (!t || t.type !== 'ident') return false;
    return val ? t.value.toLowerCase() === val.toLowerCase() : true;
  }

  public validate(): MediaQuery | null {
    if (this.stream.length === 0) return null;
    const startPos = this.pos;

    const cond = this.parseMediaCondition(true);
    if (cond !== null && this.eof()) {
      return {
        type: 'media-query',
        condition: cond,
        tokens: this.stream,
      };
    }

    this.pos = startPos;

    let modifier: 'not' | 'only' | undefined = undefined;
    if (this.isIdent('not') || this.isIdent('only')) {
      modifier = String((this.consume() as Token).value).toLowerCase() as 'not' | 'only';
    }

    const mediaType = this.parseMediaType();
    if (mediaType !== null) {
      let condition: MediaCondition | MediaFeature | GeneralEnclosed | undefined = undefined;
      if (this.isIdent('and')) {
        this.consume();
        const condResult = this.parseMediaCondition(false);
        if (condResult === null) return null;
        condition = condResult;
      }

      if (this.eof()) {
        return {
          type: 'media-query',
          modifier,
          mediaType,
          condition,
          tokens: this.stream,
        };
      }
    }

    return null;
  }

  private parseMediaType(): string | null {
    const t = this.peek();
    if (!t || t.type !== 'ident') return null;
    const v = t.value.toLowerCase();
    if (v === 'not' || v === 'only' || v === 'and' || v === 'or' || v === 'layer') {
      return null;
    }
    this.consume();
    return v;
  }

  private parseMediaCondition(allowOr: boolean = true): MediaCondition | MediaFeature | GeneralEnclosed | null {
    const startPos = this.pos;
    if (this.isIdent('not')) {
      this.consume();
      const res = this.parseMediaInParens();
      if (res !== null) {
        return {
          type: 'media-condition',
          operator: 'not',
          children: [res],
        };
      }
      this.pos = startPos;
      return null;
    }

    const res = this.parseMediaInParens();
    if (res === null) return null;

    const op = this.isIdent('and') ? 'and' : (allowOr && this.isIdent('or')) ? 'or' : null;
    if (op) {
      const children = [res];
      while (this.isIdent(op)) {
        this.consume();
        const next = this.parseMediaInParens();
        if (next === null) return null;
        children.push(next);
      }
      return {
        type: 'media-condition',
        operator: op,
        children,
      };
    }
    return res;
  }

  private parseMediaInParens(): MediaCondition | MediaFeature | GeneralEnclosed | null {
    const t = this.peek();
    if (!t) return null;

    if (t.type === 'simple-block' && t.associatedToken.value === '(') {
      this.consume();
      return this.validateMediaInParens(filterSignificant(t.value));
    }

    if (t.type === 'function' && Array.isArray(t.value)) {
      const fn = t as CSSFunction;
      this.consume();
      return {
        type: 'general-enclosed',
        name: fn.name,
        value: fn.value,
      };
    }

    return null;
  }

  private isValidMfValue(tokens: ComponentValue[]): boolean {
    if (tokens.length === 0) return false;
    for (const t of tokens) {
      if (t.type === 'comma' || (t.type === 'delim' && (t.value === '<' || t.value === '>' || t.value === '='))) {
        return false;
      }
    }
    return true;
  }

  private validateMediaInParens(tokens: ComponentValue[]): MediaCondition | MediaFeature | GeneralEnclosed | null {
    if (tokens.length === 0) return null;

    const validator = new MediaQueryValidator(tokens);
    const condResult = validator.parseMediaCondition(true);
    if (condResult !== null && validator.eof()) {
      return condResult;
    }

    if (tokens.length >= 3 && tokens[0].type === 'ident' && tokens[1].type === 'colon') {
      const featureName = tokens[0].value.toLowerCase();
      const valueTokens = normalizeAspectRatioTokens(featureName, tokens.slice(2));
      if (this.isValidMfValue(valueTokens)) {
        return {
          type: 'media-feature',
          name: featureName,
          value: valueTokens,
          tokens: [tokens[0], tokens[1], ...valueTokens],
        };
      }
    }

    if (tokens.length === 1 && tokens[0].type === 'ident') {
      const featureName = tokens[0].value.toLowerCase();
      const isInvalidMinMax =
        (featureName.startsWith('min-') || featureName.startsWith('max-')) &&
        (MediaQueryValidator.KNOWN_FEATURES as Set<string>).has(featureName.slice(4));
      if (!isInvalidMinMax) {
        return {
          type: 'media-feature',
          name: featureName,
          tokens,
        };
      }
    }

    const rangeResult = this.parseRangeContext(tokens);
    if (rangeResult !== null) return rangeResult;

    return {
      type: 'general-enclosed',
      value: tokens,
    };
  }

  private parseRangeContext(tokens: ComponentValue[]): MediaFeature | null {
    const ops: { op: string; start: number; end: number }[] = [];
    let pos = 0;
    while (pos < tokens.length) {
      const opInfo = this.parseOperator(tokens, pos);
      if (opInfo) {
        ops.push({ op: opInfo.op, start: pos, end: opInfo.nextPos });
        pos = opInfo.nextPos;
      } else {
        pos++;
      }
    }

    if (ops.length === 1) {
      const left = tokens.slice(0, ops[0].start);
      const right = tokens.slice(ops[0].end);
      if (left.length === 0 || right.length === 0) return null;
      if (!this.isValidMfValue(left) || !this.isValidMfValue(right)) return null;

      const leftIsIdent = left.length === 1 && left[0].type === 'ident';
      const rightIsIdent = right.length === 1 && right[0].type === 'ident';
      if (!leftIsIdent && !rightIsIdent) return null;

      const featureName = String((leftIsIdent ? left[0] : right[0] as Token).value).toLowerCase();
      const valueTokens = normalizeAspectRatioTokens(featureName, leftIsIdent ? right : left);
      const op = rightIsIdent ? (INVERT_COMPARISON_OP[ops[0].op] ?? ops[0].op) : ops[0].op;
      const opSlice = tokens.slice(ops[0].start, ops[0].end);
      const rebuiltTokens = leftIsIdent
        ? [left[0], ...opSlice, ...valueTokens]
        : [...valueTokens, ...opSlice, right[0]];
      return {
        type: 'media-feature',
        name: featureName,
        value: valueTokens,
        operator: op,
        tokens: rebuiltTokens,
      };
    }

    if (ops.length === 2) {
      const left = tokens.slice(0, ops[0].start);
      const middle = tokens.slice(ops[0].end, ops[1].start);
      const right = tokens.slice(ops[1].end);
      if (left.length === 0 || middle.length !== 1 || middle[0].type !== 'ident' || right.length === 0) return null;

      const op1 = ops[0].op;
      const op2 = ops[1].op;
      if (op1 === '=' || op2 === '=') return null;
      if ((op1 === '<' || op1 === '<=') !== (op2 === '<' || op2 === '<=')) return null;
      if (!this.isValidMfValue(left) || !this.isValidMfValue(middle) || !this.isValidMfValue(right)) return null;

      const featureName = String((middle[0] as Token).value).toLowerCase();
      const leftVal = normalizeAspectRatioTokens(featureName, left);
      const rightVal = normalizeAspectRatioTokens(featureName, right);
      return {
        type: 'media-feature',
        name: featureName,
        range: {
          leftValue: leftVal,
          leftOp: op1,
          rightOp: op2,
          rightValue: rightVal,
        },
        tokens: [
          ...leftVal,
          ...tokens.slice(ops[0].start, ops[0].end),
          middle[0],
          ...tokens.slice(ops[1].start, ops[1].end),
          ...rightVal,
        ],
      };
    }

    return null;
  }

  private parseOperator(tokens: ComponentValue[], pos: number) {
    if (pos >= tokens.length) return null;
    const t1 = tokens[pos];
    if (t1.type !== 'delim') return null;
    if (t1.value === '=') return { op: '=', nextPos: pos + 1 };
    if (t1.value === '<' || t1.value === '>') {
      const t2 = tokens[pos + 1];
      if (t2 && t2.type === 'delim' && t2.value === '=') {
        const t1Token = t1 as Token;
        const t2Token = t2 as Token;
        if (t1Token.endIndex !== undefined && t2Token.startIndex !== undefined && t1Token.endIndex === t2Token.startIndex) {
          return { op: t1.value + '=', nextPos: pos + 2 };
        }
      }
      return { op: t1.value, nextPos: pos + 1 };
    }
    return null;
  }
}

// Standalone Helper Functions for Type Validation and MQ4 AST Serialization

function isValidRatioOperand(t: ComponentValue): boolean {
  if (t.type === 'number') return t.value >= 0;
  if (t.type === 'function') {
    const fn = t as CSSFunction;
    const mathVal = parseMathFunction(fn.name, fn.value);
    if (mathVal) {
      const type = mathVal.type();
      return !type.length && !type.angle && !type.time && !type.frequency && !type.resolution && !type.flex && !type.percent;
    }
  }
  return false;
}

function matchesType(tokens: ComponentValue[], types: readonly string[], featureName: string): boolean {
  if (tokens.length === 0) return false;
  const t = tokens[0];

  if (t.type === 'function') {
    const fn = t as CSSFunction;
    const mathVal = parseMathFunction(fn.name, fn.value);
    if (mathVal) {
      const type = mathVal.type();
      if (types.includes('length') && type.length === 1) return true;
      if (types.includes('resolution') && type.resolution === 1) return true;
      const isNumber = !type.length && !type.angle && !type.time && !type.frequency && !type.resolution && !type.flex && !type.percent;
      if (types.includes('integer') && isNumber) return true;
    }
  }

  if (types.includes('length')) {
    if (t.type === 'dimension' && t.unit && unitToBase[t.unit.toLowerCase()] === 'length') return true;
    if (t.type === 'number' && t.value === 0) return true;
  }

  if (types.includes('resolution')) {
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();
      if (unit && (unitToBase[unit] === 'resolution' || unit === 'x')) return true;
    }
    if (t.type === 'ident' && t.value.toLowerCase() === 'infinite') return true;
  }

  if (types.includes('ident') && t.type === 'ident') {
    const allowed = FEATURE_ALLOWED_IDENTS[featureName];
    return allowed ? allowed.includes(t.value.toLowerCase()) : true;
  }

  if (types.includes('integer') && t.type === 'number' && t.numberType === 'integer') {
    return true;
  }

  if (types.includes('ratio')) {
    if (tokens.length === 1) return isValidRatioOperand(tokens[0]);
    if (tokens.length === 3) {
      return isValidRatioOperand(tokens[0]) &&
             tokens[1].type === 'delim' && (tokens[1] as Token).value === '/' &&
             isValidRatioOperand(tokens[2]);
    }
  }
  return false;
}

export const DEFAULT_MEDIA_ENV: MediaEnvironment = {
  mediaType: 'screen',
  width: 800,
  height: 600,
  deviceWidth: 800,
  deviceHeight: 600,
  aspectRatio: [800, 600],
  deviceAspectRatio: [800, 600],
  orientation: 'landscape',
  resolution: 96,
  color: 8,
  colorIndex: 0,
  monochrome: 0,
  colorGamut: 'srgb',
  videoColorGamut: 'srgb',
  pointer: 'fine',
  hover: 'hover',
  anyPointer: 'fine',
  anyHover: 'hover',
  grid: 0,
  scan: 'progressive',
  update: 'fast',
  overflowBlock: 'scroll',
  overflowInline: 'scroll',
  displayMode: 'browser',
  displayState: 'normal',
  prefersColorScheme: 'light',
  uaColorScheme: 'light',
  prefersContrast: 'no-preference',
  prefersReducedMotion: 'no-preference',
  prefersReducedTransparency: 'no-preference',
  prefersReducedData: 'no-preference',
  forcedColors: 'none',
  invertedColors: 'none',
  dynamicRange: 'standard',
  videoDynamicRange: 'standard',
  scripting: 'enabled',
  environmentBlending: 'opaque',
  navControls: 'none',
  resizable: true,
};

export type EvalResult = boolean | 'unknown';

export function serializeMediaQuery(query: MediaQuery): string {
  if (query.invalid) return 'not all';

  let result = '';
  if (query.modifier) result += query.modifier + ' ';
  if (query.mediaType) {
    result += query.mediaType.startsWith('--') ? serializeIdentifier(query.mediaType) : serializeIdentifier(query.mediaType.toLowerCase());
  }
  if (query.condition) {
    if (query.mediaType) result += ' and ';
    result += serializeMediaCondition(query.condition);
  }
  return result;
}

function serializeMediaCondition(cond: MediaCondition | MediaFeature | GeneralEnclosed): string {
  if (cond.type === 'media-condition') {
    if (cond.operator === 'not') {
      return 'not ' + serializeMediaCondition(cond.children[0]);
    }
    return cond.children.map(child => serializeMediaCondition(child)).join(` ${cond.operator} `);
  }
  if (cond.type === 'media-feature') {
    return '(' + MediaParser.canonicalSerialize(cond.tokens) + ')';
  }
  if (cond.type === 'general-enclosed') {
    const inner = MediaParser.canonicalSerialize(cond.value);
    return cond.name ? `${cond.name.toLowerCase()}(${inner})` : `(${inner})`;
  }
  return '';
}

export function hasUnknownFeature(query: MediaQuery): boolean {
  return query.condition ? checkConditionForUnknown(query.condition) : false;
}

function checkConditionForUnknown(node: MediaCondition | MediaFeature | GeneralEnclosed): boolean {
  if (node.type === 'media-condition') return node.children.some(child => checkConditionForUnknown(child));
  if (node.type === 'media-feature') return isFeatureUnknown(node);
  return node.type === 'general-enclosed';
}

function isFeatureUnknown(feature: MediaFeature): boolean {
  const name = feature.name.toLowerCase();
  if (name.startsWith('--')) return false;
  if (!(KNOWN_FEATURES as Set<string>).has(name)) return true;

  if (feature.operator || feature.range) {
    if (!(RANGE_FEATURES as Set<string>).has(name)) return true;
    const expectedTypes = FEATURE_VALUE_TYPES[name];
    if (expectedTypes) {
      if (feature.range) {
        if (!matchesType(feature.range.leftValue, expectedTypes, name) ||
            !matchesType(feature.range.rightValue, expectedTypes, name)) {
          return true;
        }
      } else if (feature.value && !matchesType(feature.value, expectedTypes, name)) {
        return true;
      }
    }
  } else if (feature.value) {
    const expectedTypes = FEATURE_VALUE_TYPES[name];
    if (expectedTypes) {
      if (!matchesType(feature.value, expectedTypes, name)) return true;
      if (!expectedTypes.includes('ratio') && feature.value.length !== 1) return true;
    }
  } else if (name.startsWith('min-') || name.startsWith('max-')) {
    if ((KNOWN_FEATURES as Set<string>).has(name.slice(4))) return true;
  }

  return false;
}

function evalNot3(val: EvalResult): EvalResult {
  return val === 'unknown' ? 'unknown' : !val;
}

function evalAnd3(vals: EvalResult[]): EvalResult {
  if (vals.some(v => v === false)) return false;
  if (vals.every(v => v === true)) return true;
  return 'unknown';
}

function evalOr3(vals: EvalResult[]): EvalResult {
  if (vals.some(v => v === true)) return true;
  if (vals.every(v => v === false)) return false;
  return 'unknown';
}

const NEGATIVE_RANGE_FEATURES = new Set([
  'width', 'height', 'device-width', 'device-height', 'resolution',
  'color', 'color-index', 'monochrome',
  'horizontal-viewport-segments', 'vertical-viewport-segments',
]);

const LENGTH_UNIT_TO_PX: Record<string, number> = {
  px: 1,
  em: 16,
  rem: 16,
  ex: 8,
  ch: 8,
  ic: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 96 / 6,
  vw: 800 / 100,
  vh: 600 / 100,
  vi: 800 / 100,
  vb: 600 / 100,
  vmin: 600 / 100,
  vmax: 800 / 100,
};

function parseLengthToPx(tokens: ComponentValue[]): number | null {
  const filtered = filterSignificant(tokens);
  if (filtered.length !== 1) return null;
  const t = filtered[0];
  if (t.type === 'dimension') {
    const factor = LENGTH_UNIT_TO_PX[t.unit.toLowerCase()];
    return factor !== undefined ? t.value * factor : null;
  }
  if (t.type === 'number' && t.value === 0) return 0;
  if (t.type === 'function') {
    const fn = t as CSSFunction;
    const mathVal = parseMathFunction(fn.name, fn.value);
    if (mathVal && mathVal.type().length) {
      const simplified = simplify(mathVal);
      if (simplified instanceof CSSUnitValue) {
        try {
          return simplified.to('px').value;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const RESOLUTION_UNIT_TO_DPI: Record<string, number> = {
  dpi: 1,
  dpcm: 2.54,
  dppx: 96,
  x: 96,
};

function parseResolutionToDpi(tokens: ComponentValue[]): number | null {
  const filtered = filterSignificant(tokens);
  if (filtered.length !== 1) return null;
  const t = filtered[0];
  if (t.type === 'dimension') {
    const factor = RESOLUTION_UNIT_TO_DPI[t.unit.toLowerCase()];
    return factor !== undefined ? t.value * factor : null;
  }
  if (t.type === 'function') {
    const fn = t as CSSFunction;
    const mathVal = parseMathFunction(fn.name, fn.value);
    if (mathVal && mathVal.type().resolution) {
      const simplified = simplify(mathVal);
      if (simplified instanceof CSSUnitValue) {
        try {
          return simplified.to('dpi').value;
        } catch {
          return null;
        }
      }
    }
  }
  if (t.type === 'ident' && t.value.toLowerCase() === 'infinite') return Infinity;
  return null;
}

function parseRatio(tokens: ComponentValue[]): number | null {
  const filtered = filterSignificant(tokens);
  if (filtered.length === 1 && filtered[0].type === 'number') {
    return filtered[0].value;
  }
  if (filtered.length === 3 && filtered[1].type === 'delim' && (filtered[1] as Token).value === '/') {
    const left = filtered[0];
    const right = filtered[2];
    if (left.type === 'number' && right.type === 'number' && right.value !== 0) {
      return left.value / right.value;
    }
  }
  return null;
}

function parseInteger(tokens: ComponentValue[]): number | null {
  const filtered = filterSignificant(tokens);
  return (filtered.length === 1 && filtered[0].type === 'number' && filtered[0].numberType === 'integer')
    ? filtered[0].value
    : null;
}

function parseIdent(tokens: ComponentValue[]): string | null {
  const filtered = filterSignificant(tokens);
  return (filtered.length === 1 && filtered[0].type === 'ident') ? filtered[0].value.toLowerCase() : null;
}

function compareOp(actual: number, op: string, queried: number, isNegativeRangeFeature: boolean): boolean {
  if (isNegativeRangeFeature && queried < 0) {
    return op === '>' || op === '>=';
  }
  const eps = 1e-6;
  switch (op) {
    case '=': return Math.abs(actual - queried) < eps;
    case '<': return actual < queried - eps;
    case '<=': return actual <= queried + eps;
    case '>': return actual > queried + eps;
    case '>=': return actual >= queried - eps;
    default: return false;
  }
}

function getActualNumeric(prop: string, env: MediaEnvironment): number | null {
  switch (prop) {
    case 'width': return env.width;
    case 'height': return env.height;
    case 'device-width': return env.deviceWidth;
    case 'device-height': return env.deviceHeight;
    case 'resolution': return env.resolution;
    case 'color': return env.color;
    case 'color-index': return env.colorIndex;
    case 'monochrome': return env.monochrome;
    case 'grid': return env.grid;
    case 'aspect-ratio': return env.aspectRatio[0] / env.aspectRatio[1];
    case 'device-aspect-ratio': return env.deviceAspectRatio[0] / env.deviceAspectRatio[1];
    default: return null;
  }
}

function parseValueForFeature(prop: string, tokens: ComponentValue[]): number | string | null {
  switch (prop) {
    case 'width':
    case 'height':
    case 'device-width':
    case 'device-height':
      return parseLengthToPx(tokens);
    case 'resolution':
      return parseResolutionToDpi(tokens);
    case 'aspect-ratio':
    case 'device-aspect-ratio':
      return parseRatio(tokens);
    case 'color':
    case 'color-index':
    case 'monochrome':
    case 'grid':
      return parseInteger(tokens);
    default:
      return parseIdent(tokens);
  }
}

function evaluateBooleanFeature(baseName: string, env: MediaEnvironment): boolean {
  const num = getActualNumeric(baseName, env);
  if (num !== null) {
    if (baseName === 'aspect-ratio') return env.aspectRatio[0] > 0 && env.aspectRatio[1] > 0;
    if (baseName === 'device-aspect-ratio') return env.deviceAspectRatio[0] > 0 && env.deviceAspectRatio[1] > 0;
    return num > 0;
  }
  switch (baseName) {
    case 'hover': return env.hover !== 'none';
    case 'pointer': return env.pointer !== 'none';
    case 'any-hover': return env.anyHover !== 'none';
    case 'any-pointer': return env.anyPointer !== 'none';
    case 'prefers-contrast': return env.prefersContrast !== 'no-preference';
    case 'prefers-reduced-motion': return env.prefersReducedMotion !== 'no-preference';
    case 'prefers-reduced-transparency': return env.prefersReducedTransparency !== 'no-preference';
    case 'prefers-reduced-data': return env.prefersReducedData !== 'no-preference';
    case 'forced-colors': return env.forcedColors !== 'none';
    case 'inverted-colors': return env.invertedColors !== 'none';
    case 'scripting': return env.scripting !== 'none';
    case 'dynamic-range': return env.dynamicRange === 'high';
    case 'video-dynamic-range': return env.videoDynamicRange === 'high';
    case 'overflow-block': return env.overflowBlock !== 'none';
    case 'overflow-inline': return env.overflowInline !== 'none';
    case 'nav-controls':
    case 'navigation-controls':
      return env.navControls !== 'none';
    case 'resizable':
      return env.resizable !== false;
    default:
      return true;
  }
}

function getEnvDiscreteIdent(baseName: string, env: MediaEnvironment): string | null {
  switch (baseName) {
    case 'orientation': return env.width > env.height ? 'landscape' : 'portrait';
    case 'display-mode': return env.displayMode;
    case 'display-state': return env.displayState;
    case 'prefers-color-scheme': return env.prefersColorScheme;
    case 'prefers-contrast': return env.prefersContrast;
    case 'prefers-reduced-motion': return env.prefersReducedMotion;
    case 'prefers-reduced-transparency': return env.prefersReducedTransparency;
    case 'prefers-reduced-data': return env.prefersReducedData;
    case 'forced-colors': return env.forcedColors;
    case 'inverted-colors': return env.invertedColors;
    case 'dynamic-range': return env.dynamicRange;
    case 'video-dynamic-range': return env.videoDynamicRange;
    case 'pointer': return env.pointer;
    case 'hover': return env.hover;
    case 'any-pointer': return env.anyPointer;
    case 'any-hover': return env.anyHover;
    case 'scan': return env.scan;
    case 'update': return env.update;
    case 'overflow-block': return env.overflowBlock;
    case 'overflow-inline': return env.overflowInline;
    case 'scripting': return env.scripting;
    case 'environment-blending': return env.environmentBlending;
    case 'nav-controls':
    case 'navigation-controls': return env.navControls;
    case 'resizable': return env.resizable !== false ? 'true' : 'false';
    default: return null;
  }
}

export function evaluateMediaFeature(feature: MediaFeature, env: MediaEnvironment): EvalResult {
  const name = feature.name.toLowerCase();

  if (name.startsWith('--')) {
    if (!env.customMedia) return 'unknown';
    const val = env.customMedia instanceof Map
      ? env.customMedia.get(name)
      : (typeof env.customMedia === 'object' && name in env.customMedia)
        ? (env.customMedia as Record<string, unknown>)[name]
        : undefined;
    if (val === undefined) return 'unknown';
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return evaluateMediaQueries(MediaParser.parse(val), env);
    if (val && typeof val === 'object' && 'mediaText' in val) {
      return evaluateMediaQueries(MediaParser.parse((val as { mediaText: string }).mediaText), env);
    }
    return 'unknown';
  }

  if (isFeatureUnknown(feature)) return 'unknown';

  let baseName = name;
  let prefix: 'min' | 'max' | null = null;
  if (name.startsWith('min-')) {
    prefix = 'min';
    baseName = name.slice(4);
  } else if (name.startsWith('max-')) {
    prefix = 'max';
    baseName = name.slice(4);
  }

  const isNegRange = NEGATIVE_RANGE_FEATURES.has(baseName);

  if (!feature.value && !feature.range && !feature.operator) {
    if (prefix !== null) return 'unknown';
    return evaluateBooleanFeature(baseName, env);
  }

  if (feature.range) {
    const actual = getActualNumeric(baseName, env);
    if (actual === null) return 'unknown';

    const leftVal = parseValueForFeature(baseName, feature.range.leftValue);
    const rightVal = parseValueForFeature(baseName, feature.range.rightValue);
    if (typeof leftVal !== 'number' || typeof rightVal !== 'number') return 'unknown';

    const invertedLeftOp = INVERT_COMPARISON_OP[feature.range.leftOp];
    const leftMatches = invertedLeftOp ? compareOp(actual, invertedLeftOp, leftVal, isNegRange) : false;
    const rightMatches = compareOp(actual, feature.range.rightOp, rightVal, isNegRange);
    return leftMatches && rightMatches;
  }

  const op = feature.operator || (prefix === 'min' ? '>=' : prefix === 'max' ? '<=' : '=');
  const parsedVal = parseValueForFeature(baseName, feature.value || []);
  if (parsedVal === null) return 'unknown';

  if (typeof parsedVal === 'number') {
    const actual = getActualNumeric(baseName, env);
    return actual === null ? 'unknown' : compareOp(actual, op, parsedVal, isNegRange);
  }

  if (typeof parsedVal === 'string') {
    if (op !== '=') return 'unknown';
    if (baseName === 'color-gamut' || baseName === 'video-color-gamut') {
      const gamut = baseName === 'color-gamut' ? env.colorGamut : env.videoColorGamut;
      if (parsedVal === 'srgb') return true;
      if (parsedVal === 'p3') return gamut === 'p3' || gamut === 'rec2020';
      if (parsedVal === 'rec2020') return gamut === 'rec2020';
      return false;
    }
    const actualIdent = getEnvDiscreteIdent(baseName, env);
    return actualIdent !== null ? actualIdent.toLowerCase() === parsedVal.toLowerCase() : 'unknown';
  }

  return 'unknown';
}

export function evaluateMediaCondition(cond: MediaCondition | MediaFeature | GeneralEnclosed, env: MediaEnvironment): EvalResult {
  if (cond.type === 'general-enclosed') {
    return 'unknown';
  }

  if (cond.type === 'media-feature') {
    return evaluateMediaFeature(cond, env);
  }

  if (cond.type === 'media-condition') {
    if (cond.operator === 'not') {
      const childRes = evaluateMediaCondition(cond.children[0], env);
      return evalNot3(childRes);
    }
    if (cond.operator === 'and') {
      const childResults = cond.children.map(c => evaluateMediaCondition(c, env));
      return evalAnd3(childResults);
    }
    if (cond.operator === 'or') {
      const childResults = cond.children.map(c => evaluateMediaCondition(c, env));
      return evalOr3(childResults);
    }
  }

  return 'unknown';
}

export function evaluateMediaQuery(query: MediaQuery, env: MediaEnvironment): EvalResult {
  if (query.invalid) return false;

  let baseTruth: EvalResult = true;

  if (query.mediaType) {
    const t = query.mediaType.toLowerCase();
    if (t !== 'all' && t !== env.mediaType.toLowerCase()) {
      baseTruth = false;
    }
  }

  if (query.condition) {
    const condTruth = evaluateMediaCondition(query.condition, env);
    baseTruth = evalAnd3([baseTruth, condTruth]);
  }

  if (query.modifier === 'not') {
    return evalNot3(baseTruth);
  }

  return baseTruth;
}

export function evaluateMediaQueries(queries: MediaQuery[], env: MediaEnvironment): EvalResult {
  if (queries.length === 0) return true;
  const results = queries.map(q => evaluateMediaQuery(q, env));
  return evalOr3(results);
}

// Inject into ParseHooks to break circular dependencies
ParseHooks.parseMediaQueryList = (text: string) => MediaParser.parse(text);


