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
import type { ComponentValue, SimpleBlock, CSSFunction, Token } from './types.ts';
import { serialize } from './serializer.ts';
import { PropertyRegistry, type PropertyDefinition, matchesSyntax } from './PropertyRegistry.ts';
import { CSSFactories } from './data/gen/css-factories.ts';
import { ParseHooks } from './parse-hooks.ts';
import { isValidDashedIdent, parseComponentValues, validateCustomPropertyValue } from './parser.ts';
import { SHORTHANDS } from './shorthands.ts';
import { SUPPORTED_PROPERTIES } from './data/gen/property-list.ts';
import { STANDARD_PROPERTIES_SYNTAX } from './data/gen/standard-syntax.ts';
import { SelectorParser } from './SelectorParser.ts';
import { isGrammaticallyValidSupportsCondition } from './rules/utils.ts';
import { escape as cssEscape } from './css-escape.ts';

function hasVarFunction(values: ComponentValue[]): boolean {
  for (const v of values) {
    if (v.type === 'function') {
      if ((v as CSSFunction).name.toLowerCase() === 'var') {
        return true;
      }
      if (hasVarFunction((v as CSSFunction).value)) {
        return true;
      }
    }
    if (v.type === 'simple-block' && hasVarFunction((v as SimpleBlock).value)) {
      return true;
    }
  }
  return false;
}

function evaluateSupportsDeclaration(property: string, value: string, isTwoArg = false): boolean {
  if (isTwoArg) {
    // 2-arg CSS.supports(property, value): do NOT trim property
    // css-conditional-3 #the-css-namespace
    if (property !== property.trim() || property === '' || property === '--') return false;
    const nameTokens = tokenize(property);
    if (nameTokens.length !== 2 || nameTokens[0].type !== 'ident' || nameTokens[1].type !== 'EOF') return false;
  } else {
    property = property.trim();
    if (property === '' || property === '--') return false;
  }

  value = value.trim();
  // Strip trailing !important per css-conditional-3 #at-supports & #the-css-namespace
  const importantMatch = value.match(/^(.*?)!\s*important\s*$/i);
  if (importantMatch) {
    value = importantMatch[1].trim();
  }

  if (property.startsWith('--')) {
    if (!isValidDashedIdent(property)) return false;
    const tokens = tokenize(value);
    const componentValues = parseComponentValues(tokens);
    return validateCustomPropertyValue(componentValues);
  }

  const prop = property.toLowerCase();
  if (prop === 'unicode-range') return false;

  const isSupported = SUPPORTED_PROPERTIES.has(prop) || SHORTHANDS[prop] !== undefined;
  if (!isSupported) return false;

  const tokens = tokenize(value);
  if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) return false;

  const componentValues = parseComponentValues(tokens);
  const nonWs = componentValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (nonWs.length === 0) return false;

  if (hasVarFunction(componentValues)) {
    return true;
  }

  if (nonWs.length === 1 && nonWs[0].type === 'ident') {
    const valStr = String((nonWs[0] as Token).value).toLowerCase();
    if (['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'revert-rule'].includes(valStr)) {
      return true;
    }
  }

  const shorthand = SHORTHANDS[prop];
  if (shorthand) {
    return shorthand.expand(componentValues) !== null;
  }

  const syntax = STANDARD_PROPERTIES_SYNTAX[prop];
  if (syntax) {
    return matchesSyntax(componentValues, syntax);
  }

  return true;
}

