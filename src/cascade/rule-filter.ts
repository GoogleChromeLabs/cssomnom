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

import { calculateSpecificity, compareSpecificity } from '../specificity.ts';
import {
  CSSRule,
  CSSNestedDeclarations,
  CSSGroupingRule,
  CSSScopeRule,
  CSSLayerBlockRule,
  CSSStyleSheet,
  CSSMediaRule,
  CSSSupportsRule,
} from '../CSSOM.ts';
import { supports } from '../parser-api.ts';
import { tokenize } from '../tokenizer.ts';
import { Parser, parseStyleSheet } from '../parser.ts';
import { MediaParser } from '../MediaParser.ts';
import { SelectorParser } from '../SelectorParser.ts';
import { serialize, serializeSelectorList } from '../serializer.ts';
import { matches, isElement } from '../matcher.ts';
import type { DOMElement } from '../matcher.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { SVG_PRESENTATION_ATTRIBUTES } from '../data/gen/cascade-data.ts';
import type {
  Rule,
  CSSStyleRule,
  CSSRuleList,
  SelectorList,
  PseudoClassSelector,
  ComponentValue,
  Declaration,
  ASTAtRule,
  MediaEnvironment,
} from '../types.ts';
import type { MatchedDeclaration, Specificity } from './types.ts';

/**
 * Harvests all applicable stylesheets and rule lists for an element across document and shadow contexts.
 * css-cascade-5 § 2 #filtering
 */
export function collectStyleSheetsAndRules(
  element: unknown,
  rules?: Rule[] | CSSRuleList
): (Rule | CSSRule)[] | null {
  if (!element || typeof element !== 'object') {
    return null;
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
    return null;
  }

  if (rules) {
    return Array.from(rules as ArrayLike<Rule | CSSRule>);
  }

  const ruleList: (Rule | CSSRule)[] = [];
  const root = typeof elObj.getRootNode === 'function'
    ? elObj.getRootNode()
    : (elObj.ownerDocument || (elObj.nodeType === 9 ? (element as unknown as Document) : null));

  const getSheetTitle = (sheet: unknown): string | null => {
    const s = sheet as { title?: string | null; ownerNode?: { getAttribute?: (attr: string) => string | null }; getAttribute?: (attr: string) => string | null };
    if (s.title) return s.title;
    if (s.ownerNode && typeof s.ownerNode.getAttribute === 'function') {
      const t = s.ownerNode.getAttribute('title');
      if (t) return t;
    }
    if (typeof s.getAttribute === 'function') {
      const t = s.getAttribute('title');
      if (t) return t;
    }
    return null;
  };

  const getSheetRel = (sheet: unknown): string | null => {
    const s = sheet as { ownerNode?: { getAttribute?: (attr: string) => string | null }; getAttribute?: (attr: string) => string | null };
    if (s.ownerNode && typeof s.ownerNode.getAttribute === 'function') {
      return s.ownerNode.getAttribute('rel');
    }
    if (typeof s.getAttribute === 'function') {
      return s.getAttribute('rel');
    }
    return null;
  };

  let preferredTitle: string | null = null;
  let preferredTitleFound = false;

  const determinePreferredTitle = (sheetsOrTags: ArrayLike<unknown>) => {
    if (preferredTitleFound) return;
    for (let i = 0; i < sheetsOrTags.length; i++) {
      const item = sheetsOrTags[i];
      const title = getSheetTitle(item);
      const rel = getSheetRel(item) || '';
      const isAlternate = rel.toLowerCase().includes('alternate');
      if (title && !isAlternate) {
        preferredTitle = title;
        preferredTitleFound = true;
        break;
      }
    }
  };

  const isSheetEnabledForSet = (sheet: unknown): boolean => {
    const title = getSheetTitle(sheet);
    const rel = getSheetRel(sheet) || '';
    const isAlternate = rel.toLowerCase().includes('alternate');
    if (!title && !isAlternate) {
      return true;
    }
    if (preferredTitleFound && preferredTitle !== null) {
      return title === preferredTitle;
    }
    return !isAlternate;
  };

  const addSheetRules = (sheet: unknown) => {
    if (!sheet) return;
    const s = sheet as { disabled?: boolean; cssRules?: ArrayLike<CSSRule>; textContent?: string; sheet?: unknown };
    if (s.disabled) return;
    if (!isSheetEnabledForSet(sheet)) return;
    try {
      if (s.sheet && (s.sheet as { cssRules?: ArrayLike<CSSRule> }).cssRules) {
        addSheetRules(s.sheet);
        return;
      }
    } catch {
      // linkedom style.sheet throws on modern CSS syntax (@layer, nesting)
    }
    if (s.cssRules && s.cssRules.length !== undefined) {
      for (let j = 0; j < s.cssRules.length; j++) {
        const r = s.cssRules[j];
        if (r) ruleList.push(r as unknown as CSSRule);
      }
      return;
    }
    if (typeof s.textContent === 'string' && s.textContent.trim() !== '') {
      const parsed = parseStyleSheet(s.textContent);
      ruleList.push(...parsed);
      return;
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
      return null;
    }

    // 1. Regular non-adopted stylesheets
    let addedFromStyleSheets = false;
    if ('styleSheets' in rootObj && rootObj.styleSheets && rootObj.styleSheets.length > 0) {
      determinePreferredTitle(rootObj.styleSheets);
      for (let i = 0; i < rootObj.styleSheets.length; i++) {
        addSheetRules(rootObj.styleSheets[i]);
        addedFromStyleSheets = true;
      }
    }
    if (!addedFromStyleSheets && typeof rootObj.querySelectorAll === 'function') {
      const styleTags = rootObj.querySelectorAll('style');
      determinePreferredTitle(styleTags);
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

  return ruleList;
}

function splitSelectorList(selectorText: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let current = '';

  for (let i = 0; i < selectorText.length; i++) {
    const char = selectorText[i];
    if (inString) {
      current += char;
      if (char === '\\' && i + 1 < selectorText.length) {
        current += selectorText[++i];
      } else if (char === inString) {
        inString = null;
      }
    } else if (char === '"' || char === "'") {
      inString = char;
      current += char;
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      if (depth > 0) depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result.length > 0 ? result : [selectorText];
}

function getRuleBaseURL(rule: unknown, element?: unknown): string | null {
  const r = rule as { parentStyleSheet?: { _baseURL?: string | null; href?: string | null } } | null;
  if (r?.parentStyleSheet?._baseURL) return r.parentStyleSheet._baseURL;
  if (r?.parentStyleSheet?.href) return r.parentStyleSheet.href;
  if (element && typeof element === 'object') {
    const el = element as { ownerDocument?: { baseURI?: string; defaultView?: { location?: { href?: string } } } };
    if (el.ownerDocument?.baseURI) return el.ownerDocument.baseURI;
    if (el.ownerDocument?.defaultView?.location?.href) return el.ownerDocument.defaultView.location.href;
  }
  if (typeof globalThis.document !== 'undefined' && globalThis.document.baseURI) return globalThis.document.baseURI;
  if (typeof globalThis.location !== 'undefined' && globalThis.location.href) return globalThis.location.href;
  return null;
}

function resolveUrlsInValue(val: string, baseURL: string | null): string {
  if (!baseURL || !val.includes('url(')) return val;
  return val.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote, rawUrl) => {
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#')) {
        return `url("${trimmed}")`;
      }
      const resolved = new URL(trimmed, baseURL).href;
      return `url("${resolved}")`;
    } catch {
      return match;
    }
  });
}

