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
import type { ComponentValue, Token, CSSFunction, GeneralEnclosed, MediaFeature, MediaCondition, MediaQuery } from './types.ts';
import { unitToBase } from './data/units.ts';
import { parseMathFunction } from './math-parser.ts';
import { 
  KNOWN_FEATURES, 
  RANGE_FEATURES,
  FEATURE_VALUE_TYPES, 
  FEATURE_ALLOWED_IDENTS
} from './data/media-features.ts';

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

    for (const val of values) {
      if (val.type === 'comma') {
        queries.push(this.normalizeAndValidate(currentQuery));
        currentQuery = [];
      } else if (val.type === 'whitespace' && currentQuery.length === 0) {
        // Skip leading whitespace
      } else {
        currentQuery.push(val);
      }
    }

    if (currentQuery.length > 0) {
      queries.push(this.normalizeAndValidate(currentQuery));
    }

    return queries;
  }

  private static normalizeAndValidate(values: ComponentValue[]): MediaQuery {
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
        serialized = fn.name.toLowerCase() + '(' + this.canonicalSerialize(fn.value as ComponentValue[]) + ')';
      } else if (v.type === 'ident') {
        serialized = v.value.toLowerCase();
      } else if (v.type === 'at-keyword') {
        serialized = '@' + v.value.toLowerCase();
      } else if (v.type === 'dimension') {
        serialized = v.value.toString() + (v.unit ? serializeIdentifier(v.unit.toLowerCase()) : '');

      } else {
        serialized = serialize([v]).trim();
      }

      const isOperator = v.type === 'delim' && (v.value === '>' || v.value === '<' || v.value === '=' || v.value === '+' || v.value === '-');
      const lastWasOperator = lastType === 'delim' && (result.endsWith('>') || result.endsWith('<') || result.endsWith('=') || result.endsWith('+') || result.endsWith('-'));

      // Add space between idents or between ident and other things if needed
      if ((lastType === 'ident' || lastType === 'dimension' || lastType === 'function') && (v.type === 'ident' || v.type === 'number' || v.type === 'dimension' || v.type === 'delim' || v.type === 'simple-block')) {
        result += ' ';
      } else if (lastType === 'simple-block' && v.type === 'ident') {
        result += ' ';
      } else if (lastType === 'delim' && v.type === 'ident') {
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
      const valueTokens = tokens.slice(2);
      if (this.isValidMfValue(valueTokens)) {
        return {
          type: 'media-feature',
          name: featureName,
          value: valueTokens,
          tokens
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
        return {
          type: 'media-feature',
          name: featureName,
          value: valueTokens,
          operator: ops[0].op,
          tokens
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
        return {
          type: 'media-feature',
          name: featureName,
          range: {
            leftValue: left,
            leftOp: op1,
            rightOp: op2,
            rightValue: right
          },
          tokens
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

export function serializeMediaQuery(query: MediaQuery): string {
  if (query.invalid) return 'not all';
  if (hasUnknownFeature(query)) return 'not all';

  let result = '';
  if (query.modifier) {
    result += query.modifier + ' ';
  }
  if (query.mediaType) {
    result += query.mediaType;
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
