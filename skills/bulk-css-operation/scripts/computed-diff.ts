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

import { CSSStyleSheet, getCascadedStyle } from '../../../src/index.ts';
import type { DOMElement } from '../../../src/matcher.ts';

export interface DomSampleDifference {
  elementDescription: string;
  property: string;
  beforeValue: string;
  afterValue: string;
}

export interface DomSampleResult {
  valid: boolean;
  totalElementsTested: number;
  differences: DomSampleDifference[];
}

/**
 * Stage 3 Verification: Computed Style Sampling.
 * Evaluates computed cascaded styles for a sample set of DOM elements
 * against before and after stylesheets.
 */
export function diffComputedStyles(
  elements: DOMElement[],
  beforeCss: string | string[],
  afterCss: string | string[]
): DomSampleResult {
  const beforeText = Array.isArray(beforeCss) ? beforeCss.join('\n') : beforeCss;
  const afterText = Array.isArray(afterCss) ? afterCss.join('\n') : afterCss;

  const sheetBefore = new CSSStyleSheet();
  sheetBefore.replaceSync(beforeText);

  const sheetAfter = new CSSStyleSheet();
  sheetAfter.replaceSync(afterText);

  const differences: DomSampleDifference[] = [];

  for (const el of elements) {
    const tagName = el.tagName || el.localName || 'element';
    const className = el.className || '';
    const id = el.id ? `#${el.id}` : '';
    const desc = `<${tagName.toLowerCase()}${id}${className ? ` class="${className}"` : ''}>`;

    const beforeStyle = getCascadedStyle(el, sheetBefore.cssRules);
    const afterStyle = getCascadedStyle(el, sheetAfter.cssRules);

    const checkedProps = new Set<string>();
    for (let i = 0; i < beforeStyle.length; i++) {
      checkedProps.add(beforeStyle.item(i));
    }
    for (let i = 0; i < afterStyle.length; i++) {
      checkedProps.add(afterStyle.item(i));
    }

    for (const prop of checkedProps) {
      const bVal = beforeStyle.getPropertyValue(prop);
      const aVal = afterStyle.getPropertyValue(prop);
      if (bVal !== aVal) {
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

