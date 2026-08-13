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
} from './types.ts';

export interface DOMElement {
  nodeType?: number;
  tagName?: string;
  localName?: string;
  id?: string;
  className?: string;
  classList?: { contains(cls: string): boolean };
  getAttribute?(name: string): string | null;
  getAttributeNS?(namespace: string | null, name: string): string | null;
  hasAttribute?(name: string): boolean;
  hasAttributeNS?(namespace: string | null, name: string): boolean;
  attributes?: Array<{ name: string; value: string; prefix?: string | null }> | NamedNodeMap;
  parentElement?: DOMElement | null;
  parentNode?: DOMElement | null;
  children?: ArrayLike<DOMElement>;
  childNodes?: ArrayLike<{ nodeType: number; nodeValue?: string | null; textContent?: string | null }>;
  previousElementSibling?: DOMElement | null;
  nextElementSibling?: DOMElement | null;
  ownerDocument?: { documentElement?: DOMElement; contentType?: string; location?: { hash?: string } } | null;
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
 * selectors-4 § 3.2 Characters and case sensitivity (#case-sensitive)
 * html#case-sensitivity-of-selectors
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

function parseSelector(selector: string | ComplexSelector | SelectorList): SelectorList {
  if (typeof selector !== 'string') {
    if (selector.type === 'selector-list') return selector;
    if (selector.type === 'complex-selector') return { type: 'selector-list', selectors: [selector] };
  }
  try {
    const tokens = tokenize(selector);
    const parser = new Parser(tokens);
    const componentValues = parser.parseComponentValues();
    const selectorParser = new SelectorParser(componentValues, { allowRelative: true, forgiving: false });
    return selectorParser.parse();
  } catch {
    return { type: 'selector-list', selectors: [] };
  }
}

/**
 * Evaluates whether a given DOM element matches a CSS selector.
 * selectors-4 § 15 #match-against-element
 */
export function matches(element: unknown, selector: string | ComplexSelector | SelectorList, scopeElement?: unknown): boolean {
  if (!isElement(element)) return false;
  const list = parseSelector(selector);
  const scope = isElement(scopeElement) ? scopeElement : undefined;

  // Support mock elements that provide a custom matches(string) method without standard DOM properties
  const elObj = element as { matches?: (s: string) => boolean; localName?: string; tagName?: string; nodeType?: number };
  if (typeof elObj.matches === 'function' && !elObj.localName && !elObj.tagName && !elObj.nodeType) {
    for (const complex of list.selectors) {
      if (complex.type === 'invalid-selector') continue;
      const text = serialize(complex.tokens).trim();
      try {
        if (elObj.matches(text)) return true;
      } catch {
        // Mock threw
      }
    }
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
 * selectors-4 § 16 #match-against-tree
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
 * selectors-4 § 16 #match-against-tree
 */
export function querySelector(root: unknown, selector: string | ComplexSelector | SelectorList): DOMElement | null {
  const all = querySelectorAll(root, selector);
  return all.length > 0 ? all[0] : null;
}

/**
 * Matches a Complex Selector against an element using backtracking combinator evaluation.
 * selectors-4 § 3 #structure-of-selectors
 */
export function matchComplexSelector(element: DOMElement, complex: ComplexSelector, scope?: DOMElement): boolean {
  const items = complex.items;
  if (items.length === 0) return false;
  const lastIndex = items.length - 1;
  if (items[lastIndex].type !== 'compound-selector') return false;

  return matchComplexRecursive(element, items, lastIndex, scope);
}

function matchComplexRecursive(
  element: DOMElement,
  items: (CompoundSelector | Combinator)[],
  itemIndex: number,
  scope?: DOMElement
): boolean {
  const currentCompound = items[itemIndex] as CompoundSelector;
  if (!matchCompoundSelector(element, currentCompound, scope)) {
    return false;
  }

  // All compound selectors matched successfully
  if (itemIndex === 0) {
    return true;
  }

  // Handle leading relative combinator inside :has()
  if (itemIndex === 1 && items[0].type === 'combinator') {
    const leadingComb = (items[0] as Combinator).value;
    if (!scope) return true;
    if (leadingComb === '>') return element.parentElement === scope;
    if (leadingComb === '+') return element.previousElementSibling === scope;
    if (leadingComb === '~') {
      let sib = element.previousElementSibling;
      while (sib) {
        if (sib === scope) return true;
        sib = sib.previousElementSibling;
      }
      return false;
    }
    if (leadingComb === ' ') {
      let parent = element.parentElement;
      while (parent) {
        if (parent === scope) return true;
        parent = parent.parentElement;
      }
      return false;
    }
    return false;
  }

  const combinator = items[itemIndex - 1] as Combinator;
  const prevCompoundIndex = itemIndex - 2;

  // selectors-4 § 3.2 #child-combinators
  if (combinator.value === '>') {
    if (!element.parentElement) return false;
    return matchComplexRecursive(element.parentElement, items, prevCompoundIndex, scope);
  }

  // selectors-4 § 3.3 #adjacent-sibling-combinators
  if (combinator.value === '+') {
    if (!element.previousElementSibling) return false;
    return matchComplexRecursive(element.previousElementSibling, items, prevCompoundIndex, scope);
  }

  // selectors-4 § 3.4 #subsequent-sibling-combinators
  if (combinator.value === '~') {
    let sib = element.previousElementSibling;
    while (sib) {
      if (matchComplexRecursive(sib, items, prevCompoundIndex, scope)) return true;
      sib = sib.previousElementSibling;
    }
    return false;
  }

  // selectors-4 § 3.1 #descendant-combinators
  if (combinator.value === ' ') {
    let parent = element.parentElement;
    while (parent) {
      if (matchComplexRecursive(parent, items, prevCompoundIndex, scope)) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  // selectors-4 § 3.5 #column-combinator
  if (combinator.value === '||') {
    return false;
  }

  return false;
}

/**
 * Matches a compound selector (sequence of simple selectors).
 * selectors-4 § 3.6 #compound
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
 * selectors-4 § 3 #structure-of-selectors
 */
function matchSimpleSelector(element: DOMElement, simple: SimpleSelector, scope?: DOMElement): boolean {
  switch (simple.type) {
    // selectors-4 § 5.1 #type-selectors
    // selectors-4 § 3.2 #case-sensitive
    // html#case-sensitivity-of-selectors
    case 'type-selector': {
      const elLocal = toAsciiLowerCase(element.localName || element.tagName || '');
      const selName = toAsciiLowerCase(simple.name);
      if (selName !== '*' && elLocal !== selName) return false;
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

    // selectors-4 § 5.2 #universal-selector
    // selectors-4 § 3.2 #case-sensitive
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

    // selectors-4 § 6.2 #id-selectors
    case 'id-selector': {
      const id = element.id || (element.getAttribute ? element.getAttribute('id') : null);
      return id === simple.name;
    }

    // selectors-4 § 6.1 #class-html
    case 'class-selector': {
      if (element.classList && typeof element.classList.contains === 'function') {
        return element.classList.contains(simple.name);
      }
      const classAttr = (element.getAttribute ? element.getAttribute('class') : null) || element.className || '';
      return classAttr.split(/\s+/).includes(simple.name);
    }

    // selectors-4 § 7 #attribute-selectors
    case 'attribute-selector': {
      return matchAttributeSelector(element, simple);
    }

    // css-nesting-1 § 2 #nesting-selector
    case 'nesting-selector': {
      if (scope) return element === scope;
      return false;
    }

    // selectors-4 § 8 #pseudo-classes
    case 'pseudo-class-selector': {
      return matchPseudoClassSelector(element, simple, scope);
    }

    case 'pseudo-element-selector': {
      return false;
    }

    default:
      return false;
  }
}

/**
 * Matches attribute selectors including null namespaces, operators, and sensitivity flags.
 * selectors-4 § 7 #attribute-selectors
 * selectors-4 § 3.2 #case-sensitive
 * html#case-sensitivity-of-selectors
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
    case '=':
      return actual === expected;
    case '~=':
      if (expected === '' || /\s/.test(expected)) return false;
      return actual.split(/\s+/).includes(expected);
    case '|=':
      return actual === expected || actual.startsWith(expected + '-');
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

/**
 * HTML Standard § 15.3.1 Case-sensitivity of selectors
 * https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
 */
function isHTMLCaseInsensitiveAttribute(element: DOMElement, attrName: string): boolean {
  const tag = toAsciiLowerCase(element.localName || element.tagName || '');
  const attr = toAsciiLowerCase(attrName);
  if (tag === 'input' && attr === 'type') return true;
  return false;
}

/**
 * Matches functional, structural, and state pseudo-classes.
 * selectors-4 § 8 #pseudo-classes
 * selectors-4 § 3.2 #case-sensitive
 */
function matchPseudoClassSelector(element: DOMElement, pseudo: PseudoClassSelector, scope?: DOMElement): boolean {
  const name = toAsciiLowerCase(pseudo.name);

  // selectors-4 § 3.7 #legacy-pseudo-element-aliases
  if (name === 'after' || name === 'before' || name === 'first-letter' || name === 'first-line') {
    return false;
  }

  // selectors-4 § 4.1 #forgiving-selector
  if (name === 'is' || name === 'where' || name === 'matches') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      for (const complex of pseudo.argument.selectors) {
        if (complex.type === 'invalid-selector') continue;
        if (matchComplexSelector(element, complex, scope)) return true;
      }
    }
    return false;
  }

  // selectors-4 § 4.2 #negation
  if (name === 'not') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      for (const complex of pseudo.argument.selectors) {
        if (complex.type === 'invalid-selector') continue;
        if (matchComplexSelector(element, complex, scope)) return false;
      }
    }
    return true;
  }

  // selectors-4 § 4.3 #relational
  if (name === 'has') {
    if (pseudo.argument && typeof pseudo.argument === 'object' && 'type' in pseudo.argument && pseudo.argument.type === 'selector-list') {
      return matchHasPseudo(element, pseudo.argument);
    }
    return false;
  }

  // selectors-4 § 8.1 #root-pseudo
  if (name === 'root') {
    if (element.ownerDocument && element.ownerDocument.documentElement) {
      return element === element.ownerDocument.documentElement;
    }
    return !element.parentElement && (!element.parentNode || element.parentNode.nodeType === 9);
  }

  // selectors-4 § 8.2 #empty-pseudo
  if (name === 'empty') {
    const childNodes = element.childNodes ? Array.from(element.childNodes) : [];
    return childNodes.every(n => n.nodeType === 8 || (n.nodeType === 3 && n.nodeValue === ''));
  }

  // selectors-4 § 8.3 #the-scope-pseudo
  if (name === 'scope') {
    if (scope) return element === scope;
    if (element.ownerDocument && element.ownerDocument.documentElement) {
      return element === element.ownerDocument.documentElement;
    }
    return !element.parentElement;
  }

  // Siblings list calculation for child-indexed pseudo-classes
  const siblings = getElementSiblings(element);
  const elIndex1Based = siblings.indexOf(element) + 1;
  if (elIndex1Based === 0) return false;

  // selectors-4 § 8.7 #the-first-child-pseudo
  if (name === 'first-child') {
    return elIndex1Based === 1;
  }
  if (name === 'last-child') {
    return elIndex1Based === siblings.length;
  }
  if (name === 'only-child') {
    return siblings.length === 1;
  }

  // Type-based siblings
  const elLocal = toAsciiLowerCase(element.localName || element.tagName || '');
  const typeSiblings = siblings.filter(s => toAsciiLowerCase(s.localName || s.tagName || '') === elLocal);
  const typeIndex1Based = typeSiblings.indexOf(element) + 1;

  if (name === 'first-of-type') {
    return typeIndex1Based === 1;
  }
  if (name === 'last-of-type') {
    return typeIndex1Based === typeSiblings.length;
  }
  if (name === 'only-of-type') {
    return typeSiblings.length === 1;
  }

  // selectors-4 § 8.5 #the-nth-child-pseudo
  if (name === 'nth-child' || name === 'nth-last-child') {
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

  // selectors-4 § 8.6 #the-nth-of-type-pseudo
  if (name === 'nth-of-type' || name === 'nth-last-of-type') {
    const anb = getAnPlusB(pseudo);
    if (!anb) return false;
    const pos = name === 'nth-of-type' ? typeIndex1Based : typeSiblings.length - typeIndex1Based + 1;
    return matchAnPlusB(pos, anb.a, anb.b);
  }

  // selectors-4 § 9.1 #the-dir-pseudo
  if (name === 'dir') {
    const expectedDir = toAsciiLowerCase(getPseudoArgumentString(pseudo));
    const actualDir = getElementDirection(element);
    return actualDir === expectedDir;
  }

  // selectors-4 § 10.1 #the-heading-pseudo
  if (name === 'heading') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    const match = tag.match(/^h([1-6])$/);
    if (!match) return false;
    const level = Number(match[1]);
    const levels = getHeadingLevels(pseudo);
    if (levels.length === 0) return true;
    return levels.includes(level);
  }

  // selectors-4 § 9.2 #the-lang-pseudo
  // selectors-4 § 3.2 #case-sensitive
  if (name === 'lang') {
    const langArgs = getPseudoArgumentString(pseudo).split(/\s*,\s*/);
    const elementLang = toAsciiLowerCase(getElementLanguage(element));
    return langArgs.some(arg => {
      const clean = toAsciiLowerCase(arg.trim()).replace(/^["']|["']$/g, '');
      return elementLang === clean || elementLang.startsWith(clean + '-');
    });
  }

  // Form states and interactions
  if (name === 'checked') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input') {
      const type = toAsciiLowerCase(element.getAttribute ? element.getAttribute('type') || '' : '');
      if (type === 'checkbox' || type === 'radio') {
        return (element as unknown as { checked?: boolean }).checked || element.hasAttribute?.('checked') || false;
      }
    }
    if (tag === 'option') {
      return (element as unknown as { selected?: boolean }).selected || element.hasAttribute?.('selected') || false;
    }
    return false;
  }

  if (name === 'disabled') {
    return isElementDisabled(element);
  }
  if (name === 'enabled') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset'].includes(tag)) {
      return !isElementDisabled(element);
    }
    return false;
  }

  if (name === 'read-only') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input' || tag === 'textarea') {
      return element.hasAttribute?.('readonly') || isElementDisabled(element);
    }
    return true;
  }
  if (name === 'read-write') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    if (tag === 'input' || tag === 'textarea') {
      return !element.hasAttribute?.('readonly') && !isElementDisabled(element);
    }
    return element.getAttribute?.('contenteditable') === 'true';
  }

  if (name === 'link' || name === 'any-link') {
    const tag = toAsciiLowerCase(element.localName || element.tagName || '');
    return ['a', 'area', 'link'].includes(tag) && !!(element.hasAttribute?.('href') || element.getAttribute?.('href'));
  }

  if (name === 'target') {
    const hash = element.ownerDocument?.location?.hash?.replace(/^#/, '');
    return !!hash && (element.id === hash || element.getAttribute?.('id') === hash);
  }

  if (name === 'defined') {
    return true;
  }

  if (name === 'focus') {
    const doc = element.ownerDocument as { activeElement?: unknown; contains?: (n: unknown) => boolean } | null;
    const active = doc?.activeElement;
    if (!active || active !== element) return false;
    return typeof doc?.contains === 'function' ? doc.contains(element) : true;
  }

  if (name === 'focus-visible') {
    const doc = element.ownerDocument as { activeElement?: unknown; contains?: (n: unknown) => boolean } | null;
    const active = doc?.activeElement;
    if (!active || active !== element) return false;
    return typeof doc?.contains === 'function' ? doc.contains(element) : true;
  }

  if (name === 'focus-within') {
    const doc = element.ownerDocument as { activeElement?: unknown; contains?: (n: unknown) => boolean } | null;
    const active = doc?.activeElement;
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
 * selectors-4 § 4.3 #relational
 */
function matchHasPseudo(element: DOMElement, selectorList: SelectorList): boolean {
  for (const complex of selectorList.selectors) {
    if (complex.type === 'invalid-selector') continue;
    if (complex.items[0]?.type === 'combinator') {
      const comb = (complex.items[0] as Combinator).value;
      if (comb === '>') {
        const children = Array.from(element.children || []) as DOMElement[];
        for (const child of children) {
          if (matchComplexSelector(child, complex, element)) return true;
        }
      } else if (comb === '+') {
        if (element.nextElementSibling) {
          if (matchComplexSelector(element.nextElementSibling, complex, element)) return true;
        }
      } else if (comb === '~') {
        let sib = element.nextElementSibling;
        while (sib) {
          if (matchComplexSelector(sib, complex, element)) return true;
          sib = sib.nextElementSibling;
        }
      } else if (comb === ' ') {
        const descendants = getAllDescendants(element);
        for (const desc of descendants) {
          if (matchComplexSelector(desc, complex, element)) return true;
        }
      }
    } else {
      const descendants = getAllDescendants(element);
      for (const desc of descendants) {
        if (matchComplexSelector(desc, complex, element)) return true;
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

function getElementLanguage(element: DOMElement): string {
  if (element.getAttribute?.('lang')) {
    return element.getAttribute('lang') || '';
  }
  if (element.parentElement) {
    return getElementLanguage(element.parentElement);
  }
  return '';
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
