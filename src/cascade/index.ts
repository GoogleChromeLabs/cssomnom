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
import type { Token } from '../types.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from '../data/gen/LogicalMapping.ts';
import { COLOR_PROPERTIES } from '../data/gen/cascade-data.ts';
import type { Rule, CSSRuleList, Declaration, InternalStyleDeclaration, ElementLike } from '../types.ts';

// Domain Modules
export * from './types.ts';
export * from './layer-manager.ts';
export * from './rule-filter.ts';
export * from './cascade-sorter.ts';
export * from './variable-resolver.ts';
export * from './color-resolver.ts';
export * from './value-processor.ts';
export * from './computed-style.ts';
export * from './at-rule-manager.ts';

import { getLayerDeclarationOrder, resolveMediaEnvironment } from './layer-manager.ts';
import { collectActiveAtRules } from './at-rule-manager.ts';
import {
  collectStyleSheetsAndRules,
  collectMatchedDeclarations,
  collectSvgPresentationAttributes,
  collectInlineDeclarations,
} from './rule-filter.ts';
import { groupDeclarationsByProperty } from './cascade-sorter.ts';
import { resolveCustomProperties } from './variable-resolver.ts';
import { normalizeComputedColor } from './color-resolver.ts';
import { processStandardDeclarations, isSvgElement } from './value-processor.ts';
import { CSSComputedStyleDeclaration } from './computed-style.ts';

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
  element?: ElementLike | null,
  rules?: Rule[] | CSSRuleList,
  pseudoElement?: string | null
): CSSStyleDeclaration {
  if (!element || typeof element !== 'object') {
    return new CSSStyleDeclaration([], true);
  }

  let normalizedPseudoStr: string | null = null;
  if (typeof pseudoElement === 'string' && pseudoElement !== '') {
    if (!pseudoElement.startsWith(':')) {
      // Per CSSOM & WPT getComputedStyle-pseudo.html: strings lacking leading ':' are ignored
      normalizedPseudoStr = null;
    } else {
      const parsedPseudo = normalizePseudoElement(pseudoElement);
      if (!parsedPseudo || !parsedPseudo.valid || !parsedPseudo.isKnown) {
        return new CSSComputedStyleDeclaration([], true, null, element, null);
      }
      normalizedPseudoStr = parsedPseudo.normalized;
    }
  }

  // 1. Collect rule lists and stylesheets
  const ruleList = collectStyleSheetsAndRules(element, rules);
  if (ruleList === null) {
    return new CSSStyleDeclaration([], true);
  }

  // 2. Discover @layer ordering (CSS Cascade 5 § 6.4 #layer-ordering)
  const env = resolveMediaEnvironment(element);
  const layerDeclarationOrder = getLayerDeclarationOrder(ruleList, env);
  const { activeProperties, activeKeyframes } = collectActiveAtRules(ruleList, layerDeclarationOrder, env);

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

  const parentNode = element.parentElement ?? (element.parentNode && isElement(element.parentNode) ? element.parentNode : null);
  const rootNode = element.ownerDocument?.documentElement;
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

  // 9. Resolve custom properties (CSS Variables 1 § 3, § 4, CSS Variables 2 § 3, CSS Values 5 § 3.3, CSS Cascade 5 § 6.4.3)
  const { resolvedCustomProps, cyclicProps, taintedProps } = resolveCustomProperties(
    declarationsByProperty,
    rawCustomProps,
    parentCascaded,
    element,
    activeProperties
  );

  // 10. Resolve standard properties and shorthands
  const winningDeclarations = processStandardDeclarations(
    matchedDeclarations,
    resolvedCustomProps,
    cyclicProps,
    parentCascaded,
    element,
    taintedProps,
    activeProperties
  );

  // 10.1. Apply animation declarations (css-cascade-5 § 6.1 #cascade-sort, css-animations-1 § 4 #keyframes)
  const animDecl = winningDeclarations.get('animation') || winningDeclarations.get('animation-name');
  if (animDecl && !animDecl.value.startsWith('none')) {
    const tokens = animDecl.value.trim().split(/\s+/);
    const nonNameKeywords = new Set([
      'paused', 'running', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out',
      'step-start', 'step-end', 'normal', 'reverse', 'alternate', 'alternate-reverse',
      'forwards', 'backwards', 'both', 'none'
    ]);
    let animName = '';
    for (const tok of tokens) {
      if (!tok) continue;
      if (/^\d+(?:\.\d+)?(?:s|ms)$/i.test(tok)) continue;
      if (nonNameKeywords.has(tok.toLowerCase())) continue;
      if (/^steps\(|^cubic-bezier\(/i.test(tok)) continue;
      animName = tok;
      break;
    }

    if (animName && activeKeyframes.has(animName)) {
      const kfRule = activeKeyframes.get(animName)!;
      const startKf = kfRule.findRule('0%') || kfRule.findRule('from');
      if (startKf && startKf.style) {
        const kfStyle = startKf.style as { length: number; item(i: number): string; getPropertyValue(p: string): string };
        for (let k = 0; k < kfStyle.length; k++) {
          const propName = kfStyle.item(k);
          const propVal = kfStyle.getPropertyValue(propName);
          const existing = winningDeclarations.get(propName);
          if (!existing || !existing.important) {
            winningDeclarations.set(propName, {
              name: propName,
              value: propVal,
              important: false,
              isInline: false,
              layerOrder: Infinity,
              specificity: [0, 0, 0],
              sourceOrder: Infinity,
            });
          }
        }
      }
    }
  }

  // 11. Map declarations into final CSSComputedStyleDeclaration
  const finalDeclarations: Declaration[] = [];

  for (const [name, decl] of winningDeclarations) {
    const mappedName = resolveLogicalProperty(name, writingMode, direction);
    // svg2 § 13.2 #presentation-attributes
    const isSvg = isSvgElement(element);
    const isSvgColorProp = isSvg && (mappedName === 'flood-color' || mappedName === 'lighting-color' || mappedName === 'stop-color' || mappedName === 'stroke');
    const finalValue = COLOR_PROPERTIES.has(mappedName) && !isSvgColorProp ? normalizeComputedColor(decl.value) : decl.value;

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

  // Sync logical properties
  if (finalDeclarations.length > 0) {
    for (const logical in LOGICAL_MAPPING) {
      const mapped = resolveLogicalProperty(logical, writingMode, direction);
      const decl = finalDeclarations.find(d => d.name === mapped);
      if (decl && !finalDeclarations.some(d => d.name === logical)) {
        finalDeclarations.push({
          type: 'declaration',
          name: logical,
          value: decl.value,
          important: decl.important,
          raw: decl.raw,
        });
      }
    }
  }

  const resultStyle = new CSSComputedStyleDeclaration(finalDeclarations, true, parentCascaded, element, normalizedPseudoStr);

  (resultStyle as CSSComputedStyleDeclaration & InternalStyleDeclaration)._readonly = true;

  return resultStyle;
}

