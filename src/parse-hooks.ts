/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { Token, Rule, ComponentValue, SelectorList } from './types.ts';
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
  parseSelectorAST: (_text: string): SelectorList | null => {
    throw new Error('parseSelectorAST not injected');
  },
  validateCustomPropertyValue: (_values: ComponentValue[]): boolean => {
    throw new Error('validateCustomPropertyValue not injected');
  }
};
