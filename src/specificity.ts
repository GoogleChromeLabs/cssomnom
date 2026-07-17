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

export type Specificity = [number, number, number];
const ZERO: Specificity = [0, 0, 0];

function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function getArgumentSpecificity(
  pseudo: PseudoClassSelector | PseudoElementSelector, 
  parentSpecificity?: Specificity
): Specificity {
  if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
    return calculateSelectorListSpecificity(pseudo.argument, parentSpecificity);
  }
  return ZERO;
}

export function calculateSpecificity(selector: string | SelectorList, parentSpecificity?: Specificity): Specificity[] {
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
  
  return list.selectors.map(complex => 
    complex.type === 'invalid-selector' ? ZERO : calculateComplexSelectorSpecificity(complex, parentSpecificity)
  );
}

export function calculateSelectorListSpecificity(list: SelectorList, parentSpecificity?: Specificity): Specificity {
  return list.selectors.reduce((max, complex) => {
    const current = complex.type === 'invalid-selector'
      ? ZERO
      : calculateComplexSelectorSpecificity(complex, parentSpecificity);
    return compareSpecificity(current, max) > 0 ? current : max;
  }, ZERO);
}

export function calculateComplexSelectorSpecificity(complex: ComplexSelector, parentSpecificity?: Specificity): Specificity {
  return complex.items.reduce((acc, item) => 
    item.type === 'compound-selector' 
      ? addSpecificity(acc, calculateCompoundSelectorSpecificity(item, parentSpecificity)) 
      : acc,
    ZERO
  );
}

function calculateCompoundSelectorSpecificity(compound: CompoundSelector, parentSpecificity?: Specificity): Specificity {
  return compound.selectors.reduce((acc, simple) => 
    addSpecificity(acc, calculateSimpleSelectorSpecificity(simple, parentSpecificity)),
    ZERO
  );
}

function calculateSimpleSelectorSpecificity(simple: SimpleSelector, parentSpecificity?: Specificity): Specificity {
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
      return ZERO;
    case 'nesting-selector':
      // The & selector behaves like :where(:scope) when no parent selector exists.
      return parentSpecificity ?? ZERO;
    case 'pseudo-class-selector':
      return calculatePseudoClassSpecificity(simple, parentSpecificity);
    default:
      return ZERO;
  }
}

function calculatePseudoClassSpecificity(pseudo: PseudoClassSelector, parentSpecificity?: Specificity): Specificity {
  const name = pseudo.name.toLowerCase();
  
  if (name === 'where') {
    return ZERO;
  }
  
  if (['is', 'not', 'has', 'matches'].includes(name)) {
    return getArgumentSpecificity(pseudo, parentSpecificity);
  }
  
  if (['nth-child', 'nth-last-child', 'host', 'host-context'].includes(name)) {
    const argSpec = getArgumentSpecificity(pseudo, parentSpecificity);
    return [argSpec[0], argSpec[1] + 1, argSpec[2]];
  }
  
  return [0, 1, 0];
}

function calculatePseudoElementSpecificity(pseudo: PseudoElementSelector, parentSpecificity?: Specificity): Specificity {
  const name = pseudo.name.toLowerCase();
  if (name === 'slotted') {
    const argSpec = getArgumentSpecificity(pseudo, parentSpecificity);
    return [argSpec[0], argSpec[1], argSpec[2] + 1];
  }
  return [0, 0, 1];
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

