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

import { CSSUnitValue } from './typed-om.ts';
import { Parser } from './parser.ts';
import { tokenize } from './tokenizer.ts';
import type { ComponentValue, SimpleBlock, CSSFunction, ASTAtRule, Declaration } from './types.ts';
import { serialize } from './serializer.ts';
import { PropertyRegistry, type PropertyDefinition } from './PropertyRegistry.ts';
import { CSSFactories } from './data/css-factories.ts';
import { resolveNestedSelector } from './cascade.ts';



export abstract class CSSParserValue {
  abstract toString(): string;
}

export class CSSParserToken extends CSSParserValue {
  public value: string;
  constructor(value: string) { 
    super(); 
    this.val = value; // Wait, let's use 'value' consistently
    this.value = value;
  }
  private val: string; // Keep for internal use if needed, but 'value' is better
  toString(): string { return this.value; }
}

export type CSSToken = CSSParserValue;

export class CSSParserBlock extends CSSParserValue {
  public name: string;
  public body: CSSParserValue[];
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
  public name: string;
  public args: CSSParserValue[][];
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
  public name: string;
  public prelude: CSSToken[];
  public body: CSSParserRule[] | null;
  constructor(
    name: string,
    prelude: CSSToken[],
    body: CSSParserRule[] | null = null
  ) {
    super();
    this.name = name;
    this.prelude = prelude;
    this.body = body;
  }
  toString(): string {
    const preludeStr = this.prelude.map(t => t.toString()).join('');
    if (this.body === null) {
      return `@${this.name}${preludeStr};`;
    }
    return `@${this.name}${preludeStr}{${this.body.map(r => r.toString()).join('')}}`;
  }
}

export class CSSParserQualifiedRule extends CSSParserRule {
  public prelude: CSSToken[];
  public body: CSSParserRule[];
  constructor(
    prelude: CSSToken[],
    body: CSSParserRule[]
  ) {
    super();
    this.prelude = prelude;
    this.body = body;
  }
  toString(): string {
    return `${this.prelude.map(t => t.toString()).join('')}{${this.body.map(r => r.toString()).join('')}}`;
  }
}

export class CSSParserDeclaration extends CSSParserRule {
  public name: string;
  public body: CSSParserValue[];
  constructor(
    name: string,
    body: CSSParserValue[]
  ) {
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
  // For tokens, we return the serialized string or a CSSStyleValue if it's a number/dimension
  return serialize([val]);
}

function toParserToken(val: ComponentValue): CSSToken {
  const res = toParserValue(val);
  if (typeof res === 'string') return new CSSParserToken(res);
  return res;
}

function toParserRule(rule: unknown): CSSParserRule {
  const r = rule as Record<string, unknown>;
  // Handle internal AST at-rule
  if (r.type === 'at-rule') {
    const at = r as unknown as ASTAtRule;
    const body = at.childRules ? (at.childRules as unknown[]).map(toParserRule) : 
                 (at.block ? (at.block.value as unknown[]).map(v => {
                    const val = v as Record<string, unknown>;
                    if (val.type === 'declaration') return toParserRule(val);
                    if (val.type === 'at-rule') return toParserRule(val);
                    return null;
                 }).filter(r => r !== null) as CSSParserRule[] : null);
    
    return new CSSParserAtRule(
      at.name,
      at.prelude.map(toParserToken),
      body
    );
  }

  // Handle CSSOM at-rules (Media, Keyframes, etc.)
  if (typeof r.type === 'number' && r.type !== 1 && r.type !== 17 && r.type !== 0) {
    const name = (r.name as string) || 
                 (r.type === 4 ? 'media' : 
                  r.type === 7 ? 'keyframes' : 
                  r.type === 3 ? 'import' : 'unknown');
    
    return new CSSParserAtRule(
      name,
      r.media ? [new CSSParserToken((r.media as {mediaText: string}).mediaText)] : 
               (r.prelude ? [new CSSParserToken(r.prelude as string)] : []),
      r.cssRules ? Array.from(r.cssRules as Iterable<unknown>).map(toParserRule) : null
    );
  }

  // Handle internal AST declaration
  if (r.type === 'declaration') {
    const decl = r as unknown as Declaration;
    return new CSSParserDeclaration(
      decl.name,
      decl.value.map(v => {
        const res = toParserValue(v);
        return typeof res === 'string' ? new CSSParserToken(res) : res;
      })
    );
  }
  
  // Handle CSSOM style-rule or qualified rule
  if (r.type === 1 || r.type === 'style-rule' || (typeof r === 'object' && r !== null && 'selectorText' in r)) {
      const qr = r as unknown as { selectorText?: string, prelude?: ComponentValue[], cssRules?: Iterable<unknown>, style?: Iterable<string> & { getPropertyValue(n: string): string } };
      return new CSSParserQualifiedRule(
          [new CSSParserToken(qr.selectorText || serialize(qr.prelude || []))],
          qr.cssRules ? Array.from(qr.cssRules).map(toParserRule) : 
          (qr.style ? Array.from(qr.style).map(name => {
              return new CSSParserDeclaration(name, [new CSSParserToken(qr.style!.getPropertyValue(name))]);
          }) : [])
      );
  }

  // Fallback for raw ComponentValue or unknown things
  return new CSSParserRawRule(serialize(Array.isArray(r) ? r as unknown as ComponentValue[] : [r as unknown as ComponentValue]));
}

class CSSParserRawRule extends CSSParserRule {
    private val: string;
    constructor(val: string) { 
        super(); 
        this.val = val;
    }
    toString(): string { return this.val; }
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

export function parseStylesheetSync(css: string, options: CSSParserOptions = {}): CSSParserRule[] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  // Using private method access for implementation
  const rules = parser.consumeListOfRules(true);
  return rules.map(toParserRule);
}

export async function parseStylesheet(css: CSSStringSource, options: CSSParserOptions = {}): Promise<CSSParserRule[]> {
  const source = await sourceToString(css);
  return parseStylesheetSync(source, options);
}

export function parseRuleListSync(css: string, options: CSSParserOptions = {}): CSSParserRule[] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const rules = parser.consumeListOfRules(false);
  return rules.map(toParserRule);
}

