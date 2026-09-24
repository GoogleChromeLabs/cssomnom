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
import type { ComponentValue, SimpleBlock, Token, CSSFunction } from '../types.ts';
import type { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import type { MatchedDeclaration } from './types.ts';
import { compareCascadeDeclarations } from './cascade-sorter.ts';
import { PropertyRegistry } from '../PropertyRegistry.ts';
import { parseMathFunction, simplify } from '../math-parser.ts';

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
  cyclicProps: Set<string> = new Set(),
  element?: unknown,
  taintedProps: Set<string> = new Set(),
  isTaintedOut?: { tainted: boolean },
  activeProperties?: Map<string, PropertyDefinition>
): string | null {
  if (
    !valueText ||
    (!valueText.includes('var(') &&
      !valueText.includes('env(') &&
      !valueText.includes('attr(') &&
      !valueText.includes('ident(') &&
      !valueText.includes('if(') &&
      !valueText.includes('random-item('))
  ) {
    return valueText;
  }

  let hasAttrTaint = false;
  const tokens = tokenize(valueText);
  const componentValues = new Parser(tokens).parseComponentValues();
  const resolveNodes = (nodes: ComponentValue[], inVarContext = false): ComponentValue[] | null => {
    const result: ComponentValue[] = [];
    const pushTokens = (tokens: ComponentValue[]) => {
      result.push(...tokens);
    };
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === 'function' && 'name' in node && Array.isArray(node.value)) {
        const funcNode = node as CSSFunction;
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
            const resolvedFallback = resolveNodes(fallbackTokens, inVarContext);
            if (resolvedFallback === null) return null;
            pushTokens(resolvedFallback);
            continue;
          }

          return null;
        }

        if (funcNameLower === 'attr') {
          // css-values-5 § 3.1 #attr-notation, § 3.3 #attr-security
          hasAttrTaint = true;
          const nonWs = funcNode.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
          const attrNameToken = nonWs[0];
          const attrName = attrNameToken && typeof (attrNameToken as Token).value === 'string'
            ? ((attrNameToken as Token).value as string)
            : '';
          let attrVal: string | null = null;
          if (element && typeof element === 'object' && typeof (element as { getAttribute?: (n: string) => string | null }).getAttribute === 'function') {
            attrVal = (element as { getAttribute: (n: string) => string | null }).getAttribute(attrName);
          }
          if (attrVal !== null) {
            pushTokens(tokenize(attrVal));
            continue;
          }
          const commaIdx = funcNode.value.findIndex(t => t.type === 'comma');
          if (commaIdx !== -1) {
            const fbTokens = funcNode.value.slice(commaIdx + 1);
            const resFb = resolveNodes(fbTokens, inVarContext);
            if (resFb) {
              pushTokens(resFb);
              continue;
            }
          }
          return null;
        }

        if (funcNameLower === 'ident') {
          // css-values-5 § 14.1 #ident: ident() remains unresolved on custom properties, only resolved inside var()
          if (!inVarContext) {
            pushTokens([node]);
            continue;
          }
          let str = '';
          for (const arg of funcNode.value) {
            if (arg.type === 'whitespace' || arg.type === 'comment') continue;
            if (arg.type === 'string' || arg.type === 'ident') {
              str += String((arg as Token).value ?? '');
            } else if (arg.type === 'function' && ['calc', 'sign', 'abs', 'mod', 'rem'].includes((arg as CSSFunction).name.toLowerCase())) {
              try {
                // css-values-5 § 14.1 #ident: resolve font-relative units (1em = 16px) inside math functions in computed context
                const resolveUnits = (toks: ComponentValue[]): ComponentValue[] => {
                  return toks.map(t => {
                    if (typeof t === 'object' && t !== null && 'type' in t) {
                      if (t.type === 'dimension' && ('unit' in t) && (t.unit === 'em' || t.unit === 'rem')) {
                        return { ...t, value: (t as { value: number }).value * 16, unit: 'px' };
                      }
                      if (t.type === 'function' && Array.isArray((t as CSSFunction).value)) {
                        return { ...t, value: resolveUnits((t as CSSFunction).value) } as ComponentValue;
                      }
                      if (t.type === 'simple-block' && Array.isArray((t as SimpleBlock).value)) {
                        return { ...t, value: resolveUnits((t as SimpleBlock).value) } as ComponentValue;
                      }
                    }
                    return t;
                  });
                };
                const resolvedArgTokens = resolveUnits((arg as CSSFunction).value);
                const mathNode = parseMathFunction((arg as CSSFunction).name.toLowerCase(), resolvedArgTokens);
                if (mathNode) {
                  const simplified = simplify(mathNode);
                  str += simplified.toString();
                }
              } catch {
                // ignore
              }
            } else if (arg.type === 'number') {
              str += String((arg as Token).value);
            }
          }
          pushTokens(tokenize(str));
          continue;
        }

        if (funcNameLower === 'if') {
          // css-values-5 § 2.2 #if-notation
          const text = serialize(funcNode.value);
          const branches = text.split(';');
          let matchedValue: string | null = null;
          for (const b of branches) {
            const trimmed = b.trim();
            if (!trimmed) continue;
            let colonIdx = -1;
            let parenDepth = 0;
            for (let c = 0; c < trimmed.length; c++) {
              if (trimmed[c] === '(') parenDepth++;
              else if (trimmed[c] === ')') parenDepth--;
              else if (trimmed[c] === ':' && parenDepth === 0) {
                colonIdx = c;
                break;
              }
            }
            if (colonIdx === -1) continue;
            const cond = trimmed.slice(0, colonIdx).trim();
            const val = trimmed.slice(colonIdx + 1).trim();
            if (cond.toLowerCase() === 'else') {
              if (matchedValue === null) matchedValue = val;
              break;
            }
            const styleMatch = cond.match(/^style\(\s*([^:]+)\s*:\s*([^)]+)\s*\)$/i);
            if (styleMatch) {
              const prop = styleMatch[1].trim();
              const exp = styleMatch[2].trim();
              const actual = customProps.get(prop) ?? (element && typeof (element as { style?: CSSStyleDeclaration }).style?.getPropertyValue === 'function' ? (element as { style: CSSStyleDeclaration }).style.getPropertyValue(prop) : null);
              if (actual && actual.trim() === exp) {
                matchedValue = val;
                break;
              }
            }
          }
          if (matchedValue !== null) {
            pushTokens(tokenize(matchedValue));
            continue;
          }
          return null;
        }

        if (funcNameLower === 'random-item') {
          // css-values-5 § 17.2 #random-item
          const args = serialize(funcNode.value).split(',');
          if (args.length >= 2) {
            const item = args[args.length - 1].trim();
            pushTokens(tokenize(item));
            continue;
          }
          return null;
        }

        if (funcNameLower === 'var') {
          const args = funcNode.value;
          const commaIndex = args.findIndex(t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'comma');
          let nameTokens = commaIndex !== -1 ? args.slice(0, commaIndex) : args;
          const fallbackTokens = commaIndex !== -1 ? args.slice(commaIndex + 1) : null;

          // Strip outer { ... } block per css-values-5 § 3.2 #component-function-commas
          const nonWsNameTokens = nameTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
          if (nonWsNameTokens.length === 1 && nonWsNameTokens[0].type === 'simple-block' && (nonWsNameTokens[0] as SimpleBlock).associatedToken?.type === '{') {
            nameTokens = (nonWsNameTokens[0] as SimpleBlock).value;
          }

          // Evaluate nested substitution functions in name argument: css-variables-2 § 3 #replace-a-var-function
          let varName: string | undefined;
          let nameWasTainted = false;
          const prevTaint = hasAttrTaint;
          hasAttrTaint = false;

          const resolvedNameTokens = resolveNodes(nameTokens, true);
          if (hasAttrTaint) {
            nameWasTainted = true;
          }
          hasAttrTaint = prevTaint || nameWasTainted;

          if (resolvedNameTokens !== null) {
            let serializedName = serialize(resolvedNameTokens).trim();
            if (serializedName.startsWith('{') && serializedName.endsWith('}')) {
              serializedName = serializedName.slice(1, -1).trim();
            }
            const nameToks = tokenize(serializedName).filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
            if (nameToks.length === 1 && nameToks[0].type === 'ident') {
              const val = String(nameToks[0].value);
              if (val.startsWith('--') && val.length > 2) {
                varName = val;
              }
            }
          }

          if (!varName) {
            if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens, true);
              if (resolvedFallback === null) return null;
              if (nameWasTainted) hasAttrTaint = true;
              pushTokens(resolvedFallback);
              continue;
            }
            return null;
          }

          if (nameWasTainted || taintedProps.has(varName)) {
            hasAttrTaint = true;
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
              if (nameWasTainted) hasAttrTaint = true;
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
                if (nameWasTainted) hasAttrTaint = true;
                pushTokens(resolvedFallback);
                continue;
              }
              return null;
            }

            if (
              rawCustomVal.includes('var(') ||
              rawCustomVal.includes('env(') ||
              rawCustomVal.includes('attr(') ||
              rawCustomVal.includes('ident(') ||
              rawCustomVal.includes('if(') ||
              rawCustomVal.includes('random-item(')
            ) {
              const nextStack = new Set(resolvingStack);
              nextStack.add(varName);
              const subTaint = { tainted: false };
              const resolvedCustom = substituteVariables(rawCustomVal, customProps, nextStack, cyclicProps, element, taintedProps, subTaint);
              if (subTaint.tainted) hasAttrTaint = true;
              if (resolvedCustom === null || cyclicProps.has(varName)) {
                cyclicProps.add(varName);
                if (fallbackTokens) {
                  const resolvedFallback = resolveNodes(fallbackTokens);
                  if (resolvedFallback === null) return null;
                  if (nameWasTainted) hasAttrTaint = true;
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
          } else {
            // css-properties-values-api-1 § 5
            const jsDef = PropertyRegistry.get(varName);
            const def = (jsDef && jsDef.origin === 'js') ? jsDef : (activeProperties?.get(varName) ?? jsDef);
            if (def?.initialValue !== undefined) {
              const substitutedTokens = tokenize(def.initialValue);
              pushTokens(substitutedTokens);
            } else if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens);
              if (resolvedFallback === null) return null;
              if (nameWasTainted) hasAttrTaint = true;
              pushTokens(resolvedFallback);
            } else {
              return null;
            }
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
  if (isTaintedOut) {
    isTaintedOut.tainted = hasAttrTaint;
  }
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
  parentCascaded: CSSStyleDeclaration | null,
  element?: unknown,
  activeProperties?: Map<string, PropertyDefinition>
): { resolvedCustomProps: Map<string, string>; cyclicProps: Set<string>; taintedProps: Set<string> } {
  const resolvedCustomProps = new Map<string, string>();
  const cyclicProps = new Set<string>();
  const taintedProps = new Set<string>();

  const getPropertyDefinition = (propName: string): PropertyDefinition | undefined => {
    // css-properties-values-api-1 § 5: JS registrations cannot be overridden by CSS @property rules
    const jsDef = PropertyRegistry.get(propName);
    if (jsDef && jsDef.origin === 'js') {
      return jsDef;
    }
    return activeProperties?.get(propName) ?? jsDef;
  };

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
      const revertingRuleIds = new Set<number>();
      let hasImportantRevertRule = false;

      for (let i = decls.length - 1; i >= 0; i--) {
        const decl = decls[i];
        if (decl.ruleId !== undefined && revertingRuleIds.has(decl.ruleId)) {
          continue;
        }
        const rawVal = (decl.raw && !decl.raw.includes('var('))
          ? decl.raw
          : (typeof decl.value === 'string' ? decl.value : serialize(decl.value, true));

        let subVal: string | null = rawVal;
        const taintOut = { tainted: false };
        if (rawVal.includes('var(') || rawVal.includes('attr(')) {
          subVal = substituteVariables(rawVal, rawCustomProps, nextStack, cyclicProps, element, taintedProps, taintOut, activeProperties);
        }
        if (taintOut.tainted) {
          taintedProps.add(name);
        }

        if (subVal === null || cyclicProps.has(name)) {
          // css-variables-1 § 3.1 #guaranteed-invalid
          // css-variables-1 § 4.4 #cycles
          // When variable substitution fails, property is invalid at computed-value time.
          // Store guaranteed-invalid value ('') and do NOT continue down earlier rules in cascade.
          resolvedCustomProps.set(name, '');
          return null;
        }

        // css-values-5 § 3.3 #attr-security: registered <url> cannot use tainted data
        const reg = getPropertyDefinition(name);
        if (reg?.syntax === '<url>' && taintOut.tainted) {
          const initVal = reg.initialValue ?? '';
          resolvedCustomProps.set(name, initVal);
          return initVal;
        }

        const trimmed = subVal.trim();
        if (trimmed === 'revert-rule') {
          // css-cascade-5 § 6.3.3 #revert-rule-keyword
          if (decl.important) {
            hasImportantRevertRule = true;
          }
          if (decl.ruleId !== undefined) {
            revertingRuleIds.add(decl.ruleId);
          }
          continue;
        }
        if (trimmed === 'revert-layer') {
          if (hasImportantRevertRule) {
            // css-cascade-5 § 6.3.3 #revert-rule-keyword
            // W3C csswg-drafts #13916: Cycle between revert-rule !important and revert-layer resolves to unset
            const def = getPropertyDefinition(name);
            if (def && !def.inherits) {
              const initVal = def.initialValue ?? null;
              resolvedCustomProps.set(name, initVal ?? '');
              return initVal;
            }
            const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
            resolvedCustomProps.set(name, parentVal);
            return parentVal || null;
          }
          let prevIdx = i - 1;
          while (prevIdx >= 0 && decls[prevIdx].layerOrder >= decl.layerOrder) {
            prevIdx--;
          }
          if (prevIdx >= 0) {
            i = prevIdx + 1;
            continue;
          } else {
            const def = getPropertyDefinition(name);
            if (def && !def.inherits) {
              const initVal = def.initialValue ?? null;
              resolvedCustomProps.set(name, initVal ?? '');
              return initVal;
            }
            const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
            resolvedCustomProps.set(name, parentVal);
            return parentVal || null;
          }
        }
        // css-properties-values-api-1 § 5 #determining-computed-value-of-registered-custom-property
        const def = getPropertyDefinition(name);
        if (trimmed === 'revert') {
          if (def && !def.inherits) {
            const initVal = def.initialValue ?? null;
            resolvedCustomProps.set(name, initVal ?? '');
            return initVal;
          }
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }
        if (trimmed === 'initial') {
          const initVal = def?.initialValue ?? null;
          resolvedCustomProps.set(name, initVal ?? '');
          return initVal;
        }
        if (trimmed === 'unset') {
          if (def && !def.inherits) {
            const initVal = def.initialValue ?? null;
            resolvedCustomProps.set(name, initVal ?? '');
            return initVal;
          }
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }
        if (trimmed === 'inherit') {
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }

        const finalSubVal = subVal === '' ? ' ' : subVal;
        resolvedCustomProps.set(name, finalSubVal);
        return finalSubVal;
      }
    }

    // No local declaration: inherit from parent or use registered initialValue
    const def = getPropertyDefinition(name);
    if (def && !def.inherits) {
      const initVal = def.initialValue ?? null;
      if (initVal !== null) {
        resolvedCustomProps.set(name, initVal);
        return initVal;
      }
    } else {
      const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
      if (parentVal) {
        resolvedCustomProps.set(name, parentVal);
        return parentVal;
      }
      if (def?.initialValue) {
        resolvedCustomProps.set(name, def.initialValue);
        return def.initialValue;
      }
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

  return { resolvedCustomProps, cyclicProps, taintedProps };
}