/**
 * Traverses rule list, evaluates conditional at-rules and selectors, and collects matched declarations.
 * css-cascade-5 § 2 #filtering
 */
export function collectMatchedDeclarations(
  element: unknown,
  ruleList: (Rule | CSSRule)[],
  layerDeclarationOrder: Map<string, number>,
  pseudoElement?: string | null
): { matchedDeclarations: MatchedDeclaration[]; sourceOrderCounter: number } {
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
        const selectors = splitSelectorList(resolvedSelector);

        let maxSpecificity: Specificity | null = null;
        let isMatchingSelector = false;

        for (const sel of selectors) {
          let matchesThisSel = false;
          let selectorForMatching = sel;
          if (pseudoElement) {
            const normTarget = pseudoElement.toLowerCase().replace(/\s+/g, '');
            const isLegacy = ['::before', '::after', '::first-line', '::first-letter'].includes(normTarget);
            const legacySingleColon = isLegacy ? `:${normTarget.slice(2)}` : null;

            const pseudoRegex = /(::?[a-zA-Z-]+(?:\([^)]*\))?)\s*$/;
            const match = sel.match(pseudoRegex);
            if (match) {
              const rawMatchedPseudo = match[1].toLowerCase().replace(/\s+/g, '');
              let isMatch = rawMatchedPseudo === normTarget;
              if (!isMatch && legacySingleColon && rawMatchedPseudo === legacySingleColon) {
                isMatch = true;
              }
              if (isMatch) {
                selectorForMatching = sel.slice(0, match.index).trim() || ':scope';
                matchesThisSel = matches(element, selectorForMatching, scopeNode);
              }
            }
          } else {
            const hasPseudo = /::[a-zA-Z-]+(?:\([^)]*\))?$/.test(sel) || /:(before|after|first-line|first-letter)\b/.test(sel);
            if (!hasPseudo) {
              matchesThisSel = matches(element, sel, scopeNode);
            }
          }

          if (matchesThisSel) {
            isMatchingSelector = true;
            const spec = getMatchingSpecificity(element, selectorForMatching);
            if (!maxSpecificity || compareSpecificity(spec, maxSpecificity) > 0) {
              maxSpecificity = spec;
            }
          }
        }

        if (isMatchingSelector && maxSpecificity) {
          const spec = maxSpecificity;
          const style = (rule as CSSStyleRule).style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          const ruleBase = getRuleBaseURL(rule, element);

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
                const rawValStr = typeof value === 'string' ? value : serialize(value as unknown as ComponentValue[]);
                matchedDeclarations.push({
                  name,
                  value: resolveUrlsInValue(rawValStr, ruleBase),
                  important: priority === 'important',
                  isInline: false,
                  layerOrder,
                  specificity: spec,
                  sourceOrder: sourceOrderCounter++,
                });
              }
            } else if (Array.isArray((style as { declarations?: unknown[] }).declarations)) {
              for (const d of (style as { declarations: Declaration[] }).declarations) {
                const rawValStr = serialize(d.value);
                matchedDeclarations.push({
                  name: d.name,
                  value: resolveUrlsInValue(rawValStr, ruleBase),
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
              const rawValStr = serialize(d.value);
              matchedDeclarations.push({
                name: d.name,
                value: resolveUrlsInValue(rawValStr, ruleBase),
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
      } else if (
        rule instanceof CSSSupportsRule ||
        ((rule as ASTAtRule).type === 'at-rule' && (rule as ASTAtRule).name === 'supports')
      ) {
        const condText = rule instanceof CSSSupportsRule ? rule.conditionText : serialize((rule as ASTAtRule).prelude || []).trim();
        if (supports(condText)) {
          const childRules = (rule instanceof CSSGroupingRule ? rule.cssRules : (rule as ASTAtRule).childRules) || [];
          walkRules(childRules, parentSelector, currentLayer, scopeNode);
        }
      } else if (rule instanceof CSSGroupingRule) {
        walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode);
      } else if (rule instanceof CSSNestedDeclarations) {
        let selectorToMatch = parentSelector || ':scope';
        let isMatchingDecl = false;
        const normalizedPseudo = pseudoElement
          ? (pseudoElement.startsWith('::') ? pseudoElement : `::${pseudoElement.replace(/^:/, '')}`)
          : null;
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
          const spec = (scopeNode ? [0, 0, 0] : getMatchingSpecificity(element, selectorToMatch)) as Specificity;
          const style = rule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          const ruleBase = getRuleBaseURL(rule, element);
          for (let k = 0; k < style.length; k++) {
            const name = style.item(k);
            const value = style.getPropertyValue(name);
            const priority = style.getPropertyPriority(name);
            matchedDeclarations.push({
              name,
              value: resolveUrlsInValue(value, ruleBase),
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
  return { matchedDeclarations, sourceOrderCounter };
}

/**
 * Extracts SVG presentation attributes with UA-level precedence.
 * svg-2 § 6.2 #presentation-attributes, css-cascade-5 § 3 #cascade-origins
 */
export function collectSvgPresentationAttributes(
  element: unknown,
  matchedDeclarationsCount: number
): MatchedDeclaration[] {
  const domEl = element as { getAttribute?(n: string): string | null };
  const results: MatchedDeclaration[] = [];
  if (domEl && typeof domEl.getAttribute === 'function') {
    for (const attr of SVG_PRESENTATION_ATTRIBUTES) {
      const attrVal = domEl.getAttribute(attr);
      if (attrVal !== null && attrVal !== '') {
        results.push({
          name: attr,
          value: attrVal,
          important: false,
          isInline: false,
          layerOrder: 0,
          specificity: [0, 0, 0],
          sourceOrder: -1000 + matchedDeclarationsCount + results.length,
        });
      }
    }
  }
  return results;
}

/**
 * Extracts inline style attribute declarations.
 * css-cascade-5 § 6.2 #cascade-sort
 */
export function collectInlineDeclarations(
  element: unknown,
  sourceOrderCounter: number
): { declarations: MatchedDeclaration[]; nextSourceOrder: number } {
  const domEl = element as { getAttribute?(n: string): string | null; style?: { cssText?: string } | string };
  let styleAttrText: string | null | undefined;
  if (domEl?.style && typeof domEl.style === 'object' && typeof domEl.style.cssText === 'string') {
    styleAttrText = domEl.style.cssText;
  } else if (typeof domEl?.style === 'string') {
    styleAttrText = domEl.style;
  } else if (domEl && typeof domEl.getAttribute === 'function') {
    styleAttrText = domEl.getAttribute('style');
  }
  const declarations: MatchedDeclaration[] = [];

  if (styleAttrText && styleAttrText.trim()) {
    const inlineDecls = ParseHooks.parseStyleAttribute(tokenize(styleAttrText));
    for (const d of inlineDecls.declarations) {
      const isCustom = d.name.startsWith('--');
      let valStr = (d.raw && !d.raw.includes('var(')) ? d.raw : serialize(d.value, isCustom).trim();
      if (isCustom && !valStr) {
        valStr = ' ';
      }
      declarations.push({
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

  return { declarations, nextSourceOrder: sourceOrderCounter };
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

/**
 * Calculates specificity for matching selector.
 * selectors-4 § 4 #specificity-rules
 */
export function getMatchingSpecificity(element: unknown, selectorText: string): Specificity {
  const tokens = tokenize(selectorText);
  const parser = new Parser(tokens);
  const componentValues = parser.parseComponentValues();
  const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: true });
  const list = selectorParser.parse();

  let maxSpec: Specificity = [0, 0, 0];

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
