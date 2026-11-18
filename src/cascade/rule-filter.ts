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
import { resolveMediaEnvironment } from './layer-manager.ts';
import { findParentStyleSheet } from '../rules/utils.ts';
import {
  CSSRule,
  CSSStyleRule,
  CSSNestedDeclarations,
  CSSGroupingRule,
  CSSScopeRule,
  CSSLayerBlockRule,
  CSSStyleSheet,
  CSSMediaRule,
  CSSSupportsRule,
  CSSImportRule,
} from '../CSSOM.ts';
import { CSSAtRule } from '../rules/at-rules.ts';
import { supports } from '../css-namespace.ts';
import { tokenize } from '../tokenizer.ts';
import { resolveNestedSelector } from '../nesting.ts';
import { parseStyleSheet, parseComponentValues, parseRuleInScopeBlock, parseStyleAttribute } from '../parser.ts';
import { MediaParser } from '../MediaParser.ts';
import { SelectorParser } from '../SelectorParser.ts';
import { serialize, serializeSelectorList } from '../serializer.ts';
import { matches, isElement } from '../matcher.ts';
import type { DOMElement } from '../matcher.ts';
import { SVG_PRESENTATION_ATTRIBUTES } from '../data/gen/cascade-data.ts';
import type { CSSRuleList } from '../rules/collections.ts';
import type {
  Rule,
  ComponentValue,
  Declaration,
  InternalRuleMetadata,
  ElementLike,
  DocumentLike,
  MediaEnvironment,
} from '../types.ts';
import type { MatchedDeclaration, Specificity } from './types.ts';

function getEffectiveParent(node: unknown): unknown {
  if (!node || typeof node !== 'object') return null;
  const n = node as { parentElement?: unknown; parentNode?: { host?: unknown }; host?: unknown };
  return n.parentElement || (n.parentNode && n.parentNode.host) || n.host || null;
}

interface SheetContainerLike {
  host?: { isConnected?: boolean };
  documentElement?: unknown;
  styleSheets?: ArrayLike<CSSStyleSheet>;
  adoptedStyleSheets?: ArrayLike<CSSStyleSheet>;
  querySelectorAll?(s: string): ArrayLike<{ textContent?: string; sheet?: CSSStyleSheet }>;
}

interface SheetLike {
  disabled?: boolean;
  title?: string | null;
  textContent?: string;
  sheet?: unknown;
  cssRules?: ArrayLike<CSSRule>;
  ownerNode?: { isConnected?: boolean; getAttribute?: (attr: string) => string | null };
  isConnected?: boolean;
  getAttribute?: (attr: string) => string | null;
}

function getSheetAttr(sheet: unknown, attr: 'title' | 'rel'): string | null {
  const s = sheet as SheetLike;
  if (attr === 'title' && s.title) return s.title;
  const fromOwner = s.ownerNode?.getAttribute?.(attr);
  if (fromOwner) return fromOwner;
  return s.getAttribute?.(attr) ?? null;
}

function isInsideTemplate(el: unknown): boolean {
  let curr: unknown = el;
  while (curr && typeof curr === 'object') {
    const c = curr as { tagName?: string; nodeName?: string; parentElement?: unknown; parentNode?: unknown };
    if ((c.tagName || c.nodeName) === 'TEMPLATE') return true;
    curr = c.parentElement || c.parentNode;
  }
  return false;
}

function collectRulesMatchingKeyword(rule: CSSRule, keyword: '::part(' | '::slotted(', out: CSSRule[]): void {
  if (rule instanceof CSSStyleRule) {
    if (rule.selectorText.includes(keyword)) out.push(rule);
  } else if (rule instanceof CSSGroupingRule) {
    const children = rule.cssRules;
    for (let i = 0; i < children.length; i++) {
      collectRulesMatchingKeyword(children[i], keyword, out);
    }
  } else if (rule instanceof CSSAtRule && rule.prelude) {
    if (serialize(rule.prelude).includes(keyword)) out.push(rule);
  }
}

