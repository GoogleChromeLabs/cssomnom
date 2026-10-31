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

import { tokenize } from './tokenizer.ts';
import { Parser } from './parser.ts';
import { SelectorParser, parseAnPlusB } from './SelectorParser.ts';
import { serialize } from './serializer.ts';
import type {
  SelectorList,
  ComplexSelector,
  CompoundSelector,
  SimpleSelector,
  Combinator,
  AttributeSelector,
  PseudoClassSelector,
  ComponentValue,
  ElementLike,
  NodeLike,
  DocumentLike,
} from './types.ts';

export interface DOMElement extends ElementLike {
  localName?: string;
  getAttributeNS?(namespace: string | null, name: string): string | null;
  hasAttributeNS?(namespace: string | null, name: string): boolean;
  attributes?: Array<{ name: string; value: string; prefix?: string | null }> | NamedNodeMap;
  parentElement: DOMElement | null;
  parentNode: NodeLike | null;
  children?: ArrayLike<DOMElement>;
  childNodes?: ArrayLike<{ nodeType: number; nodeValue?: string | null; textContent?: string | null }>;
  previousElementSibling?: DOMElement | null;
  nextElementSibling?: DOMElement | null;
  ownerDocument: DocumentLike | null;
  textContent?: string | null;
  namespaceURI?: string | null;
  prefix?: string | null;
  assignedNodes?(options?: { flatten?: boolean }): unknown[];
  contains?(other: unknown): boolean;
  closest?(selector: string): DOMElement | null;
}

/**
 * Converts only ASCII uppercase characters (A-Z, U+0041..U+005A) to lowercase (a-z, U+0061..U+007A).
 * Non-ASCII characters (e.g. Kelvin sign \u212A, Turkish \u0130, Greek \u03A9, Cyrillic \u0414) remain untouched.
 *
 * selectors-4 #case-sensitive
 * html #case-sensitivity-of-selectors
 */
export function toAsciiLowerCase(str: string): string {
  return str.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
}

export function isElement(node: unknown): node is DOMElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    ('nodeType' in node
      ? (node as { nodeType: number }).nodeType === 1
      : 'tagName' in node || 'localName' in node || 'matches' in node)
  );
}

function getEffectiveParent(element: DOMElement): DOMElement | null {
  if (element.parentElement) return element.parentElement;
  if (element.parentNode && (element.parentNode as { host?: unknown }).host && isElement((element.parentNode as { host?: unknown }).host)) {
    return (element.parentNode as { host?: unknown }).host as DOMElement;
  }
  return null;
}

export const SELECTOR_CACHE_MAX_SIZE = 1000;
export const selectorCache = new Map<string, SelectorList>();

export function clearSelectorCache(): void {
  selectorCache.clear();
}

/**
 * Determines whether an element belongs to an XML/SVG document.
 * In linkedom, XMLDocument and SVGDocument can have undefined contentType.
 */
export function isXmlDocument(element: DOMElement): boolean {
  const doc = element.ownerDocument;
  if (!doc) return false;
  if (doc.contentType) return doc.contentType !== 'text/html';
  const ctorName = (doc as { constructor?: { name?: string } }).constructor?.name;
  return ctorName === 'XMLDocument' || ctorName === 'SVGDocument';
}

// selectors-4 #parse-selector
function parseSelector(selector: string | ComplexSelector | SelectorList): SelectorList {
  if (typeof selector !== 'string') {
    if (selector.type === 'selector-list') return selector;
    if (selector.type === 'complex-selector') return { type: 'selector-list', selectors: [selector] };
  }
  const cached = selectorCache.get(selector);
  if (cached) {
    selectorCache.delete(selector);
    selectorCache.set(selector, cached);
    return cached;
  }
  try {
    const tokens = tokenize(selector);
    const parser = new Parser(tokens);
    const componentValues = parser.parseComponentValues();
    const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: false });
    const result = selectorParser.parse();
    if (selectorCache.size >= SELECTOR_CACHE_MAX_SIZE) {
      const oldestKey = selectorCache.keys().next().value;
      if (oldestKey !== undefined) selectorCache.delete(oldestKey);
    }
    selectorCache.set(selector, result);
    return result;
  } catch {
    return { type: 'selector-list', selectors: [] };
  }
}

/**
 * Evaluates whether a given DOM element matches a CSS selector.
 * selectors-4 #match-against-element
 */
