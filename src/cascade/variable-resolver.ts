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

import { tokenize } from '../tokenizer.ts';
import { Parser } from '../parser.ts';
import { serialize } from '../serializer.ts';
import type { ComponentValue, SimpleBlock, Token } from '../types.ts';
import type { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import type { MatchedDeclaration } from './types.ts';
import { compareCascadeDeclarations } from './cascade-sorter.ts';

const STANDARD_ENV_VARS: Record<string, string> = {
  'safe-area-inset-top': '0px',
  'safe-area-inset-right': '0px',
  'safe-area-inset-bottom': '0px',
  'safe-area-inset-left': '0px',
  'titlebar-area-x': '0px',
  'titlebar-area-y': '0px',
  'titlebar-area-width': '0px',
  'titlebar-area-height': '0px',
  'keyboard-inset-top': '0px',
  'keyboard-inset-right': '0px',
  'keyboard-inset-bottom': '0px',
  'keyboard-inset-left': '0px',
  'keyboard-inset-width': '0px',
  'keyboard-inset-height': '0px',
};

/**
 * Recursively resolves var() and env() references with fallback substitution and circular reference detection.
 * css-variables-1 § 4 #resolving-var-functions
 * css-variables-1 § 4.4 #cycles
 * css-env-1 § 3.1 #syntax-of-env
 */
export function substituteVariables(
  valueText: string,
  customProps: Map<string, string>,
  resolvingStack: Set<string> = new Set(),
  cyclicProps: Set<string> = new Set()
): string | null {
  if (!valueText || (!valueText.includes('var(') && !valueText.includes('env('))) {
    return valueText;
  }

  const tokens = tokenize(valueText);
  const componentValues = new Parser(tokens).parseComponentValues();
  const resolveNodes = (nodes: ComponentValue[]): ComponentValue[] | null => {
    const result: ComponentValue[] = [];
    const pushTokens = (tokens: ComponentValue[]) => {
      for (const tok of tokens) {
        if (result.length > 0) {
          const last = result[result.length - 1];
          if (last && last.type !== 'whitespace' && tok.type !== 'whitespace') {
            result.push({ type: 'whitespace', value: ' ' } as ComponentValue);
          }
        }
        result.push(tok);
      }
    };
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === 'function' && 'name' in node && Array.isArray(node.value)) {
        const funcNode = node as unknown as { name: string; value: ComponentValue[] };
        const funcNameLower = funcNode.name.toLowerCase();

        if (funcNameLower === 'env') {
          // css-env-1 § 3.1 Syntax of env()
          const args = funcNode.value;
          const commaIndex = args.findIndex(t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'comma');
          const nameTokens = commaIndex !== -1 ? args.slice(0, commaIndex) : args;
          const fallbackTokens = commaIndex !== -1 ? args.slice(commaIndex + 1) : null;

          const nonWsNameTokens = nameTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
          const envIdent = nonWsNameTokens.find(t => t.type === 'ident' && typeof (t as Token).value === 'string');
          const envName = envIdent ? ((envIdent as Token).value as string).toLowerCase() : '';

          if (envName && envName in STANDARD_ENV_VARS) {
            const envVal = STANDARD_ENV_VARS[envName];
            pushTokens(tokenize(envVal));
            continue;
          }

          if (fallbackTokens) {
            const resolvedFallback = resolveNodes(fallbackTokens);
            if (resolvedFallback === null) return null;
            pushTokens(resolvedFallback);
            continue;
          }

          return null;
        }

        if (funcNameLower === 'var') {
          const args = funcNode.value;
          const commaIndex = args.findIndex(t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'comma');
          const nameTokens = commaIndex !== -1 ? args.slice(0, commaIndex) : args;
          const fallbackTokens = commaIndex !== -1 ? args.slice(commaIndex + 1) : null;

          const nonWsNameTokens = nameTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
          let varName: string | undefined;

          if (nonWsNameTokens.length === 1 && nonWsNameTokens[0].type === 'simple-block' && (nonWsNameTokens[0] as SimpleBlock).associatedToken?.type === '{') {
            const innerTokens = (nonWsNameTokens[0] as SimpleBlock).value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
            const ident = innerTokens.find(t => t.type === 'ident' && typeof (t as Token).value === 'string' && ((t as Token).value as string).startsWith('--'));
            if (ident && typeof (ident as Token).value === 'string') varName = (ident as Token).value as string;
          } else {
            const ident = nonWsNameTokens.find(t => t.type === 'ident' && typeof (t as Token).value === 'string' && ((t as Token).value as string).startsWith('--'));
            if (ident && typeof (ident as Token).value === 'string') varName = (ident as Token).value as string;
          }

          if (!varName) {
            if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens);
              if (resolvedFallback === null) return null;
              pushTokens(resolvedFallback);
              continue;
            }
            return null;
          }

          if (resolvingStack.has(varName)) {
            const stackArr = Array.from(resolvingStack);
            const idx = stackArr.indexOf(varName);
            if (idx !== -1) {
              for (let j = idx; j < stackArr.length; j++) {
                cyclicProps.add(stackArr[j]);
              }
            }
            cyclicProps.add(varName);
            return null;
          }

          if (cyclicProps.has(varName)) {
            if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens);
              if (resolvedFallback === null) return null;
              pushTokens(resolvedFallback);
              continue;
            }
            return null;
          }

          if (customProps.has(varName)) {
            const rawCustomVal = customProps.get(varName)!;
            if (rawCustomVal === '') {
              if (fallbackTokens) {
                const resolvedFallback = resolveNodes(fallbackTokens);
                if (resolvedFallback === null) return null;
                pushTokens(resolvedFallback);
                continue;
              }
              return null;
            }

            if (rawCustomVal.includes('var(') || rawCustomVal.includes('env(')) {
              const nextStack = new Set(resolvingStack);
              nextStack.add(varName);
              const resolvedCustom = substituteVariables(rawCustomVal, customProps, nextStack, cyclicProps);
              if (resolvedCustom === null || cyclicProps.has(varName)) {
                cyclicProps.add(varName);
                if (fallbackTokens) {
                  const resolvedFallback = resolveNodes(fallbackTokens);
                  if (resolvedFallback === null) return null;
                  pushTokens(resolvedFallback);
                  continue;
                }
                return null;
              }
              const substitutedTokens = tokenize(resolvedCustom);
              pushTokens(substitutedTokens);
            } else {
              const substitutedTokens = tokenize(rawCustomVal);
              pushTokens(substitutedTokens);
            }
          } else if (fallbackTokens) {
            const resolvedFallback = resolveNodes(fallbackTokens);
            if (resolvedFallback === null) return null;
            pushTokens(resolvedFallback);
          } else {
            return null;
          }
          continue;
        }

        const resolvedChildren = resolveNodes(funcNode.value);
        if (resolvedChildren === null) return null;
        pushTokens([{ type: 'function', name: funcNode.name, value: resolvedChildren }]);
      } else if (node.type === 'simple-block') {
        const resolvedChildren = resolveNodes(node.value);
        if (resolvedChildren === null) return null;
        pushTokens([{ type: 'simple-block', associatedToken: (node as SimpleBlock).associatedToken, value: resolvedChildren }]);
      } else {
        pushTokens([node]);
      }
    }
    return result;
  };

  const resolved = resolveNodes(componentValues);
  if (resolved === null) return null;
  return serialize(resolved, true).trim();
}