/**
 * Harvests all applicable stylesheets and rule lists for an element across document and shadow contexts.
 * css-cascade-5 #filtering
 */
export function collectStyleSheetsAndRules(
  element: ElementLike | DocumentLike | null | undefined,
  rules?: CSSStyleSheet | Rule[] | CSSRuleList | null
): Rule[] | null {
  if (!element || typeof element !== 'object') {
    return null;
  }

  const elObj = element as {
    ownerDocument?: SheetContainerLike;
    nodeType?: number;
    isConnected?: boolean;
    parentElement?: { shadowRoot?: SheetContainerLike } | null;
    getRootNode?: (options?: { composed?: boolean }) => unknown;
    shadowRoot?: SheetContainerLike;
  };

  // css-cascade-5 #value-stages: disconnected elements do not participate in cascade
  if (elObj.isConnected === false) {
    return null;
  }

  if (rules) {
    return rules instanceof CSSStyleSheet ? Array.from(rules.cssRules) : Array.from(rules as ArrayLike<Rule>);
  }

  const ruleList: Rule[] = [];
  const root = typeof elObj.getRootNode === 'function'
    ? elObj.getRootNode()
    : (elObj.ownerDocument ?? (elObj.nodeType === 9 ? (elObj as DocumentLike) : null));

  let preferredTitle: string | null = null;
  let preferredTitleFound = false;

  const determinePreferredTitle = (sheetsOrTags: ArrayLike<unknown>) => {
    if (preferredTitleFound) return;
    for (let i = 0; i < sheetsOrTags.length; i++) {
      const item = sheetsOrTags[i];
      const title = getSheetAttr(item, 'title');
      const isAlternate = (getSheetAttr(item, 'rel') || '').toLowerCase().includes('alternate');
      if (title && !isAlternate) {
        preferredTitle = title;
        preferredTitleFound = true;
        break;
      }
    }
  };

  // HTML #dom-link-disabled
  // cssom-1 #the-linkstyle-interface
  const isSheetEnabledForSet = (sheet: unknown): boolean => {
    if (!sheet || typeof sheet !== 'object') return false;
    const title = getSheetAttr(sheet, 'title');
    const isAlternate = (getSheetAttr(sheet, 'rel') || '').toLowerCase().includes('alternate');
    if (!title && !isAlternate) return true;
    if (preferredTitleFound && preferredTitle !== null) return title === preferredTitle;
    if ((sheet as SheetLike).ownerNode) return true;
    return !isAlternate;
  };

  const emitSheet = (sheet: unknown, checkEnabled: boolean, filterKeyword?: '::part(' | '::slotted(') => {
    if (!sheet) return;
    const s = sheet as SheetLike;
    if (checkEnabled) {
      const node = s.ownerNode || s;
      if (typeof node.isConnected === 'boolean' && !node.isConnected) return;
      if (isInsideTemplate(node)) return;
      if (s.disabled || !isSheetEnabledForSet(sheet)) return;
    } else if (s.disabled) {
      return;
    }

    // Foreign CSSOM (e.g. linkedom's style.sheet) may throw on modern CSS syntax; fall back to textContent.
    try {
      if (checkEnabled ? s.sheet instanceof CSSStyleSheet : Boolean((s.sheet as SheetLike | undefined)?.cssRules)) {
        emitSheet(s.sheet, checkEnabled, filterKeyword);
        return;
      }
    } catch {
      // linkedom fallback
    }

    let extracted: CSSRule[] | null = null;
    if (checkEnabled) {
      if (sheet instanceof CSSStyleSheet) extracted = Array.from(sheet.cssRules);
    } else if (s.cssRules && s.cssRules.length !== undefined) {
      extracted = Array.from(s.cssRules).filter(Boolean);
    }
    if (!extracted && typeof s.textContent === 'string' && s.textContent.trim() !== '') {
      extracted = parseStyleSheet(s.textContent);
    }
    if (!extracted) return;

    if (filterKeyword) {
      for (const r of extracted) collectRulesMatchingKeyword(r, filterKeyword, ruleList);
    } else {
      ruleList.push(...extracted);
    }
  };

  const harvestRoot = (
    targetRoot: SheetContainerLike,
    options: { checkEnabled: boolean; filterKeyword?: '::part(' | '::slotted('; shadowHost?: boolean }
  ) => {
    const { checkEnabled, filterKeyword, shadowHost } = options;
    const seenNodes = new Set<unknown>();
    const hasStyleSheets = Boolean(targetRoot.styleSheets && targetRoot.styleSheets.length > 0);

    if (hasStyleSheets && targetRoot.styleSheets) {
      if (checkEnabled && !shadowHost) determinePreferredTitle(targetRoot.styleSheets);
      for (let i = 0; i < targetRoot.styleSheets.length; i++) {
        const sheet = targetRoot.styleSheets[i];
        emitSheet(sheet, checkEnabled, filterKeyword);
        const ownerNode = (sheet as SheetLike | undefined)?.ownerNode;
        if (ownerNode) seenNodes.add(ownerNode);
      }
    }

    if (typeof targetRoot.querySelectorAll === 'function' && (!shadowHost || !hasStyleSheets)) {
      const styleTags = shadowHost
        ? Array.from(targetRoot.querySelectorAll('style'))
        : Array.from(targetRoot.querySelectorAll('style')).filter(s => !isInsideTemplate(s));
      if (checkEnabled && !shadowHost) determinePreferredTitle(styleTags);
      for (const tag of styleTags) {
        if (seenNodes.has(tag)) continue;
        if (shadowHost && !tag.sheet) {
          if (tag.textContent) ruleList.push(...parseStyleSheet(tag.textContent));
        } else {
          emitSheet(shadowHost ? tag.sheet : tag, checkEnabled, filterKeyword);
        }
      }
    }

    if (targetRoot.adoptedStyleSheets && targetRoot.adoptedStyleSheets.length > 0) {
      for (let i = 0; i < targetRoot.adoptedStyleSheets.length; i++) {
        emitSheet(targetRoot.adoptedStyleSheets[i], checkEnabled, filterKeyword);
      }
    }
  };

  if (root && typeof root === 'object') {
    const rootObj = root as SheetContainerLike;
    // If root is a ShadowRoot whose host is disconnected
    if (rootObj.host && rootObj.host.isConnected === false) {
      return null;
    }

    harvestRoot(rootObj, { checkEnabled: true });

    // If element is inside a ShadowRoot, also collect ::part() rules from document
    if (rootObj.host && elObj.ownerDocument) {
      harvestRoot(elObj.ownerDocument, { checkEnabled: false, filterKeyword: '::part(' });
    }
  }

  // 2. If element is slotted into a shadow host, also collect ::slotted() rules from that host's shadowRoot
  if (elObj.parentElement?.shadowRoot) {
    harvestRoot(elObj.parentElement.shadowRoot, { checkEnabled: false, filterKeyword: '::slotted(' });
  }

  // 3. If element is a shadow host (has shadowRoot), also include :host rules from shadowRoot
  if (elObj.shadowRoot) {
    harvestRoot(elObj.shadowRoot, { checkEnabled: true, shadowHost: true });
  }

  return ruleList;
}