export async function parseRuleList(css: CSSStringSource, options: CSSParserOptions = {}): Promise<CSSParserRule[]> {
  const source = await sourceToString(css);
  return parseRuleListSync(source, options);
}

export function parseRuleSync(css: string, options: CSSParserOptions = {}): CSSParserRule | null {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const rule = parser.consumeRule();
  if (!rule) return null;

  parser.ensureEOF();

  return toParserRule(rule);
}

export function parseRule(css: string, options: CSSParserOptions = {}): CSSParserRule | null {
  return parseRuleSync(css, options);
}

export function parseDeclarationListSync(css: string, options: CSSParserOptions = {}): CSSParserRule[] {
  const tokens = tokenize(css);
  const parser = new Parser(tokens, options);
  const values = parser.parseComponentValues();
  const declarations = parser.consumeDeclarationsFromBlockContents(values);
  return declarations.map(toParserRule);
}

export function parseDeclarationList(css: string, options: CSSParserOptions = {}): CSSParserRule[] {
  return parseDeclarationListSync(css, options);
}

export function parseDeclarationSync(css: string, _options: CSSParserOptions = {}): CSSParserDeclaration | null {
    const list = parseDeclarationListSync(css, _options);
    return list.length > 0 ? list[0] as CSSParserDeclaration : null;
}

export function parseDeclaration(css: string, options: CSSParserOptions = {}): CSSParserDeclaration | null {
  return parseDeclarationSync(css, options);
}

export function parseValueSync(css: string): CSSToken {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const value = parser.consumeComponentValue();
    return toParserToken(value);
}

export function parseValueListSync(css: string): CSSToken[] {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const values = parser.parseComponentValues();
    return values.map(toParserToken);
}

export function parseCommaValueListSync(css: string): CSSToken[][] {
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

export function parseComponentValueSync(css: string, options: CSSParserOptions = {}): CSSParserValue | null {
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

export function parseComponentValue(css: string, options: CSSParserOptions = {}): CSSParserValue | null {
  return parseComponentValueSync(css, options);
}

export const CSS = {
    // Typed OM Factories
    ...CSSFactories,
    rad: (v: number) => new CSSUnitValue(v * 180 / Math.PI, 'deg'),
    turn: (v: number) => new CSSUnitValue(v * 360, 'deg'),

    // Tooling Extensions
    resolveNestedSelector,

    // Parser API
    parseStylesheet,
    parseStylesheetSync,
    parseRuleList,
    parseRule,
    parseDeclarationList,
    parseDeclaration,
    parseValue: parseValueSync,
    parseValueList: parseValueListSync,
    parseCommaValueList: parseCommaValueListSync,
    parseComponentValue,
    registerProperty: (definition: PropertyDefinition) => PropertyRegistry.register(definition),
};


