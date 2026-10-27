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

import { DEFAULT_PROPERTY_VALUES } from '../data/gen/cascade-data.ts';
import { SHORTHANDS } from '../shorthands.ts';
import { tokenize } from '../tokenizer.ts';
import { serialize } from '../serializer.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { INHERITED_PROPERTIES } from './types.ts';
import type { MatchedDeclaration } from './types.ts';
import { substituteVariables } from './variable-resolver.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from '../data/gen/LogicalMapping.ts';
import { compareCascadeDeclarations } from './cascade-sorter.ts';
import type { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import '../parser.ts';
import type { PropertyDefinition } from '../PropertyRegistry.ts';

export function isSvgElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const el = element as {
    namespaceURI?: string | null;
    ownerSVGElement?: unknown;
    tagName?: string;
    nodeName?: string;
    parentElement?: { tagName?: string; nodeName?: string; namespaceURI?: string | null };
  };
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') return true;
  if (el.ownerSVGElement !== undefined && el.ownerSVGElement !== null) return true;
  const tag = (el.tagName || el.nodeName || '').toLowerCase();
  const SVG_TAGS = new Set([
    'svg', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'path', 'text', 'tspan', 'g', 'symbol', 'defs', 'marker',
    'lineargradient', 'radialgradient', 'pattern', 'clippath', 'mask',
    'filter', 'image', 'use', 'stop', 'foreignobject',
  ]);
  if (SVG_TAGS.has(tag)) return true;
  if (el.parentElement) {
    const parentTag = (el.parentElement.tagName || el.parentElement.nodeName || '').toLowerCase();
    if (SVG_TAGS.has(parentTag) || el.parentElement.namespaceURI === 'http://www.w3.org/2000/svg') return true;
  }
  return false;
}

export function getInitialValue(prop: string, element: unknown): string {
  // svg2 #presentation-attributes
  if (isSvgElement(element)) {
    if (prop === 'baseline-shift') return 'baseline';
    if (prop === 'flood-color' || prop === 'lighting-color' || prop === 'stop-color' || prop === 'stroke') return '';
  }
  const val = DEFAULT_PROPERTY_VALUES[prop];
  if (val !== undefined && val !== '') return val;
  if (prop.startsWith('-webkit-')) {
    const unPrefixed = prop.slice(8);
    const unPrefixedVal = DEFAULT_PROPERTY_VALUES[unPrefixed];
    if (unPrefixedVal !== undefined && unPrefixedVal !== '') return unPrefixedVal;
  }
  return '';
}

/**
 * Expands shorthands after variable substitution per css-cascade-5 #shorthand and css-variables-1 #using-variables.
 */
function expandShorthandWithVariables(
  decl: MatchedDeclaration,
  resolvedCustomProps: Map<string, string>,
  cyclicProps: Set<string>,
  element?: unknown,
  taintedProps: Set<string> = new Set(),
  activeProperties?: Map<string, PropertyDefinition>
): MatchedDeclaration[] {
  const shorthand = SHORTHANDS[decl.name.toLowerCase()];
  if (!shorthand) {
    return [decl];
  }

  let subVal = decl.value;
  if (
    subVal.includes('var(') ||
    subVal.includes('env(') ||
    subVal.includes('attr(') ||
    subVal.includes('ident(') ||
    subVal.includes('if(') ||
    subVal.includes('random-item(')
  ) {
    const taintOut = { tainted: false };
    const res = substituteVariables(subVal, resolvedCustomProps, new Set(), cyclicProps, element, taintedProps, taintOut, activeProperties);
    // css-values-5 #attr-security: attr()-tainted values used in a <url> make declaration invalid at computed-value time
    if (res === null || (taintOut.tainted && (res.includes('url(') || res.includes('image-set(')))) {
      // css-variables-1 #using-variables: invalid at computed-value time
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
        }, resolvedCustomProps, cyclicProps, element, taintedProps, activeProperties));
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
        }, resolvedCustomProps, cyclicProps, element, taintedProps, activeProperties));
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
 * css-cascade-5 #default, #revert-layer, #revert-rule-keyword
 * css-cascade-5 #shorthand
 */