function parseSelectorList(selectorText: string) {
  return new SelectorParser(
    parseComponentValues(tokenize(selectorText)),
    { allowRelative: true, forgiving: true }
  ).parse();
}

function splitSelectorList(selectorText: string): string[] {
  const list = parseSelectorList(selectorText);
  const result = list.selectors
    .map(s => (s.type === 'invalid-selector' ? serialize(s.tokens).trim() : serializeSelectorList({ type: 'selector-list', selectors: [s] })))
    .filter(Boolean);
  return result.length > 0 ? result : [selectorText];
}

function normalizeScopeEndSelector(rawEnd: string): string {
  return splitSelectorList(rawEnd).map(part => {
    const p = part.trim();
    if (p.includes('&')) return p.replace(/&/g, ':where(:scope)');
    if (!p.includes(':scope')) return `:where(:scope) ${p}`;
    return p;
  }).join(', ');
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

interface ShadowElementLike extends ElementLike {
  getRootNode?(options?: { composed?: boolean }): { host?: ElementLike } | null;
  part?: { value?: string; contains?: (p: string) => boolean } | string;
}

function getElementRootNode(el: ElementLike): { host?: ElementLike } | null {
  const shadowEl = el as ShadowElementLike;
  if (typeof shadowEl.getRootNode === 'function') {
    return shadowEl.getRootNode();
  }
  return null;
}

/**
 * Extracts normalized string value for a parsed declaration.
 * Custom properties preserve raw source text, except when `var()` references are present,
 * which require AST re-serialization to normalize whitespace and tokens for cascade matching.
 */
function getDeclarationStringValue(d: Declaration): string {
  const isCustom = d.name.startsWith('--');
  let rawValStr = (d.raw && !d.raw.includes('var(')) ? d.raw : serialize(d.value, isCustom).trim();
  if (isCustom && !rawValStr) {
    rawValStr = ' ';
  }
  return rawValStr;
}

interface SelectorListMatchResult {
  isMatching: boolean;
  maxSpecificity: Specificity | null;
  matchingTreeScope?: 'document' | 'part' | 'slotted' | 'shadow';
}

function matchesInScope(domEl: DOMElement, sel: string, scopeNode: DOMElement | undefined): boolean {
  if (!scopeNode) return matches(domEl, sel, scopeNode);
  const trimmed = sel.trim();
  if (/^([>+~]|\s)/.test(trimmed) || /(^|[^a-zA-Z0-9_-])(:scope|&)([^a-zA-Z0-9_-]|$)/.test(trimmed)) {
    return matches(domEl, sel, scopeNode);
  }
  return matches(domEl, `:where(:scope) ${trimmed}`, scopeNode);
}

function matchSelectorList(
  selectors: string[],
  element: ElementLike,
  pseudoElement: string | null | undefined,
  scopeNode: DOMElement | undefined
): SelectorListMatchResult {
  const domEl = element as DOMElement;
  let maxSpecificity: Specificity | null = null;
  let isMatching = false;
  let matchingTreeScope: 'document' | 'part' | 'slotted' | 'shadow' | undefined;

  for (const sel of selectors) {
    let matchesThisSel = false;
    let selectorForMatching = sel;
    let currentSelTreeScope: 'document' | 'part' | 'slotted' | 'shadow' | undefined;
    let partOrSlottedSpec: Specificity | null = null;

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
          matchesThisSel = matchesInScope(domEl, selectorForMatching, scopeNode);
        }
      }
    } else {
      // css-shadow-1 #part, css-shadow-1 #slotted-pseudo
      const partMatch = sel.match(/^(.*?)::part\(\s*([a-zA-Z0-9_-]+)\s*\)$/);
      const slottedMatch = sel.match(/^(.*?)::slotted\(\s*([^)]+)\s*\)$/);
      if (partMatch) {
        const hostSelector = partMatch[1].trim() || '*';
        const partName = partMatch[2];
        const elPartAttr = (domEl as { getAttribute?(a: string): string | null }).getAttribute?.('part') || '';
        const partTokens = elPartAttr.trim().split(/\s+/);
        if (partTokens.includes(partName)) {
          const rootNode = getElementRootNode(domEl);
          const shadowHost = (rootNode as { host?: unknown })?.host;
          if (shadowHost && isElement(shadowHost) && matches(shadowHost, hostSelector)) {
            matchesThisSel = true;
            currentSelTreeScope = 'part';
            const hostSpecArr = calculateSpecificity(hostSelector);
            const baseSpec = hostSpecArr[0] || [0, 0, 0];
            partOrSlottedSpec = [baseSpec[0], baseSpec[1], baseSpec[2] + 1];
          }
        }
      } else if (slottedMatch) {
        const slotArg = slottedMatch[2].trim();
        const parent = (domEl as { parentElement?: unknown }).parentElement as { shadowRoot?: unknown } | null;
        const isSlotted = Boolean((domEl as { assignedSlot?: unknown }).assignedSlot || parent?.shadowRoot);
        if (isSlotted && matches(domEl, slotArg)) {
          matchesThisSel = true;
          currentSelTreeScope = 'slotted';
          const argSpecArr = calculateSpecificity(slotArg);
          const baseSpec = argSpecArr[0] || [0, 0, 0];
          partOrSlottedSpec = [baseSpec[0], baseSpec[1], baseSpec[2] + 1];
        }
      } else if (sel.includes(':host')) {
        matchesThisSel = matches(domEl, sel);
        if (matchesThisSel) {
          currentSelTreeScope = 'shadow';
        }
      } else {
        const hasPseudo = /::[a-zA-Z-]+(?:\([^)]*\))?$/.test(sel) || /:(before|after|first-line|first-letter)\b/.test(sel);
        if (!hasPseudo) {
          matchesThisSel = matchesInScope(domEl, sel, scopeNode);
          if (matchesThisSel) {
            const rootNode = getElementRootNode(domEl);
            if (rootNode && (rootNode as { host?: unknown }).host) {
              currentSelTreeScope = 'shadow';
            } else {
              currentSelTreeScope = 'document';
            }
          }
        }
      }
    }

    if (matchesThisSel) {
      isMatching = true;
      if (currentSelTreeScope) {
        matchingTreeScope = currentSelTreeScope;
      }
      const spec = partOrSlottedSpec || getMatchingSpecificity(domEl, selectorForMatching, scopeNode);
      if (!maxSpecificity || compareSpecificity(spec, maxSpecificity) > 0) {
        maxSpecificity = spec;
      }
    }
  }

  return { isMatching, maxSpecificity, matchingTreeScope };
}

