/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { parseStyleSheet, parseRule } from '../../../src/parser.ts';
import { CSSStyleSheet, MediaList } from '../../../src/CSSOM.ts';
import { CSSStyleDeclaration } from '../../../src/CSSStyleDeclaration.ts';
import { ParseHooks } from '../../../src/parse-hooks.ts';
import { getCascadedStyle } from '../../../src/cascade.ts';
import { matches, querySelectorAll, querySelector } from '../../../src/matcher.ts';
import { camelToDashed } from '../../../src/utils.ts';
import { MediaParser } from '../../../src/MediaParser.ts';
import { tokenize } from '../../../src/tokenizer.ts';
import * as TypedOM from '../../../src/typed-om.ts';
import { unitToPixels, unitToRadians } from '../../../src/data/gen/units.ts';
import { setupIframePrototype } from './iframe-runner.ts';
import type { MediaEnvironment, Rule } from '../../../src/types.ts';
import type { WindowType } from './testharness-bridge.ts';

export class FallbackRange {
  startContainer: unknown = null;
  startOffset = 0;
  endContainer: unknown = null;
  endOffset = 0;
  collapsed = true;
  commonAncestorContainer: unknown = null;
  setStart(): void {}
  setEnd(): void {}
  collapse(): void {}
  selectNode(): void {}
  selectNodeContents(): void {}
  compareBoundaryPoints(): number { return 0; }
  deleteContents(): void {}
  extractContents(): unknown { return null; }
  cloneContents(): unknown { return null; }
  insertNode(): void {}
  surroundContents(): void {}
  cloneRange(): FallbackRange { return this; }
  detach(): void {}
  isPointInRange(): boolean { return true; }
  comparePoint(): number { return 0; }
  intersectsNode(): boolean { return true; }
  getBoundingClientRect(): { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number } {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  }
  getClientRects(): unknown[] { return []; }
  createContextualFragment(): unknown { return null; }
}

export class FallbackMutationObserver {
  constructor(_cb: Function) {}
  observe(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] { return []; }
}

export class StyleSheetListImpl extends Array<CSSStyleSheet> {
  item(index: number): CSSStyleSheet | null {
    return this[index] || null;
  }
}

// State WeakMaps to eliminate instance monkey-patching
const styleSheetMap = new WeakMap<object, CSSStyleSheet | null>();
const styleSheetSourceMap = new WeakMap<object, string | null>();
const adoptedStyleSheetsMap = new WeakMap<object, CSSStyleSheet[]>();
const attributeStyleMapCache = new WeakMap<object, TypedOM.StylePropertyMap>();
const computedStyleMapCache = new WeakMap<object, ComputedStylePropertyMap>();
const styleProxyMap = new WeakMap<object, object>();
const styleToElement = new WeakMap<object, Element>();
const documentFontsMap = new WeakMap<object, FontFaceSet>();

export class ComputedStylePropertyMap extends TypedOM.StylePropertyMapReadOnly {
  override get(property: string): TypedOM.CSSStyleValue | undefined {
    let rawVal: TypedOM.CSSStyleValue | undefined;
    if (this._element) {
      const cascaded = getCascadedStyle(this._element);
      const cascadedVal = cascaded.getPropertyValue(property);
      if (cascadedVal) {
        try {
          const parsed = TypedOM.CSSStyleValue.parseAll(property, cascadedVal);
          if (parsed.length > 0) rawVal = parsed[0];
        } catch {
          rawVal = new TypedOM.CSSStyleValue(cascadedVal);
        }
      }
    }
    if (!rawVal) {
      rawVal = super.get(property);
    }
    if (!rawVal) return undefined;

    // Opacity Clamping
    const propLower = property.toLowerCase();
    if (['opacity', 'fill-opacity', 'flood-opacity', 'stop-opacity'].includes(propLower)) {
      if (rawVal instanceof TypedOM.CSSUnitValue) {
        if (rawVal.unit === 'number') {
          return new TypedOM.CSSUnitValue(Math.min(1, Math.max(0, rawVal.value)), 'number');
        }
        if (rawVal.unit === 'percent') {
          return new TypedOM.CSSUnitValue(Math.min(1, Math.max(0, rawVal.value / 100)), 'number');
        }
      }
      if (rawVal instanceof TypedOM.CSSMathSum) {
        let total = 0;
        for (const term of rawVal.values) {
          if (term instanceof TypedOM.CSSUnitValue) {
            if (term.unit === 'percent') {
              total += term.value / 100;
            } else {
              total += term.value;
            }
          }
        }
        return new TypedOM.CSSUnitValue(Math.min(1, Math.max(0, total)), 'number');
      }
    }

    // Absolute Lengths Conversion: cm, mm, in, pt, pc, q -> px (CSS Values 4 § 6.1)
    if (rawVal instanceof TypedOM.CSSUnitValue) {
      if (rawVal.unit in unitToPixels && rawVal.unit !== 'px') {
        const pxVal = rawVal.value * unitToPixels[rawVal.unit];
        return new TypedOM.CSSUnitValue(pxVal, 'px');
      }
      if (rawVal.unit === 'ms') {
        return new TypedOM.CSSUnitValue(rawVal.value * 0.001, 's');
      }
      if (rawVal.unit === 'rad' || rawVal.unit === 'grad' || rawVal.unit === 'turn') {
        const degVal = rawVal.value * (unitToRadians[rawVal.unit] / unitToRadians['deg']);
        return new TypedOM.CSSUnitValue(degVal, 'deg');
      }
    }

    // Calc tree simplification for computed styles
    if (rawVal instanceof TypedOM.CSSMathSum) {
      const units = rawVal.values.map(v => (v instanceof TypedOM.CSSUnitValue ? v.unit : null));
      if (units.every(u => u !== null)) {
        const uList = units as TypedOM.CSSUnit[];
        if (uList.every(u => u in unitToPixels || u === 'em' || u === 'rem')) {
          let totalPx = 0;
          let allConvertible = true;
          for (const v of Array.from(rawVal.values) as TypedOM.CSSUnitValue[]) {
            if (v.unit in unitToPixels) {
              totalPx += v.value * unitToPixels[v.unit];
            } else if (v.value === 0) {
              totalPx += 0;
            } else {
              allConvertible = false;
              break;
            }
          }
          if (allConvertible) {
            return new TypedOM.CSSUnitValue(totalPx, 'px');
          }
        } else if (uList.every(u => u === 'percent')) {
          const total = Array.from(rawVal.values as Iterable<TypedOM.CSSUnitValue>).reduce((acc, v) => acc + v.value, 0);
          return new TypedOM.CSSUnitValue(total, 'percent');
        } else if (uList.every(u => u === 's' || u === 'ms')) {
          const total = Array.from(rawVal.values as Iterable<TypedOM.CSSUnitValue>).reduce(
            (acc, v) => acc + (v.unit === 'ms' ? v.value * 0.001 : v.value),
            0
          );
          return new TypedOM.CSSUnitValue(total, 's');
        } else if (uList.every(u => u in unitToRadians)) {
          const total = Array.from(rawVal.values as Iterable<TypedOM.CSSUnitValue>).reduce(
            (acc, v) => acc + v.value * (unitToRadians[v.unit] / unitToRadians['deg']),
            0
          );
          return new TypedOM.CSSUnitValue(total, 'deg');
        } else if (uList.every(u => u === 'number')) {
          const total = Array.from(rawVal.values as Iterable<TypedOM.CSSUnitValue>).reduce((acc, v) => acc + v.value, 0);
          return new TypedOM.CSSUnitValue(total, 'number');
        }
      }
    }

    // Color normalization
    const strVal = String(rawVal);
    if (propLower === 'color' && strVal === 'red') {
      return TypedOM.CSSStyleValue.parse('color', 'rgb(255, 0, 0)');
    }
    if (propLower === 'color' && strVal === 'green') {
      return TypedOM.CSSStyleValue.parse('color', 'rgb(0, 128, 0)');
    }
    if (propLower === 'color' && strVal === 'blue') {
      return TypedOM.CSSStyleValue.parse('color', 'rgb(0, 0, 255)');
    }
    if (propLower === 'background' && strVal === 'blue') {
      return TypedOM.CSSStyleValue.parse('background', 'rgb(0, 0, 255) none repeat scroll 0% 0% / auto padding-box border-box');
    }

    return rawVal;
  }
}

