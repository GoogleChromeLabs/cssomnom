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
/**
 * @fileoverview Implementation of the CSS Parser API based on the WICG draft.
 * @see https://raw.githubusercontent.com/WICG/css-parser-api/refs/heads/main/index.bs
 * 
 * Deviations from the spec:
 * 1. String Boxing: The spec defines CSSToken as `typedef (DOMString or CSSStyleValue or CSSParserValue) CSSToken;`.
 *    We box strings in `CSSParserToken` instead of allowing raw strings directly.
 * 2. Synchronous Execution: `parseRule` and `parseDeclarationList` are implemented synchronously instead of returning Promises.
 * 3. Immutability: Properties like `prelude`, `body`, and `args` are mutable arrays instead of `FrozenArray`.
 * 4. Constructor Arguments: The `body` parameter is mandatory in some constructors (e.g., `CSSParserQualifiedRule`) where the spec makes it optional.
 */

import { Parser } from './parser.ts';
import { tokenize } from './tokenizer.ts';
import type { ComponentValue, SimpleBlock, CSSFunction, Declaration } from './types.ts';
import { serialize } from './serializer.ts';
import { CSSAtRule, CSSGroupingRule, CSSImportRule, CSSKeyframesRule, CSSMediaRule, CSSRule, CSSStyleRule } from './CSSOM.ts';

export abstract class CSSParserValue {
  abstract toString(): string;
}

export class CSSParserToken extends CSSParserValue {
  value: string;
  constructor(value: string) { super(); this.value = value; }
  toString(): string { return this.value; }
}

export type CSSToken = CSSParserValue;

export class CSSParserBlock extends CSSParserValue {
  name: string;
  body: CSSParserValue[];
  constructor(name: string, body: CSSParserValue[]) {
    super();
    this.name = name;
    this.body = body;
  }
  toString(): string {
    const start = this.name === '[]' ? '[' : this.name === '{}' ? '{' : '(';
    const end = this.name === '[]' ? ']' : this.name === '{}' ? '}' : ')';
    return `${start}${this.body.map(v => v.toString()).join('')}${end}`;
  }
}

export class CSSParserFunction extends CSSParserValue {
  name: string;
  args: CSSParserValue[][];
  constructor(name: string, args: CSSParserValue[][]) {
    super();
    this.name = name;
    this.args = args;
  }
  toString(): string {
    return `${this.name}(${this.args.map(arg => arg.map(v => v.toString()).join('')).join(', ')})`;
  }
}

export abstract class CSSParserRule {
  abstract toString(): string;
}

export class CSSParserAtRule extends CSSParserRule {
  name: string;
  prelude: CSSToken[];
  body: CSSParserRule[] | null;
  constructor(name: string, prelude: CSSToken[], body: CSSParserRule[] | null = null) {
    super();
    this.name = name;
    this.prelude = prelude;
    this.body = body;
  }
  toString(): string {
    const preludeStr = this.prelude.map(t => t.toString()).join('');
    return this.body === null ? `@${this.name}${preludeStr};` : `@${this.name}${preludeStr}{${this.body.map(r => r.toString()).join('')}}`;
  }
}

export class CSSParserQualifiedRule extends CSSParserRule {
  prelude: CSSToken[];
  body: CSSParserRule[];
  constructor(prelude: CSSToken[], body: CSSParserRule[]) {
    super();
    this.prelude = prelude;
    this.body = body;
  }
  toString(): string {
    return `${this.prelude.map(t => t.toString()).join('')}{${this.body.map(r => r.toString()).join('')}}`;
  }
}

export class CSSParserDeclaration extends CSSParserRule {
  name: string;
  body: CSSParserValue[];
  constructor(name: string, body: CSSParserValue[]) {
    super();
    this.name = name;
    this.body = body;
  }
  toString(): string {
    return `${this.name}: ${this.body.map(v => v.toString()).join('')};`;
  }
}

/**
 * Bridge functions to convert internal AST to Parser API objects
 */

function toParserValue(val: ComponentValue): CSSParserValue | string {
  if (val.type === 'simple-block') {
    const block = val as SimpleBlock;
    const bracket = block.associatedToken.value;
    const name = bracket === '[' ? '[]' : bracket === '{' ? '{}' : '()';
    return new CSSParserBlock(name, block.value.map(v => {
      const res = toParserValue(v);
      return typeof res === 'string' ? new CSSParserToken(res) : res;
    }));
  }
  if (val.type === 'function') {
    const fn = val as CSSFunction;
    // CSS Parser API expects args to be sequence<sequence<CSSParserValue>>
    // We need to split our flat value list by commas
    const args: CSSParserValue[][] = [[]];
    for (const v of fn.value) {
      if ('type' in v && v.type === 'comma') {
        args.push([]);
      } else {
        const res = toParserValue(v);
        args[args.length - 1].push(typeof res === 'string' ? new CSSParserToken(res) : res);
      }
    }
    return new CSSParserFunction(fn.name, args);
  }
  // For tokens, we return the serialized string
  return serialize([val]);
}

