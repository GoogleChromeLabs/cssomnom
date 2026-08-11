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
import type { Token, Rule, ComponentValue, SelectorList, MediaQuery } from './types.ts';
import type { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';

export const ParseHooks = {
  parseStyleAttribute: (_tokens: Token[]): CSSStyleDeclaration => {
    throw new Error('parseStyleAttribute not injected');
  },
  consumeRule: (_tokens: Token[]): Rule => {
    throw new Error('consumeRule not injected');
  },
  consumeListOfRules: (_tokens: Token[], _topLevel: boolean): Rule[] => {
    throw new Error('consumeListOfRules not injected');
  },
  parseComponentValues: (_tokens: Token[]): ComponentValue[] => {
    throw new Error('parseComponentValues not injected');
  },
  parseSelector: (_text: string): string | null => {
    throw new Error('parseSelector not injected');
  },
  parseSelectorAST: (_text: string, _declaredNamespaces?: Set<string>, _allowRelative?: boolean): SelectorList | null => {
    throw new Error('parseSelectorAST not injected');
  },
  parseMediaQueryList: (_text: string): MediaQuery[] => {
    throw new Error('parseMediaQueryList not injected');
  },

  validateCustomPropertyValue: (_values: ComponentValue[]): boolean => {
    throw new Error('validateCustomPropertyValue not injected');
  },
  isValidDashedIdent: (_name: string): boolean => {
    throw new Error('isValidDashedIdent not injected');
  }
};
