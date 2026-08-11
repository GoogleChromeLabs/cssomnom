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

import { calculateSpecificity, compareSpecificity } from './specificity.ts';
import {
  CSSRule,
  CSSNestedDeclarations,
  CSSGroupingRule,
  CSSScopeRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSStyleSheet,
} from './CSSOM.ts';
import { tokenize } from './tokenizer.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from './data/gen/LogicalMapping.ts';
import { Parser, parseStyleSheet } from './parser.ts';
import { SelectorParser } from './SelectorParser.ts';
import { serialize, serializeSelectorList } from './serializer.ts';
import { matches, isElement } from './matcher.ts';
import type { DOMElement } from './matcher.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { ParseHooks } from './parse-hooks.ts';
import type {
  Rule,
  CSSStyleRule,
  CSSRuleList,
  SelectorList,
  PseudoClassSelector,
  ComponentValue,
  Declaration,
  ASTAtRule,
} from './types.ts';

interface MatchedDeclaration {
  name: string;
  value: string;
  important: boolean;
  isInline: boolean;
  layerOrder: number;
  specificity: [number, number, number];
  sourceOrder: number;
}

/**
 * Resolves the cascaded style statically for a DOM element according to CSS Cascade 5 and CSS Variables 1.
 * css-cascade-5 § 3 #cascading
 * css-cascade-5 § 6 #cascade-sort
 * css-cascade-5 § 7 #cascaded-values
 * css-variables-1 § 4 #resolving-var-functions
 */