/**
 * Traverses rule list, evaluates conditional at-rules and selectors, and collects matched declarations.
 * css-cascade-5 #filtering
 */
export function collectMatchedDeclarations(
  element: ElementLike,
  ruleList: Rule[],
  layerDeclarationOrder: Map<string, number>,
  pseudoElement?: string | null,
  origin: 'user-agent' | 'author' = 'author',
  envOverride?: Partial<MediaEnvironment>
): { matchedDeclarations: MatchedDeclaration[]; sourceOrderCounter: number } {
  const matchedDeclarations: MatchedDeclaration[] = [];
  let sourceOrderCounter = 0;
  let ruleCounter = 0;

  const walkRules = (
    list: (CSSRule | Declaration)[] | CSSRuleList,
    parentSelector: string = '',
    currentLayer: string | null = null,
    scopeNode?: DOMElement,
    scopeProximity?: number
  ) => {
    const count = list.length;
    for (let i = 0; i < count; i++) {
      const rule = list[i] as CSSRule | Declaration;

      if (rule instanceof CSSStyleRule) {
        const currentRuleId = ++ruleCounter;
        const selectorText = rule.selectorText;
        const resolvedSelector = resolveNestedSelector(selectorText, parentSelector);
        const selectors = splitSelectorList(resolvedSelector);

        const { isMatching: isMatchingSelector, maxSpecificity, matchingTreeScope } = matchSelectorList(
          selectors,
          element,
          pseudoElement,
          scopeNode
        );

        if (isMatchingSelector && maxSpecificity) {
          const spec = maxSpecificity;
          const style = rule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          const ruleBase = getRuleBaseURL(rule, element);

          if (style) {
            interface StyleDeclarationLike {
              length: number;
              item?(index: number): string;
              [index: number]: string;
              getPropertyValue?(property: string): string;
              getPropertyPriority?(property: string): string;
              [property: string]: unknown;
            }
            const s = style as StyleDeclarationLike;
            if ('_declarations' in style && Array.isArray(style._declarations)) {
              for (const d of style._declarations) {
                matchedDeclarations.push({
                  name: d.name,
                  value: resolveUrlsInValue(getDeclarationStringValue(d), ruleBase),
                  important: d.important,
                  isInline: false,
                  layerOrder,
                  specificity: spec,
                  scopeProximity,
                  sourceOrder: sourceOrderCounter++,
                  ruleId: currentRuleId,
                  treeScope: matchingTreeScope,
                  origin,
                });
              }
            } else if (typeof s.length === 'number' && s.length >= 0) {
              const len = s.length;
              for (let k = 0; k < len; k++) {
                const name = typeof s.item === 'function' ? s.item(k) : s[k];
                if (!name) continue;
                const value = typeof s.getPropertyValue === 'function'
                  ? s.getPropertyValue(name)
                  : (s[name] as string | ComponentValue[] | undefined);
                const priority = typeof s.getPropertyPriority === 'function'
                  ? s.getPropertyPriority(name)
                  : '';
                const rawValStr = typeof value === 'string' ? value : (Array.isArray(value) ? serialize(value) : String(value || ''));
                matchedDeclarations.push({
                  name,
                  value: resolveUrlsInValue(rawValStr, ruleBase),
                  important: priority === 'important',
                  isInline: false,
                  layerOrder,
                  specificity: spec,
                  scopeProximity,
                  sourceOrder: sourceOrderCounter++,
                  ruleId: currentRuleId,
                  treeScope: matchingTreeScope,
                  origin,
                });
              }
            }
          }
        }

        // Nested rules inside CSSStyleRule
        const nestedRules = rule.cssRules;
        if (nestedRules && nestedRules.length > 0) {
          walkRules(nestedRules, resolvedSelector, currentLayer, scopeNode, scopeProximity);
        }
      } else if (rule instanceof CSSLayerBlockRule) {
        const assigned = rule._assignedLayerName;
        const rawName = rule.name;
        const layerName = assigned || (currentLayer ? (rawName ? `${currentLayer}.${rawName}` : currentLayer) : rawName);
        if (rule.cssRules) {
          walkRules(rule.cssRules, parentSelector, layerName, scopeNode, scopeProximity);
        }
      } else if (rule instanceof CSSMediaRule) {
        // css-cascade-5 #filtering
        // mediaqueries-4 #mq-list
        const mediaText = rule.media.mediaText;
        const env = envOverride ?? resolveMediaEnvironment(element);
        if (MediaParser.evaluate(mediaText, env) && rule.cssRules) {
          walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode, scopeProximity);
        }
      } else if (rule instanceof CSSImportRule) {
        // css-cascade-6 #at-import
        const mediaText = rule.media?.mediaText;
        const env = envOverride ?? resolveMediaEnvironment(element);
        if (mediaText && !MediaParser.evaluate(mediaText, env)) {
          continue;
        }
        if (rule.supportsText && !supports(rule.supportsText)) {
          continue;
        }

        const importedSheet = rule.styleSheet;
        if (importedSheet && importedSheet.cssRules && importedSheet.cssRules.length > 0) {
          const rawLayer = rule.layerName;
          const assignedLayer = rule._assignedLayerName;
          const layerName = assignedLayer || (rawLayer !== null && rawLayer !== undefined ? (currentLayer ? (rawLayer ? `${currentLayer}.${rawLayer}` : currentLayer) : rawLayer) : currentLayer);
          
          const isScoped = rule._isScoped;
          const scopeStart = rule._scopeStart;
          const scopeEnd = rule._scopeEnd;

          if (isScoped) {
            const startStr = scopeStart ? `(${scopeStart})` : null;
            const endStr = scopeEnd ? `(${scopeEnd})` : null;
            const scopeRule = new CSSScopeRule(startStr, endStr, Array.from(importedSheet.cssRules), parseRuleInScopeBlock);
            (scopeRule as CSSRule & InternalRuleMetadata)._parentStyleSheet = (rule as CSSRule).parentStyleSheet || findParentStyleSheet(rule as CSSRule);
            walkRules([scopeRule], parentSelector, layerName, scopeNode, scopeProximity);
          } else {
            walkRules(importedSheet.cssRules, parentSelector, layerName, scopeNode, scopeProximity);
          }
        }
      } else if (rule instanceof CSSScopeRule) {
        // css-cascade-6 #scoped-styles
        const childRules = (rule as CSSGroupingRule).cssRules || [];
        const candidateScopeRoots: DOMElement[] = [];

        if (rule.start) {
          const rawStart = rule.start;
          let scopeStart = rawStart;
          if (parentSelector) {
            scopeStart = resolveNestedSelector(rawStart, parentSelector);
          } else if (scopeNode) {
            if (rawStart.includes('&')) {
              scopeStart = rawStart.replace(/&/g, ':where(:scope)');
            } else if (!rawStart.includes(':scope') && !/^[>+~]/.test(rawStart)) {
              scopeStart = `:where(:scope) ${rawStart}`;
            }
          }
          if (isElement(element)) {
            let curr: unknown = element;
            while (curr && (isElement(curr) || (curr as { nodeType?: number }).nodeType === 11)) {
              if (isElement(curr)) {
                if (matches(curr as DOMElement, scopeStart, scopeNode)) {
                  candidateScopeRoots.push(curr as DOMElement);
                }
              }
              if (scopeNode && curr === scopeNode) {
                break;
              }
              curr = getEffectiveParent(curr);
            }
          }
        } else {
          // Implicit scope root: parent of style element's ownerNode, or shadow host / root
          const sheet = findParentStyleSheet(rule as CSSRule);
          const ownerNode = sheet?.ownerNode as { parentElement?: DOMElement; parentNode?: { host?: DOMElement } } | null | undefined;
          let implicitRoot: DOMElement | null = null;
          if (ownerNode && ownerNode.parentElement && isElement(ownerNode.parentElement)) {
            implicitRoot = ownerNode.parentElement;
          } else if (ownerNode && ownerNode.parentNode && (ownerNode.parentNode as { host?: DOMElement }).host && isElement((ownerNode.parentNode as { host?: DOMElement }).host)) {
            implicitRoot = (ownerNode.parentNode as { host?: DOMElement }).host!;
          } else if (isElement(element)) {
            if ((element as { shadowRoot?: { adoptedStyleSheets?: ArrayLike<unknown> } }).shadowRoot) {
              const sr = (element as { shadowRoot: { adoptedStyleSheets?: ArrayLike<unknown> } }).shadowRoot;
              if (sheet && sr.adoptedStyleSheets && Array.from(sr.adoptedStyleSheets).includes(sheet)) {
                implicitRoot = element as DOMElement;
              }
            }
            if (!implicitRoot) {
              const rootNode = typeof (element as DOMElement & { getRootNode?: (opt?: { composed?: boolean }) => unknown }).getRootNode === 'function'
                ? (element as DOMElement & { getRootNode: (opt?: { composed?: boolean }) => unknown }).getRootNode()
                : null;
              if (rootNode && (rootNode as { host?: DOMElement }).host && isElement((rootNode as { host?: DOMElement }).host)) {
                implicitRoot = (rootNode as { host?: DOMElement }).host!;
              } else {
                const docRoot = (element as DOMElement).ownerDocument?.documentElement;
                if (docRoot && isElement(docRoot)) {
                  implicitRoot = docRoot;
                }
              }
            }
          }
          if (implicitRoot && isElement(element)) {
            let curr: unknown = element;
            while (curr && (isElement(curr) || (curr as { nodeType?: number }).nodeType === 11)) {
              if (curr === implicitRoot) {
                candidateScopeRoots.push(implicitRoot);
                break;
              }
              if (scopeNode && curr === scopeNode) {
                break;
              }
              curr = getEffectiveParent(curr);
            }
          }
        }

        const rawEnd = rule.end;
        const normalizedEnd = rawEnd ? normalizeScopeEndSelector(rawEnd) : null;

        for (const candRoot of candidateScopeRoots) {
          // Check scoping limits:
          // Any element from element up to candRoot matching normalizedEnd is a limit.
          let isBlockedByLimit = false;
          if (normalizedEnd) {
            let curr: unknown = element;
            while (curr && (isElement(curr) || (curr as { nodeType?: number }).nodeType === 11)) {
              if (isElement(curr)) {
                if (matches(curr as DOMElement, normalizedEnd, candRoot)) {
                  isBlockedByLimit = true;
                  break;
                }
              }
              if (curr === candRoot) {
                break;
              }
              curr = getEffectiveParent(curr);
            }
          }

          if (!isBlockedByLimit) {
            let hops = 0;
            let curr: unknown = element;
            while (curr && curr !== candRoot) {
              hops++;
              curr = getEffectiveParent(curr);
            }
            walkRules(childRules, '', currentLayer, candRoot, hops);
          }
        }
      } else if (rule instanceof CSSSupportsRule) {
        const condText = rule.conditionText;
        if (supports(condText) && rule.cssRules) {
          walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode, scopeProximity);
        }
      } else if (rule instanceof CSSGroupingRule) {
        walkRules(rule.cssRules, parentSelector, currentLayer, scopeNode, scopeProximity);
      // css-nesting-1 #nested-declarations
      } else if (rule instanceof CSSNestedDeclarations) {
        const rawParent = parentSelector || ':scope';
        const selectors = splitSelectorList(rawParent);
        const { isMatching: isMatchingDecl, maxSpecificity } = matchSelectorList(
          selectors,
          element,
          pseudoElement,
          scopeNode
        );

        if (isMatchingDecl && maxSpecificity) {
          // css-nesting-1 #nesting-at-scope: '&' directly in @scope behaves like :where(:scope) with (0, 0, 0) specificity
          const isDirectScope = scopeNode && (!parentSelector || parentSelector === ':scope');
          const spec = isDirectScope ? ([0, 0, 0] as Specificity) : maxSpecificity;
          const style = rule.style;
          const layerOrder = currentLayer ? (layerDeclarationOrder.get(currentLayer) ?? 0) : Infinity;
          const ruleBase = getRuleBaseURL(rule, element);
          for (const d of style._declarations) {
            matchedDeclarations.push({
              name: d.name,
              value: resolveUrlsInValue(getDeclarationStringValue(d), ruleBase),
              important: d.important,
              isInline: false,
              layerOrder,
              specificity: spec,
              scopeProximity: scopeNode ? (element === scopeNode ? 0 : scopeProximity) : undefined,
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
 * svg-2 #presentation-attributes, css-cascade-5 #cascading-origins
 */
export function collectSvgPresentationAttributes(
  element: ElementLike,
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
 * css-cascade-5 #cascade-sort
 */
export function collectInlineDeclarations(
  element: ElementLike,
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
    const inlineDecls = parseStyleAttribute(tokenize(styleAttrText));
    for (const d of inlineDecls._declarations) {
      declarations.push({
        name: d.name,
        value: getDeclarationStringValue(d),
        important: d.important,
        isInline: true,
        layerOrder: Infinity,
        specificity: [1, 0, 0],
        sourceOrder: sourceOrderCounter++,
        origin: 'author',
      });
    }
  }

  return { declarations, nextSourceOrder: sourceOrderCounter };
}

export { resolveNestedSelector } from '../nesting.ts';

/**
 * Calculates specificity for matching selector.
 * selectors-4 #specificity-rules
 */
export function getMatchingSpecificity(element: ElementLike, selectorText: string, scope?: DOMElement): Specificity {
  const list = parseSelectorList(selectorText);

  let maxSpec: Specificity = [0, 0, 0];

  for (const complex of list.selectors) {
    if (complex.type === 'invalid-selector') continue;
    if (matches(element, complex, scope)) {
      const spec = calculateSpecificity({ type: 'selector-list', selectors: [complex] });
      const singleSpec = spec[0] || [0, 0, 0];
      if (compareSpecificity(singleSpec, maxSpec) > 0) {
        maxSpec = singleSpec;
      }
    }
  }

  return maxSpec;
}