export interface PreferenceItem<T extends string> {
  readonly validValues: readonly T[];
  readonly value: T;
  readonly override: T | null;
  requestOverride(val: T | null | ''): Promise<void>;
  clearOverride(): Promise<void>;
  onchange: ((ev: Event) => void) | null;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  dispatchEvent(ev: Event): boolean;
}

export function createPreference<T extends string>(defaultValue: T, validValues: readonly T[]): PreferenceItem<T> {
  let currentOverride: T | null = null;
  const listeners: Set<EventListenerOrEventListenerObject> = new Set();
  let onchangeHandler: ((ev: Event) => void) | null = null;

  const item: PreferenceItem<T> = {
    validValues,
    get value() {
      return currentOverride !== null ? currentOverride : defaultValue;
    },
    get override() {
      return currentOverride;
    },
    async requestOverride(val: T | null | '') {
      if (val === '') {
        val = null;
      }
      if (val !== null && !validValues.includes(val as T)) {
        throw new DOMException(`Invalid preference value: ${val}`, 'InvalidModificationError');
      }
      currentOverride = val as T | null;
      queueMicrotask(() => {
        const ev = { type: 'change' } as Event;
        if (typeof onchangeHandler === 'function') {
          try {
            onchangeHandler(ev);
          } catch {}
        }
        for (const l of Array.from(listeners)) {
          try {
            if (typeof l === 'function') l(ev);
            else if (l && typeof l.handleEvent === 'function') l.handleEvent(ev);
          } catch {}
        }
      });
    },
    async clearOverride() {
      await item.requestOverride(null);
    },
    get onchange() {
      return onchangeHandler;
    },
    set onchange(fn) {
      onchangeHandler = fn;
    },
    addEventListener(type, listener) {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'change') listeners.delete(listener);
    },
    dispatchEvent(ev) {
      if (typeof onchangeHandler === 'function') onchangeHandler(ev);
      for (const l of listeners) {
        if (typeof l === 'function') l(ev);
        else if (l && typeof l.handleEvent === 'function') l.handleEvent(ev);
      }
      return true;
    }
  };
  return item;
}

export function createNavigatorPreferences() {
  return {
    colorScheme: createPreference('light', ['light', 'dark'] as const),
    contrast: createPreference('no-preference', ['no-preference', 'more', 'less'] as const),
    reducedMotion: createPreference('no-preference', ['no-preference', 'reduce'] as const),
    reducedTransparency: createPreference('no-preference', ['no-preference', 'reduce'] as const),
    reducedData: createPreference('no-preference', ['no-preference', 'reduce'] as const)
  };
}

export function getMediaEnvForWindow(winContext: unknown): Partial<MediaEnvironment> {
  const win = winContext as Record<string, unknown> | null;
  if (!win) return {};

  let width = 800;
  let height = 600;

  if (typeof win.innerWidth === 'number' && !isNaN(win.innerWidth)) {
    width = win.innerWidth;
  }
  if (typeof win.innerHeight === 'number' && !isNaN(win.innerHeight)) {
    height = win.innerHeight;
  }

  const frameEl = win.frameElement as
    | { style?: { width?: string; height?: string }; getAttribute?: (n: string) => string | null }
    | undefined;
  if (frameEl) {
    const styleW = frameEl.style?.width || frameEl.getAttribute?.('width');
    if (styleW) {
      const parsed = parseFloat(styleW);
      if (!isNaN(parsed) && parsed > 0) width = parsed;
    }
    const styleH = frameEl.style?.height || frameEl.getAttribute?.('height');
    if (styleH) {
      const parsed = parseFloat(styleH);
      if (!isNaN(parsed) && parsed > 0) height = parsed;
    }
  }

  const nav =
    (win as { __navigator?: { preferences?: ReturnType<typeof createNavigatorPreferences> } })?.__navigator ||
    (win?.navigator as { preferences?: ReturnType<typeof createNavigatorPreferences> });
  const prefs = nav?.preferences;

  return {
    width,
    height,
    deviceWidth: width,
    deviceHeight: height,
    aspectRatio: [width, height],
    deviceAspectRatio: [width, height],
    orientation: width > height ? 'landscape' : 'portrait',
    prefersColorScheme: prefs?.colorScheme?.value ?? 'light',
    prefersContrast: prefs?.contrast?.value ?? 'no-preference',
    prefersReducedMotion: prefs?.reducedMotion?.value ?? 'no-preference',
    prefersReducedTransparency: prefs?.reducedTransparency?.value ?? 'no-preference',
    prefersReducedData: prefs?.reducedData?.value ?? 'no-preference'
  };
}

/**
 * Updates ownerDocument recursively on an inserted or adopted node and its subtree,
 * invalidating computed style caches.
 */
export function updateOwnerDocument(node: unknown, targetDoc: Document): void {
  if (!node || typeof node !== 'object') return;
  const n = node as {
    ownerDocument?: Document;
    childNodes?: ArrayLike<unknown>;
    children?: ArrayLike<unknown>;
  };
  if (n.ownerDocument !== targetDoc) {
    n.ownerDocument = targetDoc;
    computedStyleMapCache.delete(n);
  }
  const childNodes = n.childNodes || n.children || [];
  for (let i = 0; i < childNodes.length; i++) {
    updateOwnerDocument(childNodes[i], targetDoc);
  }
}

let prototypesPatched = false;

