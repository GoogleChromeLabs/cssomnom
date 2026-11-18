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
import { serializeIdentifier } from './serializer.ts';
import { PropertyRegistry, type PropertyDefinition, matchesSyntax } from './PropertyRegistry.ts';
import { CSSFactories } from './data/gen/css-factories.ts';
import { ParseHooks } from './parse-hooks.ts';
import { isValidDashedIdent, parseComponentValues, validateCustomPropertyValue } from './parser.ts';
import { SHORTHANDS } from './shorthands.ts';
import { SUPPORTED_PROPERTIES } from './data/gen/property-list.ts';
import { STANDARD_PROPERTIES_SYNTAX } from './data/gen/standard-syntax.ts';
import { SelectorParser } from './SelectorParser.ts';
import { evaluateSupportsCondition } from './rules/utils.ts';
import { CSS_WIDE_KEYWORDS } from './utils.ts';

// cssom-1 #the-css.escape()-method
function escape(ident: unknown): string {
  if (arguments.length === 0) {
    throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
  }
  return serializeIdentifier(String(ident));
}

function hasBadToken(values: ComponentValue[]): boolean {
  for (const v of values) {
    if (v.type === 'bad-string' || v.type === 'bad-url') return true;
    if (v.type === 'function' && hasBadToken((v as CSSFunction).value)) return true;
    if (v.type === 'simple-block' && hasBadToken((v as SimpleBlock).value)) return true;
  }
  return false;
}

function stripTrailingImportant(values: ComponentValue[]): ComponentValue[] {
  let end = values.length;
  while (end > 0 && (values[end - 1].type === 'whitespace' || values[end - 1].type === 'comment')) end--;
  if (end === 0 || values[end - 1].type !== 'ident' || String((values[end - 1] as Token).value).toLowerCase() !== 'important') {
    return values;
  }
  let excl = end - 1;
  while (excl > 0 && (values[excl - 1].type === 'whitespace' || values[excl - 1].type === 'comment')) excl--;
  if (excl > 0 && values[excl - 1].type === 'delim' && (values[excl - 1] as Token).value === '!') {
    return values.slice(0, excl - 1);
  }
  return values;
}

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

function evaluateSupportsDeclarationValues(property: string, rawValues: ComponentValue[]): boolean {
  if (property === '' || property === '--') return false;
  const componentValues = stripTrailingImportant(rawValues);

  if (property.startsWith('--')) {
    if (!isValidDashedIdent(property)) return false;
    return validateCustomPropertyValue(componentValues);
  }

  const prop = property.toLowerCase();
  if (prop === 'unicode-range') return false;
  if (!SUPPORTED_PROPERTIES.has(prop) && SHORTHANDS[prop] === undefined) return false;
  if (hasBadToken(componentValues)) return false;

  const nonWs = componentValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
  if (nonWs.length === 0) return false;
  if (hasVarFunction(componentValues)) return true;

  if (nonWs.length === 1 && nonWs[0].type === 'ident') {
    const valStr = String((nonWs[0] as Token).value).toLowerCase();
    if (CSS_WIDE_KEYWORDS.has(valStr) || valStr === 'revert-rule') return true;
  }

  const shorthand = SHORTHANDS[prop];
  if (shorthand) return shorthand.expand(componentValues) !== null;

  const syntax = STANDARD_PROPERTIES_SYNTAX[prop];
  if (syntax) return matchesSyntax(componentValues, syntax);

  return true;
}

function evaluateSupportsDeclaration(property: string, value: string): boolean {
  // 2-arg CSS.supports(property, value): do NOT trim property
  // css-conditional-3 #the-css-namespace
  if (property !== property.trim() || property === '' || property === '--') return false;
  const nameTokens = tokenize(property);
  if (nameTokens.length !== 2 || nameTokens[0].type !== 'ident' || nameTokens[1].type !== 'EOF') return false;

  return evaluateSupportsDeclarationValues(property, parseComponentValues(tokenize(value.trim())));
}

function evalSupportsInParens(item: ComponentValue): boolean {
  if (item.type === 'function' && (item as CSSFunction).name.toLowerCase() === 'selector') {
    const selValues = (item as CSSFunction).value;
    const nonWsSel = selValues.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (nonWsSel.length === 0 || selValues.some(v => v.type === 'comma')) return false;
    try {
      const list = new SelectorParser(selValues, { strictSupports: true, declaredNamespaces: new Set() }).parse();
      return list.selectors.length === 1 && list.selectors[0].type !== 'invalid-selector';
    } catch {
      return false;
    }
  }

  if (item.type === 'simple-block' && (item as SimpleBlock).associatedToken.value === '(') {
    const blockValues = (item as SimpleBlock).value;
    const colonIdx = blockValues.findIndex(v => v.type === 'colon');
    if (colonIdx > 0) {
      const propValues = blockValues.slice(0, colonIdx).filter(v => v.type !== 'whitespace' && v.type !== 'comment');
      if (propValues.length === 1 && propValues[0].type === 'ident') {
        const propName = String((propValues[0] as Token).value).trim();
        return evaluateSupportsDeclarationValues(propName, blockValues.slice(colonIdx + 1));
      }
    }
  }

  return false;
}

// css-conditional-3 #the-css-namespace
export function supports(propertyOrCondition: string, value?: string): boolean {
  if (typeof value === 'string') {
    return evaluateSupportsDeclaration(propertyOrCondition, value);
  }
  const condition = propertyOrCondition.trim();
  if (condition === '') return false;

  // Step 1: If conditionText parses as a <supports-condition>, evaluate it
  const direct = evaluateSupportsCondition(parseComponentValues(tokenize(condition)), evalSupportsInParens);
  if (direct !== null) return direct;

  // Step 2: If (${conditionText}) parses as a <supports-condition>, evaluate it
  const wrapped = evaluateSupportsCondition(parseComponentValues(tokenize(`(${condition})`)), evalSupportsInParens);
  if (wrapped !== null) return wrapped;

  // Step 3: Return false
  return false;
}

ParseHooks.supports = supports;

export const CSS: typeof CSSFactories & {
  escape: typeof escape;
  supports: typeof supports;
  registerProperty: (definition: PropertyDefinition) => void;
  [Symbol.toStringTag]?: string;
} = {
  // Typed OM Factories
  ...CSSFactories,

  // Utility APIs (cssom-1 #the-css.escape()-method)
  escape,

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
