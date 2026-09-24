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
import { HTML_UA_STYLESHEET_TEXT } from '../data/gen/ua-stylesheet.ts';
import { SHORTHANDS } from '../shorthands.ts';
import { tokenize } from '../tokenizer.ts';
import { serialize } from '../serializer.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { INHERITED_PROPERTIES } from './types.ts';
import type { MatchedDeclaration } from './types.ts';
import { substituteVariables } from './variable-resolver.ts';
import { compareCascadeDeclarations } from './cascade-sorter.ts';
import type { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import type { CSSStyleRule } from '../CSSOM.ts';
import type { PropertyDefinition } from '../PropertyRegistry.ts';

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
  'stop-opacity': '1',
};

interface UaTagComputedDefaults {
  display?: string;
  fontSizeEm?: number;
  marginBlockRaw?: string;
  marginInlineRaw?: string;
  marginAllRaw?: string;
  margins?: Record<string, string>;
}

let cachedUaTagStyles: Map<string, UaTagComputedDefaults> | null = null;

function resolveUaLengthPx(raw: string, fontSizePx: number): string {
  const trimmed = raw.trim();
  if (trimmed.endsWith('em')) {
    const px = Number((parseFloat(trimmed) * fontSizePx).toFixed(3));
    return `${px}px`;
  }
  if (trimmed === '0') return '0px';
  return trimmed;
}

function getUaTagStyles(): Map<string, UaTagComputedDefaults> {
  if (cachedUaTagStyles) return cachedUaTagStyles;
  const map = new Map<string, UaTagComputedDefaults>();
  const rules = ParseHooks.consumeListOfRules(tokenize(HTML_UA_STYLESHEET_TEXT), true);

  for (const rule of rules) {
    const styleRule = rule as CSSStyleRule;
    if (!styleRule.selectorText || !styleRule.style) continue;
    const style = styleRule.style;
    const display = style.getPropertyValue('display');
    const fontSize = style.getPropertyValue('font-size');
    const marginTop = style.getPropertyValue('margin-top');
    const marginLeft = style.getPropertyValue('margin-left');
    const marginBlockStart = style.getPropertyValue('margin-block-start');
    const marginInlineStart = style.getPropertyValue('margin-inline-start');

    for (const rawSel of styleRule.selectorText.split(',')) {
      const tag = rawSel.trim().toUpperCase();
      if (!tag) continue;
      let entry = map.get(tag);
      if (!entry) {
        entry = {};
        map.set(tag, entry);
      }
      if (display && display !== 'none' && display !== 'contents') {
        entry.display = display === 'inline-block' || display === 'inline' ? display : 'block';
      }
      if (fontSize && fontSize.endsWith('em')) {
        entry.fontSizeEm = parseFloat(fontSize);
      }
      if (marginTop && marginLeft && marginTop === marginLeft && marginTop !== 'auto') {
        entry.marginAllRaw = marginTop;
      }
      if (marginBlockStart && marginBlockStart !== '0' && marginBlockStart !== 'auto') {
        entry.marginBlockRaw = marginBlockStart;
      }
      if (marginInlineStart && marginInlineStart !== 'auto') {
        entry.marginInlineRaw = marginInlineStart;
      }
    }
  }

  for (const entry of map.values()) {
    const fontSizePx = (entry.fontSizeEm ?? 1) * 16;
    if (entry.marginAllRaw) {
      const px = resolveUaLengthPx(entry.marginAllRaw, fontSizePx);
      entry.margins = {
        margin: px,
        'margin-top': px,
        'margin-bottom': px,
        'margin-left': px,
        'margin-right': px,
        'margin-block': px,
        'margin-block-start': px,
        'margin-block-end': px,
        'margin-inline': px,
        'margin-inline-start': px,
        'margin-inline-end': px,
      };
    } else if (entry.marginBlockRaw) {
      const blockPx = resolveUaLengthPx(entry.marginBlockRaw, fontSizePx);
      const inlinePx = entry.marginInlineRaw ? resolveUaLengthPx(entry.marginInlineRaw, fontSizePx) : '0px';
      const shorthand = `${blockPx} ${inlinePx}`;
      entry.margins = {
        margin: shorthand,
        'margin-block': shorthand,
        'margin-top': blockPx,
        'margin-bottom': blockPx,
        'margin-block-start': blockPx,
        'margin-block-end': blockPx,
        'margin-inline': inlinePx,
        'margin-left': inlinePx,
        'margin-right': inlinePx,
        'margin-inline-start': inlinePx,
        'margin-inline-end': inlinePx,
      };
    }
  }

  cachedUaTagStyles = map;
  return map;
}

