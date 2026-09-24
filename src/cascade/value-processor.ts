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

import { DEFAULT_PROPERTY_VALUES, BLOCK_TAGS } from '../data/gen/cascade-data.ts';
import { SHORTHANDS } from '../shorthands.ts';
import { tokenize } from '../tokenizer.ts';
import { serialize } from '../serializer.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { INHERITED_PROPERTIES } from './types.ts';
import type { MatchedDeclaration } from './types.ts';
import { substituteVariables } from './variable-resolver.ts';
import { compareCascadeDeclarations } from './cascade-sorter.ts';
import type { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';

const EXTRA_INITIAL_VALUES: Record<string, string> = {
  '-webkit-mask-box-image-outset': '0',
  '-webkit-mask-box-image-repeat': 'stretch',
  '-webkit-mask-box-image-slice': '0 fill',
  '-webkit-mask-box-image-source': 'none',
  '-webkit-mask-box-image-width': 'auto',
  '-webkit-text-fill-color': 'currentcolor',
  '-webkit-text-stroke-color': 'currentcolor',
  '-webkit-text-stroke-width': '0px',
  'background-tbd': 'none',
  'font-presentation': 'auto',
};

export function getUaDefault(prop: string, element: unknown): string {
  const el = element as { tagName?: string; nodeName?: string };
  const tag = (el?.tagName || el?.nodeName || '').toUpperCase();

  // html § 15.3.4 #flow-content-3, html § 15.3.3 #phrasing-content-3, css-cascade-5 § 6.2 #default
  // Standard HTML UA default margins for headings, paragraphs, blockquotes, and body
  if (tag === 'H1') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '21.44px'; // 0.67em of 32px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '21.44px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'H2') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '19.92px'; // 0.83em of 24px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '19.92px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'H3') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '18.72px'; // 1em of 18.72px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '18.72px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'H4') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '21.28px'; // 1.33em of 16px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '21.28px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'H5') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '22.176px'; // 1.67em of 13.28px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '22.176px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'H6') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '24.971px'; // 2.33em of 10.72px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '24.971px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'P') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '16px'; // 1em of 16px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '0px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '16px 0px';
    }
    if (prop === 'margin-inline') {
      return '0px';
    }
  } else if (tag === 'BLOCKQUOTE') {
    if (prop === 'margin-top' || prop === 'margin-block-start' || prop === 'margin-bottom' || prop === 'margin-block-end') {
      return '16px'; // 1em of 16px font-size
    }
    if (prop === 'margin-left' || prop === 'margin-inline-start' || prop === 'margin-right' || prop === 'margin-inline-end') {
      return '40px';
    }
    if (prop === 'margin' || prop === 'margin-block') {
      return '16px 40px';
    }
    if (prop === 'margin-inline') {
      return '40px';
    }
  } else if (tag === 'BODY') {
    if (
      prop === 'margin' || prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-left' || prop === 'margin-right' ||
      prop === 'margin-block-start' || prop === 'margin-block-end' || prop === 'margin-inline-start' || prop === 'margin-inline-end' ||
      prop === 'margin-block' || prop === 'margin-inline'
    ) {
      return '8px';
    }
  }

  if (prop === 'margin') {
    return '0px';
  }
  if (
    prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-left' || prop === 'margin-right' ||
    prop === 'margin-block-start' || prop === 'margin-block-end' || prop === 'margin-inline-start' || prop === 'margin-inline-end'
  ) {
    return '';
  }
  if (prop === 'display') {
    return BLOCK_TAGS.has(tag) ? 'block' : 'inline';
  }
  const val = DEFAULT_PROPERTY_VALUES[prop] || EXTRA_INITIAL_VALUES[prop];
  if (val !== undefined && val !== '') return val;
  if (prop.startsWith('-webkit-')) {
    const unPrefixed = prop.slice(8);
    const unPrefixedVal = DEFAULT_PROPERTY_VALUES[unPrefixed] || EXTRA_INITIAL_VALUES[unPrefixed];
    if (unPrefixedVal !== undefined && unPrefixedVal !== '') return unPrefixedVal;
  }
  return '';
}

export function getInitialValue(prop: string, _element: unknown): string {
  const val = DEFAULT_PROPERTY_VALUES[prop] || EXTRA_INITIAL_VALUES[prop];
  if (val !== undefined && val !== '') return val;
  if (prop.startsWith('-webkit-')) {
    const unPrefixed = prop.slice(8);
    const unPrefixedVal = DEFAULT_PROPERTY_VALUES[unPrefixed] || EXTRA_INITIAL_VALUES[unPrefixed];
    if (unPrefixedVal !== undefined && unPrefixedVal !== '') return unPrefixedVal;
  }
  return '';
}

/**
 * Expands shorthands after variable substitution per CSS Cascade 5 § 7 and CSS Variables 1 § 3.
 */