export function getCascadedStyle(element: unknown, rules?: Rule[] | CSSRuleList): CSSStyleDeclaration {
  if (!element || typeof element !== 'object') {
    return new CSSStyleDeclaration([], true);
  }

  let ruleList: (Rule | CSSRule)[] = [];
  if (rules) {
    ruleList = Array.from(rules as ArrayLike<Rule | CSSRule>);
  } else {
    // Collect all stylesheets from ownerDocument
    const elObj = element as { ownerDocument?: { styleSheets?: ArrayLike<CSSStyleSheet>; querySelectorAll?(s: string): ArrayLike<{ textContent?: string }> }; nodeType?: number };
    const doc = elObj.ownerDocument || (elObj.nodeType === 9 ? (element as unknown as Document) : null);
    if (doc) {
      if ('styleSheets' in doc && doc.styleSheets && doc.styleSheets.length > 0) {
        for (let i = 0; i < doc.styleSheets.length; i++) {
          const sheet = doc.styleSheets[i] as unknown as CSSStyleSheet;
          if (sheet && sheet.cssRules) {
            for (let j = 0; j < sheet.cssRules.length; j++) {
              const r = sheet.cssRules[j];
              if (r) ruleList.push(r as unknown as CSSRule);
            }
          }
        }
      } else if (typeof doc.querySelectorAll === 'function') {
        const styleTags = doc.querySelectorAll('style');
        for (let i = 0; i < styleTags.length; i++) {
          const styleEl = styleTags[i];
          const text = styleEl.textContent || '';
          if (text) {
            const parsed = parseStyleSheet(text);
            ruleList.push(...parsed);
          }
        }
      }
    }
  }

  // Pre-pass: Discover and order @layer declarations
  // css-cascade-5 § 6.4 #layer-ordering
  const layerDeclarationOrder = new Map<string, number>();
  let nextLayerIndex = 1;

  const registerLayer = (name: string) => {
    const clean = name.trim();
    if (clean && !layerDeclarationOrder.has(clean)) {
      layerDeclarationOrder.set(clean, nextLayerIndex++);
    }
  };

  const scanLayers = (list: (Rule | CSSRule)[], prefix: string = '') => {
    for (const r of list) {
      if (
        r instanceof CSSLayerStatementRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && !(r as ASTAtRule).block)
      ) {
        const names = (r as CSSLayerStatementRule).nameList || [];
        for (const n of names) {
          const fullName = prefix ? `${prefix}.${n}` : n;
          registerLayer(fullName);
        }
      } else if (
        r instanceof CSSLayerBlockRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && (r as ASTAtRule).block)
      ) {
        const rawName = (r as CSSLayerBlockRule).name || serialize((r as ASTAtRule).prelude || []).trim();
        const fullName = prefix ? (rawName ? `${prefix}.${rawName}` : prefix) : rawName;
        if (fullName) registerLayer(fullName);
        if (r instanceof CSSGroupingRule && r.cssRules) {
          scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), fullName);
        }
      } else if (r instanceof CSSGroupingRule && r.cssRules) {
        scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), prefix);
      }
    }
  };

  scanLayers(ruleList);

  const matchedDeclarations: MatchedDeclaration[] = [];
  let sourceOrderCounter = 0;

  const walkRules = (
    list: (Rule | CSSRule)[] | CSSRuleList,
    parentSelector: string = '',
    currentLayer: string | null = null,
    scopeNode?: DOMElement
  ) => {
    const count = list.length;
    for (let i = 0; i < count; i++) {
      const rule = list[i] as Rule | CSSRule;

      if ((rule as CSSRule).type === CSSRule.STYLE_RULE || (rule as { type: string }).type === 'style-rule') {
        const styleRule = rule as CSSStyleRule;
        const resolvedSelector = resolveNestedSelector(styleRule.selectorText, parentSelector);

        if (matches(element, resolvedSelector, scopeNode)) {
          const spec = getMatchingSpecificity(element, resolvedSelector);
          const style = styleRule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;

          if (style) {
            for (let k = 0; k < style.length; k++) {
              const name = style.item(k);
              const value = style.getPropertyValue(name);
              const priority = style.getPropertyPriority(name);
              matchedDeclarations.push({
                name,
                value,
                important: priority === 'important',
                isInline: false,
                layerOrder,
                specificity: spec,
                sourceOrder: sourceOrderCounter++,
              });
            }
          }
        }

        // Nested rules inside CSSStyleRule
        if (styleRule.cssRules && styleRule.cssRules.length > 0) {
          walkRules(styleRule.cssRules, resolvedSelector, currentLayer, scopeNode);
        }
      } else if (
        rule instanceof CSSLayerBlockRule ||
        ((rule as ASTAtRule).type === 'at-rule' && (rule as ASTAtRule).name === 'layer' && (rule as ASTAtRule).block)
      ) {
        const rawName = (rule as CSSLayerBlockRule).name || serialize((rule as ASTAtRule).prelude || []).trim();
        const layerName = currentLayer ? (rawName ? `${currentLayer}.${rawName}` : currentLayer) : rawName;
        const childRules = (rule instanceof CSSGroupingRule ? rule.cssRules : (rule as ASTAtRule).childRules) || [];
        walkRules(childRules, parentSelector, layerName, scopeNode);
      } else if (rule instanceof CSSScopeRule) {
        const childRules = (rule as CSSGroupingRule).cssRules || [];
        walkRules(childRules, '', currentLayer, isElement(element) ? element : undefined);
      } else if (rule instanceof CSSGroupingRule) {
        walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode);
      } else if (rule instanceof CSSNestedDeclarations) {
        const selectorToMatch = parentSelector || ':scope';
        if (matches(element, selectorToMatch, scopeNode)) {
          const spec = getMatchingSpecificity(element, selectorToMatch);
          const style = rule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          for (let k = 0; k < style.length; k++) {
            const name = style.item(k);
            const value = style.getPropertyValue(name);
            const priority = style.getPropertyPriority(name);
            matchedDeclarations.push({
              name,
              value,
              important: priority === 'important',
              isInline: false,
              layerOrder,
              specificity: spec,
              sourceOrder: sourceOrderCounter++,
            });
          }
        }
      }
    }
  };

  walkRules(ruleList);

  // Overlay inline style attribute
  // css-cascade-5 § 6.2 #cascade-sort
  const domEl = element as { getAttribute?(n: string): string | null; style?: { cssText?: string } };
  const styleAttrText = domEl.getAttribute?.('style') || (typeof domEl.style === 'string' ? domEl.style : domEl.style?.cssText);

  if (styleAttrText && styleAttrText.trim()) {
    const inlineDecls = ParseHooks.parseStyleAttribute(tokenize(styleAttrText));
    for (const d of inlineDecls.declarations) {
      matchedDeclarations.push({
        name: d.name,
        value: serialize(d.value, d.name.startsWith('--')).trim(),
        important: d.important,
        isInline: true,
        layerOrder: Infinity,
        specificity: [1, 0, 0],
        sourceOrder: sourceOrderCounter++,
      });
    }
  }

  // Sort matching declarations per CSS Cascade 5 § 6 #cascade-sort
  const declarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    const key = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
    if (!declarationsByProperty.has(key)) {
      declarationsByProperty.set(key, []);
    }
    declarationsByProperty.get(key)!.push(decl);
  }

  const winningDeclarations = new Map<string, MatchedDeclaration>();

  for (const [prop, decls] of declarationsByProperty) {
    decls.sort(compareCascadeDeclarations);
    winningDeclarations.set(prop, decls[decls.length - 1]);
  }

  // Determine writing-mode, direction, and text-orientation for logical property resolution
  let writingMode = 'horizontal-tb';
  let direction = 'ltr';
  let textOrientation = 'mixed';

  const elWithParent = element as { parentElement?: DOMElement | null };
  if (elWithParent.parentElement) {
    const parentCascaded = getCascadedStyle(elWithParent.parentElement, rules);
    const pWm = parentCascaded.getPropertyValue('writing-mode');
    if (pWm) writingMode = pWm;
    const pDir = parentCascaded.getPropertyValue('direction');
    if (pDir) direction = pDir;
    const pTo = parentCascaded.getPropertyValue('text-orientation');
    if (pTo) textOrientation = pTo;
  }

  const wmWinner = winningDeclarations.get('writing-mode');
  if (wmWinner) writingMode = wmWinner.value;

  const dirWinner = winningDeclarations.get('direction');
  if (dirWinner) direction = dirWinner.value;

  const toWinner = winningDeclarations.get('text-orientation');
  if (toWinner) textOrientation = toWinner.value;

  if (textOrientation === 'upright' && (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')) {
    direction = 'ltr';
  }

  // Resolve custom properties with inheritance down the tree
  // css-variables-1 § 4 #resolving-var-functions
  const customProperties = new Map<string, string>();

  if (elWithParent.parentElement) {
    const parentCascaded = getCascadedStyle(elWithParent.parentElement, rules);
    for (let i = 0; i < parentCascaded.length; i++) {
      const name = parentCascaded.item(i);
      if (name.startsWith('--')) {
        customProperties.set(name, parentCascaded.getPropertyValue(name));
      }
    }
  }

  // Merge direct custom property winners
  for (const [prop, decl] of winningDeclarations) {
    if (prop.startsWith('--')) {
      customProperties.set(prop, decl.value);
    }
  }

  // Resolve var() references within custom properties
  for (const [prop, rawVal] of customProperties) {
    const resolved = substituteVariables(rawVal, customProperties, new Set([prop]));
    if (resolved !== null) {
      customProperties.set(prop, resolved);
    }
  }

  // Map declarations into result with logical resolution & variable substitution
  const finalDeclarations: Declaration[] = [];

  for (const [name, decl] of winningDeclarations) {
    if (name.startsWith('--')) {
      const resolvedVal = customProperties.get(name) ?? decl.value;
      finalDeclarations.push({
        type: 'declaration',
        name,
        value: tokenize(resolvedVal),
        important: decl.important,
      });
      continue;
    }

    const mappedName = resolveLogicalProperty(name, writingMode, direction);
    const resolvedValue = substituteVariables(decl.value, customProperties, new Set());

    if (resolvedValue !== null) {
      finalDeclarations.push({
        type: 'declaration',
        name: mappedName,
        value: tokenize(resolvedValue),
        important: decl.important,
      });

      // Retain logical property names
      if (mappedName !== name) {
        finalDeclarations.push({
          type: 'declaration',
          name,
          value: tokenize(resolvedValue),
          important: decl.important,
        });
      }
    }
  }

  // Ensure inherited custom properties from parent are present
  for (const [customProp, customVal] of customProperties) {
    if (!finalDeclarations.some(d => d.name === customProp)) {
      finalDeclarations.push({
        type: 'declaration',
        name: customProp,
        value: tokenize(customVal),
        important: false,
      });
    }
  }

  const resultStyle = new CSSStyleDeclaration(finalDeclarations, true);

  // Sync logical properties
  for (const logical in LOGICAL_MAPPING) {
    const mapped = resolveLogicalProperty(logical, writingMode, direction);
    const existingVal = resultStyle.getPropertyValue(mapped);
    if (existingVal && !resultStyle.getPropertyValue(logical)) {
      resultStyle.setProperty(logical, existingVal);
    }
  }

  return resultStyle;
}