export function getUaDefault(prop: string, element: unknown): string {
  const el = element as { tagName?: string; nodeName?: string };
  const tag = (el?.tagName || el?.nodeName || '').toUpperCase();
  const uaEntry = tag ? getUaTagStyles().get(tag) : undefined;

  if (uaEntry?.margins && prop in uaEntry.margins) {
    return uaEntry.margins[prop];
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
    return uaEntry?.display ?? 'inline';
  }
  return getInitialValue(prop, element);
}

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
  // svg2 § 13.2 #presentation-attributes
  if (isSvgElement(element)) {
    if (prop === 'baseline-shift') return 'baseline';
    if (prop === 'flood-color' || prop === 'lighting-color' || prop === 'stop-color' || prop === 'stroke') return '';
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

/**
 * Expands shorthands after variable substitution per CSS Cascade 5 § 7 and CSS Variables 1 § 3.
 */
export function expandShorthandWithVariables(
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
    // css-values-5 § 3.3 #attr-security: attr()-tainted values used in a <url> make declaration invalid at computed-value time
    if (res === null || (taintOut.tainted && (res.includes('url(') || res.includes('image-set(')))) {
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
 * css-cascade-5 § 6.2 #default, § 6.3 #revert-layer, § 6.3.3 #revert-rule-keyword
 * css-variables-1 § 3 #variables-in-shorthands
 */
export function processStandardDeclarations(
  matchedDeclarations: MatchedDeclaration[],
  resolvedCustomProps: Map<string, string>,
  cyclicProps: Set<string>,
  parentCascaded: CSSStyleDeclaration | null,
  element: unknown,
  taintedProps: Set<string> = new Set(),
  activeProperties?: Map<string, PropertyDefinition>
): Map<string, MatchedDeclaration> {
  const standardDeclarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    if (decl.name.startsWith('--')) continue;
    const expandedList = expandShorthandWithVariables(decl, resolvedCustomProps, cyclicProps, element, taintedProps, activeProperties);
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
        // css-variables-1 § 3.1: Invalid at computed-value time
        continue;
      }

      // css-values-5 § 3.3 #attr-security: attr()-tainted values used in a <url> make declaration invalid at computed-value time
      if (taintOut.tainted && (subVal.includes('url(') || subVal.includes('image-set('))) {
        continue;
      }

      if (/^\s*-?\d+(?:\.\d+)?(?:\s+|\/\*\*\/)(?:px|em|rem|%|vh|vw|ch|pt|cm|mm|in|pc|ex|cap|ic|lh|cqw|cqh)\s*$/i.test(subVal)) {
        continue;
      }

      const trimmedVal = subVal.trim();
      if (trimmedVal === 'revert-rule') {
        // css-cascade-5 § 6.3.3 #revert-rule-keyword
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
          // css-cascade-5 § 6.3.3 #revert-rule-keyword
          // W3C csswg-drafts #13916: Cycle between revert-rule !important and revert-layer resolves to unset
          const val = (INHERITED_PROPERTIES.has(prop) && parentCascaded)
            ? parentCascaded.getPropertyValue(prop)
            : getInitialValue(prop, element);
          winningDeclarations.set(prop, { ...decl, value: val });
          break;
        }
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