/**
 * Resolves custom properties with dependency cycle detection and cascade rollback.
 * css-variables-1 § 3.1 #guaranteed-invalid
 * css-variables-1 § 4.4 #cycles
 * css-cascade-5 § 6.2 #default, § 6.3 #revert-layer, § 6.3.3 #revert-rule-keyword
 */
export function resolveCustomProperties(
  declarationsByProperty: Map<string, MatchedDeclaration[]>,
  rawCustomProps: Map<string, string>,
  parentCascaded: CSSStyleDeclaration | null
): { resolvedCustomProps: Map<string, string>; cyclicProps: Set<string> } {
  const resolvedCustomProps = new Map<string, string>();
  const cyclicProps = new Set<string>();

  function resolveCustomProp(name: string, callStack: Set<string>): string | null {
    if (cyclicProps.has(name)) return null;
    if (resolvedCustomProps.has(name)) return resolvedCustomProps.get(name)!;
    if (callStack.has(name)) {
      const stackArr = Array.from(callStack);
      const idx = stackArr.indexOf(name);
      if (idx !== -1) {
        for (let j = idx; j < stackArr.length; j++) {
          cyclicProps.add(stackArr[j]);
        }
      }
      cyclicProps.add(name);
      return null;
    }

    const nextStack = new Set(callStack);
    nextStack.add(name);

    const decls = declarationsByProperty.get(name);
    if (decls && decls.length > 0) {
      decls.sort(compareCascadeDeclarations);
      for (let i = decls.length - 1; i >= 0; i--) {
        const decl = decls[i];
        const rawVal = (decl.raw && !decl.raw.includes('var('))
          ? decl.raw
          : (typeof decl.value === 'string' ? decl.value : serialize(decl.value, true));

        let subVal: string | null = rawVal;
        if (rawVal.includes('var(')) {
          subVal = substituteVariables(rawVal, rawCustomProps, nextStack, cyclicProps);
        }

        if (subVal === null || cyclicProps.has(name)) {
          if (cyclicProps.has(name)) return null;
          continue;
        }

        const trimmed = subVal.trim();
        if (trimmed === 'revert-rule') {
          continue;
        }
        if (trimmed === 'revert-layer') {
          let prevIdx = i - 1;
          while (prevIdx >= 0 && decls[prevIdx].layerOrder >= decl.layerOrder) {
            prevIdx--;
          }
          if (prevIdx >= 0) {
            i = prevIdx + 1;
            continue;
          } else {
            const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
            resolvedCustomProps.set(name, parentVal);
            return parentVal || null;
          }
        }
        if (trimmed === 'revert') {
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }
        if (trimmed === 'initial') {
          return null;
        }
        if (trimmed === 'inherit' || trimmed === 'unset') {
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }

        const finalSubVal = subVal === '' ? ' ' : subVal;
        resolvedCustomProps.set(name, finalSubVal);
        return finalSubVal;
      }
    }

    // No local declaration: inherit from parent
    const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
    if (parentVal) {
      resolvedCustomProps.set(name, parentVal);
      return parentVal;
    }

    return null;
  }

  // Populate all custom properties that are declared or inherited
  const allCustomPropertyNames = new Set<string>();
  for (const [prop] of rawCustomProps) {
    allCustomPropertyNames.add(prop);
  }
  for (const [prop] of declarationsByProperty) {
    if (prop.startsWith('--')) {
      allCustomPropertyNames.add(prop);
    }
  }

  for (const prop of allCustomPropertyNames) {
    const res = resolveCustomProp(prop, new Set());
    if (res !== null && !cyclicProps.has(prop)) {
      resolvedCustomProps.set(prop, res);
    } else {
      resolvedCustomProps.set(prop, '');
    }
  }

  return { resolvedCustomProps, cyclicProps };
}