/**
 * Compares two declarations according to CSS Cascade 5 § 6 #cascade-sort.
 */
function compareCascadeDeclarations(a: MatchedDeclaration, b: MatchedDeclaration): number {
  const getPrecedence = (decl: MatchedDeclaration): number => {
    if (decl.important) {
      if (decl.isInline) return 60; // Important inline
      if (decl.layerOrder !== Infinity) return 50; // Important layered
      return 40; // Important unlayered
    } else {
      if (decl.isInline) return 30; // Normal inline
      if (decl.layerOrder === Infinity) return 20; // Normal unlayered
      return 10; // Normal layered
    }
  };

  const precA = getPrecedence(a);
  const precB = getPrecedence(b);
  if (precA !== precB) {
    return precA - precB;
  }

  // Layer order within importance bucket
  if (a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // !important layered: REVERSE layer order (lower layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return b.layerOrder - a.layerOrder;
    }
  } else if (!a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // Normal layered: normal layer order (higher layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
  }

  // Compare Specificity: selectors-4 § 4 #specificity-rules
  const specDiff = compareSpecificity(a.specificity, b.specificity);
  if (specDiff !== 0) {
    return specDiff;
  }

  // Source Order
  return a.sourceOrder - b.sourceOrder;
}

/**
 * Recursively resolves var() references with fallback substitution and circular reference detection.
 * css-variables-1 § 4 #resolving-var-functions
 */