export function matches(element: unknown, selector: string | ComplexSelector | SelectorList, scopeElement?: unknown): boolean {
  if (!isElement(element)) return false;
  const list = parseSelector(selector);
  const scope = isElement(scopeElement) ? scopeElement : undefined;

  // Support mock elements that provide an own custom matches(string) method
  if (typeof element.matches === 'function' && Object.hasOwn(element, 'matches')) {
    for (const complex of list.selectors) {
      if (complex.type === 'invalid-selector') continue;
      const text = serialize(complex.tokens).trim();
      try {
        if (element.matches(text)) return true;
      } catch {
        // Mock threw
      }
    }
    return false;
  }

  for (const complex of list.selectors) {
    if (complex.type === 'invalid-selector') continue;
    if (matchComplexSelector(element, complex, scope)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns all descendant elements matching a CSS selector in tree order.
 * selectors-4 #match-against-tree
 */
export function querySelectorAll(root: unknown, selector: string | ComplexSelector | SelectorList): DOMElement[] {
  if (!root || typeof root !== 'object') return [];
  const results: DOMElement[] = [];
  const list = parseSelector(selector);

  function walk(node: DOMElement) {
    if (matches(node, list, isElement(root) ? root : undefined)) {
      results.push(node);
    }
    const children = node.children ? Array.from(node.children) : [];
    for (const child of children) {
      if (isElement(child)) {
        walk(child);
      }
    }
  }

  if (isElement(root)) {
    const children = root.children ? Array.from(root.children) : [];
    for (const child of children) {
      if (isElement(child)) {
        walk(child);
      }
    }
  } else if ('children' in root || 'childNodes' in root) {
    // Document, DocumentFragment, or Node container
    const nodes = (root as { children?: ArrayLike<unknown>; childNodes?: ArrayLike<unknown> }).children ||
                  (root as { childNodes?: ArrayLike<unknown> }).childNodes || [];
    for (let i = 0; i < nodes.length; i++) {
      const child = nodes[i];
      if (isElement(child)) {
        walk(child);
      }
    }
  }
  return results;
}

/**
 * Returns the first descendant element matching a CSS selector in tree order.
 * selectors-4 #match-against-tree
 */
export function querySelector(root: unknown, selector: string | ComplexSelector | SelectorList): DOMElement | null {
  const all = querySelectorAll(root, selector);
  return all.length > 0 ? all[0] : null;
}

/**
 * Matches a Complex Selector against an element using backtracking combinator evaluation.
 * selectors-4 #match-against-element
 */
export function matchComplexSelector(element: DOMElement, complex: ComplexSelector, scope?: DOMElement, relativeAnchor?: DOMElement): boolean {
  const items = complex.items;
  if (items.length === 0) return false;
  const lastIndex = items.length - 1;
  if (items[lastIndex].type !== 'compound-selector') return false;

  return matchComplexRecursive(element, items, lastIndex, scope, relativeAnchor);
}

function matchComplexRecursive(
  element: DOMElement,
  items: (CompoundSelector | Combinator)[],
  itemIndex: number,
  scope?: DOMElement,
  relativeAnchor?: DOMElement
): boolean {
  const currentCompound = items[itemIndex] as CompoundSelector;
  if (!matchCompoundSelector(element, currentCompound, scope)) {
    return false;
  }

  // All compound selectors matched successfully
  if (itemIndex === 0) {
    return true;
  }

  // Handle leading relative combinator inside :has() or relative selectors
  if (itemIndex === 1 && items[0].type === 'combinator') {
    const leadingComb = (items[0] as Combinator).value;
    const anchor = relativeAnchor || scope;
    if (!anchor) return true;
    if (leadingComb === '>') return getEffectiveParent(element) === anchor;
    if (leadingComb === '+') return element.previousElementSibling === anchor;
    if (leadingComb === '~') {
      let sib = element.previousElementSibling;
      while (sib) {
        if (sib === anchor) return true;
        sib = sib.previousElementSibling;
      }
      return false;
    }
    if (leadingComb === ' ') {
      let parent = getEffectiveParent(element);
      while (parent) {
        if (parent === anchor) return true;
        parent = getEffectiveParent(parent);
      }
      return false;
    }
    return false;
  }

  const combinator = items[itemIndex - 1] as Combinator;
  const prevCompoundIndex = itemIndex - 2;

  // selectors-4 #child-combinators
  if (combinator.value === '>') {
    const parent = getEffectiveParent(element);
    if (!parent) return false;
    if (relativeAnchor && element === relativeAnchor) return false;
    return matchComplexRecursive(parent, items, prevCompoundIndex, scope, relativeAnchor);
  }

  // selectors-4 #adjacent-sibling-combinators
  if (combinator.value === '+') {
    if (!element.previousElementSibling) return false;
    return matchComplexRecursive(element.previousElementSibling, items, prevCompoundIndex, scope, relativeAnchor);
  }

  // selectors-4 #general-sibling-combinators
  if (combinator.value === '~') {
    let sib = element.previousElementSibling;
    while (sib) {
      if (matchComplexRecursive(sib, items, prevCompoundIndex, scope, relativeAnchor)) return true;
      sib = sib.previousElementSibling;
    }
    return false;
  }

  // selectors-4 #descendant-combinators
  if (combinator.value === ' ') {
    let parent = getEffectiveParent(element);
    while (parent) {
      if (relativeAnchor && parent === relativeAnchor) {
        break;
      }
      if (matchComplexRecursive(parent, items, prevCompoundIndex, scope, relativeAnchor)) return true;
      parent = getEffectiveParent(parent);
    }
    return false;
  }

  // selectors-5 #the-column-combinator
  if (combinator.value === '||') {
    return false;
  }

  return false;
}

/**
 * Matches a compound selector (sequence of simple selectors).
 * selectors-4 #structure (<compound-selector>)
 * selectors-4 #match-against-element
 */
function matchCompoundSelector(element: DOMElement, compound: CompoundSelector, scope?: DOMElement): boolean {
  for (const simple of compound.selectors) {
    if (!matchSimpleSelector(element, simple, scope)) {
      return false;
    }
  }
  return true;
}

/**
 * Matches a simple selector (type, universal, class, ID, attribute, pseudo).
 * selectors-4 #structure (<simple-selector>)
 * selectors-4 #match-against-element
 */
function matchSimpleSelector(element: DOMElement, simple: SimpleSelector, scope?: DOMElement): boolean {
  switch (simple.type) {
    case 'type-selector': {
      const isXml = isXmlDocument(element);
      const elLocal = isXml ? (element.localName || element.tagName || '') : toAsciiLowerCase(element.localName || element.tagName || '');
      const selName = isXml ? simple.name : toAsciiLowerCase(simple.name);
      if (selName !== '*' && elLocal !== selName) return false;
      if (simple.namespace !== undefined && simple.namespace !== '*') {
        const isSvg = elLocal === 'svg' || element.namespaceURI === 'http://www.w3.org/2000/svg';
        if (simple.namespace === '') {
          // Trigger #3: Linkedom compatibility invariant - document.createElementNS(null, 'x') and un-namespaced XML elements in linkedom return 'http://www.w3.org/1999/xhtml' instead of null.
          if (element.namespaceURI && element.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
          if (isSvg) return false;
        } else if (simple.namespace === 'svg') {
          if (!isSvg && element.prefix !== 'svg' && element.namespaceURI !== 'http://www.w3.org/2000/svg') return false;
        } else {
          if (element.prefix !== simple.namespace && element.namespaceURI !== simple.namespace) return false;
        }
      }
      return true;
    }

    case 'universal-selector': {
      const elLocal = toAsciiLowerCase(element.localName || element.tagName || '');
      if (simple.namespace !== undefined && simple.namespace !== '*') {
        const isSvg = elLocal === 'svg' || element.namespaceURI === 'http://www.w3.org/2000/svg';
        if (simple.namespace === '') {
          if (element.namespaceURI && element.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
          if (isSvg) return false;
        } else if (simple.namespace === 'svg') {
          if (!isSvg && element.prefix !== 'svg' && element.namespaceURI !== 'http://www.w3.org/2000/svg') return false;
        } else {
          if (element.prefix !== simple.namespace && element.namespaceURI !== simple.namespace) return false;
        }
      }
      return true;
    }

    // selectors-4 #id-selectors
    case 'id-selector': {
      const id = element.id || (element.getAttribute ? element.getAttribute('id') : null);
      return id === simple.name;
    }

    // selectors-4 #class-html
    case 'class-selector': {
      if (element.classList && typeof element.classList.contains === 'function') {
        return element.classList.contains(simple.name);
      }
      const classAttr = (element.getAttribute ? element.getAttribute('class') : null) || element.className || '';
      return classAttr.split(/\s+/).includes(simple.name);
    }

    // selectors-4 #attribute-selectors
    case 'attribute-selector': {
      return matchAttributeSelector(element, simple);
    }

    // css-nesting-1 #nesting-selector
    case 'nesting-selector': {
      if (scope) return element === scope;
      return false;
    }

    // selectors-4 #pseudo-classes
    case 'pseudo-class-selector': {
      return matchPseudoClassSelector(element, simple, scope);
    }

    // selectors-4 #pseudo-elements
    // selectors-4 #match-against-pseudo-element
    case 'pseudo-element-selector': {
      return false;
    }

    default:
      return false;
  }
}

/**
 * Matches attribute selectors including null namespaces, operators, and sensitivity flags.
 * selectors-4 #attribute-selectors
 * selectors-4 #attribute-representation
 * selectors-4 #attribute-substrings
 * selectors-4 #attribute-case
 * selectors-4 #attrnmsp
 * selectors-4 #case-sensitive
 * html #case-sensitivity-of-selectors
 */
function matchAttributeSelector(element: DOMElement, sel: AttributeSelector): boolean {
  const attrName = sel.name;
  let hasAttr = false;
  let attrVal: string | null = null;

  if (sel.namespace === '') {
    // null namespace [|attr]
    if (element.hasAttributeNS?.(null, attrName)) {
      hasAttr = true;
      attrVal = element.getAttributeNS ? element.getAttributeNS(null, attrName) : null;
    } else if (element.hasAttribute?.(attrName)) {
      hasAttr = true;
      attrVal = element.getAttribute ? element.getAttribute(attrName) : null;
    }
  } else if (element.hasAttribute?.(attrName)) {
    hasAttr = true;
    attrVal = element.getAttribute ? element.getAttribute(attrName) : null;
  } else if (element.getAttribute) {
    attrVal = element.getAttribute(attrName);
    hasAttr = attrVal !== null;
  }

  // [attr] checks presence only
  if (!sel.operator) {
    return hasAttr;
  }

  if (!hasAttr || attrVal === null) return false;

  let actual = attrVal;
  let expected = sel.value ?? '';

  const isCaseInsensitive =
    toAsciiLowerCase(sel.flags || '') === 'i' ||
    (sel.flags !== 's' && isHTMLCaseInsensitiveAttribute(element, attrName));

  if (isCaseInsensitive) {
    actual = toAsciiLowerCase(actual);
    expected = toAsciiLowerCase(expected);
  }

  switch (sel.operator) {
    // selectors-4 #attribute-representation
    case '=':
      return actual === expected;
    case '~=':
      if (expected === '' || /\s/.test(expected)) return false;
      return actual.split(/\s+/).includes(expected);
    case '|=':
      return actual === expected || actual.startsWith(expected + '-');
    // selectors-4 #attribute-substrings
    case '^=':
      if (expected === '') return false;
      return actual.startsWith(expected);
    case '$=':
      if (expected === '') return false;
      return actual.endsWith(expected);
    case '*=':
      if (expected === '') return false;
      return actual.includes(expected);
    default:
      return false;
  }
}

// html #case-sensitivity-of-selectors
// selectors-4 #case-sensitive
const HTML_CASE_INSENSITIVE_ATTRIBUTES = /* @__PURE__ */ new Set('accept,accept-charset,align,alink,axis,bgcolor,charset,checked,clear,codetype,color,compact,declare,defer,dir,direction,disabled,enctype,face,frame,hreflang,http-equiv,lang,language,link,media,method,multiple,nohref,noresize,noshade,nowrap,readonly,rel,rev,rules,scope,scrolling,selected,shape,target,text,type,valign,valuetype,vlink'.split(','));

/**
 * html #case-sensitivity-of-selectors
 * https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
 * selectors-4 #case-sensitive
 */
function isHTMLCaseInsensitiveAttribute(element: DOMElement, attrName: string): boolean {
  // selectors-4 #case-sensitive
  // html #case-sensitivity-of-selectors
  if (isXmlDocument(element)) {
    return false;
  }
  return HTML_CASE_INSENSITIVE_ATTRIBUTES.has(toAsciiLowerCase(attrName));
}

/**
 * Matches functional, structural, and state pseudo-classes.
 * selectors-4 #pseudo-classes
 * selectors-4 #case-sensitive
 */
function matchPseudoClassSelector(element: DOMElement, pseudo: PseudoClassSelector, scope?: DOMElement): boolean {
  const name = toAsciiLowerCase(pseudo.name);

  // selectors-4 #pseudo-element-syntax, #legacy-aliasing
  if (name === 'after' || name === 'before' || name === 'first-letter' || name === 'first-line') {
    return false;
  }

  // selectors-4 #matches (:is, :matches) & #zero-matches (:where)
  if (name === 'is' || name === 'where' || name === 'matches') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      for (const complex of pseudo.argument.selectors) {
        if (complex.type === 'invalid-selector') continue;
        if (matchComplexSelector(element, complex, scope)) return true;
      }
    }
    return false;
  }

  // selectors-4 #negation
  if (name === 'not') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      for (const complex of pseudo.argument.selectors) {
        if (complex.type === 'invalid-selector') continue;
        if (matchComplexSelector(element, complex, scope)) return false;
      }
    }
    return true;
  }

  // selectors-4 #relational
  if (name === 'has') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      return matchHasPseudo(element, pseudo.argument, scope);
    }
    return false;
  }

  // selectors-4 #the-root-pseudo
  if (name === 'root') {
    if (element.ownerDocument && element.ownerDocument.documentElement) {
      return element === element.ownerDocument.documentElement;
    }
    return !element.parentElement && (!element.parentNode || element.parentNode.nodeType === 9);
  }

  // selectors-4 #the-empty-pseudo
  if (name === 'empty') {
    const childNodes = element.childNodes ? Array.from(element.childNodes) : [];
    return childNodes.every(n => n.nodeType === 8 || (n.nodeType === 3 && n.nodeValue === ''));
  }

  // selectors-4 #the-scope-pseudo
  if (name === 'scope') {
    if (scope) return element === scope;
    if (element.ownerDocument && element.ownerDocument.documentElement) {
      return element === element.ownerDocument.documentElement;
    }
    return !element.parentElement;
  }

  // css-shadow-1 #host-selector
  if (name === 'host' || name === 'host-context') {
    const isHost = Boolean(element.shadowRoot);
    if (!isHost) return false;
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      for (const complex of pseudo.argument.selectors) {
        if (complex.type === 'invalid-selector') continue;
        if (matchComplexSelector(element, complex)) return true;
      }
      return false;
    }
    return true;
  }

  // selectors-4 child-indexed pseudo-classes
  if (name === 'first-child' || name === 'last-child' || name === 'only-child' || name === 'nth-child' || name === 'nth-last-child') {
    const siblings = getElementSiblings(element);
    const elIndex1Based = siblings.indexOf(element) + 1;
    if (elIndex1Based === 0) return false;
    if (name === 'first-child') return elIndex1Based === 1;
    if (name === 'last-child') return elIndex1Based === siblings.length;
    if (name === 'only-child') return siblings.length === 1;

    const anb = getAnPlusB(pseudo);
    if (!anb) return false;
    let targetList = siblings;
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      const selectorList = pseudo.argument;
      if (!matches(element, selectorList, scope)) return false;
      targetList = siblings.filter(s => matches(s, selectorList, scope));
    }
    const idx = targetList.indexOf(element) + 1;
    if (idx === 0) return false;
    const pos = name === 'nth-child' ? idx : targetList.length - idx + 1;
    return matchAnPlusB(pos, anb.a, anb.b);
  }

  // selectors-4 type-indexed pseudo-classes
  if (name === 'first-of-type' || name === 'last-of-type' || name === 'only-of-type' || name === 'nth-of-type' || name === 'nth-last-of-type') {
    const siblings = getElementSiblings(element);
    const elLocal = toAsciiLowerCase(element.localName || element.tagName || '');
    const typeSiblings = siblings.filter(s => toAsciiLowerCase(s.localName || s.tagName || '') === elLocal);
    const typeIndex1Based = typeSiblings.indexOf(element) + 1;
    if (typeIndex1Based === 0) return false;
    if (name === 'first-of-type') return typeIndex1Based === 1;
    if (name === 'last-of-type') return typeIndex1Based === typeSiblings.length;
    if (name === 'only-of-type') return typeSiblings.length === 1;

    const anb = getAnPlusB(pseudo);
    if (!anb) return false;
    const pos = name === 'nth-of-type' ? typeIndex1Based : typeSiblings.length - typeIndex1Based + 1;
    return matchAnPlusB(pos, anb.a, anb.b);
  }

  // selectors-4 #the-dir-pseudo
  if (name === 'dir') {
    const expectedDir = toAsciiLowerCase(getPseudoArgumentString(pseudo));
    const actualDir = getElementDirection(element);
    return actualDir === expectedDir;
  }

  // selectors-5 #headings
  if (name === 'heading') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    const match = tag.match(/^h([1-6])$/);
    if (!match) return false;
    const level = Number(match[1]);
    const levels = getHeadingLevels(pseudo);
    if (levels.length === 0) return true;
    return levels.includes(level);
  }

  // selectors-4 #the-lang-pseudo
  // selectors-4 #case-sensitive
  if (name === 'lang') {
    const ranges = getLangRanges(pseudo);
    if (ranges.length === 0) return false;
    const elementLang = getElementLanguage(element);
    return ranges.some(range => matchLangRange(elementLang, range));
  }

  // Form states and interactions
  // selectors-4 #checked & html #selector-checked
  if (name === 'checked') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input') {
      const type = toAsciiLowerCase(element.getAttribute ? element.getAttribute('type') || '' : '');
      if (type === 'checkbox' || type === 'radio') {
        return element.checked || element.hasAttribute?.('checked') || false;
      }
    }
    if (tag === 'option') {
      return element.selected || element.hasAttribute?.('selected') || false;
    }
    return false;
  }

  // selectors-4 #enableddisabled & html #selector-disabled
  if (name === 'disabled') {
    return isElementDisabled(element);
  }
  // selectors-4 #enableddisabled & html #selector-enabled
  if (name === 'enabled') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset'].includes(tag)) {
      return !isElementDisabled(element);
    }
    return false;
  }

  // selectors-4 #rw-pseudos & html #selector-read-only
  if (name === 'read-only') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input' || tag === 'textarea') {
      return element.hasAttribute?.('readonly') || isElementDisabled(element);
    }
    return true;
  }
  // selectors-4 #rw-pseudos & html #selector-read-write
  if (name === 'read-write') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input' || tag === 'textarea') {
      return !element.hasAttribute?.('readonly') && !isElementDisabled(element);
    }
    return element.getAttribute?.('contenteditable') === 'true';
  }

  // selectors-4 #the-any-link-pseudo & selectors-4 #link & html #selector-link
  if (name === 'link' || name === 'any-link') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    return ['a', 'area', 'link'].includes(tag) && !!(element.hasAttribute?.('href') || element.getAttribute?.('href'));
  }

  // selectors-4 #the-target-pseudo
  if (name === 'target') {
    const hash = element.ownerDocument?.location?.hash?.replace(/^#/, '');
    return !!hash && (element.id === hash || element.getAttribute?.('id') === hash);
  }

  // selectors-4 #the-defined-pseudo
  if (name === 'defined') {
    return true;
  }

  // selectors-4 #the-hover-pseudo
  if (name === 'hover') {
    const doc = element.ownerDocument as { _hoverElement?: unknown } | null;
    const hovered = doc?._hoverElement || (element as { _isHovered?: boolean })._isHovered;
    if (!hovered) return false;
    if (hovered === element) return true;
    if (typeof (element as { contains?: (n: unknown) => boolean }).contains === 'function') {
      return (element as { contains: (n: unknown) => boolean }).contains(hovered);
    }
    let cur = (hovered as DOMElement).parentElement || (hovered as DOMElement).parentNode;
    while (cur) {
      if (cur === element) return true;
      cur = (cur as DOMElement).parentElement || (cur as DOMElement).parentNode;
    }
    return false;
  }

  // selectors-4 #the-focus-pseudo
  if (name === 'focus') {
    const doc = element.ownerDocument as { activeElement?: unknown; _focusedElement?: Element | null; contains?: (n: unknown) => boolean } | null;
    const active = doc && '_focusedElement' in doc ? doc._focusedElement : doc?.activeElement;
    if (!active || active !== element) return false;
    return typeof doc?.contains === 'function' ? doc.contains(element) : true;
  }

  // selectors-4 #the-focus-visible-pseudo
  if (name === 'focus-visible') {
    const doc = element.ownerDocument as { activeElement?: unknown; _focusedElement?: Element | null; contains?: (n: unknown) => boolean } | null;
    const active = doc && '_focusedElement' in doc ? doc._focusedElement : doc?.activeElement;
    if (!active || active !== element) return false;
    return typeof doc?.contains === 'function' ? doc.contains(element) : true;
  }

  // selectors-4 #the-focus-within-pseudo
  if (name === 'focus-within') {
    const doc = element.ownerDocument as { activeElement?: unknown; _focusedElement?: Element | null; contains?: (n: unknown) => boolean } | null;
    const active = doc && '_focusedElement' in doc ? doc._focusedElement : doc?.activeElement;
    if (!active) return false;
    if (typeof doc?.contains === 'function' && !doc.contains(active as DOMElement)) return false;
    if (active === element) return true;
    if (typeof (element as { contains?: (n: unknown) => boolean }).contains === 'function') {
      return (element as { contains: (n: unknown) => boolean }).contains(active);
    }
    let cur = (active as DOMElement).parentElement || (active as DOMElement).parentNode;
    while (cur) {
      if (cur === element) return true;
      cur = (cur as DOMElement).parentElement || (cur as DOMElement).parentNode;
    }
    return false;
  }

  // css-shadow-1 #the-has-slotted-pseudo
  if (name === 'has-slotted') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'slot') {
      if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
        const slottedNodes = typeof element.assignedNodes === 'function' ? element.assignedNodes({ flatten: true }) : Array.from(element.children || []);
        return slottedNodes.some(n => isElement(n) && matches(n, pseudo.argument as SelectorList, scope));
      }
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Evaluates the relational :has() pseudo-class against relative and descendant selectors.
 * selectors-4 #relational
 * selectors-4 #match-against-element
 */