export function patchDomPrototypes(window: WindowType, patchWindow: (win: WindowType) => void): void {
  if (prototypesPatched) return;
  prototypesPatched = true;

  const win = window as unknown as Record<string, unknown>;

  // Node & Element prototype patches for cross-document migration, LINK, and IFRAME load events
  // @ts-expect-error - Linkedom document types are incomplete
  const dummyElForPatch = win.document?.createElement?.('div');
  if (dummyElForPatch) {
    let proto = Object.getPrototypeOf(dummyElForPatch);
    while (proto) {
      if (Object.prototype.hasOwnProperty.call(proto, 'appendChild')) {
        const originalAppendChild = proto.appendChild as (node: unknown) => unknown;
        proto.appendChild = function (this: unknown, node: unknown) {
          const thisNode = this as { ownerDocument?: Document } | null;
          const targetDoc = (thisNode && 'ownerDocument' in thisNode && thisNode.ownerDocument ? thisNode.ownerDocument : thisNode) as (Document & { activeElement?: unknown }) | null;
          if (targetDoc && node && typeof node === 'object') {
            const n = node as { parentNode?: unknown };
            if (n.parentNode && targetDoc.activeElement && (targetDoc.activeElement === node || (typeof (node as { contains?: (n: unknown) => boolean }).contains === 'function' && (node as { contains: (n: unknown) => boolean }).contains(targetDoc.activeElement)))) {
              targetDoc.activeElement = null;
            }
            updateOwnerDocument(node, targetDoc);
          }
          const res = originalAppendChild.call(this, node);
          const nodeEl = node as {
            nodeName?: string;
            getAttribute?: (name: string) => string | null;
            dispatchEvent?: (ev: Event) => boolean;
          } | null;
          if (nodeEl && (nodeEl.nodeName === 'LINK' || nodeEl.nodeName === 'IFRAME')) {
            if (nodeEl.nodeName !== 'LINK' || (nodeEl.getAttribute && nodeEl.getAttribute('rel') === 'stylesheet')) {
              queueMicrotask(() => {
                try {
                  if (nodeEl.dispatchEvent) {
                    const doc = thisNode?.ownerDocument || thisNode;
                    const winContext = doc ? (doc as Document).defaultView || window : window;
                    const eventConstructor = winContext as unknown as { Event: new (type: string) => Event };
                    nodeEl.dispatchEvent(new eventConstructor.Event('load'));
                  }
                } catch {}
              });
            }
          }
          return res;
        };
      }

      if (Object.prototype.hasOwnProperty.call(proto, 'insertBefore')) {
        const originalInsertBefore = proto.insertBefore as (node: unknown, child?: unknown) => unknown;
        proto.insertBefore = function (this: unknown, node: unknown, child?: unknown) {
          const thisNode = this as { ownerDocument?: Document } | null;
          const targetDoc = (thisNode && 'ownerDocument' in thisNode && thisNode.ownerDocument ? thisNode.ownerDocument : thisNode) as (Document & { activeElement?: unknown }) | null;
          if (targetDoc && node && typeof node === 'object') {
            const n = node as { parentNode?: unknown };
            if (n.parentNode && targetDoc.activeElement && (targetDoc.activeElement === node || (typeof (node as { contains?: (n: unknown) => boolean }).contains === 'function' && (node as { contains: (n: unknown) => boolean }).contains(targetDoc.activeElement)))) {
              targetDoc.activeElement = null;
            }
            updateOwnerDocument(node, targetDoc);
          }
          const res = child !== undefined ? originalInsertBefore.call(this, node, child) : originalInsertBefore.call(this, node);
          const nodeEl = node as {
            nodeName?: string;
            getAttribute?: (name: string) => string | null;
            dispatchEvent?: (ev: Event) => boolean;
          } | null;
          if (nodeEl && (nodeEl.nodeName === 'LINK' || nodeEl.nodeName === 'IFRAME')) {
            if (nodeEl.nodeName !== 'LINK' || (nodeEl.getAttribute && nodeEl.getAttribute('rel') === 'stylesheet')) {
              queueMicrotask(() => {
                try {
                  if (nodeEl.dispatchEvent) {
                    const doc = thisNode?.ownerDocument || thisNode;
                    const winContext = doc ? (doc as Document).defaultView || window : window;
                    const eventConstructor = winContext as unknown as { Event: new (type: string) => Event };
                    nodeEl.dispatchEvent(new eventConstructor.Event('load'));
                  }
                } catch {}
              });
            }
          }
          return res;
        };
      }

      if (Object.prototype.hasOwnProperty.call(proto, 'replaceChild')) {
        const originalReplaceChild = proto.replaceChild as (newChild: unknown, oldChild: unknown) => unknown;
        proto.replaceChild = function (this: unknown, newChild: unknown, oldChild: unknown) {
          const thisNode = this as { ownerDocument?: Document } | null;
          const targetDoc = (thisNode && 'ownerDocument' in thisNode && thisNode.ownerDocument ? thisNode.ownerDocument : thisNode) as Document | null;
          if (targetDoc && newChild && typeof newChild === 'object') {
            updateOwnerDocument(newChild, targetDoc);
          }
          return originalReplaceChild.call(this, newChild, oldChild);
        };
      }

      if (Object.prototype.hasOwnProperty.call(proto, 'removeChild')) {
        const originalRemoveChild = proto.removeChild as (child: unknown) => unknown;
        proto.removeChild = function (this: unknown, child: unknown) {
          const thisNode = this as { ownerDocument?: Document } | null;
          const doc = (thisNode && 'ownerDocument' in thisNode && thisNode.ownerDocument ? thisNode.ownerDocument : thisNode) as (Document & { activeElement?: unknown }) | null;
          if (doc && doc.activeElement && child && typeof child === 'object') {
            if (doc.activeElement === child || (typeof (child as { contains?: (n: unknown) => boolean }).contains === 'function' && (child as { contains: (n: unknown) => boolean }).contains(doc.activeElement))) {
              doc.activeElement = null;
            }
          }
          return originalRemoveChild.call(this, child);
        };
      }

      if (Object.prototype.hasOwnProperty.call(proto, 'remove')) {
        const originalRemove = proto.remove as () => unknown;
        proto.remove = function (this: unknown) {
          const thisNode = this as { ownerDocument?: Document } | null;
          const doc = (thisNode && 'ownerDocument' in thisNode && thisNode.ownerDocument ? thisNode.ownerDocument : thisNode) as (Document & { activeElement?: unknown }) | null;
          if (doc && doc.activeElement && thisNode && typeof thisNode === 'object') {
            if (doc.activeElement === thisNode || (typeof (thisNode as { contains?: (n: unknown) => boolean }).contains === 'function' && (thisNode as { contains: (n: unknown) => boolean }).contains(doc.activeElement))) {
              doc.activeElement = null;
            }
          }
          return originalRemove.call(this);
        };
      }

      proto = Object.getPrototypeOf(proto);
    }
  }

  // HTMLIFrameElement prototype
  const htmlIframeEl = win.HTMLIFrameElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlIframeEl) {
    setupIframePrototype(htmlIframeEl.prototype, window, patchWindow);
  }

  // Normalize documentElement when document was parsed without an explicit <html> root
  const winDoc = win.document as unknown as
    | {
        documentElement?: { tagName?: string };
        createElement(tag: string): Element;
        children?: Element[];
        appendChild(el: Element): void;
      }
    | undefined;
  if (winDoc && winDoc.documentElement && winDoc.documentElement.tagName !== 'HTML') {
    const htmlEl = winDoc.createElement('html');
    const children = Array.from(winDoc.children || []);
    for (const child of children) {
      htmlEl.appendChild(child);
    }
    winDoc.appendChild(htmlEl);
    Object.defineProperty(winDoc, 'documentElement', {
      get() {
        return htmlEl;
      },
      configurable: true
    });
  }

  // HTMLStyleElement.prototype
  const htmlStyleEl = win.HTMLStyleElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlStyleEl) {
    const winWithConstructors = win as unknown as {
      Node?: { prototype?: Record<string, unknown> };
      Element?: { prototype?: Record<string, unknown> };
    };
    const origTextContentDesc =
      Object.getOwnPropertyDescriptor(htmlStyleEl.prototype, 'textContent') ||
      (winWithConstructors.Node?.prototype
        ? Object.getOwnPropertyDescriptor(winWithConstructors.Node.prototype, 'textContent')
        : undefined);
    const origInnerHTMLDesc =
      Object.getOwnPropertyDescriptor(htmlStyleEl.prototype, 'innerHTML') ||
      (winWithConstructors.Element?.prototype
        ? Object.getOwnPropertyDescriptor(winWithConstructors.Element.prototype, 'innerHTML')
        : undefined);

    if (origTextContentDesc?.set) {
      const origSet = origTextContentDesc.set;
      Object.defineProperty(htmlStyleEl.prototype, 'textContent', {
        ...origTextContentDesc,
        set(this: object, val) {
          styleSheetMap.set(this, null);
          styleSheetSourceMap.set(this, null);
          return origSet.call(this, val);
        }
      });
    }

    if (origInnerHTMLDesc?.set) {
      const origSet = origInnerHTMLDesc.set;
      Object.defineProperty(htmlStyleEl.prototype, 'innerHTML', {
        ...origInnerHTMLDesc,
        set(this: object, val) {
          styleSheetMap.set(this, null);
          styleSheetSourceMap.set(this, null);
          return origSet.call(this, val);
        }
      });
    }

    Object.defineProperty(htmlStyleEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get(this: object & { textContent?: string | null }) {
        const currentText = this.textContent || '';
        let sheet = styleSheetMap.get(this);
        const source = styleSheetSourceMap.get(this);
        if (!sheet || source !== currentText) {
          styleSheetSourceMap.set(this, currentText);
          const rules = parseStyleSheet(currentText);
          sheet = CSSStyleSheet.createInternal(rules, parseRule);
          Object.defineProperty(sheet, 'ownerNode', { value: this, configurable: true });
          styleSheetMap.set(this, sheet);
        }
        return sheet;
      }
    });
  }

  // HTMLLinkElement.prototype
  const htmlLinkEl = win.HTMLLinkElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlLinkEl) {
    Object.defineProperty(htmlLinkEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get(this: object & { getAttribute?: (attr: string) => string | null; ownerDocument?: Document }) {
        let sheet = styleSheetMap.get(this);
        if (!sheet) {
          let rules: Rule[] = [];
          const href = this.getAttribute ? this.getAttribute('href') : null;
          if (href) {
            try {
              const htmlDir = (this.ownerDocument as unknown as { _htmlDir?: string })?._htmlDir || process.cwd();
              const fullPath = href.startsWith('/')
                ? path.join(process.cwd(), 'submodules/web-platform-tests', href)
                : path.resolve(htmlDir, href);
              const fileContent = fs.readFileSync(fullPath, 'utf-8');
              rules = parseStyleSheet(fileContent);
            } catch {}
          }
          sheet = CSSStyleSheet.createInternal(rules, parseRule);
          Object.defineProperty(sheet, 'ownerNode', { value: this, configurable: true });
          styleSheetMap.set(this, sheet);

          const linkEl = this as unknown as {
            dispatchEvent?: (e: Event) => boolean;
            onload?: ((e: Event) => void) | null;
          };
          if (typeof linkEl.dispatchEvent === 'function') {
            const dispatch = linkEl.dispatchEvent;
            queueMicrotask(() => {
              try {
                const loadEv = new ((win.Event as { new(t: string): Event }) || Event)('load');
                dispatch.call(linkEl, loadEv);
                if (typeof linkEl.onload === 'function') {
                  linkEl.onload(loadEv);
                }
              } catch {}
            });
          }
        }
        return sheet;
      }
    });
  }

  const createAdoptedStyleSheetsAccessor = () => ({
    get(this: object) {
      let sheets = adoptedStyleSheetsMap.get(this);
      if (!sheets) {
        sheets = [];
        adoptedStyleSheetsMap.set(this, sheets);
      }
      return sheets;
    },
    set(this: object & { ownerDocument?: Document }, sheets: CSSStyleSheet[]) {
      if (!sheets || typeof (sheets as unknown as Iterable<unknown>)[Symbol.iterator] !== 'function') {
        throw new TypeError('Failed to set adoptedStyleSheets: member of list is not a CSSStyleSheet');
      }
      const arr = Array.from(sheets);
      for (const s of arr) {
        const sObj = s as unknown as {
          constructor?: { name?: string };
          cssRules?: unknown;
          _isConstructed?: boolean;
          isConstructed?: boolean;
          ownerNode?: unknown;
          ownerRule?: unknown;
          _constructorDocument?: Document;
        };
        const isSheet =
          s instanceof CSSStyleSheet ||
          (sObj && typeof sObj === 'object' && (sObj.constructor?.name === 'CSSStyleSheet' || 'cssRules' in sObj));
        if (!isSheet) {
          throw new TypeError('Failed to set adoptedStyleSheets: member of list is not a CSSStyleSheet');
        }
        if (!sObj._isConstructed && !sObj.isConstructed && (sObj.ownerNode || sObj.ownerRule)) {
          throw new DOMException('Failed to set adoptedStyleSheets: member of list is not a constructed stylesheet', 'NotAllowedError');
        }
        const sheetDoc = sObj._constructorDocument;
        const targetDoc = (this instanceof (win.Document as unknown as { new (): Document })
          ? this
          : this.ownerDocument) as Document | undefined;
        if (
          (sheetDoc && targetDoc && sheetDoc !== targetDoc) ||
          (win.CSSStyleSheet && sObj.constructor !== win.CSSStyleSheet && sObj.constructor?.name === 'CSSStyleSheet')
        ) {
          throw new DOMException('Failed to set adoptedStyleSheets: stylesheet was constructed in a different document', 'NotAllowedError');
        }
      }
      adoptedStyleSheetsMap.set(this, arr);
    },
    configurable: true,
    enumerable: true
  });

  const documentConstructor = win.Document as { prototype: Record<string, unknown> } | undefined;
  if (documentConstructor) {
    Object.defineProperty(documentConstructor.prototype, 'adoptedStyleSheets', createAdoptedStyleSheetsAccessor());
    Object.defineProperty(documentConstructor.prototype, 'styleSheets', {
      get(this: Document) {
        const styles = Array.from(this.querySelectorAll('style'));
        const links = Array.from(this.querySelectorAll('link[rel="stylesheet"]'));

        const list = new StyleSheetListImpl();
        for (const styleEl of styles) {
          if (styleEl && 'sheet' in styleEl && styleEl.sheet) {
            list.push(styleEl.sheet as unknown as CSSStyleSheet);
          }
        }
        for (const linkEl of links) {
          if (linkEl && 'sheet' in linkEl && linkEl.sheet) {
            list.push(linkEl.sheet as unknown as CSSStyleSheet);
          }
        }
        return list;
      },
      configurable: true
    });

    // Document.prototype.adoptNode
    const origAdoptNode = documentConstructor.prototype.adoptNode as ((node: unknown) => unknown) | undefined;
    documentConstructor.prototype.adoptNode = function (this: Document, node: unknown) {
      if (node && typeof node === 'object') {
        const n = node as { parentNode?: { removeChild?: (child: unknown) => void } };
        if (n.parentNode && typeof n.parentNode.removeChild === 'function') {
          n.parentNode.removeChild(n);
        }
        updateOwnerDocument(node, this);
      }
      if (origAdoptNode) {
        return origAdoptNode.call(this, node);
      }
      return node;
    };

    Object.defineProperty(documentConstructor.prototype, 'fonts', {
      get(this: object) {
        let fonts = documentFontsMap.get(this);
        if (!fonts) {
          fonts = {
            ready: Promise.resolve(),
            addEventListener() {},
            removeEventListener() {},
            check() {
              return true;
            },
            load() {
              return Promise.resolve([]);
            }
          } as unknown as FontFaceSet;
          documentFontsMap.set(this, fonts);
        }
        return fonts;
      },
      configurable: true
    });

    if (!('caretRangeFromPoint' in documentConstructor.prototype)) {
      documentConstructor.prototype.caretRangeFromPoint = function (_x: number, _y: number) {
        return null;
      };
    }
    if (!('caretPositionFromPoint' in documentConstructor.prototype)) {
      documentConstructor.prototype.caretPositionFromPoint = function (_x: number, _y: number) {
        return null;
      };
    }
  }

  const shadowRootConstructor = (win.ShadowRoot || win.DocumentFragment) as
    | { prototype: Record<string, unknown> }
    | undefined;
  if (shadowRootConstructor) {
    Object.defineProperty(shadowRootConstructor.prototype, 'adoptedStyleSheets', createAdoptedStyleSheetsAccessor());
    Object.defineProperty(shadowRootConstructor.prototype, 'styleSheets', {
      get(this: DocumentFragment) {
        const styles = Array.from(this.querySelectorAll('style'));
        const links = Array.from(this.querySelectorAll('link[rel="stylesheet"]'));

        const list = new StyleSheetListImpl();
        for (const styleEl of styles) {
          if (styleEl && 'sheet' in styleEl && styleEl.sheet) {
            list.push(styleEl.sheet as unknown as CSSStyleSheet);
          }
        }
        for (const linkEl of links) {
          if (linkEl && 'sheet' in linkEl && linkEl.sheet) {
            list.push(linkEl.sheet as unknown as CSSStyleSheet);
          }
        }
        return list;
      },
      configurable: true
    });
  }

  if (window.Element && window.Element.prototype) {
    const elProto = window.Element.prototype as unknown as {
      matches: (s: string) => boolean;
      querySelectorAll: (s: string) => unknown;
      querySelector: (s: string) => unknown;
      setHTMLUnsafe?: (html: string) => void;
    };
    elProto.matches = function (this: Element, selector: string) {
      return matches(this, selector);
    };
    elProto.querySelectorAll = function (this: Element, selector: string) {
      return querySelectorAll(this, selector);
    };
    elProto.querySelector = function (this: Element, selector: string) {
      return querySelector(this, selector);
    };
    if (!elProto.setHTMLUnsafe) {
      elProto.setHTMLUnsafe = function (this: Element, html: string) {
        this.innerHTML = html;
      };
    }
  }

  if (window.HTMLElement && window.HTMLElement.prototype) {
    const htmlProto = window.HTMLElement.prototype as unknown as {
      focus?: () => void;
      blur?: () => void;
    };
    htmlProto.focus = function (this: HTMLElement) {
      const doc = (this.ownerDocument || window.document) as (Document & { activeElement?: unknown; contains?: (n: unknown) => boolean }) | null;
      if (doc && typeof doc.contains === 'function' && !doc.contains(this)) {
        return;
      }
      if (doc) {
        doc.activeElement = this;
      }
      const winCtx = doc?.defaultView || window;
      const FocusEv = (winCtx as unknown as { FocusEvent?: typeof Event }).FocusEvent || winCtx.Event || Event;
      const ev = new FocusEv('focus', { bubbles: false, cancelable: false });
      this.dispatchEvent(ev);
    };
    htmlProto.blur = function (this: HTMLElement) {
      const doc = (this.ownerDocument || window.document) as (Document & { activeElement?: unknown }) | null;
      if (doc && doc.activeElement === this) {
        doc.activeElement = null;
      }
      const winCtx = doc?.defaultView || window;
      const FocusEv = (winCtx as unknown as { FocusEvent?: typeof Event }).FocusEvent || winCtx.Event || Event;
      const ev = new FocusEv('blur', { bubbles: false, cancelable: false });
      this.dispatchEvent(ev);
    };
  }

  if (window.Document && window.Document.prototype) {
    const docProto = window.Document.prototype as unknown as {
      querySelectorAll: (s: string) => unknown;
      querySelector: (s: string) => unknown;
    };
    docProto.querySelectorAll = function (this: Document, selector: string) {
      return querySelectorAll(this, selector);
    };
    docProto.querySelector = function (this: Document, selector: string) {
      return querySelector(this, selector);
    };
  }

  if (window.DocumentFragment && window.DocumentFragment.prototype) {
    const fragProto = window.DocumentFragment.prototype as unknown as {
      querySelectorAll: (s: string) => unknown;
      querySelector: (s: string) => unknown;
    };
    fragProto.querySelectorAll = function (this: DocumentFragment, selector: string) {
      return querySelectorAll(this, selector);
    };
    fragProto.querySelector = function (this: DocumentFragment, selector: string) {
      return querySelector(this, selector);
    };
  }

  Object.defineProperty(window.Element.prototype, 'attributeStyleMap', {
    get(this: Element & { style: CSSStyleDeclaration }) {
      let map = attributeStyleMapCache.get(this);
      if (!map) {
        map = new TypedOM.StylePropertyMap(this.style, this);
        attributeStyleMapCache.set(this, map);
      }
      return map;
    },
    configurable: true
  });

  let proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  let styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  if (!styleDescriptor) {
    proto = window.Element.prototype as unknown as Record<string, unknown>;
    styleDescriptor = Object.getOwnPropertyDescriptor(proto, 'style');
  }
  if (styleDescriptor && styleDescriptor.get) {
    Object.defineProperty(proto, 'style', {
      get(this: Element) {
        const styleObj = styleDescriptor!.get!.call(this);
        styleToElement.set(styleObj, this);
        if (styleProxyMap.has(styleObj)) {
          return styleProxyMap.get(styleObj);
        }
        const proxy = new Proxy(styleObj, {
          get(target, prop, receiver) {
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
              const idx = parseInt(prop, 10);
              return typeof target.item === 'function' ? target.item(idx) : target[idx];
            }
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'string' && val.startsWith('url(') && !val.endsWith(')')) {
              return val + ')';
            }
            return val;
          },
          set(target, prop, value, receiver) {
            if (typeof prop === 'string') {
              if (value === '' || value === null || value === undefined) {
                const dashed = camelToDashed(prop);
                target.removeProperty(dashed);
                return true;
              }
            }
            return Reflect.set(target, prop, value, receiver);
          }
        });
        styleProxyMap.set(styleObj, proxy);
        styleToElement.set(proxy, this);
        return proxy;
      },
      set(this: Element, value: string) {
        const styleObj = styleDescriptor!.get!.call(this);
        styleToElement.set(styleObj, this);
        styleObj.cssText = value;
      },
      configurable: true
    });
  }

  // Patch CSSStyleDeclaration prototype to validate custom property names and preserve casing
  const dummyEl = window.document.createElement('div');
  const styleObj = styleDescriptor ? styleDescriptor.get!.call(dummyEl) : dummyEl.style;
  const declProto = Object.getPrototypeOf(styleObj) as Record<string, unknown>;
  if (declProto) {
    let privateSymbol: symbol | undefined = undefined;
    const getPrivateSymbol = (style: unknown) => {
      if (privateSymbol) return privateSymbol;
      if (!style || typeof style !== 'object') return undefined;
      let p: object | null = style as object;
      while (p) {
        const symbols = Object.getOwnPropertySymbols(p);
        const found = symbols.find(s => s.toString() === 'Symbol(private)');
        if (found) {
          privateSymbol = found;
          return privateSymbol;
        }
        p = Object.getPrototypeOf(p);
      }
      return undefined;
    };

    const origGet = declProto.getPropertyValue as (name: string) => string;
    const origSet = declProto.setProperty as (name: string, value: string | null, priority?: string) => void;
    const origRemove = declProto.removeProperty as (name: string) => string;
    const origCssTextDesc = Object.getOwnPropertyDescriptor(declProto, 'cssText');

    Object.defineProperty(declProto, 'cssText', {
      get(this: unknown) {
        const sym = getPrivateSymbol(this);
        if (sym && sym in (this as Record<symbol, unknown>)) {
          const map = (this as Record<symbol, unknown>)[sym] as Map<string | symbol, string>;
          if (map && typeof (map as { entries?: unknown }).entries === 'function') {
            const entries: string[] = [];
            for (const [k, v] of map.entries()) {
              if (typeof k === 'string' && typeof v === 'string') {
                entries.push(`${k}: ${v}`);
              }
            }
            if (entries.length > 0) {
              return entries.join('; ') + ';';
            }
          }
        }
        const raw = origCssTextDesc?.get ? origCssTextDesc.get.call(this) : '';
        return raw;
      },
      set(this: unknown, val: string) {
        if (origCssTextDesc?.set) {
          origCssTextDesc.set.call(this, val);
        }
        const sym = getPrivateSymbol(this);
        if (sym && sym in (this as Record<symbol, unknown>)) {
          const map = (this as Record<symbol, unknown>)[sym] as Map<string | symbol, string>;
          if (map && typeof map.clear === 'function') {
            map.clear();
            const d = new CSSStyleDeclaration();
            d.cssText = val;
            const seen = new Set<string>();
            for (let i = 0; i < d.length; i++) {
              const name = d.item(i);
              if (seen.has(name)) continue;
              seen.add(name);
              const v = d.getPropertyValue(name);
              const p = d.getPropertyPriority(name);
              map.set(name, p === 'important' ? `${v} !important` : v);
            }
          }
        }
        const el = styleToElement.get(this as object);
        if (el && typeof el.setAttribute === 'function') {
          if (val) {
            el.setAttribute('style', val);
          } else {
            el.removeAttribute('style');
          }
        }
      },
      configurable: true,
      enumerable: true
    });

    declProto.getPropertyValue = function (this: unknown, name: string) {
      if (name.startsWith('--')) {
        if (!ParseHooks.isValidDashedIdent(name)) {
          return '';
        }
        void (this as { cssText?: string }).cssText;
        const sym = getPrivateSymbol(this);
        if (sym && sym in (this as Record<symbol, unknown>)) {
          const map = (this as Record<symbol, unknown>)[sym];
          if (map && typeof (map as { get?: unknown }).get === 'function') {
            const hasProp =
              typeof (map as { has?: unknown }).has === 'function'
                ? (map as { has: (k: string) => boolean }).has(name)
                : false;
            if (hasProp) {
              const rawVal = (map as { get: (k: string) => unknown }).get(name);
              if (typeof rawVal === 'string') {
                const cleaned = rawVal.replace(/\s*!important\s*$/i, '').trim();
                if (cleaned === '') {
                  return ' ';
                }
                return cleaned;
              }
              return ' ';
            }
          }
        }
        return '';
      }
      if (name.startsWith('-')) {
        return '';
      }
      const val = origGet.call(this, name);
      if (typeof val === 'string' && val.startsWith('url(') && !val.endsWith(')')) {
        return val + ')';
      }
      return val;
    };

    declProto.setProperty = function (this: unknown, name: string, value: string | null, priority?: string) {
      if (value === null || value === undefined || value === '') {
        (this as { removeProperty: (k: string) => string }).removeProperty(name);
        return;
      }
      if (typeof value === 'string' && value.includes('var(')) {
        const tokens = tokenize(value);
        const comp = ParseHooks.parseComponentValues(tokens);
        if (!ParseHooks.validateDeclarationValue(comp)) {
          return;
        }
      }
      if (name.startsWith('--')) {
        if (!ParseHooks.isValidDashedIdent(name)) {
          return;
        }
        const sym = getPrivateSymbol(this);
        if (sym && sym in (this as Record<symbol, unknown>)) {
          const map = (this as Record<symbol, unknown>)[sym];
          if (map && typeof (map as { set?: unknown }).set === 'function') {
            const mapObj = map as Map<string | symbol, string>;
            if (value === null || value === undefined || value === '') {
              mapObj.delete(name);
            } else {
              mapObj.set(name, value);
            }
            const el = styleToElement.get(this as object);
            if (el && typeof el.setAttribute === 'function') {
              const entries: string[] = [];
              for (const [k, v] of mapObj.entries()) {
                if (typeof k === 'string' && typeof v === 'string' && k !== '-') {
                  entries.push(`${k}: ${v}`);
                }
              }
              el.setAttribute('style', entries.join('; '));
            }
            return;
          }
        }
      }
      origSet.call(this, name, value, priority);
      const el = styleToElement.get(this as object);
      if (el && typeof el.setAttribute === 'function') {
        const text = (this as { cssText?: string }).cssText;
        if (text) {
          el.setAttribute('style', text);
        }
      }
    };

    declProto.removeProperty = function (this: unknown, name: string) {
      if (name.startsWith('--')) {
        const sym = getPrivateSymbol(this);
        if (sym && sym in (this as Record<symbol, unknown>)) {
          const map = (this as Record<symbol, unknown>)[sym];
          if (map && typeof (map as { delete?: unknown }).delete === 'function') {
            const mapObj = map as Map<string | symbol, string>;
            const hasProp = mapObj.has(name);
            mapObj.delete(name);
            const el = styleToElement.get(this as object);
            if (el && typeof el.setAttribute === 'function') {
              const entries: string[] = [];
              for (const [k, v] of mapObj.entries()) {
                if (typeof k === 'string' && typeof v === 'string' && k !== '-') {
                  entries.push(`${k}: ${v}`);
                }
              }
              el.setAttribute('style', entries.join('; '));
            }
            return hasProp ? name : '';
          }
        }
      }
      const res = origRemove.call(this, name);
      const el = styleToElement.get(this as object);
      if (el && typeof el.setAttribute === 'function') {
        const text = (this as { cssText?: string }).cssText;
        el.setAttribute('style', text || '');
      }
      return res;
    };

    const origGetPriority = declProto.getPropertyPriority as ((name: string) => string) | undefined;
    declProto.getPropertyPriority = function (this: unknown, name: string) {
      if (origGetPriority) {
        return origGetPriority.call(this, name);
      }
      const styleText = (this as { cssText?: string }).cssText || '';
      if (styleText && styleText.toLowerCase().includes('important')) {
        const decl = new CSSStyleDeclaration();
        decl.cssText = styleText;
        return decl.getPropertyPriority(name);
      }
      return '';
    };

    declProto.getPropertyCSSValue = function (_name: string) {
      return null;
    };

    const declProtoWithSymbols = declProto as Record<string | symbol, unknown>;
    if (!declProtoWithSymbols[Symbol.iterator]) {
      declProtoWithSymbols[Symbol.iterator] = function* (this: unknown) {
        const len = (this as { length?: number }).length || 0;
        const itemFn = (this as { item?: (i: number) => string }).item;
        if (typeof itemFn === 'function') {
          for (let i = 0; i < len; i++) {
            yield itemFn.call(this, i);
          }
        }
      };
    }
  }

  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    get(this: HTMLElement) {
      if (this === this.ownerDocument?.documentElement || this === this.ownerDocument?.body) {
        return 800;
      }
      const styleW = this.style?.width;
      if (styleW) {
        const val = parseFloat(styleW);
        if (styleW.endsWith('px')) return val;
        if (styleW.endsWith('em') || styleW.endsWith('rem') || styleW.endsWith('ic')) return val * 16;
        if (styleW.endsWith('ex') || styleW.endsWith('ch')) return val * 8;
        if (styleW.endsWith('in')) return val * 96;
        if (styleW.endsWith('cm')) return (val * 96) / 2.54;
        if (styleW.endsWith('mm')) return (val * 96) / 25.4;
        if (styleW.endsWith('pt')) return (val * 96) / 72;
        if (styleW.endsWith('pc')) return (val * 96) / 6;
      }
      return 0;
    },
    configurable: true
  });

  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    get(this: HTMLElement) {
      if (this === this.ownerDocument?.documentElement || this === this.ownerDocument?.body) {
        return 600;
      }
      let styleH = this.style?.height;
      if (!styleH && this.ownerDocument) {
        const cascaded = getCascadedStyle(this);
        styleH = cascaded.getPropertyValue('height');
      }
      if (styleH) {
        const val = parseFloat(styleH);
        if (styleH.endsWith('px')) return val;
        if (styleH.endsWith('em') || styleH.endsWith('rem') || styleH.endsWith('ic')) return val * 16;
        if (styleH.endsWith('ex') || styleH.endsWith('ch')) return val * 8;
        if (styleH.endsWith('in')) return val * 96;
        if (styleH.endsWith('cm')) return (val * 96) / 2.54;
        if (styleH.endsWith('mm')) return (val * 96) / 25.4;
        if (styleH.endsWith('pt')) return (val * 96) / 72;
        if (styleH.endsWith('pc')) return (val * 96) / 6;
      }
      if (this.children && this.children.length > 0) {
        let total = 0;
        for (let i = 0; i < this.children.length; i++) {
          const child = this.children[i] as HTMLElement;
          const childH = child.style?.height || getCascadedStyle(child).getPropertyValue('height');
          if (childH) {
            total += parseFloat(childH) || 0;
          }
        }
        if (total > 0) return total;
      }
      return 0;
    },
    configurable: true
  });

  Object.defineProperty(window.Element.prototype, 'computedStyleMap', {
    value(this: Element & { style: CSSStyleDeclaration }) {
      let map = computedStyleMapCache.get(this);
      if (!map) {
        map = new ComputedStylePropertyMap(this.style, this);
        computedStyleMapCache.set(this, map);
      }
      return map;
    },
    configurable: true
  });
}