function substituteVariables(
  valueText: string,
  customProps: Map<string, string>,
  resolvingStack: Set<string>
): string | null {
  if (!valueText || !valueText.includes('var(')) {
    return valueText;
  }

  const tokens = tokenize(valueText);
  const componentValues = new Parser(tokens).parseComponentValues();

  const resolveNodes = (nodes: ComponentValue[]): ComponentValue[] | null => {
    const result: ComponentValue[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === 'function' && 'name' in node && Array.isArray(node.value)) {
        const funcNode = node as unknown as { name: string; value: ComponentValue[] };
        if (funcNode.name.toLowerCase() === 'var') {
          const args = funcNode.value;
          const varNameToken = args.find(
            t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'ident' && 'value' in t && typeof t.value === 'string' && t.value.startsWith('--')
          ) as { type: string; value: string } | undefined;
          if (!varNameToken) {
            return null;
          }
          const varName = varNameToken.value;

          // Circular reference detection: css-variables-1 § 4.4 #cycles
          if (resolvingStack.has(varName)) {
            return null;
          }

          const commaIndex = args.findIndex(t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'comma');
          const fallbackTokens = commaIndex !== -1 ? args.slice(commaIndex + 1) : null;

          if (customProps.has(varName)) {
            const rawCustomVal = customProps.get(varName)!;
            if (rawCustomVal.includes('var(')) {
              const nextStack = new Set(resolvingStack);
              nextStack.add(varName);
              const resolvedCustom = substituteVariables(rawCustomVal, customProps, nextStack);
              if (resolvedCustom === null) {
                if (fallbackTokens) {
                  const resolvedFallback = resolveNodes(fallbackTokens);
                  if (resolvedFallback === null) return null;
                  result.push(...resolvedFallback);
                  continue;
                }
                return null;
              }
              const substitutedTokens = new Parser(tokenize(resolvedCustom)).parseComponentValues();
              result.push(...substitutedTokens);
            } else {
              const substitutedTokens = new Parser(tokenize(rawCustomVal)).parseComponentValues();
              result.push(...substitutedTokens);
            }
          } else if (fallbackTokens) {
            const resolvedFallback = resolveNodes(fallbackTokens);
            if (resolvedFallback === null) return null;
            result.push(...resolvedFallback);
          } else {
            return null;
          }
          continue;
        }

        const resolvedChildren = resolveNodes(funcNode.value);
        if (resolvedChildren === null) return null;
        result.push({ type: 'function', name: funcNode.name, value: resolvedChildren });
      } else if (node.type === 'simple-block') {
        const resolvedChildren = resolveNodes(node.value);
        if (resolvedChildren === null) return null;
        result.push({ type: 'simple-block', associatedToken: node.associatedToken, value: resolvedChildren });
      } else {
        result.push(node);
      }
    }
    return result;
  };

  const resolved = resolveNodes(componentValues);
  if (resolved === null) return null;
  return serialize(resolved).trim();
}

