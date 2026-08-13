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

export function getUaDefault(prop: string, element: unknown): string {
  const el = element as { tagName?: string; nodeName?: string };
  const tag = (el?.tagName || el?.nodeName || '').toUpperCase();

  if (prop === 'margin' || prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-left' || prop === 'margin-right') {
    return tag === 'BODY' ? '8px' : '0px';
  }
  if (prop === 'display') {
    return BLOCK_TAGS.has(tag) ? 'block' : 'inline';
  }
  return DEFAULT_PROPERTY_VALUES[prop] ?? '';
}

export function getInitialValue(prop: string, _element: unknown): string {
  return DEFAULT_PROPERTY_VALUES[prop] ?? '';
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
      return [];
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

      if (/^\s*-?\d+(?:\.\d+)?\s+(?:px|em|rem|%|vh|vw|ch|pt|cm|mm|in|pc|ex|cap|ic|lh|cqw|cqh)\s*$/i.test(subVal)) {
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
          const val = (parentCascaded && INHERITED_PROPERTIES.has(prop))
            ? parentCascaded.getPropertyValue(prop)
            : getUaDefault(prop, element);
          winningDeclarations.set(prop, { ...decl, value: val });
          break;
        }
      }
      if (trimmedVal === 'revert') {
        const val = (parentCascaded && INHERITED_PROPERTIES.has(prop))
          ? parentCascaded.getPropertyValue(prop)
          : getUaDefault(prop, element);
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

      winningDeclarations.set(prop, { ...decl, value: subVal });
      break;
    }
  }

  return winningDeclarations;
}
