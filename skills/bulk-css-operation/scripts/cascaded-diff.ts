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

import { CSSStyleSheet, getCascadedStyle, type CSSStyleDeclaration } from '../../../src/index.ts';
import { isElement, type DOMElement } from '../../../src/matcher.ts';
import { parseHTML } from 'linkedom';

export interface CascadedStyleDifference {
  elementDescription: string;
  property: string;
  beforeValue: string;
  afterValue: string;
}

export interface CascadedDiffResult {
  valid: boolean;
  totalElementsTested: number;
  differences: CascadedStyleDifference[];
}

/** Backward compatibility aliases */
export type DomSampleDifference = CascadedStyleDifference;
export type DomSampleResult = CascadedDiffResult;

/**
 * Stage 3 Verification: Cascaded Style DOM Verification.
 * Evaluates cascaded winning declarations for a collection of DOM elements (or an HTML string)
 * against before and after stylesheets using `getCascadedStyle`.
 */
export function diffCascadedStyles(
  elementsOrHtml: DOMElement[] | string,
  beforeCss: string | string[],
  afterCss: string | string[]
): CascadedDiffResult {
  let elements: DOMElement[];
  if (typeof elementsOrHtml === 'string') {
    const { document } = parseHTML(elementsOrHtml);
    elements = Array.from(document.querySelectorAll('*')).filter(isElement);
  } else {
    elements = elementsOrHtml;
  }

  const beforeText = Array.isArray(beforeCss) ? beforeCss.join('\n') : beforeCss;
  const afterText = Array.isArray(afterCss) ? afterCss.join('\n') : afterCss;

  const sheetBefore = new CSSStyleSheet();
  sheetBefore.replaceSync(beforeText);

  const sheetAfter = new CSSStyleSheet();
  sheetAfter.replaceSync(afterText);

  const differences: CascadedStyleDifference[] = [];

  function createStyleGetter(rules: CSSStyleSheet['cssRules']) {
    const cache = new Map<DOMElement, CSSStyleDeclaration>();
    return (el: DOMElement) => {
      let s = cache.get(el);
      if (!s) {
        s = getCascadedStyle(el, rules);
        cache.set(el, s);
      }
      return s;
    };
  }

  const getBeforeStyle = createStyleGetter(sheetBefore.cssRules);
  const getAfterStyle = createStyleGetter(sheetAfter.cssRules);

  for (const el of elements) {
    const tagName = el.tagName || el.localName || 'element';
    const className = el.className || '';
    const id = el.id ? `#${el.id}` : '';
    const desc = `<${tagName.toLowerCase()}${id}${className ? ` class="${className}"` : ''}>`;

    const beforeStyle = getBeforeStyle(el);
    const afterStyle = getAfterStyle(el);

    const checkedProps = new Set<string>([...beforeStyle, ...afterStyle]);

    for (const prop of checkedProps) {
      const bVal = beforeStyle.getPropertyValue(prop);
      const aVal = afterStyle.getPropertyValue(prop);
      if (bVal !== aVal) {
        if (prop.startsWith('--') && el.parentElement) {
          const parentBefore = getBeforeStyle(el.parentElement);
          const parentAfter = getAfterStyle(el.parentElement);
          if (
            parentBefore.getPropertyValue(prop) === bVal &&
            parentAfter.getPropertyValue(prop) === aVal
          ) {
            continue;
          }
        }
        differences.push({
          elementDescription: desc,
          property: prop,
          beforeValue: bVal,
          afterValue: aVal,
        });
      }
    }
  }

  return {
    valid: differences.length === 0,
    totalElementsTested: elements.length,
    differences,
  };
}

/** Backward compatibility alias */
export const diffComputedStyles = diffCascadedStyles;

