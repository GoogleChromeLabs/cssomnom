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
import type { Token, Rule, ComponentValue, SelectorList, MediaQuery, ParseError } from './types.ts';
import type { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';

export type SelectorASTOptions = {
  declaredNamespaces?: Set<string>;
  allowRelative?: boolean;
  allowVendorPseudos?: boolean;
};

export const ParseHooks = {
  parseStyleAttribute: (_tokens: Token[]): CSSStyleDeclaration => {
    throw new Error('parseStyleAttribute not injected');
  },
  consumeRule: (_tokens: Token[]): Rule | null => {
    throw new Error('consumeRule not injected');
  },
  consumeListOfRules: (_tokens: Token[], _topLevel: boolean): Rule[] => {
    throw new Error('consumeListOfRules not injected');
  },
  parseRule: (_text: string): Rule | null => {
    throw new Error('parseRule not injected');
  },
  parseRuleInBlock: (_text: string, _nested?: boolean): Rule => {
    throw new Error('parseRuleInBlock not injected');
  },
  parseRuleInScopeBlock: (_text: string): Rule => {
    throw new Error('parseRuleInScopeBlock not injected');
  },
  parseComponentValues: (_tokens: Token[], _errors?: ParseError[]): ComponentValue[] => {
    throw new Error('parseComponentValues not injected');
  },
  parseSelector: (_text: string): string | null => {
    throw new Error('parseSelector not injected');
  },
  parseSelectorAST: (
    _text: string,
    _declaredNamespacesOrOptions?: Set<string> | SelectorASTOptions,
    _allowRelative?: boolean,
    _allowVendorPseudos?: boolean
  ): SelectorList | null => {
    throw new Error('parseSelectorAST not injected');
  },
  parseMediaQueryList: (text: string): MediaQuery[] => {
    return text.split(',').map(s => s.trim()).filter(Boolean).map(m => ({
      type: 'media-query' as const,
      mediaType: m,
      tokens: [],
      raw: m,
    }));
  },

  validateCustomPropertyValue: (_values: ComponentValue[]): boolean => {
    throw new Error('validateCustomPropertyValue not injected');
  },
  validateDeclarationValue: (_values: ComponentValue[]): boolean => {
    throw new Error('validateDeclarationValue not injected');
  },
  isValidUnicodeRangeValue: (_values: ComponentValue[]): boolean => {
    throw new Error('isValidUnicodeRangeValue not injected');
  },
  assembleUnicodeRanges: (_values: ComponentValue[]): ComponentValue[] | null => {
    throw new Error('assembleUnicodeRanges not injected');
  },
  isValidDashedIdent: (name: string): boolean => {
    return typeof name === 'string' && name.startsWith('--') && name !== '--' && !/\s/.test(name);
  },
  validatePropertyValue: (_property: string, _value: string, _rawValue?: unknown): boolean => {
    return true;
  },
  supports: (_conditionText: string): boolean => {
    return false;
  },
  createStylePropertyMap: (_style: unknown): unknown => {
    throw new Error('createStylePropertyMap not injected (import cssomnom/typed-om)');
  },
  serializeMediaQuery: (query: MediaQuery): string => {
    return (query as { raw?: string }).raw ?? query.mediaType ?? '';
  },
  validatePropertyRuleDescriptor: (_def: { name: string; syntax: string; inherits: boolean; initialValue?: string }): boolean => {
    return true;
  },
  registerPropertyRule: (_def: { name: string; syntax: string; inherits: boolean; initialValue?: string }): boolean => {
    return false;
  },
  unregisterPropertyRule: (_name: string): void => {},
};