export function processStandardDeclarations(
  matchedDeclarations: MatchedDeclaration[],
  resolvedCustomProps: Map<string, string>,
  cyclicProps: Set<string>,
  parentCascaded: CSSStyleDeclaration | null,
  element: unknown,
  taintedProps: Set<string> = new Set(),
  activeProperties?: Map<string, PropertyDefinition>,
  writingMode: string = 'horizontal-tb',
  direction: string = 'ltr'
): Map<string, MatchedDeclaration> {
  const standardDeclarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    if (decl.name.startsWith('--')) continue;
    const expandedList = expandShorthandWithVariables(decl, resolvedCustomProps, cyclicProps, element, taintedProps, activeProperties);
    for (const expDecl of expandedList) {
      const key = expDecl.name.toLowerCase();
      // css-logical-1 #box: Corresponding flow-relative and physical properties share a computed value
      // determined by cascading declarations of both properties together as one.
      const targetProp = key in LOGICAL_MAPPING ? resolveLogicalProperty(key, writingMode, direction).toLowerCase() : key;
      if (!standardDeclarationsByProperty.has(targetProp)) {
        standardDeclarationsByProperty.set(targetProp, []);
      }
      standardDeclarationsByProperty.get(targetProp)!.push(expDecl);
    }
  }

  const winningDeclarations = new Map<string, MatchedDeclaration>();

  for (const [prop, decls] of standardDeclarationsByProperty) {
    if (prop.startsWith('--')) continue;
    decls.sort(compareCascadeDeclarations);

    const revertingRuleIds = new Set<number>();
    let hasImportantRevertRule = false;

    for (let i = decls.length - 1; i >= 0; i--) {
      const decl = decls[i];
      if (decl.ruleId !== undefined && revertingRuleIds.has(decl.ruleId)) {
        continue;
      }
      const taintOut = { tainted: false };
      const subVal = substituteVariables(decl.value, resolvedCustomProps, new Set(), cyclicProps, element, taintedProps, taintOut, activeProperties);
      if (subVal === null) {
        // css-variables-1 #using-variables: invalid at computed-value time
        continue;
      }

      // css-values-5 #attr-security: attr()-tainted values used in a <url> make declaration invalid at computed-value time
      if (taintOut.tainted && (subVal.includes('url(') || subVal.includes('image-set('))) {
        continue;
      }

      if (/^\s*-?\d+(?:\.\d+)?(?:\s+|\/\*\*\/)(?:px|em|rem|%|vh|vw|ch|pt|cm|mm|in|pc|ex|cap|ic|lh|cqw|cqh)\s*$/i.test(subVal)) {
        continue;
      }

      const trimmedVal = subVal.trim();
      if (trimmedVal === 'revert-rule') {
        // css-cascade-5 #revert-rule-keyword
        if (decl.important) {
          hasImportantRevertRule = true;
        }
        if (decl.ruleId !== undefined) {
          revertingRuleIds.add(decl.ruleId);
        }
        continue;
      }
      if (trimmedVal === 'revert-layer') {
        if (hasImportantRevertRule) {
          // css-cascade-5 #revert-rule-keyword
          // W3C csswg-drafts #13916: Cycle between revert-rule !important and revert-layer resolves to unset
          const val = (INHERITED_PROPERTIES.has(prop) && parentCascaded)
            ? parentCascaded.getPropertyValue(prop)
            : getInitialValue(prop, element);
          winningDeclarations.set(prop, { ...decl, value: val });
          break;
        }
        // css-cascade-5 #revert-layer: rolls back to earlier cascade layer
        let prevIdx = i - 1;
        while (
          prevIdx >= 0 &&
          decls[prevIdx].isInline === decl.isInline &&
          decls[prevIdx].layerOrder === decl.layerOrder &&
          decls[prevIdx].important === decl.important
        ) {
          prevIdx--;
        }
        if (prevIdx >= 0) {
          i = prevIdx + 1;
          continue;
        } else {
          // If no earlier layer in the current origin, roll back to previous origin
          const currOrigin = decl.origin || 'author';
          let originIdx = i - 1;
          while (originIdx >= 0 && (decls[originIdx].origin || 'author') === currOrigin) {
            originIdx--;
          }
          if (originIdx >= 0) {
            i = originIdx + 1;
            continue;
          }
          const val = (INHERITED_PROPERTIES.has(prop) && parentCascaded)
            ? parentCascaded.getPropertyValue(prop)
            : getInitialValue(prop, element);
          winningDeclarations.set(prop, { ...decl, value: val });
          break;
        }
      }
      if (trimmedVal === 'revert') {
        // css-cascade-5 #default: rolls back the cascaded value to the earlier origin
        const currOrigin = decl.origin || 'author';
        let prevOriginIdx = i - 1;
        while (prevOriginIdx >= 0 && (decls[prevOriginIdx].origin || 'author') === currOrigin) {
          prevOriginIdx--;
        }
        if (prevOriginIdx >= 0) {
          i = prevOriginIdx + 1;
          continue;
        }
        // If at user-agent origin or no earlier origin declaration, behaves as unset
        const val = (INHERITED_PROPERTIES.has(prop) && parentCascaded)
          ? parentCascaded.getPropertyValue(prop)
          : getInitialValue(prop, element);
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
