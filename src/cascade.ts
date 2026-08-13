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

import { calculateSpecificity, compareSpecificity } from './specificity.ts';
import {
  CSSRule,
  CSSNestedDeclarations,
  CSSGroupingRule,
  CSSScopeRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSStyleSheet,
  CSSMediaRule,
} from './CSSOM.ts';
import { tokenize } from './tokenizer.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from './data/gen/LogicalMapping.ts';
import { Parser, parseStyleSheet } from './parser.ts';
import { MediaParser } from './MediaParser.ts';
import { SelectorParser } from './SelectorParser.ts';
import { serialize, serializeSelectorList } from './serializer.ts';
import { matches, isElement } from './matcher.ts';
import type { DOMElement } from './matcher.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';
import { ParseHooks } from './parse-hooks.ts';
import { NAMED_COLORS } from './data/gen/colors.ts';
import {
  SVG_PRESENTATION_ATTRIBUTES,
  COLOR_PROPERTIES,
  DEFAULT_PROPERTY_VALUES,
  BLOCK_TAGS,
} from './data/gen/cascade-data.ts';
import { camelToDashed } from './utils.ts';
import type {
  Rule,
  CSSStyleRule,
  CSSRuleList,
  SelectorList,
  PseudoClassSelector,
  ComponentValue,
  SimpleBlock,
  Token,
  Declaration,
  ASTAtRule,
  MediaEnvironment,
} from './types.ts';

interface MatchedDeclaration {
  name: string;
  value: string;
  important: boolean;
  isInline: boolean;
  layerOrder: number;
  specificity: [number, number, number];
  sourceOrder: number;
  raw?: string;
}

/**
 * Standard CSS properties that are inherited by default according to CSS specs.
 * css-cascade-5 § 7.2 #computed-values
 */
const INHERITED_PROPERTIES = new Set([
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-indent',
  'text-transform',
  'white-space',
  'visibility',
  'cursor',
  'direction',
  'writing-mode',
]);

