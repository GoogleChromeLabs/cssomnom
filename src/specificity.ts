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
import type { 
  SelectorList, ComplexSelector, CompoundSelector, SimpleSelector, 
  PseudoClassSelector, PseudoElementSelector
} from './types.ts';

import { tokenize } from './tokenizer.ts';
import { Parser } from './parser.ts';
import { SelectorParser } from './SelectorParser.ts';

/**
 * Spec: https://drafts.csswg.org/selectors-4/#specificity-rules
 */
export function calculateSpecificity(selector: string | SelectorList, parentSpecificity?: [number, number, number]): [number, number, number][] {
  let list: SelectorList;
  if (typeof selector === 'string') {
    const tokens = tokenize(selector);
    const parser = new Parser(tokens);
    const componentValues = parser.parseComponentValues();
    const selectorParser = new SelectorParser(componentValues);
    list = selectorParser.parse();
  } else {
    list = selector;
  }
  
  return list.selectors.map(complex => {
    if (complex.type === 'invalid-selector') {
      return [0, 0, 0] as [number, number, number];
    }
    return calculateComplexSelectorSpecificity(complex, parentSpecificity);
  });
}

/**
 * Returns the most specific specificity in the list.
 */
export function calculateSelectorListSpecificity(list: SelectorList, parentSpecificity?: [number, number, number]): [number, number, number] {
  let max: [number, number, number] = [0, 0, 0];
  
  for (const complex of list.selectors) {
    const current = complex.type === 'invalid-selector'
      ? [0, 0, 0] as [number, number, number]
      : calculateComplexSelectorSpecificity(complex, parentSpecificity);
    if (compareSpecificity(current, max) > 0) {
      max = current;
    }
  }
  
  return max;
}

export function calculateComplexSelectorSpecificity(complex: ComplexSelector, parentSpecificity?: [number, number, number]): [number, number, number] {
  const result: [number, number, number] = [0, 0, 0];
  
  for (const item of complex.items) {
    if (item.type === 'compound-selector') {
      const compound = calculateCompoundSelectorSpecificity(item, parentSpecificity);
      result[0] += compound[0];
      result[1] += compound[1];
      result[2] += compound[2];
    }
    // Combinators don't contribute to specificity
  }
  
  return result;
}

function calculateCompoundSelectorSpecificity(compound: CompoundSelector, parentSpecificity?: [number, number, number]): [number, number, number] {
  const result: [number, number, number] = [0, 0, 0];
  
  for (const simple of compound.selectors) {
    const s = calculateSimpleSelectorSpecificity(simple, parentSpecificity);
    result[0] += s[0];
    result[1] += s[1];
    result[2] += s[2];
  }
  
  return result;
}

function calculateSimpleSelectorSpecificity(simple: SimpleSelector, parentSpecificity?: [number, number, number]): [number, number, number] {
  switch (simple.type) {
    case 'id-selector':
      return [1, 0, 0];
    case 'class-selector':
    case 'attribute-selector':
      return [0, 1, 0];
    case 'type-selector':
      return [0, 0, 1];
    case 'pseudo-element-selector':
      return calculatePseudoElementSpecificity(simple, parentSpecificity);
    case 'universal-selector':
      return [0, 0, 0];
    case 'nesting-selector':
      if (!parentSpecificity) {
        // The & selector behaves like :where(:scope) when no parent selector exists.
        // Spec: css-nesting-1 #nest-selector
        return [0, 0, 0];
      }
      return parentSpecificity;
    case 'pseudo-class-selector':
      return calculatePseudoClassSpecificity(simple, parentSpecificity);
    default:
      return [0, 0, 0];
  }
}

function calculatePseudoClassSpecificity(pseudo: PseudoClassSelector, parentSpecificity?: [number, number, number]): [number, number, number] {
  const name = pseudo.name.toLowerCase();
  
  // :where() has zero specificity
  if (name === 'where') {
    return [0, 0, 0];
  }
  
  // :is(), :not(), :has() specificity is replaced by most specific argument
  if (['is', 'not', 'has', 'matches'].includes(name)) {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      return calculateSelectorListSpecificity(pseudo.argument, parentSpecificity);
    }
    return [0, 0, 0];
  }
  
  // :nth-child(), :nth-last-child() specificity is 1 (pseudo-class) + max of argument
  if (['nth-child', 'nth-last-child'].includes(name)) {
    let argSpec: [number, number, number] = [0, 0, 0];
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      argSpec = calculateSelectorListSpecificity(pseudo.argument, parentSpecificity);
    }
    return [argSpec[0], argSpec[1] + 1, argSpec[2]];
  }

  // :host and :host-context() specificity is 1 in B + specificity of argument
  if (['host', 'host-context'].includes(name)) {
    let argSpec: [number, number, number] = [0, 0, 0];
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      argSpec = calculateSelectorListSpecificity(pseudo.argument, parentSpecificity);
    }
    return [argSpec[0], argSpec[1] + 1, argSpec[2]];
  }
  
  // Other pseudo-classes count as 1 in B
  return [0, 1, 0];
}

function calculatePseudoElementSpecificity(pseudo: PseudoElementSelector, parentSpecificity?: [number, number, number]): [number, number, number] {
  const name = pseudo.name.toLowerCase();
  // ::slotted() specificity is 1 in C + specificity of argument
  if (name === 'slotted') {
    let argSpec: [number, number, number] = [0, 0, 0];
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      argSpec = calculateSelectorListSpecificity(pseudo.argument, parentSpecificity);
    }
    return [argSpec[0], argSpec[1], argSpec[2] + 1];
  }
  return [0, 0, 1];
}

export function compareSpecificity(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