function matchHasPseudo(element: DOMElement, selectorList: SelectorList, scope?: DOMElement): boolean {
  const contextualScope = scope ?? element;
  for (const complex of selectorList.selectors) {
    if (complex.type === 'invalid-selector') continue;
    const isSingleCompound = complex.items.length <= 2;
    if (complex.items[0]?.type === 'combinator') {
      const comb = (complex.items[0] as Combinator).value;
      if (comb === '>') {
        if (isSingleCompound) {
          const children = Array.from(element.children || []) as DOMElement[];
          for (const child of children) {
            if (matchComplexSelector(child, complex, contextualScope, element)) return true;
          }
        } else {
          const descendants = getAllDescendants(element);
          for (const desc of descendants) {
            if (matchComplexSelector(desc, complex, contextualScope, element)) return true;
          }
        }
      } else if (comb === '+') {
        if (isSingleCompound) {
          if (element.nextElementSibling) {
            if (matchComplexSelector(element.nextElementSibling, complex, contextualScope, element)) return true;
          }
        } else {
          let sib = element.nextElementSibling;
          while (sib) {
            if (matchComplexSelector(sib, complex, contextualScope, element)) return true;
            const sibDescendants = getAllDescendants(sib);
            for (const desc of sibDescendants) {
              if (matchComplexSelector(desc, complex, contextualScope, element)) return true;
            }
            sib = sib.nextElementSibling;
          }
        }
      } else if (comb === '~') {
        let sib = element.nextElementSibling;
        while (sib) {
          if (matchComplexSelector(sib, complex, contextualScope, element)) return true;
          if (!isSingleCompound) {
            const sibDescendants = getAllDescendants(sib);
            for (const desc of sibDescendants) {
              if (matchComplexSelector(desc, complex, contextualScope, element)) return true;
            }
          }
          sib = sib.nextElementSibling;
        }
      } else if (comb === ' ') {
        const descendants = getAllDescendants(element);
        for (const desc of descendants) {
          if (matchComplexSelector(desc, complex, contextualScope, element)) return true;
        }
      }
    } else {
      const descendants = getAllDescendants(element);
      for (const desc of descendants) {
        if (matchComplexSelector(desc, complex, contextualScope, element)) return true;
      }
    }
  }
  return false;
}

