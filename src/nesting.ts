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

import { parseComponentValues } from './parser.ts';
import { SelectorParser } from './SelectorParser.ts';
import { serializeSelectorList } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import type { ComplexSelector, PseudoClassSelector, SelectorList } from './types.ts';

/**
 * Resolves nesting '&' selectors within child rules.
 * css-nesting-1 #nesting-selector
 */
export function resolveNestedSelector(selector: string, parentSelector: string): string {
  if (!parentSelector && !selector.includes('&')) return selector;

  const tokens = tokenize(selector);
  const componentValues = parseComponentValues(tokens);
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let parentList: SelectorList | null = null;
  if (parentSelector) {
    const parentTokens = tokenize(parentSelector);
    const parentComp = parseComponentValues(parentTokens);
    const parentSelectorParser = new SelectorParser(parentComp, { allowRelative: true, forgiving: true });
    parentList = parentSelectorParser.parse();
  }

  function complexHasNesting(complex: ComplexSelector | import('./types.ts').InvalidSelector): boolean {
    if (!('items' in complex)) return false;
    for (const item of complex.items) {
      if (item.type === 'compound-selector') {
        for (const simple of item.selectors) {
          if (simple.type === 'nesting-selector') return true;
          if (simple.type === 'pseudo-class-selector' || simple.type === 'pseudo-element-selector') {
            if (
              simple.argument &&
              typeof simple.argument === 'object' &&
              'type' in simple.argument &&
              simple.argument.type === 'selector-list'
            ) {
              for (const sub of simple.argument.selectors) {
                if (complexHasNesting(sub)) return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  function recurse(l: SelectorList, isTopLevel: boolean = false) {
    for (const complex of l.selectors) {
      if (complex.type === 'invalid-selector') continue;
      if (isTopLevel && parentList && !complexHasNesting(complex)) {
        if (complex.items.length > 0 && complex.items[0].type === 'combinator') {
          complex.items.unshift({
            type: 'compound-selector',
            selectors: [{
              type: 'pseudo-class-selector',
              name: 'is',
              argument: parentList,
            }],
          });
        } else {
          complex.items.unshift(
            {
              type: 'compound-selector',
              selectors: [{
                type: 'pseudo-class-selector',
                name: 'is',
                argument: parentList,
              }],
            },
            {
              type: 'combinator',
              value: ' ',
            }
          );
        }
      }
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
                simple.argument !== parentList &&
                typeof simple.argument === 'object' &&
                'type' in simple.argument &&
                simple.argument.type === 'selector-list'
              ) {
                recurse(simple.argument, false);
              }
            }
          }
        }
      }
    }
  }

  recurse(list, true);
  return serializeSelectorList(list);
}