export function expandShorthandWithVariables(
  decl: MatchedDeclaration,
  resolvedCustomProps: Map<string, string>,
  cyclicProps: Set<string>
): MatchedDeclaration[] {
  const shorthand = SHORTHANDS[decl.name.toLowerCase()];
  if (!shorthand) {
    return [decl];
  }

  let subVal = decl.value;
  if (subVal.includes('var(') || subVal.includes('env(')) {
    const res = substituteVariables(subVal, resolvedCustomProps, new Set(), cyclicProps);
    if (res === null) {
      // css-variables-1 § 3.1: Invalid at computed-value time
      // When a shorthand contains an invalid var(), each longhand is invalid at computed-value time
      // and reverts to its initial value (e.g. 0px for margin).
      const results: MatchedDeclaration[] = [];
      for (const lh of shorthand.longhands) {
        results.push({
          ...decl,
          name: lh,
          value: 'initial',
        });
      }
      return results;
    }
    subVal = res;
  }

  const trimmed = subVal.trim().toLowerCase();
  const isCSSWide = ['revert', 'revert-layer', 'revert-rule', 'initial', 'inherit', 'unset'].includes(trimmed);

  if (isCSSWide) {
    const results: MatchedDeclaration[] = [];
    for (const lh of shorthand.longhands) {
      const subShorthand = SHORTHANDS[lh];
      if (subShorthand) {
        results.push(...expandShorthandWithVariables({
          ...decl,
          name: lh,
          value: subVal,
        }, resolvedCustomProps, cyclicProps));
      } else {
        results.push({
          ...decl,
          name: lh,
          value: subVal,
        });
      }
    }
    return results;
  }

  const tokens = tokenize(subVal);
  const compValues = ParseHooks.parseComponentValues(tokens);
  const expanded = shorthand.expand(compValues);
  if (expanded) {
    const results: MatchedDeclaration[] = [];
    for (const [lh, val] of Object.entries(expanded)) {
      const subShorthand = SHORTHANDS[lh];
      const valStr = serialize(val).trim();
      if (subShorthand) {
        results.push(...expandShorthandWithVariables({
          ...decl,
          name: lh,
          value: valStr,
        }, resolvedCustomProps, cyclicProps));
      } else {
        results.push({
          ...decl,
          name: lh,
          value: valStr,
        });
      }
    }
    return results;
  }

  return [{
    ...decl,
    value: subVal,
  }];
}

/**
 * Resolves winning standard property declarations, CSS-wide keyword rollbacks, and shorthands.
 * css-cascade-5 § 6.2 #default, § 6.3 #revert-layer, § 6.3.3 #revert-rule-keyword
 * css-variables-1 § 3 #variables-in-shorthands
 */
export function processStandardDeclarations(
  matchedDeclarations: MatchedDeclaration[],
  resolvedCustomProps: Map<string, string>,
  cyclicProps: Set<string>,
  parentCascaded: CSSStyleDeclaration | null,
  element: unknown
): Map<string, MatchedDeclaration> {
  const standardDeclarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    if (decl.name.startsWith('--')) continue;
    const expandedList = expandShorthandWithVariables(decl, resolvedCustomProps, cyclicProps);
    for (const expDecl of expandedList) {
      const key = expDecl.name.toLowerCase();
      if (!standardDeclarationsByProperty.has(key)) {
        standardDeclarationsByProperty.set(key, []);
      }
      standardDeclarationsByProperty.get(key)!.push(expDecl);
    }
  }

  const winningDeclarations = new Map<string, MatchedDeclaration>();

  for (const [prop, decls] of standardDeclarationsByProperty) {
    if (prop.startsWith('--')) continue;
    decls.sort(compareCascadeDeclarations);

    for (let i = decls.length - 1; i >= 0; i--) {
      const decl = decls[i];
      const subVal = substituteVariables(decl.value, resolvedCustomProps, new Set(), cyclicProps);
      if (subVal === null) {
        // css-variables-1 § 3.1: Invalid at computed-value time
        continue;
      }

      if (/^\s*-?\d+(?:\.\d+)?(?:\s+|\/\*\*\/)(?:px|em|rem|%|vh|vw|ch|pt|cm|mm|in|pc|ex|cap|ic|lh|cqw|cqh)\s*$/i.test(subVal)) {
        continue;
      }

      const trimmedVal = subVal.trim();
      if (trimmedVal === 'revert-rule') {
        continue;
      }
      if (trimmedVal === 'revert-layer') {
        let prevIdx = i - 1;
        while (prevIdx >= 0 && decls[prevIdx].layerOrder >= decl.layerOrder) {
          prevIdx--;
        }
        if (prevIdx >= 0) {
          i = prevIdx + 1;
          continue;
        } else {
          const ua = getUaDefault(prop, element);
          const val = ua || ((parentCascaded && INHERITED_PROPERTIES.has(prop))
            ? parentCascaded.getPropertyValue(prop)
            : getInitialValue(prop, element));
          winningDeclarations.set(prop, { ...decl, value: val });
          break;
        }
      }
      if (trimmedVal === 'revert') {
        const ua = getUaDefault(prop, element);
        const val = ua || ((parentCascaded && INHERITED_PROPERTIES.has(prop))
          ? parentCascaded.getPropertyValue(prop)
          : getInitialValue(prop, element));
        winningDeclarations.set(prop, { ...decl, value: val });
        break;
      }
      if (trimmedVal === 'initial') {
        const val = getInitialValue(prop, element);
        winningDeclarations.set(prop, { ...decl, value: val });
        break;
      }
      if (trimmedVal === 'inherit') {
        const val = parentCascaded ? parentCascaded.getPropertyValue(prop) : getInitialValue(prop, element);
        winningDeclarations.set(prop, { ...decl, value: val });
        break;
      }
      if (trimmedVal === 'unset') {
        const val = (INHERITED_PROPERTIES.has(prop) && parentCascaded)
          ? parentCascaded.getPropertyValue(prop)
          : getInitialValue(prop, element);
        winningDeclarations.set(prop, { ...decl, value: val });
        break;
      }

      const finalVal = !prop.startsWith('--') ? subVal.replace(/\/\*\*\//g, ' ') : subVal;
      winningDeclarations.set(prop, { ...decl, value: finalVal });
      break;
    }
  }

  return winningDeclarations;
}
