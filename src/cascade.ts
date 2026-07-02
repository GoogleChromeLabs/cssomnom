/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { calculateSpecificity, compareSpecificity } from './specificity.ts';
import { CSSRule, CSSNestedDeclarations, CSSGroupingRule } from './CSSOM.ts';
import { tokenize } from './tokenizer.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from './data/LogicalMapping.ts';
import { Parser } from './parser.ts';
import { SelectorParser } from './SelectorParser.ts';
import { serialize } from './serializer.ts';
import type { 
  Rule, CSSStyleRule, CSSRuleList,
  SelectorList, ComplexSelector, SimpleSelector, PseudoClassSelector, ComponentValue
} from './types.ts';


interface MatchableElement {
  matches(selector: string): boolean;
}

/**
 * Resolves computed style statically for an element against a set of rules.
 * Does not handle inheritance or default values, just the cascade.
 */
export function getCascadedStyle(element: unknown, rules: Rule[]) {

  const matchedRules: { rule: CSSStyleRule, specificity: [number, number, number], order: number }[] = [];
  
  let order = 0;
  const walkRules = (ruleList: Rule[] | CSSRuleList, parentSelector: string = '') => {
    for (let i = 0; i < ruleList.length; i++) {
      const rule = ruleList[i] as Rule;
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule;
        const resolvedSelector = resolveNestedSelector(styleRule.selectorText, parentSelector);
        const matchingSpecificity = getMatchingSpecificity(element, resolvedSelector);
        if (matchingSpecificity) {
          matchedRules.push({ rule: styleRule, specificity: matchingSpecificity, order: order++ });
        }
        // Nested rules
        if (styleRule.cssRules && styleRule.cssRules.length > 0) {
            walkRules(styleRule.cssRules, resolvedSelector);
        }
      } else if (rule instanceof CSSGroupingRule) {
        walkRules((rule as CSSGroupingRule).cssRules, parentSelector);
      } else if (rule instanceof CSSNestedDeclarations) {
        const selectorToMatch = parentSelector || ':scope';
        const matchingSpecificity = getMatchingSpecificity(element, selectorToMatch);
        if (matchingSpecificity) {
          matchedRules.push({ rule: rule as unknown as CSSStyleRule, specificity: matchingSpecificity, order: order++ });
        }
      }
    }
  };


  walkRules(rules);

  // Sort by specificity, then source order
  matchedRules.sort((a, b) => {
    const specDiff = compareSpecificity(a.specificity, b.specificity);
    if (specDiff !== 0) return specDiff;
    return a.order - b.order;
  });

  const declarations = new Map<string, { value: string, important: boolean }>();
  
  let writingMode = 'horizontal-tb';
  let direction = 'ltr';
  
  let wmImportant = false;
  let dirImportant = false;

  // First pass: find winning writing-mode and direction
  for (const { rule } of matchedRules) {
    const style = rule.style;
    
    const wm = style.getPropertyValue('writing-mode');
    if (wm) {
      const isImportant = style.getPropertyPriority('writing-mode') === 'important';
      if (isImportant || !wmImportant) {
        writingMode = wm;
        wmImportant = isImportant;
      }
    }

    const dir = style.getPropertyValue('direction');
    if (dir) {
      const isImportant = style.getPropertyPriority('direction') === 'important';
      if (isImportant || !dirImportant) {
        direction = dir;
        dirImportant = isImportant;
      }
    }
  }

  // Second pass: process all properties with dynamic logical resolution
  for (const { rule } of matchedRules) {
    const style = rule.style;
    for (let i = 0; i < style.length; i++) {
      const name = style.item(i);
      const mappedName = resolveLogicalProperty(name, writingMode, direction);
      const value = style.getPropertyValue(name);
      const priority = style.getPropertyPriority(name);
      const isImportant = priority === 'important';

      const existing = declarations.get(mappedName);
      if (!existing || isImportant || !existing.important) {
        declarations.set(mappedName, { value, important: isImportant });
      }
    }
  }

  const result: Record<string, string> = {};
  for (const [name, { value }] of declarations) {
    result[name] = value;
  }

  // Retain logical keys in computed style output
  for (const logical in LOGICAL_MAPPING) {
    const mappedName = resolveLogicalProperty(logical, writingMode, direction);
    const existing = declarations.get(mappedName);
    if (existing) {
      result[logical] = existing.value;
    }
  }

  return result;
}