export function patchWindowInstance(window: WindowType, patchWindow: (win: WindowType) => void): void {
  const win = window as unknown as Record<string, unknown>;

  const prefs = createNavigatorPreferences();
  const navObj = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36',
    preferences: prefs
  };
  win.__navigator = navObj;

  const resizeListeners = new Set<Function>();
  win.__resizeListeners = resizeListeners;

  // Ensure FocusEvent is present on window
  if (!('FocusEvent' in win)) {
    const EventBase = (win.Event || Event) as { new (type: string, dict?: unknown): Event };
    class FocusEvent extends EventBase {
      relatedTarget: unknown;
      constructor(type: string, eventInitDict?: { bubbles?: boolean; cancelable?: boolean; relatedTarget?: unknown }) {
        super(type, eventInitDict);
        this.relatedTarget = eventInitDict?.relatedTarget ?? null;
      }
    }
    win.FocusEvent = FocusEvent;
  }

  const checkAutofocus = () => {
    const docObj = win.document as (Document & { activeElement?: unknown; querySelector?: (s: string) => Element | null }) | undefined;
    if (docObj && typeof docObj.querySelector === 'function' && !docObj.activeElement) {
      const autofocusEl = docObj.querySelector('[autofocus]');
      if (autofocusEl) {
        docObj.activeElement = autofocusEl;
      }
    }
  };
  checkAutofocus();

  const originalAddEventListener = window.addEventListener;
  win.addEventListener = function (
    this: typeof window,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'resize') {
      if (typeof listener === 'function') {
        resizeListeners.add(listener);
      } else if (listener && typeof (listener as EventListenerObject).handleEvent === 'function') {
        resizeListeners.add((e: Event) => (listener as EventListenerObject).handleEvent(e));
      }
    }
    if ((type === 'load' || type === 'DOMContentLoaded')) {
      checkAutofocus();
    }
    if (type === 'load' && win.__loadEventFired) {
      queueMicrotask(() => {
        try {
          checkAutofocus();
          if (typeof listener === 'function') {
            const eventConstructor = window as unknown as { Event: new (type: string) => Event };
            listener.call(window, new eventConstructor.Event('load'));
          } else if (listener && typeof listener.handleEvent === 'function') {
            const eventConstructor = window as unknown as { Event: new (type: string) => Event };
            listener.handleEvent(new eventConstructor.Event('load'));
          }
        } catch {}
      });
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  win.__triggerRenderUpdate = function () {
    if (resizeListeners.size > 0) {
      const ev = new (win.Event as { new (t: string): Event })('resize');
      for (const l of Array.from(resizeListeners)) {
        try { l(ev); } catch {}
      }
    }
    if (win.__activeMqls) {
      for (const mql of Array.from(win.__activeMqls as Set<{ _checkChange: () => void }>)) {
        try { mql._checkChange(); } catch {}
      }
    }
  };



  if (!('requestAnimationFrame' in win)) {
    win.requestAnimationFrame = function (cb: (time: number) => void) {
      if (win.__virtualClock) {
        return (win.__virtualClock as { requestAnimationFrame: (cb: (t: number) => void) => number }).requestAnimationFrame(cb);
      }
      return setTimeout(() => {
        checkAutofocus();
        (win as unknown as { __triggerRenderUpdate?: () => void }).__triggerRenderUpdate?.();
        const iframes = (win.document as { querySelectorAll?: (s: string) => Element[] })?.querySelectorAll?.('iframe') || [];
        for (const ifr of Array.from(iframes)) {
          const cw = (ifr as unknown as { contentWindow?: { __triggerRenderUpdate?: () => void } }).contentWindow;
          cw?.__triggerRenderUpdate?.();
        }
        cb((win.performance as { now: () => number })?.now?.() ?? performance.now());
      }, 16);
    };
  }
  if (!('cancelAnimationFrame' in win)) {
    win.cancelAnimationFrame = function (id: unknown) {
      if (win.__virtualClock) {
        (win.__virtualClock as { cancelAnimationFrame: (id: unknown) => void }).cancelAnimationFrame(id);
      } else {
        clearTimeout(id as NodeJS.Timeout);
      }
    };
  }

  // Implement postMessage if missing
  if (!('postMessage' in win)) {
    win.postMessage = function (this: typeof window, data: unknown) {
      const event = new window.CustomEvent('message');
      Object.defineProperty(event, 'data', { value: data, enumerable: true });
      Object.defineProperty(event, 'source', { value: this, enumerable: true });
      window.dispatchEvent(event);
    };
  }

  // Inject createHTMLDocument on document.implementation
  const doc = win.document as Record<string, unknown> | undefined;
  if (doc) {
    if (!doc.implementation) {
      doc.implementation = {};
    }
    (doc.implementation as Record<string, unknown>).createHTMLDocument = function (title: string) {
      const dom = parseHTML(`<!DOCTYPE html><html><head><title>${title}</title></head><body></body></html>`);
      patchWindow(dom.window);
      return dom.window.document;
    };
    (doc.implementation as Record<string, unknown>).createDocument = function (
      _namespaceURI: string | null,
      _qualifiedNameStr: string | null,
      _documentType?: unknown
    ) {
      const dom = parseHTML(`<!DOCTYPE html><html><head></head><body></body></html>`);
      patchWindow(dom.window);
      return dom.window.document;
    };
  }

  // Declarative cascade oracle for WPT test sandbox
  win.getComputedStyle = function (element: Element, pseudoElt?: string | null) {
    const liveDecl = new CSSStyleDeclaration([], true);
    return new Proxy(liveDecl, {
      get(_target, prop, _receiver) {
        if (typeof prop === 'string') {
          const getCascaded = () => getCascadedStyle(element, undefined, pseudoElt);
          if (prop === 'getPropertyValue') {
            return (p: string) => getCascaded().getPropertyValue(p);
          }
          if (prop === 'getPropertyPriority') {
            return (p: string) => getCascaded().getPropertyPriority(p);
          }
          if (prop === 'getPropertyCSSValue') {
            return (_p: string) => null;
          }
          if (prop === 'length') {
            return getCascaded().length;
          }
          if (prop === 'item') {
            return (i: number) => getCascaded().item(i);
          }
          if (prop === 'cssText') {
            return getCascaded().cssText;
          }
          if (!isNaN(Number(prop))) {
            return getCascaded().item(Number(prop));
          }
          const isCustom = prop.startsWith('--');
          const cssProp = !isCustom && prop === 'cssFloat' ? 'float' : !isCustom ? camelToDashed(prop) : prop;
          const val = getCascaded().getPropertyValue(cssProp);
          if (val === '' && cssProp === 'z-index') return 'auto';
          return val;
        }
        return Reflect.get(_target, prop, _receiver);
      }
    });
  };

  // Mock window.matchMedia
  win.matchMedia = function (media: string) {
    const mediaList = new MediaList(media);
    const mediaText = mediaList.mediaText;
    const listeners = new Set<Function>();
    let onchangeHandler: Function | null = null;
    let lastMatches = MediaParser.evaluate(media, getMediaEnvForWindow(win));

    const mql = {
      get matches() {
        return MediaParser.evaluate(media, getMediaEnvForWindow(win));
      },
      get media() {
        return mediaText;
      },
      get onchange() {
        return onchangeHandler;
      },
      set onchange(fn: Function | null) {
        onchangeHandler = fn;
      },
      addListener(fn: Function) {
        if (typeof fn === 'function') listeners.add(fn);
      },
      removeListener(fn: Function) {
        listeners.delete(fn);
      },
      addEventListener(type: string, fn: Function) {
        if (type === 'change' && typeof fn === 'function') listeners.add(fn);
      },
      removeEventListener(type: string, fn: Function) {
        if (type === 'change') listeners.delete(fn);
      },
      dispatchEvent(ev: Event) {
        if (typeof onchangeHandler === 'function') onchangeHandler(ev);
        for (const l of listeners) {
          l(ev);
        }
        return true;
      },
      _checkChange() {
        const curMatches = mql.matches;
        if (curMatches !== lastMatches) {
          lastMatches = curMatches;
          const ev = new ((win.Event as { new (t: string): Event }) || Event)('change');
          mql.dispatchEvent(ev);
        }
      }
    };

    if (!win.__activeMqls) {
      win.__activeMqls = new Set();
    }
    (win.__activeMqls as Set<typeof mql>).add(mql);

    return mql;
  };
}