/**
 * Resolves nesting '&' selectors within child rules.
 * css-nesting-1 § 4 #nesting-selector
 */
export function resolveNestedSelector(selector: string, parentSelector: string): string {
  if (!parentSelector && !selector.includes('&')) return selector;

  const tokens = tokenize(selector);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let parentList: SelectorList | null = null;
  if (parentSelector) {
    const parentTokens = tokenize(parentSelector);
    const parentParser = new Parser(parentTokens);
    const parentComp = parentParser.parseComponentValues();
    const parentSelectorParser = new SelectorParser(parentComp, { allowRelative: true, forgiving: true });
    parentList = parentSelectorParser.parse();
  }

  function recurse(l: SelectorList) {
    for (const complex of l.selectors) {
      if (complex.type === 'invalid-selector') continue;
      for (const item of complex.items) {
        if (item.type === 'compound-selector') {
          for (let i = 0; i < item.selectors.length; i++) {
            const simple = item.selectors[i];
            if (simple.type === 'nesting-selector') {
              if (parentList) {
                const pseudo: PseudoClassSelector = {
                  type: 'pseudo-class-selector',
                  name: 'is',
                  argument: parentList,
                };
                item.selectors[i] = pseudo;
              } else {
                const pseudo: PseudoClassSelector = {
                  type: 'pseudo-class-selector',
                  name: 'where',
                  argument: {
                    type: 'selector-list',
                    selectors: [
                      {
                        type: 'complex-selector',
                        items: [
                          {
                            type: 'compound-selector',
                            selectors: [
                              {
                                type: 'pseudo-class-selector',
                                name: 'scope',
                              },
                            ],
                          },
                        ],
                        tokens: [],
                      },
                    ],
                  },
                };
                item.selectors[i] = pseudo;
              }
            } else if (simple.type === 'pseudo-class-selector' || simple.type === 'pseudo-element-selector') {
              if (
                simple.argument &&
                typeof simple.argument === 'object' &&
                'type' in simple.argument &&
                simple.argument.type === 'selector-list'
              ) {
                recurse(simple.argument);
              }
            }
          }
        }
      }
    }
  }

  recurse(list);
  return serializeSelectorList(list);
}

function getMatchingSpecificity(element: unknown, selectorText: string): [number, number, number] {
  const tokens = tokenize(selectorText);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let maxSpec: [number, number, number] = [0, 0, 0];

  for (const complex of list.selectors) {
    if (complex.type === 'invalid-selector') continue;
    if (matches(element, complex)) {
      const spec = calculateSpecificity({ type: 'selector-list', selectors: [complex] });
      const singleSpec = spec[0] || [0, 0, 0];
      if (compareSpecificity(singleSpec, maxSpec) > 0) {
        maxSpec = singleSpec;
      }
    }
  }

  return maxSpec;
}