export function resolveNestedSelector(selector: string, parentSelector: string): string {
  if (!parentSelector && !selector.includes('&')) return selector;
  
  const tokens = tokenize(selector);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues);
  const list = selectorParser.parse();

  let parentList: SelectorList | null = null;
  if (parentSelector) {
    const parentTokens = tokenize(parentSelector);
    const parentParser = new Parser(parentTokens);
    const parentComp = parentParser.parseComponentValues();
    const parentSelectorParser = new SelectorParser(parentComp);
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
                  argument: parentList
                };
                item.selectors[i] = pseudo;
              } else {
                const pseudo: PseudoClassSelector = {
                  type: 'pseudo-class-selector',
                  name: 'where',
                  argument: {
                    type: 'selector-list',
                    selectors: [{
                      type: 'complex-selector',
                      items: [{
                        type: 'compound-selector',
                        selectors: [{
                          type: 'pseudo-class-selector',
                          name: 'scope'
                        }]
                      }],
                      tokens: []
                    }]
                  }
                };
                item.selectors[i] = pseudo;
              }
            } else if (simple.type === 'pseudo-class-selector' || simple.type === 'pseudo-element-selector') {
              if (simple.argument && typeof simple.argument === 'object' && 'type' in simple.argument && simple.argument.type === 'selector-list') {
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


function serializeSelectorList(list: SelectorList): string {
  return list.selectors.map(s => {
    if (s.type === 'invalid-selector') {
      return serialize(s.tokens);
    }
    return serializeComplexSelector(s);
  }).join(', ');
}

function serializeComplexSelector(complex: ComplexSelector): string {
  return complex.items.map(item => {
    if (item.type === 'combinator') return item.value === ' ' ? ' ' : ` ${item.value} `;
    return item.selectors.map(s => serializeSimpleSelector(s)).join('');
  }).join('');
}

function serializeSimpleSelector(simple: SimpleSelector): string {
  switch (simple.type) {
    case 'type-selector': return simple.name;
    case 'universal-selector': return '*';
    case 'id-selector': return `#${simple.name}`;
    case 'class-selector': return `.${simple.name}`;
    case 'attribute-selector':
      let attr = `[${simple.name}`;
      if (simple.operator) attr += `${simple.operator}${simple.value}`;
      if (simple.flags) attr += ` ${simple.flags}`;
      return attr + ']';
    case 'pseudo-class-selector':
      let pc = `:${simple.name}`;
      if (simple.argument) {
        if ('type' in simple.argument && simple.argument.type === 'selector-list') {
          pc += `(${serializeSelectorList(simple.argument)})`;
        } else {
          pc += `(${serialize(simple.argument as ComponentValue[])})`;
        }
      }
      return pc;
    case 'pseudo-element-selector':
      let pe = `::${simple.name}`;
      if (simple.argument) {
        if ('type' in simple.argument && simple.argument.type === 'selector-list') {
          pe += `(${serializeSelectorList(simple.argument)})`;
        } else {
          pe += `(${serialize(simple.argument as ComponentValue[])})`;
        }
      }
      return pe;
    case 'nesting-selector': return '&';
    default: return '';
  }
}

function getMatchingSpecificity(element: unknown, selectorText: string): [number, number, number] | null {
  const tokens = tokenize(selectorText);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues);
  const list = selectorParser.parse();

  let maxSpec: [number, number, number] | null = null;

  for (const complex of list.selectors) {
    const complexSelectorText = serialize(complex.tokens).trim();
    if (isMatchable(element)) {
      try {
        if (element.matches(complexSelectorText)) {
          const spec = calculateSpecificity({ type: 'selector-list', selectors: [complex] });
          const singleSpec = spec[0];
          if (!maxSpec || compareSpecificity(singleSpec, maxSpec) > 0) {
            maxSpec = singleSpec;
          }
        }
      } catch (e) {
        // Ignore DOMException crashes from invalid selectors
      }
    }
  }

  return maxSpec;
}

function isMatchable(element: unknown): element is MatchableElement {
  return typeof element === 'object' && element !== null && 'matches' in element && typeof (element as Record<string, unknown>).matches === 'function';
}