function getAllDescendants(root: DOMElement): DOMElement[] {
  const result: DOMElement[] = [];
  function walk(node: DOMElement) {
    const children = Array.from(node.children || []) as DOMElement[];
    for (const c of children) {
      result.push(c);
      walk(c);
    }
  }
  walk(root);
  return result;
}

function getElementSiblings(element: DOMElement): DOMElement[] {
  if (element.parentElement) {
    return Array.from(element.parentElement.children || []) as DOMElement[];
  }
  if (element.parentNode) {
    const children: DOMElement[] = [];
    const childNodes = element.parentNode.childNodes || [];
    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];
      if (isElement(node)) children.push(node);
    }
    if (children.length > 0) return children;
  }
  return [element];
}

function getAnPlusB(pseudo: PseudoClassSelector): { a: number; b: number } | null {
  if (pseudo.nth) {
    return parseAnPlusB(pseudo.nth);
  }
  if (Array.isArray(pseudo.argument)) {
    return parseAnPlusB(pseudo.argument as ComponentValue[]);
  }
  return null;
}

function matchAnPlusB(index: number, a: number, b: number): boolean {
  if (a === 0) return index === b;
  const diff = index - b;
  if (a > 0) return diff >= 0 && diff % a === 0;
  return diff <= 0 && diff % a === 0;
}

