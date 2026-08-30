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
 * Specificity vector [A, B, C]:
 * - A: number of ID selectors
 * - B: number of class selectors, attribute selectors, and pseudo-classes
 * - C: number of type selectors and pseudo-elements
 *
 * selectors-4 § 15 #specificity-rules
 */
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

/**
 * Calculates specificity for each complex selector in a selector list.
 *
 * selectors-4 § 15 #specificity-rules:
 * "If the selector is a selector list, this number is calculated for each selector in the list."
 */
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

/**
 * Calculates the maximum specificity among complex selectors in a selector list.
 *
 * selectors-4 § 15 #specificity-rules:
 * "The specificity of an :is(), :not(), or :has() pseudo-class is replaced by the specificity
 * of the most specific complex selector in its selector list argument."
 */
export function calculateSelectorListSpecificity(list: SelectorList, parentSpecificity?: Specificity): Specificity {
  return list.selectors.reduce((max, complex) => {
    const current = complex.type === 'invalid-selector'
      ? ZERO
      : calculateComplexSelectorSpecificity(complex, parentSpecificity);
    return compareSpecificity(current, max) > 0 ? current : max;
  }, ZERO);
}

/**
 * Sums specificities of compound selectors within a complex selector (combinators ignored).
 *
 * selectors-4 § 15 #specificity-rules
 */
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
    // selectors-4 § 15 #specificity-rules: count ID selectors (= A)
    case 'id-selector':
      return [1, 0, 0];
    // selectors-4 § 15 #specificity-rules: count class selectors and attribute selectors (= B)
    case 'class-selector':
    case 'attribute-selector':
      return [0, 1, 0];
    // selectors-4 § 15 #specificity-rules: count type selectors (= C)
    case 'type-selector':
      return [0, 0, 1];
    // selectors-4 § 15 #specificity-rules: count pseudo-elements (= C)
    case 'pseudo-element-selector':
      return calculatePseudoElementSpecificity(simple, parentSpecificity);
    // selectors-4 § 15 #specificity-rules: ignore universal selector
    case 'universal-selector':
      return ZERO;
    // css-nesting-1 § 4.1 #nesting-selector:
    // "The specificity of the nesting selector is the specificity of the parent selector list"
    case 'nesting-selector':
      return parentSpecificity ?? ZERO;
    // selectors-4 § 15 #specificity-rules: count pseudo-classes (= B) or evaluation contexts
    case 'pseudo-class-selector':
      return calculatePseudoClassSpecificity(simple, parentSpecificity);
    default:
      return ZERO;
  }
}

function calculatePseudoClassSpecificity(pseudo: PseudoClassSelector, parentSpecificity?: Specificity): Specificity {
  const name = pseudo.name.toLowerCase();
  
  // selectors-4 § 15 #specificity-rules: "The specificity of a :where() pseudo-class is replaced by zero."
  // selectors-4 § 4.4 #zero-matches
  if (name === 'where') {
    return ZERO;
  }
  
  // selectors-4 § 15 #specificity-rules: replaced by specificity of most specific complex selector in argument
  // selectors-4 § 4.2 #matches, § 4.3 #negation, § 4.5 #relational
  if (['is', 'not', 'has', 'matches'].includes(name)) {
    return getArgumentSpecificity(pseudo, parentSpecificity);
  }
  
  // selectors-4 § 15 #specificity-rules: pseudo-class (1 in B) plus argument specificity
  // css-scoping-1 § 3.1 #host-selector
  if (['nth-child', 'nth-last-child', 'host', 'host-context'].includes(name)) {
    const argSpec = getArgumentSpecificity(pseudo, parentSpecificity);
    return [argSpec[0], argSpec[1] + 1, argSpec[2]];
  }
  
  // selectors-4 § 15 #specificity-rules: default pseudo-class counts as B
  return [0, 1, 0];
}

function calculatePseudoElementSpecificity(pseudo: PseudoElementSelector, parentSpecificity?: Specificity): Specificity {
  const name = pseudo.name.toLowerCase();
  // css-scoping-1 § 3.2 #slotted-pseudo:
  // "The specificity of ::slotted() is that of a pseudo-element, plus the specificity of its argument."
  if (name === 'slotted') {
    const argSpec = getArgumentSpecificity(pseudo, parentSpecificity);
    return [argSpec[0], argSpec[1], argSpec[2] + 1];
  }
  // selectors-4 § 15 #specificity-rules: pseudo-element counts as C
  return [0, 0, 1];
}

/**
 * Compares two specificities according to lexicographical (A, B, C) component order.
 *
 * selectors-4 § 15 #specificity-rules:
 * "Specificities are compared by comparing the three components in order:
 * the specificity with a larger A value is more specific;
 * if the two A values are tied, then the specificity with a larger B value is more specific;
 * if the two B values are also tied, then the specificity with a larger C value is more specific;
 * if all the values are tied, the two specificities are equal."
 */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

