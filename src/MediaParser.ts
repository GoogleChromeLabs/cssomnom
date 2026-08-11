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

export class MediaParser {
  /**
   * Parse a media query list string into an array of normalized media queries.
   * Invalid queries are replaced with 'not all'.
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
        const mathVal = parseMathFunction(fn.name, fn.value);
        if (mathVal) {
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




export class MediaQueryValidator {
  private stream: ComponentValue[];
  private pos: number;

  private static readonly KNOWN_FEATURES = KNOWN_FEATURES;
  private static readonly RANGE_FEATURES = RANGE_FEATURES;
  private static readonly FEATURE_VALUE_TYPES = FEATURE_VALUE_TYPES;
  private static readonly FEATURE_ALLOWED_IDENTS = FEATURE_ALLOWED_IDENTS;

  constructor(stream: ComponentValue[]) {
    this.stream = stream.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
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
  
  private isSimpleBlock(blockType: string): boolean {
    const t = this.peek();
    return !!t && t.type === 'simple-block' && t.associatedToken.value === blockType;
  }


  public validate(): MediaQuery | null {
    if (this.stream.length === 0) return null;
    const startPos = this.pos;
    
    const cond = this.parseMediaCondition();
    if (cond !== null && this.eof()) {
      return {
        type: 'media-query',
        condition: cond,
        tokens: this.stream
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
        const condResult = this.parseMediaConditionWithoutOr();
        if (condResult === null) return null;
        condition = condResult;
      }
      
      if (this.eof()) {
        return {
          type: 'media-query',
          modifier,
          mediaType,
          condition,
          tokens: this.stream
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

  private parseMediaCondition(): MediaCondition | MediaFeature | GeneralEnclosed | null {
    const startPos = this.pos;
    if (this.isIdent('not')) {
      this.consume();
      const res = this.parseMediaInParens();
      if (res !== null) {
        return {
          type: 'media-condition',
          operator: 'not',
          children: [res]
        };
      }
      this.pos = startPos;
      return null;
    }

    const res = this.parseMediaInParens();
    if (res === null) return null;

    if (this.isIdent('and')) {
      const children = [res];
      while (this.isIdent('and')) {
        this.consume();
        const next = this.parseMediaInParens();
        if (next === null) return null;
        children.push(next);
      }
      return {
        type: 'media-condition',
        operator: 'and',
        children
      };
    } else if (this.isIdent('or')) {
      const children = [res];
      while (this.isIdent('or')) {
        this.consume();
        const next = this.parseMediaInParens();
        if (next === null) return null;
        children.push(next);
      }
      return {
        type: 'media-condition',
        operator: 'or',
        children
      };
    }
    return res;
  }

  private parseMediaConditionWithoutOr(): MediaCondition | MediaFeature | GeneralEnclosed | null {
    const startPos = this.pos;
    if (this.isIdent('not')) {
      this.consume();
      const res = this.parseMediaInParens();
      if (res !== null) {
        return {
          type: 'media-condition',
          operator: 'not',
          children: [res]
        };
      }
      this.pos = startPos;
      return null;
    }

    const res = this.parseMediaInParens();
    if (res === null) return null;

    if (this.isIdent('and')) {
      const children = [res];
      while (this.isIdent('and')) {
        this.consume();
        const next = this.parseMediaInParens();
        if (next === null) return null;
        children.push(next);
      }
      return {
        type: 'media-condition',
        operator: 'and',
        children
      };
    }
    return res;
  }

  private parseMediaInParens(): MediaCondition | MediaFeature | GeneralEnclosed | null {
    const t = this.peek();
    if (!t) return null;
    
    if (t.type === 'simple-block' && t.associatedToken.value === '(') {
      this.consume();
      const tokens = t.value.filter((v: ComponentValue) => v.type !== 'whitespace' && v.type !== 'comment');
      return this.validateMediaInParens(tokens);
    }
    
    if (t.type === 'function' && Array.isArray(t.value)) {
      const fn = t as CSSFunction;
      this.consume();
      return {
        type: 'general-enclosed',
        name: fn.name,
        value: fn.value
      };
    }
    
    return null;
  }

  private isValidMfValue(tokens: ComponentValue[]): boolean {
    if (tokens.length === 0) return false;
    for (const t of tokens) {
      if (t.type === 'delim' && (t.value === '<' || t.value === '>' || t.value === '=')) {
        return false;
      }
      if (t.type === 'comma') {
        return false;
      }
    }
    return true;
  }

  private validateMediaInParens(tokens: ComponentValue[]): MediaCondition | MediaFeature | GeneralEnclosed | null {
    if (tokens.length === 0) return null;

    const validator = new MediaQueryValidator(tokens);
    const condResult = validator.parseMediaCondition();
    if (condResult !== null && validator.eof()) {
      return condResult;
    }

    if (tokens.length >= 3 && tokens[0].type === 'ident' && tokens[1].type === 'colon') {
      const featureName = tokens[0].value.toLowerCase();
      let valueTokens = tokens.slice(2);
      if (featureName.includes('aspect-ratio')) {
        const filtered = valueTokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
        if (filtered.length === 1) {
          valueTokens = [
            filtered[0],
            { type: 'delim', value: '/' } as Token,
            { type: 'number', value: 1, valueText: '1', numberType: 'integer', sign: null } as Token
          ];
        }
      }
      if (this.isValidMfValue(valueTokens)) {
        const rebuiltTokens = [tokens[0], tokens[1], ...valueTokens];
        return {
          type: 'media-feature',
          name: featureName,
          value: valueTokens,
          tokens: rebuiltTokens
        };
      }
    }

    if (tokens.length === 1 && tokens[0].type === 'ident') {
      const featureName = tokens[0].value.toLowerCase();
      let isInvalidMinMax = false;
      if (featureName.startsWith('min-') || featureName.startsWith('max-')) {
        const baseFeature = featureName.slice(4);
        if ((MediaQueryValidator.KNOWN_FEATURES as Set<string>).has(baseFeature)) {
          isInvalidMinMax = true;
        }
      }

      if (!isInvalidMinMax) {
        return {
          type: 'media-feature',
          name: featureName,
          tokens
        };
      }
    }

    const rangeResult = this.parseRangeContext(tokens);
    if (rangeResult !== null) {
      return rangeResult;
    }

    return {
      type: 'general-enclosed',
      value: tokens
    };
  }

  private parseRangeContext(tokens: ComponentValue[]): MediaFeature | null {
    const ops = [];
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
      
      let featureName: string | null = null;
      let valueTokens: ComponentValue[] = [];
      if (leftIsIdent) {
        featureName = (left[0] as Token).value.toString().toLowerCase();
        valueTokens = right;
      } else if (rightIsIdent) {
        featureName = (right[0] as Token).value.toString().toLowerCase();
        valueTokens = left;
      }
      
      if (featureName) {
        if (featureName.includes('aspect-ratio')) {
          const filtered = valueTokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
          if (filtered.length === 1) {
            valueTokens = [
              filtered[0],
              { type: 'delim', value: '/' } as Token,
              { type: 'number', value: 1, valueText: '1', numberType: 'integer', sign: null } as Token
            ];
          }
        }
        let op = ops[0].op;
        if (rightIsIdent) {
          if (op === '<') op = '>';
          else if (op === '<=') op = '>=';
          else if (op === '>') op = '<';
          else if (op === '>=') op = '<=';
        }
        const rebuiltTokens = leftIsIdent
          ? [left[0], ...tokens.slice(ops[0].start, ops[0].end), ...valueTokens]
          : [...valueTokens, ...tokens.slice(ops[0].start, ops[0].end), right[0]];
        return {
          type: 'media-feature',
          name: featureName,
          value: valueTokens,
          operator: op,
          tokens: rebuiltTokens
        };
      }
      
      return null;
    } else if (ops.length === 2) {
      const left = tokens.slice(0, ops[0].start);
      const middle = tokens.slice(ops[0].end, ops[1].start);
      const right = tokens.slice(ops[1].end);
      
      if (left.length === 0 || middle.length === 0 || right.length === 0) return null;
      
      const op1 = ops[0].op;
      const op2 = ops[1].op;
      
      const isLessThanOp = (op: string) => op === '<' || op === '<=';
      const isGreaterThanOp = (op: string) => op === '>' || op === '>=';
      
      if (op1 === '=' || op2 === '=') return null;
      if (isLessThanOp(op1) && !isLessThanOp(op2)) return null;
      if (isGreaterThanOp(op1) && !isGreaterThanOp(op2)) return null;
      
      if (!this.isValidMfValue(left) || !this.isValidMfValue(middle) || !this.isValidMfValue(right)) return null;
      if (middle.length === 1 && middle[0].type === 'ident') {
        const featureName = (middle[0] as Token).value.toString().toLowerCase();
        let leftVal = left;
        let rightVal = right;
        if (featureName.includes('aspect-ratio')) {
          const filtL = left.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
          if (filtL.length === 1) {
            leftVal = [
              filtL[0],
              { type: 'delim', value: '/' } as Token,
              { type: 'number', value: 1, valueText: '1', numberType: 'integer', sign: null } as Token
            ];
          }
          const filtR = right.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
          if (filtR.length === 1) {
            rightVal = [
              filtR[0],
              { type: 'delim', value: '/' } as Token,
              { type: 'number', value: 1, valueText: '1', numberType: 'integer', sign: null } as Token
            ];
          }
        }
        const rebuiltTokens = [
          ...leftVal,
          ...tokens.slice(ops[0].start, ops[0].end),
          middle[0],
          ...tokens.slice(ops[1].start, ops[1].end),
          ...rightVal
        ];
        return {
          type: 'media-feature',
          name: featureName,
          range: {
            leftValue: leftVal,
            leftOp: op1,
            rightOp: op2,
            rightValue: rightVal
          },
          tokens: rebuiltTokens
        };
      }
      return null;
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
  if (t.type === 'number') {
    return t.value >= 0;
  }
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
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();
      if (unit && unitToBase[unit] === 'length') return true;
    }
    if (t.type === 'number' && t.value === 0) return true;
  }
  
  if (types.includes('resolution')) {
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();
      if (unit && (unitToBase[unit] === 'resolution' || unit === 'x')) return true;
    }
    if (t.type === 'ident' && t.value.toLowerCase() === 'infinite') {
      return true;
    }
  }
  
  if (types.includes('ident')) {
    if (t.type === 'ident') {
      const allowed = FEATURE_ALLOWED_IDENTS[featureName];
      if (allowed) {
        return allowed.includes(t.value.toLowerCase());
      }
      return true;
    }
  }
  
  if (types.includes('integer')) {
    if (t.type === 'number' && t.numberType === 'integer') return true;
  }
  
  if (types.includes('ratio')) {
    if (tokens.length === 1) {
      return isValidRatioOperand(tokens[0]);
    }
    if (tokens.length === 3) {
      return isValidRatioOperand(tokens[0]) &&
             tokens[1].type === 'delim' && (tokens[1] as Token).value === '/' &&
             isValidRatioOperand(tokens[2]);
    }
    return false;
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
  if (query.modifier) {
    result += query.modifier + ' ';
  }
  if (query.mediaType) {
    result += query.mediaType.startsWith('--') ? serializeIdentifier(query.mediaType) : serializeIdentifier(query.mediaType.toLowerCase());
  }
  if (query.condition) {
    if (query.mediaType) {
      result += ' and ';
    }
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
    if (cond.name) {
      return cond.name.toLowerCase() + '(' + MediaParser.canonicalSerialize(cond.value) + ')';
    }
    return '(' + MediaParser.canonicalSerialize(cond.value) + ')';
  }
  
  return '';
}

export function hasUnknownFeature(query: MediaQuery): boolean {
  if (!query.condition) return false;
  return checkConditionForUnknown(query.condition);
}

function checkConditionForUnknown(node: MediaCondition | MediaFeature | GeneralEnclosed): boolean {
  if (node.type === 'media-condition') {
    return node.children.some(child => checkConditionForUnknown(child));
  }
  if (node.type === 'media-feature') {
    return isFeatureUnknown(node);
  }
  if (node.type === 'general-enclosed') {
    return true;
  }
  return false;
}

function isFeatureUnknown(feature: MediaFeature): boolean {
  const name = feature.name.toLowerCase();
  if (name.startsWith('--')) return false;
  if (!(KNOWN_FEATURES as Set<string>).has(name)) {
    return true;
  }

  if (feature.operator || feature.range) {
    if (!(RANGE_FEATURES as Set<string>).has(name)) {
      return true;
    }
    const expectedTypes = FEATURE_VALUE_TYPES[name];
    if (expectedTypes) {
      if (feature.range) {
        if (!matchesType(feature.range.leftValue, expectedTypes, name) ||
            !matchesType(feature.range.rightValue, expectedTypes, name)) {
          return true;
        }
      } else if (feature.value) {
        if (!matchesType(feature.value, expectedTypes, name)) {
          return true;
        }
      }
    }
  } else if (feature.value) {
    const expectedTypes = FEATURE_VALUE_TYPES[name];
    if (expectedTypes) {
      if (!matchesType(feature.value, expectedTypes, name)) {
        return true;
      }
      if (!expectedTypes.includes('ratio') && feature.value.length !== 1) {
        return true;
      }
    }
  } else {
    if (name.startsWith('min-') || name.startsWith('max-')) {
      const baseFeature = name.slice(4);
      if ((KNOWN_FEATURES as Set<string>).has(baseFeature)) {
        return true;
      }
    }
  }

  return false;
}

function evalNot3(val: EvalResult): EvalResult {
  if (val === 'unknown') return 'unknown';
  return !val;
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
  'width',
  'height',
  'device-width',
  'device-height',
  'resolution',
  'color',
  'color-index',
  'monochrome',
  'horizontal-viewport-segments',
  'vertical-viewport-segments'
]);

function parseLengthToPx(tokens: ComponentValue[]): number | null {
  const filtered = tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (filtered.length === 1) {
    const t = filtered[0];
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();
      const val = t.value;
      switch (unit) {
        case 'px': return val;
        case 'em':
        case 'rem': return val * 16;
        case 'ex': return val * 8;
        case 'ch': return val * 8;
        case 'ic': return val * 16;
        case 'in': return val * 96;
        case 'cm': return (val * 96) / 2.54;
        case 'mm': return (val * 96) / 25.4;
        case 'pt': return (val * 96) / 72;
        case 'pc': return (val * 96) / 6;
        case 'vw': return (val * 800) / 100;
        case 'vh': return (val * 600) / 100;
        case 'vi': return (val * 800) / 100;
        case 'vb': return (val * 600) / 100;
        case 'vmin': return (val * 600) / 100;
        case 'vmax': return (val * 800) / 100;
        default: return null;
      }
    }
    if (t.type === 'number' && t.value === 0) {
      return 0;
    }
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
  }
  return null;
}

function parseResolutionToDpi(tokens: ComponentValue[]): number | null {
  const filtered = tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (filtered.length === 1) {
    const t = filtered[0];
    if (t.type === 'dimension') {
      const unit = t.unit.toLowerCase();
      const val = t.value;
      switch (unit) {
        case 'dpi': return val;
        case 'dpcm': return val * 2.54;
        case 'dppx':
        case 'x': return val * 96;
        default: return null;
      }
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
    if (t.type === 'ident' && t.value.toLowerCase() === 'infinite') {
      return Infinity;
    }
  }
  return null;
}

function parseRatio(tokens: ComponentValue[]): number | null {
  const filtered = tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (filtered.length === 1) {
    if (filtered[0].type === 'number') {
      return filtered[0].value;
    }
  }
  if (filtered.length === 3 && filtered[1].type === 'delim' && (filtered[1] as Token).value === '/') {
    const left = filtered[0];
    const right = filtered[2];
    if (left.type === 'number' && right.type === 'number') {
      if (right.value === 0) return null;
      return left.value / right.value;
    }
  }
  return null;
}

function parseInteger(tokens: ComponentValue[]): number | null {
  const filtered = tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (filtered.length === 1 && filtered[0].type === 'number' && filtered[0].numberType === 'integer') {
    return filtered[0].value;
  }
  return null;
}

function parseIdent(tokens: ComponentValue[]): string | null {
  const filtered = tokens.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (filtered.length === 1 && filtered[0].type === 'ident') {
    return filtered[0].value.toLowerCase();
  }
  return null;
}

function compareOp(actual: number, op: string, queried: number, isNegativeRangeFeature: boolean): boolean {
  if (isNegativeRangeFeature && queried < 0) {
    if (op === '=') return false;
    if (op === '<' || op === '<=') return false;
    if (op === '>' || op === '>=') return true;
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

export function evaluateMediaFeature(feature: MediaFeature, env: MediaEnvironment): EvalResult {
  const name = feature.name.toLowerCase();

  // Custom media queries (--custom-media)
  if (name.startsWith('--')) {
    if (!env.customMedia) {
      return 'unknown';
    }
    let val: unknown;
    if (env.customMedia instanceof Map) {
      val = env.customMedia.get(name);
    } else if (typeof env.customMedia === 'object' && name in env.customMedia) {
      val = (env.customMedia as Record<string, unknown>)[name];
    }
    if (val === undefined) {
      return 'unknown';
    }
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'string') {
      const parsed = MediaParser.parse(val);
      return evaluateMediaQueries(parsed, env);
    }
    if (val && typeof val === 'object' && 'mediaText' in val) {
      const parsed = MediaParser.parse((val as { mediaText: string }).mediaText);
      return evaluateMediaQueries(parsed, env);
    }
    return 'unknown';
  }

  if (isFeatureUnknown(feature)) {
    return 'unknown';
  }

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

  // 1. Boolean context
  if (!feature.value && !feature.range && !feature.operator) {
    if (prefix !== null) return 'unknown'; // min-/max- invalid in boolean context

    switch (baseName) {
      case 'width': return env.width > 0;
      case 'height': return env.height > 0;
      case 'device-width': return env.deviceWidth > 0;
      case 'device-height': return env.deviceHeight > 0;
      case 'resolution': return env.resolution > 0;
      case 'color': return env.color > 0;
      case 'color-index': return env.colorIndex > 0;
      case 'monochrome': return env.monochrome > 0;
      case 'grid': return env.grid > 0;
      case 'hover': return env.hover !== 'none';
      case 'pointer': return env.pointer !== 'none';
      case 'any-hover': return env.anyHover !== 'none';
      case 'any-pointer': return env.anyPointer !== 'none';
      case 'prefers-color-scheme': return true;
      case 'prefers-contrast': return env.prefersContrast !== 'no-preference';
      case 'prefers-reduced-motion': return env.prefersReducedMotion !== 'no-preference';
      case 'prefers-reduced-transparency': return env.prefersReducedTransparency !== 'no-preference';
      case 'prefers-reduced-data': return env.prefersReducedData !== 'no-preference';
      case 'forced-colors': return env.forcedColors !== 'none';
      case 'inverted-colors': return env.invertedColors !== 'none';
      case 'scripting': return env.scripting !== 'none';
      case 'orientation': return true;
      case 'aspect-ratio': return env.aspectRatio[0] > 0 && env.aspectRatio[1] > 0;
      case 'device-aspect-ratio': return env.deviceAspectRatio[0] > 0 && env.deviceAspectRatio[1] > 0;
      case 'display-mode': return true;
      case 'display-state': return true;
      case 'color-gamut': return true;
      case 'video-color-gamut': return true;
      case 'dynamic-range': return env.dynamicRange === 'high';
      case 'video-dynamic-range': return env.videoDynamicRange === 'high';
      case 'scan': return true;
      case 'update': return true;
      case 'overflow-block': return env.overflowBlock !== 'none';
      case 'overflow-inline': return env.overflowInline !== 'none';
      case 'environment-blending': return true;
      case 'nav-controls':
      case 'navigation-controls':
        return env.navControls !== 'none';
      case 'resizable':
        return env.resizable !== false;
      default: return true;
    }
  }

  // 2. Numeric / Length / Resolution / Ratio / Integer features
  const getActualNumeric = (prop: string): number | null => {
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
  };

  const parseValueForFeature = (prop: string, tokens: ComponentValue[]): number | string | null => {
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
  };

  // 3. Two-operator Range: e.g. 400px < width <= 800px
  if (feature.range) {
    const actual = getActualNumeric(baseName);
    if (actual === null) return 'unknown';

    const leftVal = parseValueForFeature(baseName, feature.range.leftValue);
    const rightVal = parseValueForFeature(baseName, feature.range.rightValue);
    if (typeof leftVal !== 'number' || typeof rightVal !== 'number') return 'unknown';

    // Left comparison: leftVal < actual  ==>  actual > leftVal
    const leftOp = feature.range.leftOp;
    let leftMatches = false;
    if (leftOp === '<') leftMatches = compareOp(actual, '>', leftVal, isNegRange);
    else if (leftOp === '<=') leftMatches = compareOp(actual, '>=', leftVal, isNegRange);
    else if (leftOp === '>') leftMatches = compareOp(actual, '<', leftVal, isNegRange);
    else if (leftOp === '>=') leftMatches = compareOp(actual, '<=', leftVal, isNegRange);

    // Right comparison: actual < rightVal
    const rightOp = feature.range.rightOp;
    const rightMatches = compareOp(actual, rightOp, rightVal, isNegRange);

    return leftMatches && rightMatches;
  }

  // 4. One-operator Range or Plain feature
  const op = feature.operator || (prefix === 'min' ? '>=' : prefix === 'max' ? '<=' : '=');
  const tokensToParse = feature.value || [];
  const parsedVal = parseValueForFeature(baseName, tokensToParse);
  if (parsedVal === null) return 'unknown';

  if (typeof parsedVal === 'number') {
    const actual = getActualNumeric(baseName);
    if (actual === null) return 'unknown';
    return compareOp(actual, op, parsedVal, isNegRange);
  }

  // 5. Discrete Ident features (equality only)
  if (typeof parsedVal === 'string') {
    if (op !== '=') return 'unknown';

    let actualIdent: string | null = null;
    switch (baseName) {
      case 'orientation':
        actualIdent = env.width > env.height ? 'landscape' : 'portrait';
        break;
      case 'display-mode':
        actualIdent = env.displayMode;
        break;
      case 'display-state':
        actualIdent = env.displayState;
        break;
      case 'prefers-color-scheme':
        actualIdent = env.prefersColorScheme;
        break;
      case 'prefers-contrast':
        actualIdent = env.prefersContrast;
        break;
      case 'prefers-reduced-motion':
        actualIdent = env.prefersReducedMotion;
        break;
      case 'prefers-reduced-transparency':
        actualIdent = env.prefersReducedTransparency;
        break;
      case 'prefers-reduced-data':
        actualIdent = env.prefersReducedData;
        break;
      case 'forced-colors':
        actualIdent = env.forcedColors;
        break;
      case 'inverted-colors':
        actualIdent = env.invertedColors;
        break;
      case 'dynamic-range':
        actualIdent = env.dynamicRange;
        break;
      case 'video-dynamic-range':
        actualIdent = env.videoDynamicRange;
        break;
      case 'pointer':
        actualIdent = env.pointer;
        break;
      case 'hover':
        actualIdent = env.hover;
        break;
      case 'any-pointer':
        actualIdent = env.anyPointer;
        break;
      case 'any-hover':
        actualIdent = env.anyHover;
        break;
      case 'scan':
        actualIdent = env.scan;
        break;
      case 'update':
        actualIdent = env.update;
        break;
      case 'overflow-block':
        actualIdent = env.overflowBlock;
        break;
      case 'overflow-inline':
        actualIdent = env.overflowInline;
        break;
      case 'color-gamut':
        if (parsedVal === 'srgb') return true;
        if (parsedVal === 'p3') return env.colorGamut === 'p3' || env.colorGamut === 'rec2020';
        if (parsedVal === 'rec2020') return env.colorGamut === 'rec2020';
        return false;
      case 'video-color-gamut':
        if (parsedVal === 'srgb') return true;
        if (parsedVal === 'p3') return env.videoColorGamut === 'p3' || env.videoColorGamut === 'rec2020';
        if (parsedVal === 'rec2020') return env.videoColorGamut === 'rec2020';
        return false;
      case 'scripting':
        actualIdent = env.scripting;
        break;
      case 'environment-blending':
        actualIdent = env.environmentBlending;
        break;
      case 'nav-controls':
      case 'navigation-controls':
        actualIdent = env.navControls;
        break;
      case 'resizable':
        actualIdent = env.resizable !== false ? 'true' : 'false';
        break;
      default:
        return 'unknown';
    }

    if (actualIdent !== null) {
      return actualIdent.toLowerCase() === parsedVal.toLowerCase();
    }
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