function evalSupportsInParens(item: ComponentValue): boolean {
  if (item.type === 'function' && (item as CSSFunction).name.toLowerCase() === 'selector') {
    const selValues = (item as CSSFunction).value;
    const nonWsSel = selValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (nonWsSel.length === 0) return false;
    if (selValues.some(v => v.type === 'comma')) return false;
    try {
      const selParser = new SelectorParser(selValues, { strictSupports: true, declaredNamespaces: new Set() });
      const list = selParser.parse();
      if (list.selectors.length !== 1 || list.selectors[0].type === 'invalid-selector') return false;
      return true;
    } catch {
      return false;
    }
  }

  if (item.type === 'simple-block' && (item as SimpleBlock).associatedToken.value === '(') {
    const blockValues = (item as SimpleBlock).value;
    const nonWsBlock = blockValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (nonWsBlock.length === 0) return false;

    const hasTopLevelOp = nonWsBlock.some(v => v.type === 'ident' && ['and', 'or', 'not'].includes(String((v as Token).value).toLowerCase()));
    const isNestedParenBlock = nonWsBlock.length === 1 &&
      nonWsBlock[0].type === 'simple-block' &&
      (nonWsBlock[0] as SimpleBlock).associatedToken.value === '(';
    if (hasTopLevelOp || isNestedParenBlock) {
      return evalSupportsConditionValues(nonWsBlock);
    }

    const colonIdx = blockValues.findIndex(v => v.type === 'colon');
    if (colonIdx > 0) {
      const propValues = blockValues.slice(0, colonIdx).filter(v => v.type !== 'whitespace' && v.type !== 'comment');
      if (propValues.length === 1 && propValues[0].type === 'ident') {
        const propName = String((propValues[0] as Token).value);
        const valTokens = blockValues.slice(colonIdx + 1);
        const valStr = serialize(valTokens);
        return evaluateSupportsDeclaration(propName, valStr, false);
      }
    }
    return false;
  }

  return false;
}

function evalSupportsConditionValues(values: ComponentValue[]): boolean {
  const items = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (items.length === 0) return false;

  const evalResults: boolean[] = [];
  const operators: string[] = [];

  let i = 0;
  while (i < items.length) {
    if (items[i].type === 'ident' && String((items[i] as Token).value).toLowerCase() === 'not') {
      if (i + 1 >= items.length) return false;
      const next = items[i + 1];
      if (next.type !== 'function' && !(next.type === 'simple-block' && (next as SimpleBlock).associatedToken.value === '(')) {
        return false;
      }
      evalResults.push(!evalSupportsInParens(next));
      i += 2;
    } else {
      const item = items[i];
      if (item.type !== 'function' && !(item.type === 'simple-block' && (item as SimpleBlock).associatedToken.value === '(')) {
        return false;
      }
      evalResults.push(evalSupportsInParens(item));
      i += 1;
    }

    if (i < items.length) {
      if (items[i].type !== 'ident') return false;
      const op = String((items[i] as Token).value).toLowerCase();
      if (op !== 'and' && op !== 'or') return false;
      if (operators.length > 0 && operators[0] !== op) return false;
      operators.push(op);
      i += 1;
      if (i >= items.length) return false;
    }
  }

  if (evalResults.length === 0) return false;
  if (evalResults.length === 1) {
    return evalResults[0];
  }

  const op = operators[0];
  if (op === 'and') {
    return evalResults.every(Boolean);
  } else {
    return evalResults.some(Boolean);
  }
}

// css-conditional-3 #the-css-namespace
export function supports(propertyOrCondition: string, value?: string): boolean {
  if (typeof value === 'string') {
    return evaluateSupportsDeclaration(propertyOrCondition, value, true);
  }
  const condition = propertyOrCondition.trim();
  if (condition === '') return false;

  // Step 1: If conditionText parses as a <supports-condition>, evaluate it
  const tokens = tokenize(condition);
  const componentValues = parseComponentValues(tokens);
  if (isGrammaticallyValidSupportsCondition(componentValues)) {
    return evalSupportsConditionValues(componentValues);
  }

  // Step 2: If (${conditionText}) parses as a <supports-condition>, evaluate it
  const wrappedTokens = tokenize(`(${condition})`);
  const wrappedValues = parseComponentValues(wrappedTokens);
  if (isGrammaticallyValidSupportsCondition(wrappedValues)) {
    return evalSupportsConditionValues(wrappedValues);
  }

  // Step 3: Return false
  return false;
}

ParseHooks.supports = supports;

export const CSS: typeof CSSFactories & {
  escape: typeof cssEscape;
  supports: typeof supports;
  registerProperty: (definition: PropertyDefinition) => void;
  [Symbol.toStringTag]?: string;
} = {
  // Typed OM Factories
  ...CSSFactories,

  // Utility APIs (cssom-1 #the-css.escape()-method)
  escape: cssEscape,

  // Feature Detection (css-conditional-3 #the-css-namespace)
  supports,

  // Houdini Properties & Values API (css-properties-values-api #register-a-custom-property)
  registerProperty: (definition: PropertyDefinition) => PropertyRegistry.register(definition),
};

// WebIDL namespace @@toStringTag definition (webidl #namespacedef-css)
Object.defineProperty(CSS, Symbol.toStringTag, {
  value: 'CSS',
  writable: false,
  enumerable: false,
  configurable: true,
});