function getElementDirection(element: DOMElement): 'ltr' | 'rtl' {
  const dir = toAsciiLowerCase(element.getAttribute?.('dir') || '');
  if (dir === 'ltr' || dir === 'rtl') return dir;
  if (dir === 'auto') {
    const text = element.textContent || '';
    for (const char of text) {
      const code = char.codePointAt(0) || 0;
      if ((code >= 0x0590 && code <= 0x08ff) || (code >= 0xfb1d && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) {
        return 'rtl';
      }
      if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x02af)) {
        return 'ltr';
      }
    }
    return 'ltr';
  }
  const tag = toAsciiLowerCase(element.localName || element.tagName || '');
  if (tag === 'input' && toAsciiLowerCase(element.getAttribute?.('type') || '') === 'tel') {
    return 'ltr';
  }
  if (element.parentElement) {
    return getElementDirection(element.parentElement);
  }
  return 'ltr';
}

function getLangRanges(pseudo: PseudoClassSelector): string[] {
  if (!pseudo.argument) return [];
  if (Array.isArray(pseudo.argument)) {
    const ranges: string[] = [];
    for (const token of pseudo.argument as ComponentValue[]) {
      if (token.type === 'ident' || token.type === 'string') {
        ranges.push(String(token.value));
      }
    }
    return ranges;
  }
  if (typeof pseudo.argument === 'string') {
    const trimmed = (pseudo.argument as string).trim();
    if (trimmed === '""' || trimmed === "''") return [''];
    return trimmed
      .split(/\s*,\s*/)
      .map(s => s.replace(/^["']|["']$/g, ''));
  }
  return [];
}

function isValidSubtag(subtag: string, allowWildcard = false): boolean {
  if (allowWildcard && subtag === '*') return true;
  return subtag.length >= 1 && subtag.length <= 8 && /^[a-zA-Z0-9]+$/.test(subtag);
}

/**
 * selectors-4 #the-lang-pseudo: extended filtering per rfc4647 § 3.3.2
 */
function matchLangRange(elementLang: string | null, range: string): boolean {
  // selectors-4 #the-lang-pseudo:
  // A language range consisting of an empty string matches (only) elements whose language is not tagged.
  if (range === '') {
    return elementLang === null || elementLang === '';
  }

  // If the element has no language, it cannot match any non-empty range.
  if (elementLang === null || elementLang === '') {
    return false;
  }

  // Check language tag well-formedness: 1..8 ASCII alphanumeric characters per subtag.
  const tagSubtags = elementLang.split('-');
  for (let i = 0; i < tagSubtags.length; i++) {
    if (!isValidSubtag(tagSubtags[i])) return false;
  }

  // selectors-4 #the-lang-pseudo:
  // Wildcard language range ("*") matches any tagged element (provided well-formed).
  if (range === '*') {
    return true;
  }

  // Check language range well-formedness: each subtag must be '*' or 1..8 ASCII alphanum.
  const rangeSubtags = range.split('-');
  for (let i = 0; i < rangeSubtags.length; i++) {
    if (!isValidSubtag(rangeSubtags[i], true)) return false;
  }

  const rangeLower = rangeSubtags.map(toAsciiLowerCase);
  const tagLower = tagSubtags.map(toAsciiLowerCase);

  // RFC 4647 § 3.3.2 Step 2:
  // Begin with the first subtag in each list. If the first subtag in the range
  // does not match the first subtag in the tag, the overall match fails.
  if (rangeLower[0] !== '*' && rangeLower[0] !== tagLower[0]) {
    return false;
  }

  let rIdx = 1;
  let tIdx = 1;

  // RFC 4647 § 3.3.2 Step 3:
  // While there are more subtags left in the language range's list:
  while (rIdx < rangeLower.length) {
    // 3A. If the subtag in the range is '*', move to next subtag in range and continue.
    if (rangeLower[rIdx] === '*') {
      rIdx++;
      continue;
    }

    // 3B. If there are no more subtags in the tag's list, match fails.
    if (tIdx >= tagLower.length) {
      return false;
    }

    // 3C. If range subtag matches tag subtag, move both and continue.
    if (rangeLower[rIdx] === tagLower[tIdx]) {
      rIdx++;
      tIdx++;
      continue;
    }

    // 3D. If tag subtag is a singleton (single letter/digit), match fails.
    if (tagLower[tIdx].length === 1) {
      return false;
    }

    // 3E. Move to next subtag in tag's list and continue.
    tIdx++;
  }

  // RFC 4647 § 3.3.2 Step 4:
  // When the language range's list has no more subtags, match succeeds.
  return true;
}

const XML_LANG_NS = 'http://www.w3.org/XML/1998/namespace';

// html #the-lang-and-xml:lang-attributes: determine element language with xml:lang namespace precedence
export function getElementLanguage(element: DOMElement): string | null {
  const isXml = isXmlDocument(element);

  let curr: DOMElement | null = element;
  while (curr) {
    // html #the-lang-and-xml:lang-attributes: Step 1: attribute in XML namespace determines language across all documents
    if (curr.hasAttributeNS?.(XML_LANG_NS, 'lang')) {
      return curr.getAttributeNS?.(XML_LANG_NS, 'lang') ?? '';
    }
    // Literal un-namespaced xml:lang applies only in XML/XHTML documents
    if (isXml && curr.hasAttribute?.('xml:lang')) {
      return curr.getAttribute?.('xml:lang') ?? '';
    }
    // html #the-lang-and-xml:lang-attributes: Step 2: lang in no namespace
    if ((!isXml || curr.namespaceURI === 'http://www.w3.org/1999/xhtml' || curr.namespaceURI === 'http://www.w3.org/2000/svg') && curr.hasAttribute?.('lang')) {
      return curr.getAttribute?.('lang') ?? '';
    }
    // html #the-lang-and-xml:lang-attributes: Steps 3 & 4: shadow root host or parent element traversal
    curr = getEffectiveParent(curr);
  }

  // html #pragma-set-default-language: pragma-set default language from meta http-equiv="content-language"
  if (!isXml && element.ownerDocument && typeof element.ownerDocument.querySelectorAll === 'function') {
    const metas = element.ownerDocument.querySelectorAll('meta[http-equiv="content-language" i]');
    let pragmaLang: string | null = null;
    for (const meta of metas) {
      if (!meta.hasAttribute?.('content')) continue;
      const content = meta.getAttribute?.('content');
      if (!content || content.includes(',')) continue;
      const match = /^[^\t\n\f\r ]+/.exec(content.trimStart());
      if (match && match[0].length > 0) {
        pragmaLang = match[0];
      }
    }
    if (pragmaLang !== null) return pragmaLang;
  }

  return null;
}

function isElementDisabled(element: DOMElement): boolean {
  if (element.hasAttribute?.('disabled')) return true;
  if (element.parentElement) {
    const tag = toAsciiLowerCase(element.parentElement.localName || element.parentElement.tagName || '');
    if (tag === 'fieldset' && element.parentElement.hasAttribute?.('disabled')) {
      const firstLegend = (element.parentElement.children ? Array.from(element.parentElement.children) : []).find(
        c => toAsciiLowerCase(c.localName || c.tagName || '') === 'legend'
      );
      if (!firstLegend || !firstLegend.contains?.(element)) {
        return true;
      }
    }
    return isElementDisabled(element.parentElement);
  }
  return false;
}

function getPseudoArgumentString(pseudo: PseudoClassSelector): string {
  if (!pseudo.argument) return '';
  if (Array.isArray(pseudo.argument)) {
    return serialize(pseudo.argument as ComponentValue[]).trim();
  }
  return '';
}

function getHeadingLevels(pseudo: PseudoClassSelector): number[] {
  if (!pseudo.argument) return [];
  if (Array.isArray(pseudo.argument)) {
    const str = serialize(pseudo.argument as ComponentValue[]);
    const numbers = str.match(/\d+/g);
    return numbers ? numbers.map(Number) : [];
  }
  return [];
}