function toParserToken(val: ComponentValue): CSSToken {
  const res = toParserValue(val);
  if (typeof res === 'string') return new CSSParserToken(res);
  return res;
}

function isASTDeclaration(r: unknown): r is Declaration {
  return typeof r === 'object' && r !== null && (r as { type?: unknown }).type === 'declaration';
}

function toParserRule(rule: CSSRule | Declaration): CSSParserRule {
  if (!(rule instanceof CSSRule)) {
    return new CSSParserDeclaration(
      rule.name,
      rule.value.map(v => {
        const res = toParserValue(v);
        return typeof res === 'string' ? new CSSParserToken(res) : res;
      })
    );
  }

  if (rule instanceof CSSAtRule) {
    const body = rule.declarations
      ? rule.declarations.map(toParserRule)
      : (rule.childRules
        ? rule.childRules.map(toParserRule)
        : (rule.block
          ? (rule.block.value as unknown[]).filter(isASTDeclaration).map(toParserRule)
          : null));
    return new CSSParserAtRule(rule.name, rule.prelude.map(toParserToken), body);
  }

  if (rule instanceof CSSStyleRule) {
    const decls = Array.from(rule.style).map(name => new CSSParserDeclaration(name, [new CSSParserToken(rule.style.getPropertyValue(name))]));
    return new CSSParserQualifiedRule([new CSSParserToken(rule.selectorText)], [...decls, ...Array.from(rule.cssRules).map(toParserRule)]);
  }

  // Other CSSOM at-rules (@media, @keyframes, @import, ...)
  const name = rule instanceof CSSMediaRule ? 'media' : rule instanceof CSSKeyframesRule ? 'keyframes' : rule instanceof CSSImportRule ? 'import' : 'unknown';
  return new CSSParserAtRule(
    name,
    rule instanceof CSSMediaRule ? [new CSSParserToken(rule.media.mediaText)] : [],
    rule instanceof CSSGroupingRule ? Array.from(rule.cssRules).map(toParserRule) : null
  );
}

export type CSSStringSource = string | ReadableStream<Uint8Array>;

async function sourceToString(source: CSSStringSource): Promise<string> {
  if (typeof source === 'string') return source;
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

export interface CSSParserOptions {
  atRules?: Record<string, string>;
}

/**
 * Parser API Implementation
 */

export async function parseStylesheet(css: CSSStringSource, options: CSSParserOptions = {}): Promise<CSSParserRule[]> {
  const source = await sourceToString(css);
  const tokens = tokenize(source);
  const parser = new Parser(tokens, options);
  const rules = parser.consumeListOfRules(true);
  return rules.map(toParserRule);
}

export async function parseRuleList(css: CSSStringSource, options: CSSParserOptions = {}): Promise<CSSParserRule[]> {
  const source = await sourceToString(css);
  const tokens = tokenize(source);
  const parser = new Parser(tokens, options);
  const rules = parser.consumeListOfRules(false);
  return rules.map(toParserRule);
}

export function parseRule(css: string, options: CSSParserOptions = {}): CSSParserRule | null {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const rule = parser.consumeRule();
  if (!rule) return null;

  parser.ensureEOF();

  return toParserRule(rule);
}

export function parseDeclarationList(css: string, options: CSSParserOptions = {}): CSSParserRule[] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const values = parser.parseComponentValues();
  const declarations = parser.consumeDeclarationsFromBlockContents(values);
  return declarations.map(toParserRule);
}

export function parseDeclaration(css: string, options: CSSParserOptions = {}): CSSParserDeclaration | null {
  const list = parseDeclarationList(css, options);
  return list.length > 0 ? (list[0] as CSSParserDeclaration) : null;
}

export function parseComponentValue(css: string, options: CSSParserOptions = {}): CSSParserValue | null {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const values = parser.parseComponentValues();

  const nonWsValues = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');

  if (nonWsValues.length === 0) {
    return null;
  }
  if (nonWsValues.length > 1) {
    throw new DOMException('Syntax error', 'SyntaxError');
  }

  return toParserToken(nonWsValues[0]);
}

export function parseValue(css: string): CSSToken {
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const value = parser.consumeComponentValue();
  return toParserToken(value);
}

export function parseValueList(css: string): CSSToken[] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const values = parser.parseComponentValues();
  return values.map(toParserToken);
}

export function parseCommaValueList(css: string): CSSToken[][] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const list = parser.parseCommaSeparatedListOfComponentValues();
  return list.map(subList => {
    let start = 0;
    while (start < subList.length && subList[start].type === 'whitespace') start++;
    let end = subList.length - 1;
    while (end >= start && subList[end].type === 'whitespace') end--;
    return subList.slice(start, end + 1).map(toParserToken);
  });
}
