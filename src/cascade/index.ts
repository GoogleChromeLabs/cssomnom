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

import { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import { tokenize } from '../tokenizer.ts';
import { serialize } from '../serializer.ts';
import { isElement } from '../matcher.ts';
import type { DOMElement } from '../matcher.ts';
import type { Token } from '../types.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from '../data/gen/LogicalMapping.ts';
import {
  COLOR_PROPERTIES,
  SVG_PRESENTATION_ATTRIBUTES,
  DEFAULT_PROPERTY_VALUES,
} from '../data/gen/cascade-data.ts';
import { NAMED_COLORS } from '../data/gen/colors.ts';
import { camelToDashed } from '../utils.ts';
import type { Rule, CSSRuleList, Declaration } from '../types.ts';

// Domain Modules
export * from './types.ts';
export * from './layer-manager.ts';
export * from './rule-filter.ts';
export * from './cascade-sorter.ts';
export * from './variable-resolver.ts';
export * from './color-resolver.ts';
export * from './value-processor.ts';

import { INHERITED_PROPERTIES } from './types.ts';
import { getLayerDeclarationOrder } from './layer-manager.ts';
import {
  collectStyleSheetsAndRules,
  collectMatchedDeclarations,
  collectSvgPresentationAttributes,
  collectInlineDeclarations,
} from './rule-filter.ts';
import { groupDeclarationsByProperty } from './cascade-sorter.ts';
import { resolveCustomProperties } from './variable-resolver.ts';
import {
  SYSTEM_COLORS,
  normalizeComputedColor,
  formatAlpha,
} from './color-resolver.ts';
import {
  getUaDefault,
  getInitialValue,
  processStandardDeclarations,
} from './value-processor.ts';

export const KNOWN_PSEUDO_ELEMENTS = new Set([
  'before',
  'after',
  'marker',
  'placeholder',
  'file-selector-button',
  'backdrop',
  'first-line',
  'first-letter',
  'grammar-error',
  'spelling-error',
  'view-transition',
  'cue',
  'selection',
  'target-text',
  'checkmark',
  'picker-icon',
]);

export const KNOWN_FUNCTIONAL_PSEUDO_ELEMENTS = new Set([
  'highlight',
  'picker',
  'view-transition-group',
  'view-transition-image-pair',
  'view-transition-old',
  'view-transition-new',
  'part',
  'slotted',
]);

export function normalizePseudoElement(pseudo: string): { valid: boolean; normalized: string; isKnown: boolean } | null {
  if (!pseudo.startsWith(':')) {
    return null;
  }

  const legacyAliases: Record<string, string> = {
    ':before': '::before',
    ':after': '::after',
    ':first-line': '::first-line',
    ':first-letter': '::first-letter',
  };

  const tokens = tokenize(pseudo);
  const nonEofTokens = tokens.filter(t => t.type !== 'EOF');

  const isColon = (t: Token | undefined) => t && (t.type === 'colon' || (t.type === 'delim' && t.value === ':'));

  if (pseudo.startsWith('::')) {
    if (nonEofTokens.length < 3) {
      return { valid: false, normalized: '', isKnown: false };
    }
    if (!isColon(nonEofTokens[0]) || !isColon(nonEofTokens[1])) {
      return { valid: false, normalized: '', isKnown: false };
    }

    const third = nonEofTokens[2];
    if (third.type === 'ident') {
      if (nonEofTokens.length !== 3) {
        return { valid: false, normalized: '', isKnown: false };
      }
      const name = third.value.toLowerCase();
      const isKnown = KNOWN_PSEUDO_ELEMENTS.has(name);
      return { valid: true, normalized: `::${name}`, isKnown };
    } else if (third.type === 'function') {
      const fnName = third.value.toLowerCase();
      const isKnown = KNOWN_FUNCTIONAL_PSEUDO_ELEMENTS.has(fnName);
      if (!isKnown) {
        return { valid: true, normalized: `::${fnName}()`, isKnown: false };
      }
      const lastToken = nonEofTokens[nonEofTokens.length - 1];
      const hasCloseParen = lastToken.type === ')';
      const argTokens = (hasCloseParen ? nonEofTokens.slice(3, -1) : nonEofTokens.slice(3))
        .filter(t => t.type !== 'whitespace' && t.type !== 'comment');
      if (argTokens.length !== 1 || argTokens[0].type !== 'ident') {
        return { valid: false, normalized: '', isKnown: false };
      }
      const identVal = argTokens[0].value.toLowerCase();
      if (fnName === 'picker' && identVal !== 'select') {
        return { valid: false, normalized: '', isKnown: false };
      }
      return { valid: true, normalized: `::${fnName}(${identVal})`, isKnown: true };
    }

    return { valid: false, normalized: '', isKnown: false };
  }

  // Single colon
  if (nonEofTokens.length === 2 && isColon(nonEofTokens[0]) && nonEofTokens[1].type === 'ident') {
    const ident = nonEofTokens[1].value.toLowerCase();
    const single = `:${ident}`;
    if (single in legacyAliases) {
      return { valid: true, normalized: legacyAliases[single], isKnown: true };
    }
  }

  return { valid: false, normalized: '', isKnown: false };
}

/**
 * Resolves the cascaded style statically for a DOM element according to CSS Cascade 5 and CSS Variables 1.
 * css-cascade-5 § 3 #cascading
 * css-cascade-5 § 6 #cascade-sort
 * css-cascade-5 § 7 #cascaded-values
 * css-variables-1 § 4 #resolving-var-functions
 */
export function getCascadedStyle(
  element: unknown,
  rules?: Rule[] | CSSRuleList,
  pseudoElement?: string | null
): CSSStyleDeclaration {
  if (!element || typeof element !== 'object') {
    return new CSSStyleDeclaration([], true);
  }

  let normalizedPseudoStr: string | null = null;
  if (typeof pseudoElement === 'string') {
    const parsedPseudo = normalizePseudoElement(pseudoElement);
    if (parsedPseudo === null) {
      normalizedPseudoStr = null;
    } else if (!parsedPseudo.valid || !parsedPseudo.isKnown) {
      const emptyDecl = new CSSComputedStyleDeclaration([], true, null, element);
      (emptyDecl as unknown as { _readonly: boolean })._readonly = true;
      return emptyDecl;
    } else {
      normalizedPseudoStr = parsedPseudo.normalized;
    }
  }

  // 1. Collect rule lists and stylesheets
  const ruleList = collectStyleSheetsAndRules(element, rules);
  if (ruleList === null) {
    return new CSSStyleDeclaration([], true);
  }

  // 2. Discover @layer ordering (CSS Cascade 5 § 6.4 #layer-ordering)
  const layerDeclarationOrder = getLayerDeclarationOrder(ruleList);

  // 3. Collect matched declarations from stylesheet rules
  const { matchedDeclarations, sourceOrderCounter } = collectMatchedDeclarations(
    element,
    ruleList,
    layerDeclarationOrder,
    normalizedPseudoStr
  );

  if (!normalizedPseudoStr) {
    // 4. Collect SVG presentation attributes
    const svgDecls = collectSvgPresentationAttributes(element, matchedDeclarations.length);
    matchedDeclarations.push(...svgDecls);

    // 5. Collect inline styles
    const { declarations: inlineDecls } = collectInlineDeclarations(element, sourceOrderCounter);
    matchedDeclarations.push(...inlineDecls);
  }

  // 6. Group declarations by property
  const declarationsByProperty = groupDeclarationsByProperty(matchedDeclarations);

  // 7. Resolve logical property context (writing-mode, direction, text-orientation)
  let writingMode = 'horizontal-tb';
  let direction = 'ltr';
  let textOrientation = 'mixed';

  const elWithParent = element as { parentElement?: DOMElement | null; parentNode?: DOMElement | null };
  const parentNode = elWithParent.parentElement || (elWithParent.parentNode && isElement(elWithParent.parentNode) ? elWithParent.parentNode : null);
  const rootNode = (element as { ownerDocument?: { documentElement?: DOMElement | null } }).ownerDocument?.documentElement;
  const parentCascaded = parentNode ? getCascadedStyle(parentNode, rules) : null;

  if (parentCascaded) {
    const pWm = parentCascaded.getPropertyValue('writing-mode');
    if (pWm) writingMode = pWm;
    const pDir = parentCascaded.getPropertyValue('direction');
    if (pDir) direction = pDir;
    const pTo = parentCascaded.getPropertyValue('text-orientation');
    if (pTo) textOrientation = pTo;
  }

  const wmWinner = declarationsByProperty.get('writing-mode')?.at(-1);
  if (wmWinner) writingMode = wmWinner.value;

  const dirWinner = declarationsByProperty.get('direction')?.at(-1);
  if (dirWinner) direction = dirWinner.value;

  const toWinner = declarationsByProperty.get('text-orientation')?.at(-1);
  if (toWinner) textOrientation = toWinner.value;

  if (textOrientation === 'upright' && (writingMode === 'vertical-rl' || writingMode === 'vertical-lr')) {
    direction = 'ltr';
  }

  // 8. Collect raw inherited and local custom properties
  const rawCustomProps = new Map<string, string>();

  if (parentCascaded) {
    for (let i = 0; i < parentCascaded.length; i++) {
      const name = parentCascaded.item(i);
      if (name.startsWith('--')) {
        rawCustomProps.set(name, parentCascaded.getPropertyValue(name));
      }
    }
  } else if (rootNode && rootNode !== element) {
    const rootCascaded = getCascadedStyle(rootNode, rules);
    for (let i = 0; i < rootCascaded.length; i++) {
      const name = rootCascaded.item(i);
      if (name.startsWith('--')) {
        rawCustomProps.set(name, rootCascaded.getPropertyValue(name));
      }
    }
  }

  for (const [prop, decls] of declarationsByProperty) {
    if (prop.startsWith('--') && decls.length > 0) {
      const lastDecl = decls[decls.length - 1];
      const rawVal = (lastDecl.raw && !lastDecl.raw.includes('var('))
        ? lastDecl.raw
        : (typeof lastDecl.value === 'string' ? lastDecl.value : serialize(lastDecl.value, true));
      rawCustomProps.set(prop, rawVal);
    }
  }

  // 9. Resolve custom properties (CSS Variables 1 § 3, § 4)
  const { resolvedCustomProps, cyclicProps } = resolveCustomProperties(
    declarationsByProperty,
    rawCustomProps,
    parentCascaded
  );

  // 10. Resolve standard properties and shorthands
  const winningDeclarations = processStandardDeclarations(
    matchedDeclarations,
    resolvedCustomProps,
    cyclicProps,
    parentCascaded,
    element
  );

  // 11. Map declarations into final CSSComputedStyleDeclaration
  const finalDeclarations: Declaration[] = [];

  for (const [name, decl] of winningDeclarations) {
    const mappedName = resolveLogicalProperty(name, writingMode, direction);
    const finalValue = COLOR_PROPERTIES.has(mappedName) ? normalizeComputedColor(decl.value) : decl.value;

    finalDeclarations.push({
      type: 'declaration',
      name: mappedName,
      value: tokenize(finalValue),
      important: decl.important,
    });

    if (mappedName !== name) {
      finalDeclarations.push({
        type: 'declaration',
        name,
        value: tokenize(finalValue),
        important: decl.important,
      });
    }
  }

  // Ensure resolved non-empty custom properties are present in finalDeclarations
  for (const [customProp, customVal] of resolvedCustomProps) {
    if (customVal !== '') {
      finalDeclarations.push({
        type: 'declaration',
        name: customProp,
        value: tokenize(customVal),
        important: false,
        raw: customVal,
      });
    }
  }

  const resultStyle = new CSSComputedStyleDeclaration(finalDeclarations, false, parentCascaded, element);

  // Sync logical properties
  if (finalDeclarations.length > 0) {
    for (const logical in LOGICAL_MAPPING) {
      const mapped = resolveLogicalProperty(logical, writingMode, direction);
      const decl = finalDeclarations.find(d => d.name === mapped);
      if (decl && !resultStyle.getPropertyValue(logical)) {
        resultStyle.setProperty(logical, decl.value.length ? serialize(decl.value) : decl.raw || '');
      }
    }
  }

  (resultStyle as unknown as { _readonly: boolean })._readonly = true;

  return resultStyle;
}

export function shouldPreserveAutoMinSize(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const el = element as {
    getAttribute?: (attr: string) => string | null;
    parentElement?: unknown;
    parentNode?: unknown;
  };

  // 1. Check if element or any ancestor is display: none (no box generated)
  let curr: unknown = element;
  while (curr && typeof curr === 'object') {
    const currEl = curr as {
      parentElement?: unknown;
      parentNode?: unknown;
      getAttribute?: (attr: string) => string | null;
    };
    const styleAttr = currEl.getAttribute ? currEl.getAttribute('style') : null;
    if (styleAttr && /display\s*:\s*none\b/i.test(styleAttr)) {
      return false;
    }
    curr = currEl.parentElement || currEl.parentNode;
  }

  // 2. Check if element has non-default aspect-ratio (not 'auto')
  const styleAttr = el.getAttribute ? el.getAttribute('style') : null;
  if (styleAttr && /aspect-ratio\s*:/i.test(styleAttr)) {
    const match = styleAttr.match(/aspect-ratio\s*:\s*([^;]+)/i);
    if (match) {
      const val = match[1].trim().toLowerCase();
      if (val !== 'auto' && val !== '') {
        return true;
      }
    }
  }

  // 3. Check if parent is flex or grid container
  const parent = el.parentElement || el.parentNode;
  if (parent && typeof parent === 'object') {
    const parentEl = parent as {
      getAttribute?: (attr: string) => string | null;
    };
    const pStyle = parentEl.getAttribute ? parentEl.getAttribute('style') : null;
    if (pStyle) {
      if (/display\s*:\s*(?:inline-)?(?:flex|grid)\b/i.test(pStyle)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * CSSComputedStyleDeclaration represents the resolved/computed style declaration of a DOM element.
 * cssom-1 § 6.8 #resolved-values
 * css-cascade-5 § 7.2 #computed-values
 */
export class CSSComputedStyleDeclaration extends CSSStyleDeclaration {
  private _parentStyle: CSSStyleDeclaration | null;
  private _element: unknown;

  constructor(
    declarations: Declaration[] = [],
    readonlyFlag: boolean = false,
    parentStyle: CSSStyleDeclaration | null = null,
    element: unknown = null
  ) {
    super(declarations, readonlyFlag);
    this._parentStyle = parentStyle;
    this._element = element;
  }

  override get cssText(): string {
    return '';
  }

  override getPropertyValue(property: string): string {
    const isCustom = property.startsWith('--');
    if (isCustom) {
      const decl = this._declarations.find(d => d.name === property);
      if (!decl) return '';
      if (decl.raw !== undefined) {
        const trimmed = decl.raw.trim();
        return trimmed === '' ? ' ' : trimmed;
      }
      const ser = serialize(decl.value, true).trim();
      return ser === '' ? ' ' : ser;
    }
    const dashed = camelToDashed(property).toLowerCase();
    if (dashed !== 'writing-mode' && dashed !== 'direction' && dashed in LOGICAL_MAPPING) {
      const wm = super.getPropertyValue('writing-mode') || 'horizontal-tb';
      const dir = super.getPropertyValue('direction') || 'ltr';
      const resolvedPhysical = resolveLogicalProperty(dashed, wm, dir);
      if (resolvedPhysical !== dashed) {
        return this.getPropertyValue(resolvedPhysical);
      }
    }
    if (dashed === 'background') {
      const color = this.getPropertyValue('background-color') || 'rgba(0, 0, 0, 0)';
      const image = this.getPropertyValue('background-image') || 'none';
      const repeat = this.getPropertyValue('background-repeat') || 'repeat';
      const attachment = this.getPropertyValue('background-attachment') || 'scroll';
      const position = this.getPropertyValue('background-position') || '0% 0%';
      const size = this.getPropertyValue('background-size') || 'auto';
      const origin = this.getPropertyValue('background-origin') || 'padding-box';
      const clip = this.getPropertyValue('background-clip') || 'border-box';
      return `${color} ${image} ${repeat} ${attachment} ${position} / ${size} ${origin} ${clip}`;
    }
    const rawVal = super.getPropertyValue(dashed);

    if (dashed === 'min-width' || dashed === 'min-height') {
      if (rawVal === 'auto' || rawVal === '') {
        if (shouldPreserveAutoMinSize(this._element)) {
          return 'auto';
        }
        return '0px';
      }
    }

    if (rawVal) {
      const lowerRaw = rawVal.trim().toLowerCase();
      // css-cascade-5 § 7.3.2 #inherit
      if (lowerRaw === 'inherit') {
        if (this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 7.3.1 #initial
      if (lowerRaw === 'initial') {
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 7.3.3 #unset
      if (lowerRaw === 'unset') {
        if (INHERITED_PROPERTIES.has(dashed) && this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 6.2 #default
      if (lowerRaw === 'revert' || lowerRaw === 'revert-layer' || lowerRaw === 'revert-rule') {
        if (INHERITED_PROPERTIES.has(dashed) && this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getUaDefault(dashed, this._element);
      }
      if (dashed === 'box-shadow') {
        const tokens = rawVal.split(/\s+/);
        const normalizedTokens = tokens.map(t => {
          const lower = t.toLowerCase();
          if (lower in SYSTEM_COLORS) {
            const [r, g, b] = SYSTEM_COLORS[lower];
            return `rgb(${r}, ${g}, ${b})`;
          }
          if (lower in NAMED_COLORS) {
            const [r, g, b, a] = NAMED_COLORS[lower];
            if (a !== undefined && a < 1) return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
            return `rgb(${r}, ${g}, ${b})`;
          }
          return t;
        });
        const colorToken = normalizedTokens.find(t => t.startsWith('rgb'));
        const otherTokens = normalizedTokens.filter(t => !t.startsWith('rgb'));
        if (colorToken) {
          return `${colorToken} ${otherTokens.join(' ')}`;
        }
        return normalizedTokens.join(' ');
      }
      if (COLOR_PROPERTIES.has(dashed)) {
        return normalizeComputedColor(rawVal);
      }
      return rawVal;
    }

    if (this._parentStyle && INHERITED_PROPERTIES.has(dashed)) {
      const parentVal = this._parentStyle.getPropertyValue(dashed);
      if (parentVal) {
        return parentVal;
      }
    }

    if (this._element && (dashed === 'display' || dashed === 'margin')) {
      const el = this._element as { tagName?: string; nodeName?: string };
      const tag = (el?.tagName || el?.nodeName || '').toUpperCase();
      if (tag) {
        return getUaDefault(dashed, this._element);
      }
    }

    if (dashed === 'color') return 'rgb(0, 0, 0)';
    if (dashed === 'background-color') return 'rgba(0, 0, 0, 0)';
    if (SVG_PRESENTATION_ATTRIBUTES.has(dashed)) {
      return DEFAULT_PROPERTY_VALUES[dashed] ?? '';
    }

    return '';
  }
}