function getUaDefault(prop: string, element: unknown): string {
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

function getInitialValue(prop: string, _element: unknown): string {
  return DEFAULT_PROPERTY_VALUES[prop] ?? '';
}

/**
 * Resolves the cascaded style statically for a DOM element according to CSS Cascade 5 and CSS Variables 1.
 * css-cascade-5 § 3 #cascading
 * css-cascade-5 § 6 #cascade-sort
 * css-cascade-5 § 7 #cascaded-values
 * css-variables-1 § 4 #resolving-var-functions
 */
export function getCascadedStyle(element: unknown, rules?: Rule[] | CSSRuleList, pseudoElement?: string | null): CSSStyleDeclaration {
  if (!element || typeof element !== 'object') {
    return new CSSStyleDeclaration([], true);
  }

  const elObj = element as {
    ownerDocument?: {
      documentElement?: unknown;
      styleSheets?: ArrayLike<CSSStyleSheet>;
      adoptedStyleSheets?: ArrayLike<CSSStyleSheet>;
      querySelectorAll?(s: string): ArrayLike<{ textContent?: string; sheet?: CSSStyleSheet }>;
    };
    nodeType?: number;
    isConnected?: boolean;
    parentNode?: unknown;
    parentElement?: unknown;
    getRootNode?: (options?: { composed?: boolean }) => unknown;
    shadowRoot?: {
      adoptedStyleSheets?: ArrayLike<CSSStyleSheet>;
      styleSheets?: ArrayLike<CSSStyleSheet>;
      querySelectorAll?(s: string): ArrayLike<{ textContent?: string; sheet?: CSSStyleSheet }>;
    };
  };

  // If element is explicitly disconnected from DOM
  if (elObj.isConnected === false) {
    return new CSSStyleDeclaration([], true);
  }

  let ruleList: (Rule | CSSRule)[] = [];
  if (rules) {
    ruleList = Array.from(rules as ArrayLike<Rule | CSSRule>);
  } else {
    const root = typeof elObj.getRootNode === 'function' ? elObj.getRootNode() : (elObj.ownerDocument || (elObj.nodeType === 9 ? (element as unknown as Document) : null));
    
    // Helper to add rules from a CSSStyleSheet or HTMLStyleElement
    const addSheetRules = (sheet: unknown) => {
      if (!sheet) return;
      const s = sheet as { disabled?: boolean; cssRules?: ArrayLike<CSSRule>; textContent?: string; sheet?: unknown };
      if (s.disabled) return;
      if (typeof s.textContent === 'string' && s.textContent.trim() !== '') {
        const parsed = parseStyleSheet(s.textContent);
        ruleList.push(...parsed);
        return;
      }
      if (s.sheet && (s.sheet as { cssRules?: ArrayLike<CSSRule> }).cssRules) {
        addSheetRules(s.sheet);
        return;
      }
      if (s.cssRules && s.cssRules.length !== undefined) {
        for (let j = 0; j < s.cssRules.length; j++) {
          const r = s.cssRules[j];
          if (r) ruleList.push(r as unknown as CSSRule);
        }
      }
    };

    if (root && typeof root === 'object') {
      const rootObj = root as {
        host?: { isConnected?: boolean };
        styleSheets?: ArrayLike<CSSStyleSheet>;
        adoptedStyleSheets?: ArrayLike<CSSStyleSheet>;
        querySelectorAll?(s: string): ArrayLike<{ textContent?: string; sheet?: CSSStyleSheet }>;
      };

      // If root is a ShadowRoot whose host is disconnected
      if (rootObj.host && rootObj.host.isConnected === false) {
        return new CSSStyleDeclaration([], true);
      }

      // 1. Regular non-adopted stylesheets
      let addedFromStyleSheets = false;
      if ('styleSheets' in rootObj && rootObj.styleSheets && rootObj.styleSheets.length > 0) {
        for (let i = 0; i < rootObj.styleSheets.length; i++) {
          addSheetRules(rootObj.styleSheets[i]);
          addedFromStyleSheets = true;
        }
      }
      if (!addedFromStyleSheets && typeof rootObj.querySelectorAll === 'function') {
        const styleTags = rootObj.querySelectorAll('style');
        for (let i = 0; i < styleTags.length; i++) {
          addSheetRules(styleTags[i]);
        }
      }

      // 2. Adopted stylesheets (ordered after non-adopted stylesheets)
      if (rootObj.adoptedStyleSheets && rootObj.adoptedStyleSheets.length > 0) {
        for (let i = 0; i < rootObj.adoptedStyleSheets.length; i++) {
          addSheetRules(rootObj.adoptedStyleSheets[i]);
        }
      }
    }

    // 3. If element is a shadow host (has shadowRoot), also include :host rules from shadowRoot
    if (elObj.shadowRoot) {
      const sr = elObj.shadowRoot;
      if ('styleSheets' in sr && sr.styleSheets && sr.styleSheets.length > 0) {
        for (let i = 0; i < sr.styleSheets.length; i++) {
          addSheetRules(sr.styleSheets[i]);
        }
      } else if (typeof sr.querySelectorAll === 'function') {
        const styleTags = sr.querySelectorAll('style');
        for (let i = 0; i < styleTags.length; i++) {
          const styleEl = styleTags[i];
          if (styleEl.sheet) {
            addSheetRules(styleEl.sheet);
          } else {
            const text = styleEl.textContent || '';
            if (text) {
              const parsed = parseStyleSheet(text);
              ruleList.push(...parsed);
            }
          }
        }
      }
      if (sr.adoptedStyleSheets && sr.adoptedStyleSheets.length > 0) {
        for (let i = 0; i < sr.adoptedStyleSheets.length; i++) {
          addSheetRules(sr.adoptedStyleSheets[i]);
        }
      }
    }
  }

  // Pre-pass: Discover and order @layer declarations
  // css-cascade-5 § 6.4 #layer-ordering
  const layerDeclarationOrder = new Map<string, number>();
  let nextLayerIndex = 1;

  const registerLayer = (name: string) => {
    const clean = name.trim();
    if (clean && !layerDeclarationOrder.has(clean)) {
      layerDeclarationOrder.set(clean, nextLayerIndex++);
    }
  };

  const scanLayers = (list: (Rule | CSSRule)[], prefix: string = '', isInsideStyleRule: boolean = false) => {
    for (const r of list) {
      if (
        !isInsideStyleRule && (
          r instanceof CSSLayerStatementRule ||
          ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && !(r as ASTAtRule).block)
        )
      ) {
        const names = (r as CSSLayerStatementRule).nameList || [];
        for (const n of names) {
          const fullName = prefix ? `${prefix}.${n}` : n;
          registerLayer(fullName);
        }
      } else if (
        r instanceof CSSLayerBlockRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && (r as ASTAtRule).block)
      ) {
        const rawName = (r as CSSLayerBlockRule).name || serialize((r as ASTAtRule).prelude || []).trim();
        let fullName: string;
        if (!rawName) {
          fullName = prefix ? `${prefix}.__anon_${nextLayerIndex}` : `__anon_${nextLayerIndex}`;
          registerLayer(fullName);
        } else {
          fullName = prefix ? `${prefix}.${rawName}` : rawName;
          registerLayer(fullName);
        }
        (r as unknown as { _assignedLayerName?: string })._assignedLayerName = fullName;
        if (r instanceof CSSGroupingRule && r.cssRules) {
          scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), fullName, isInsideStyleRule);
        }
      } else if ('style' in r && 'selectorText' in r) {
        if ('cssRules' in r && (r as { cssRules?: unknown }).cssRules) {
          scanLayers(Array.from((r as { cssRules: ArrayLike<Rule | CSSRule> }).cssRules), prefix, true);
        }
      } else if (r instanceof CSSGroupingRule && r.cssRules) {
        scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), prefix, isInsideStyleRule);
      }
    }
  };

  scanLayers(ruleList);

  const matchedDeclarations: MatchedDeclaration[] = [];
  let sourceOrderCounter = 0;

  const walkRules = (
    list: (Rule | CSSRule)[] | CSSRuleList,
    parentSelector: string = '',
    currentLayer: string | null = null,
    scopeNode?: DOMElement
  ) => {
    const count = list.length;
    for (let i = 0; i < count; i++) {
      const rule = list[i] as Rule | CSSRule;

      if (
        (rule as CSSRule).type === CSSRule.STYLE_RULE ||
        (rule as { type: string }).type === 'style-rule' ||
        (rule as { type: string }).type === 'qualified-rule'
      ) {
        const selectorText = (rule as CSSStyleRule).selectorText || serialize((rule as { prelude?: ComponentValue[] }).prelude || []).trim();
        const resolvedSelector = resolveNestedSelector(selectorText, parentSelector);

        const normalizedPseudo = pseudoElement ? (pseudoElement.startsWith('::') ? pseudoElement : `::${pseudoElement.replace(/^:/, '')}`) : null;
        let isMatchingSelector = false;
        let selectorForMatching = resolvedSelector;
        if (normalizedPseudo) {
          if (resolvedSelector.endsWith(normalizedPseudo) || resolvedSelector.endsWith(`:${normalizedPseudo.slice(2)}`)) {
            selectorForMatching = resolvedSelector.replace(/::?[a-zA-Z-]+$/, '').trim() || ':scope';
            isMatchingSelector = matches(element, selectorForMatching, scopeNode);
          }
        } else {
          const hasPseudo = /::[a-zA-Z-]+$/.test(resolvedSelector) || /:(before|after|first-line|first-letter)\b/.test(resolvedSelector);
          if (!hasPseudo) {
            isMatchingSelector = matches(element, resolvedSelector, scopeNode);
          }
        }

        if (isMatchingSelector) {
          const spec = getMatchingSpecificity(element, selectorForMatching);
          const style = (rule as CSSStyleRule).style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;

          if (style) {
            if (typeof (style as { length?: number }).length === 'number' && (style as { length: number }).length >= 0) {
              const len = (style as { length: number }).length;
              for (let k = 0; k < len; k++) {
                const name = typeof (style as { item?: (i: number) => string }).item === 'function'
                  ? (style as { item: (i: number) => string }).item(k)
                  : (style as unknown as Record<number, string>)[k];
                if (!name) continue;
                const value = typeof (style as { getPropertyValue?: (p: string) => string }).getPropertyValue === 'function'
                  ? (style as { getPropertyValue: (p: string) => string }).getPropertyValue(name)
                  : (style as unknown as Record<string, string>)[name];
                const priority = typeof (style as { getPropertyPriority?: (p: string) => string }).getPropertyPriority === 'function'
                  ? (style as { getPropertyPriority: (p: string) => string }).getPropertyPriority(name)
                  : '';
                matchedDeclarations.push({
                  name,
                  value: typeof value === 'string' ? value : serialize(value as unknown as ComponentValue[]),
                  important: priority === 'important',
                  isInline: false,
                  layerOrder,
                  specificity: spec,
                  sourceOrder: sourceOrderCounter++,
                });
              }
            } else if (Array.isArray((style as { declarations?: unknown[] }).declarations)) {
              for (const d of (style as { declarations: Declaration[] }).declarations) {
                matchedDeclarations.push({
                  name: d.name,
                  value: serialize(d.value),
                  important: d.important,
                  isInline: false,
                  layerOrder,
                  specificity: spec,
                  sourceOrder: sourceOrderCounter++,
                });
              }
            }
          } else if ((rule as { block?: { value?: ComponentValue[] } }).block?.value) {
            const blockVal = (rule as { block?: { value?: ComponentValue[] } }).block!.value || [];
            const decls = ParseHooks.parseStyleAttribute(tokenize(serialize(blockVal)));
            for (const d of decls.declarations) {
              matchedDeclarations.push({
                name: d.name,
                value: serialize(d.value),
                important: d.important,
                isInline: false,
                layerOrder,
                specificity: spec,
                sourceOrder: sourceOrderCounter++,
              });
            }
          }
        }

        // Nested rules inside CSSStyleRule
        const nestedRules = (rule as CSSStyleRule).cssRules || ((rule as { block?: { value?: unknown[] } }).block?.value ? (rule as { block?: { value?: unknown[] } }).block!.value!.filter((v: unknown) => v && typeof v === 'object' && ('type' in v) && ((v as { type: string }).type === 'qualified-rule' || (v as { type: string }).type === 'at-rule')) : undefined);
        if (nestedRules && (nestedRules as ArrayLike<Rule | CSSRule>).length > 0) {
          walkRules(nestedRules as unknown as (Rule | CSSRule)[], resolvedSelector, currentLayer, scopeNode);
        }
      } else if (
        rule instanceof CSSLayerBlockRule ||
        ((rule as ASTAtRule).type === 'at-rule' && (rule as ASTAtRule).name === 'layer' && (rule as ASTAtRule).block)
      ) {
        const assigned = (rule as unknown as { _assignedLayerName?: string })._assignedLayerName;
        const rawName = (rule as CSSLayerBlockRule).name || serialize((rule as ASTAtRule).prelude || []).trim();
        const layerName = assigned || (currentLayer ? (rawName ? `${currentLayer}.${rawName}` : currentLayer) : rawName);
        const childRules = (rule instanceof CSSGroupingRule ? rule.cssRules : (rule as ASTAtRule).childRules) || [];
        walkRules(childRules, parentSelector, layerName, scopeNode);
      } else if (
        // css-cascade-5 § 2 #filtering
        // mediaqueries-4 § 3.2 #evaluating-mq-list
        rule instanceof CSSMediaRule ||
        ((rule as ASTAtRule).type === 'at-rule' && (rule as ASTAtRule).name === 'media')
      ) {
        const mediaText = rule instanceof CSSMediaRule ? rule.media.mediaText : serialize((rule as ASTAtRule).prelude || []).trim();
        const doc = (element as { ownerDocument?: { defaultView?: Record<string, unknown> } }).ownerDocument;
        const win = doc?.defaultView;
        let env: Partial<MediaEnvironment> | undefined;
        if (win) {
          let width = 800;
          let height = 600;
          if (typeof win.innerWidth === 'number' && !isNaN(win.innerWidth)) width = win.innerWidth;
          if (typeof win.innerHeight === 'number' && !isNaN(win.innerHeight)) height = win.innerHeight;
          const frameEl = win.frameElement as { width?: string | number; height?: string | number; style?: { width?: string; height?: string }; getAttribute?: (n: string) => string | null } | undefined;
          if (frameEl) {
            const styleW = frameEl.style?.width || (frameEl.width !== undefined ? String(frameEl.width) : null) || frameEl.getAttribute?.('width');
            if (styleW) {
              const parsed = parseFloat(styleW);
              if (!isNaN(parsed) && parsed > 0) width = parsed;
            }
            const styleH = frameEl.style?.height || (frameEl.height !== undefined ? String(frameEl.height) : null) || frameEl.getAttribute?.('height');
            if (styleH) {
              const parsed = parseFloat(styleH);
              if (!isNaN(parsed) && parsed > 0) height = parsed;
            }
          }
          env = {
            width,
            height,
            deviceWidth: width,
            deviceHeight: height,
            aspectRatio: [width, height],
            deviceAspectRatio: [width, height],
            orientation: width > height ? 'landscape' : 'portrait',
          };
        }
        if (MediaParser.evaluate(mediaText, env)) {
          const childRules = (rule instanceof CSSGroupingRule ? rule.cssRules : (rule as ASTAtRule).childRules) || [];
          walkRules(childRules, parentSelector, currentLayer, scopeNode);
        }
      } else if (rule instanceof CSSScopeRule) {
        const childRules = (rule as CSSGroupingRule).cssRules || [];
        let matchingScopeNode: DOMElement | undefined = undefined;
        if (rule.startSelector) {
          const rawStart = rule.startSelector.replace(/^\(/, '').replace(/\)$/, '').trim();
          const scopeStart = resolveNestedSelector(rawStart, parentSelector);
          if (isElement(element)) {
            if (matches(element, scopeStart)) {
              matchingScopeNode = element;
            } else if (typeof (element as DOMElement).closest === 'function') {
              const closest = ((element as DOMElement).closest as (s: string) => DOMElement | null).call(element, scopeStart);
              if (closest) matchingScopeNode = closest as DOMElement;
            }
          }
        } else if (isElement(element)) {
          matchingScopeNode = element;
        }
        if (!rule.startSelector || matchingScopeNode) {
          walkRules(childRules, parentSelector, currentLayer, matchingScopeNode);
        }
      } else if (rule instanceof CSSGroupingRule) {
        walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode);
      } else if (rule instanceof CSSNestedDeclarations) {
        let selectorToMatch = parentSelector || ':scope';
        let isMatchingDecl = false;
        const normalizedPseudo = pseudoElement ? (pseudoElement.startsWith('::') ? pseudoElement : `::${pseudoElement.replace(/^:/, '')}`) : null;
        if (normalizedPseudo) {
          if (selectorToMatch.endsWith(normalizedPseudo) || selectorToMatch.endsWith(`:${normalizedPseudo.slice(2)}`)) {
            selectorToMatch = selectorToMatch.replace(/::?[a-zA-Z-]+$/, '').trim() || ':scope';
            isMatchingDecl = matches(element, selectorToMatch, scopeNode);
          }
        } else {
          const hasPseudo = /::[a-zA-Z-]+$/.test(selectorToMatch) || /:(before|after|first-line|first-letter)\b/.test(selectorToMatch);
          if (!hasPseudo) {
            isMatchingDecl = matches(element, selectorToMatch, scopeNode);
          }
        }

        if (isMatchingDecl) {
          // css-nesting-1 § 4.1 #the-cssnesteddeclarations-interface:
          // Nested @scope rules behave like :where(:scope) with specificity (0, 0, 0)
          const spec = (scopeNode ? [0, 0, 0] : getMatchingSpecificity(element, selectorToMatch)) as [number, number, number];
          const style = rule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          for (let k = 0; k < style.length; k++) {
            const name = style.item(k);
            const value = style.getPropertyValue(name);
            const priority = style.getPropertyPriority(name);
            matchedDeclarations.push({
              name,
              value,
              important: priority === 'important',
              isInline: false,
              layerOrder,
              specificity: spec,
              sourceOrder: sourceOrderCounter++,
            });
          }
        }
      }
    }
  };

  walkRules(ruleList);

  // SVG presentation attributes: svg-2 § 6.2 #presentation-attributes, css-cascade-5 § 3 #cascade-origins
  const domEl = element as { getAttribute?(n: string): string | null; style?: { cssText?: string } };
  if (domEl && typeof domEl.getAttribute === 'function') {
    for (const attr of SVG_PRESENTATION_ATTRIBUTES) {
      const attrVal = domEl.getAttribute(attr);
      if (attrVal !== null && attrVal !== '') {
        matchedDeclarations.push({
          name: attr,
          value: attrVal,
          important: false,
          isInline: false,
          layerOrder: 0,
          specificity: [0, 0, 0],
          sourceOrder: -1000 + matchedDeclarations.length,
        });
      }
    }
  }

  // Overlay inline style attribute: css-cascade-5 § 6.2 #cascade-sort
  const styleAttrText = domEl?.getAttribute?.('style') || (typeof domEl?.style === 'string' ? domEl.style : domEl?.style?.cssText);

  if (styleAttrText && styleAttrText.trim()) {
    const inlineDecls = ParseHooks.parseStyleAttribute(tokenize(styleAttrText));
    for (const d of inlineDecls.declarations) {
      const isCustom = d.name.startsWith('--');
      let valStr = (d.raw && !d.raw.includes('var(')) ? d.raw : serialize(d.value, isCustom).trim();
      if (isCustom && !valStr) {
        valStr = ' ';
      }
      matchedDeclarations.push({
        name: d.name,
        value: valStr,
        important: d.important,
        isInline: true,
        layerOrder: Infinity,
        specificity: [1, 0, 0],
        sourceOrder: sourceOrderCounter++,
      });
    }
  }

  // Sort matching declarations per CSS Cascade 5 § 6 #cascade-sort
  const declarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    const key = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
    if (!declarationsByProperty.has(key)) {
      declarationsByProperty.set(key, []);
    }
    declarationsByProperty.get(key)!.push(decl);
  }

  // Determine writing-mode, direction, and text-orientation for logical property resolution
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

  // 1. Collect inherited and direct custom property raw declarations
  // css-variables-1 § 4 #resolving-var-functions
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
      const rawVal = (lastDecl.raw && !lastDecl.raw.includes('var(')) ? lastDecl.raw : (typeof lastDecl.value === 'string' ? lastDecl.value : serialize(lastDecl.value, true));
      rawCustomProps.set(prop, rawVal);
    }
  }

  // 2. Resolve custom properties with dependency cycle detection and cascade rollback
  // css-variables-1 § 3.1 #guaranteed-invalid
  // css-variables-1 § 4.4 #cycles
  // css-cascade-5 § 6.2 #default, § 6.3 #revert-layer, § 6.3.3 #revert-rule-keyword
  const resolvedCustomProps = new Map<string, string>();
  const cyclicProps = new Set<string>();

  function resolveCustomProp(name: string, callStack: Set<string>): string | null {
    if (cyclicProps.has(name)) return null;
    if (resolvedCustomProps.has(name)) return resolvedCustomProps.get(name)!;
    if (callStack.has(name)) {
      const stackArr = Array.from(callStack);
      const idx = stackArr.indexOf(name);
      if (idx !== -1) {
        for (let j = idx; j < stackArr.length; j++) {
          cyclicProps.add(stackArr[j]);
        }
      }
      cyclicProps.add(name);
      return null;
    }

    const nextStack = new Set(callStack);
    nextStack.add(name);

    const decls = declarationsByProperty.get(name);
    if (decls && decls.length > 0) {
      decls.sort(compareCascadeDeclarations);
      for (let i = decls.length - 1; i >= 0; i--) {
        const decl = decls[i];
        const rawVal = (decl.raw && !decl.raw.includes('var(')) ? decl.raw : (typeof decl.value === 'string' ? decl.value : serialize(decl.value, true));
        
        let subVal: string | null = rawVal;
        if (rawVal.includes('var(')) {
          subVal = substituteVariables(rawVal, rawCustomProps, nextStack, cyclicProps);
        }

        if (subVal === null || cyclicProps.has(name)) {
          if (cyclicProps.has(name)) return null;
          continue;
        }

        const trimmed = subVal.trim();
        if (trimmed === 'revert-rule') {
          continue;
        }
        if (trimmed === 'revert-layer') {
          let prevIdx = i - 1;
          while (prevIdx >= 0 && decls[prevIdx].layerOrder >= decl.layerOrder) {
            prevIdx--;
          }
          if (prevIdx >= 0) {
            i = prevIdx + 1;
            continue;
          } else {
            const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
            resolvedCustomProps.set(name, parentVal);
            return parentVal || null;
          }
        }
        if (trimmed === 'revert') {
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }
        if (trimmed === 'initial') {
          return null;
        }
        if (trimmed === 'inherit' || trimmed === 'unset') {
          const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
          resolvedCustomProps.set(name, parentVal);
          return parentVal || null;
        }

        const finalSubVal = subVal === '' ? ' ' : subVal;
        resolvedCustomProps.set(name, finalSubVal);
        return finalSubVal;
      }
    }

    // No local declaration: inherit from parent
    const parentVal = parentCascaded ? parentCascaded.getPropertyValue(name) : '';
    if (parentVal) {
      resolvedCustomProps.set(name, parentVal);
      return parentVal;
    }

    return null;
  }

  // Populate all custom properties that are declared or inherited
  const allCustomPropertyNames = new Set<string>();
  for (const [prop] of rawCustomProps) {
    allCustomPropertyNames.add(prop);
  }
  for (const [prop] of declarationsByProperty) {
    if (prop.startsWith('--')) {
      allCustomPropertyNames.add(prop);
    }
  }

  for (const prop of allCustomPropertyNames) {
    const res = resolveCustomProp(prop, new Set());
    if (res !== null && !cyclicProps.has(prop)) {
      resolvedCustomProps.set(prop, res);
    } else {
      resolvedCustomProps.set(prop, '');
    }
  }

  // 3. Resolve standard properties with cascade rollbacks
  // css-cascade-5 § 6.2 #default, § 6.3 #revert-layer, § 6.3.3 #revert-rule-keyword
  const winningDeclarations = new Map<string, MatchedDeclaration>();

  for (const [prop, decls] of declarationsByProperty) {
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

  // 4. Map declarations into final declarations list
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

/**
 * CSSComputedStyleDeclaration represents the resolved/computed style declaration of a DOM element.
 * cssom-1 § 6.8 #resolved-values
 * css-cascade-5 § 7.2 #computed-values
 */
export class CSSComputedStyleDeclaration extends CSSStyleDeclaration {
  private _parentStyle: CSSStyleDeclaration | null;
  private _element: unknown;

  constructor(declarations: Declaration[] = [], readonlyFlag: boolean = false, parentStyle: CSSStyleDeclaration | null = null, element: unknown = null) {
    super(declarations, readonlyFlag);
    this._parentStyle = parentStyle;
    this._element = element;
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
    const rawVal = super.getPropertyValue(dashed);

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

    if (dashed === 'color') return 'rgb(0, 0, 0)';
    if (dashed === 'background-color') return 'rgba(0, 0, 0, 0)';
    if (SVG_PRESENTATION_ATTRIBUTES.has(dashed)) {
      return DEFAULT_PROPERTY_VALUES[dashed] ?? '';
    }

    return '';
  }
}

/**
 * Normalizes a CSS color value to its computed/resolved format.
 * css-color-4 § 4 #resolving-color-values
 * css-color-4 § 15 #named-colors
 * cssom-1 § 6.8 #resolved-values
 */
const SYSTEM_COLORS: Record<string, [number, number, number]> = {
  canvas: [255, 255, 255],
  canvastext: [0, 0, 0],
  linktext: [0, 0, 238],
  visitedtext: [85, 26, 139],
  activetext: [255, 0, 0],
  buttonface: [240, 240, 240],
  buttontext: [0, 0, 0],
  buttonborder: [118, 118, 118],
  field: [255, 255, 255],
  fieldtext: [0, 0, 0],
  highlight: [181, 213, 255],
  highlighttext: [0, 0, 0],
  selecteditem: [0, 103, 194],
  selecteditemtext: [255, 255, 255],
  mark: [255, 255, 0],
  marktext: [0, 0, 0],
  graytext: [128, 128, 128],
  accentcolor: [0, 103, 194],
  accentcolortext: [255, 255, 255],
  activeborder: [240, 240, 240],
  activecaption: [204, 204, 204],
  appworkspace: [171, 171, 171],
  background: [99, 99, 99],
  buttonhighlight: [255, 255, 255],
  buttonshadow: [160, 160, 160],
  captiontext: [0, 0, 0],
  inactiveborder: [244, 247, 252],
  inactivecaption: [191, 205, 219],
  inactivecaptiontext: [0, 0, 0],
  infobackground: [255, 255, 225],
  infotext: [0, 0, 0],
  menu: [240, 240, 240],
  menutext: [0, 0, 0],
  scrollbar: [200, 200, 200],
  threeddarkshadow: [113, 111, 100],
  threedface: [240, 240, 240],
  threedhighlight: [255, 255, 255],
  threedlightshadow: [227, 227, 227],
  threedshadow: [160, 160, 160],
  window: [255, 255, 255],
  windowframe: [100, 100, 100],
  windowtext: [0, 0, 0]
};

export function normalizeComputedColor(val: string): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // 1. Named colors (css-color-4 § 15 #named-colors)
  if (lower in NAMED_COLORS) {
    const [r, g, b, a] = NAMED_COLORS[lower];
    if (a !== undefined && a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  // 1.1 System colors (css-color-4 § 6 #system-colors)
  if (lower in SYSTEM_COLORS) {
    const [r, g, b] = SYSTEM_COLORS[lower];
    return `rgb(${r}, ${g}, ${b})`;
  }

  // 2. Hex colors (css-color-4 § 4.2 #hex-notation)
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  // 3. rgb() / rgba() function (css-color-4 § 4.1)
  const rgbMatch = /^(?:rgb|rgba)\s*\(\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (rgbMatch) {
    const parsed = parseRgbComponents(rgbMatch[1]);
    if (parsed) {
      const [r, g, b, a] = parsed;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  // 4. hsl() / hsla() function (css-color-4 § 4.3)
  const hslMatch = /^(?:hsl|hsla)\s*\(\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (hslMatch) {
    const parsed = parseHslComponents(hslMatch[1]);
    if (parsed) {
      const [r, g, b, a] = parsed;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  return trimmed;
}

function formatAlpha(a: number): string {
  if (a <= 0) return '0';
  if (a >= 1) return '1';
  return parseFloat(a.toFixed(4)).toString();
}

function parseRgbComponents(content: string): [number, number, number, number] | null {
  let parts: string[];
  if (content.includes(',')) {
    parts = content.split(',').map(s => s.trim());
  } else {
    const slashIdx = content.indexOf('/');
    if (slashIdx !== -1) {
      const rgbPart = content.slice(0, slashIdx).trim();
      const aPart = content.slice(slashIdx + 1).trim();
      parts = [...rgbPart.split(/\s+/), aPart];
    } else {
      parts = content.trim().split(/\s+/);
    }
  }

  if (parts.length < 3 || parts.length > 4) return null;

  const parseComp = (val: string, max: number = 255): number | null => {
    val = val.trim();
    if (val.endsWith('%')) {
      const num = parseFloat(val.slice(0, -1));
      if (isNaN(num)) return null;
      return Math.min(max, Math.max(0, Math.round((num / 100) * max)));
    }
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    return Math.min(max, Math.max(0, Math.round(num)));
  };

  const parseAlpha = (val: string): number => {
    val = val.trim();
    if (val.endsWith('%')) {
      const num = parseFloat(val.slice(0, -1));
      if (isNaN(num)) return 1;
      return Math.min(1, Math.max(0, num / 100));
    }
    const num = parseFloat(val);
    if (isNaN(num)) return 1;
    return Math.min(1, Math.max(0, num));
  };

  const r = parseComp(parts[0], 255);
  const g = parseComp(parts[1], 255);
  const b = parseComp(parts[2], 255);
  if (r === null || g === null || b === null) return null;

  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  return [r, g, b, a];
}

function parseHslComponents(content: string): [number, number, number, number] | null {
  let parts: string[];
  if (content.includes(',')) {
    parts = content.split(',').map(s => s.trim());
  } else {
    const slashIdx = content.indexOf('/');
    if (slashIdx !== -1) {
      const hslPart = content.slice(0, slashIdx).trim();
      const aPart = content.slice(slashIdx + 1).trim();
      parts = [...hslPart.split(/\s+/), aPart];
    } else {
      parts = content.trim().split(/\s+/);
    }
  }

  if (parts.length < 3 || parts.length > 4) return null;

  const parseHue = (val: string): number => {
    val = val.trim().toLowerCase();
    if (val.endsWith('deg')) return parseFloat(val.slice(0, -3));
    if (val.endsWith('rad')) return (parseFloat(val.slice(0, -3)) * 180) / Math.PI;
    if (val.endsWith('turn')) return parseFloat(val.slice(0, -4)) * 360;
    return parseFloat(val) || 0;
  };

  const parsePct = (val: string): number => {
    val = val.trim();
    if (val.endsWith('%')) return Math.min(1, Math.max(0, parseFloat(val.slice(0, -1)) / 100));
    const n = parseFloat(val);
    return Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
  };

  const h = ((parseHue(parts[0]) % 360) + 360) % 360;
  const s = parsePct(parts[1]);
  const l = parsePct(parts[2]);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  const a = parts.length === 4 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
  return [r, g, b, isNaN(a) ? 1 : Math.min(1, Math.max(0, a))];
}

/**
 * Compares two declarations according to CSS Cascade 5 § 6 #cascade-sort.
 */
function compareCascadeDeclarations(a: MatchedDeclaration, b: MatchedDeclaration): number {
  const getPrecedence = (decl: MatchedDeclaration): number => {
    if (decl.important) {
      if (decl.isInline) return 60; // Important inline
      if (decl.layerOrder !== Infinity) return 50; // Important layered
      return 40; // Important unlayered
    } else {
      if (decl.isInline) return 30; // Normal inline
      if (decl.layerOrder === Infinity) return 20; // Normal unlayered
      return 10; // Normal layered
    }
  };

  const precA = getPrecedence(a);
  const precB = getPrecedence(b);
  if (precA !== precB) {
    return precA - precB;
  }

  // Layer order within importance bucket
  if (a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // !important layered: REVERSE layer order (lower layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return b.layerOrder - a.layerOrder;
    }
  } else if (!a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // Normal layered: normal layer order (higher layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
  }

  // Compare Specificity: selectors-4 § 4 #specificity-rules
  const specDiff = compareSpecificity(a.specificity, b.specificity);
  if (specDiff !== 0) {
    return specDiff;
  }

  // Source Order
  return a.sourceOrder - b.sourceOrder;
}

/**
 * Recursively resolves var() references with fallback substitution and circular reference detection.
 * css-variables-1 § 4 #resolving-var-functions
 */
/**
 * Recursively resolves var() references with fallback substitution and circular reference detection.
 * css-variables-1 § 4 #resolving-var-functions
 * css-variables-1 § 4.4 #cycles
 */
export function substituteVariables(
  valueText: string,
  customProps: Map<string, string>,
  resolvingStack: Set<string> = new Set(),
  cyclicProps: Set<string> = new Set()
): string | null {
  if (!valueText || !valueText.includes('var(')) {
    return valueText;
  }

  const tokens = tokenize(valueText);
  const componentValues = new Parser(tokens).parseComponentValues();
  const resolveNodes = (nodes: ComponentValue[]): ComponentValue[] | null => {
    const result: ComponentValue[] = [];
    const pushTokens = (tokens: ComponentValue[]) => {
      for (const tok of tokens) {
        if (result.length > 0) {
          const last = result[result.length - 1];
          if (last && last.type !== 'whitespace' && tok.type !== 'whitespace') {
            result.push({ type: 'whitespace', value: ' ' } as ComponentValue);
          }
        }
        result.push(tok);
      }
    };
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === 'function' && 'name' in node && Array.isArray(node.value)) {
        const funcNode = node as unknown as { name: string; value: ComponentValue[] };
        if (funcNode.name.toLowerCase() === 'var') {
          const args = funcNode.value;
          const commaIndex = args.findIndex(t => typeof t === 'object' && t !== null && 'type' in t && t.type === 'comma');
          const nameTokens = commaIndex !== -1 ? args.slice(0, commaIndex) : args;
          const fallbackTokens = commaIndex !== -1 ? args.slice(commaIndex + 1) : null;

          const nonWsNameTokens = nameTokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
          let varName: string | undefined;

          if (nonWsNameTokens.length === 1 && nonWsNameTokens[0].type === 'simple-block' && (nonWsNameTokens[0] as SimpleBlock).associatedToken?.type === '{') {
            const innerTokens = (nonWsNameTokens[0] as SimpleBlock).value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
            const ident = innerTokens.find(t => t.type === 'ident' && typeof (t as Token).value === 'string' && ((t as Token).value as string).startsWith('--'));
            if (ident && typeof (ident as Token).value === 'string') varName = (ident as Token).value as string;
          } else {
            const ident = nonWsNameTokens.find(t => t.type === 'ident' && typeof (t as Token).value === 'string' && ((t as Token).value as string).startsWith('--'));
            if (ident && typeof (ident as Token).value === 'string') varName = (ident as Token).value as string;
          }

          if (!varName) {
            if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens);
              if (resolvedFallback === null) return null;
              pushTokens(resolvedFallback);
              continue;
            }
            return null;
          }

          if (resolvingStack.has(varName)) {
            const stackArr = Array.from(resolvingStack);
            const idx = stackArr.indexOf(varName);
            if (idx !== -1) {
              for (let j = idx; j < stackArr.length; j++) {
                cyclicProps.add(stackArr[j]);
              }
            }
            cyclicProps.add(varName);
            return null;
          }

          if (cyclicProps.has(varName)) {
            if (fallbackTokens) {
              const resolvedFallback = resolveNodes(fallbackTokens);
              if (resolvedFallback === null) return null;
              pushTokens(resolvedFallback);
              continue;
            }
            return null;
          }

          if (customProps.has(varName)) {
            const rawCustomVal = customProps.get(varName)!;
            if (rawCustomVal === '') {
              if (fallbackTokens) {
                const resolvedFallback = resolveNodes(fallbackTokens);
                if (resolvedFallback === null) return null;
                pushTokens(resolvedFallback);
                continue;
              }
              return null;
            }

            if (rawCustomVal.includes('var(')) {
              const nextStack = new Set(resolvingStack);
              nextStack.add(varName);
              const resolvedCustom = substituteVariables(rawCustomVal, customProps, nextStack, cyclicProps);
              if (resolvedCustom === null || cyclicProps.has(varName)) {
                cyclicProps.add(varName);
                if (fallbackTokens) {
                  const resolvedFallback = resolveNodes(fallbackTokens);
                  if (resolvedFallback === null) return null;
                  pushTokens(resolvedFallback);
                  continue;
                }
                return null;
              }
              const substitutedTokens = tokenize(resolvedCustom);
              pushTokens(substitutedTokens);
            } else {
              const substitutedTokens = tokenize(rawCustomVal);
              pushTokens(substitutedTokens);
            }
          } else if (fallbackTokens) {
            const resolvedFallback = resolveNodes(fallbackTokens);
            if (resolvedFallback === null) return null;
            pushTokens(resolvedFallback);
          } else {
            return null;
          }
          continue;
        }

        const resolvedChildren = resolveNodes(funcNode.value);
        if (resolvedChildren === null) return null;
        pushTokens([{ type: 'function', name: funcNode.name, value: resolvedChildren }]);
      } else if (node.type === 'simple-block') {
        const resolvedChildren = resolveNodes(node.value);
        if (resolvedChildren === null) return null;
        pushTokens([{ type: 'simple-block', associatedToken: (node as SimpleBlock).associatedToken, value: resolvedChildren }]);
      } else {
        pushTokens([node]);
      }
    }
    return result;
  };

  const resolved = resolveNodes(componentValues);
  if (resolved === null) return null;
  return serialize(resolved, true).trim();
}

/**
 * Resolves nesting '&' selectors within child rules.
 * css-nesting-1 § 4 #nesting-selector
 */
export function resolveNestedSelector(selector: string, parentSelector: string): string {
  if (!parentSelector && !selector.includes('&')) return selector;

  const tokens = tokenize(selector);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let parentList: SelectorList | null = null;
  if (parentSelector) {
    const parentTokens = tokenize(parentSelector);
    const parentParser = new Parser(parentTokens);
    const parentComp = parentParser.parseComponentValues();
    const parentSelectorParser = new SelectorParser(parentComp, { allowRelative: true, forgiving: true });
    parentList = parentSelectorParser.parse();
  }

  function recurse(l: SelectorList) {
    for (const complex of l.selectors) {
      if (complex.type === 'invalid-selector') continue;
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
                typeof simple.argument === 'object' &&
                'type' in simple.argument &&
                simple.argument.type === 'selector-list'
              ) {
                recurse(simple.argument);
              }
            }
          }
        }
      }
    }
  }

  recurse(list);
  return serializeSelectorList(list);
}

function getMatchingSpecificity(element: unknown, selectorText: string): [number, number, number] {
  const tokens = tokenize(selectorText);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let maxSpec: [number, number, number] = [0, 0, 0];

  for (const complex of list.selectors) {
    if (complex.type === 'invalid-selector') continue;
    if (matches(element, complex)) {
      const spec = calculateSpecificity({ type: 'selector-list', selectors: [complex] });
      const singleSpec = spec[0] || [0, 0, 0];
      if (compareSpecificity(singleSpec, maxSpec) > 0) {
        maxSpec = singleSpec;
      }
    }
  }

  return maxSpec;
}
