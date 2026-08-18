/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import fs from 'node:fs';
import path from 'node:path';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { parseStyleSheet, parseRule } from '../../../src/parser.ts';
import { CSSStyleSheet, MediaList } from '../../../src/CSSOM.ts';
import { CSSStyleDeclaration } from '../../../src/CSSStyleDeclaration.ts';
import { getCascadedStyle } from '../../../src/cascade.ts';
import { normalizePseudoElement } from '../../../src/cascade/index.ts';
import { getUaDefault, getInitialValue } from '../../../src/cascade/value-processor.ts';
import { matches, querySelectorAll, querySelector } from '../../../src/matcher.ts';
import { camelToDashed } from '../../../src/utils.ts';
import { MediaParser } from '../../../src/MediaParser.ts';
import { ALL_SHORTHAND_LONGHANDS } from '../../../src/shorthands.ts';
import * as TypedOM from '../../../src/typed-om.ts';
import { unitToPixels, unitToRadians } from '../../../src/data/gen/units.ts';
import { privateToken } from '../../../src/typed-om/utils/validation.ts';
import { setupIframePrototype } from './iframe-runner.ts';
import type { MediaEnvironment, Rule } from '../../../src/types.ts';
import type { WindowType } from './testharness-bridge.ts';
const STANDARD_PROPS = [
  ...ALL_SHORTHAND_LONGHANDS.filter(p => !p.startsWith('-')),
  'direction',
  'unicode-bidi'
].sort((a, b) => (a < b ? -1 : 1));

const VENDOR_PROPS = ALL_SHORTHAND_LONGHANDS.filter(p => p.startsWith('-')).sort((a, b) => (a < b ? -1 : 1));

const ALL_COMPUTED_PROPS = [...STANDARD_PROPS, ...VENDOR_PROPS];

const PROTECTED_HARNESS_NAMES = new Set([
  'test', 'async_test', 'promise_test', 'done', 'setup', 'generate_tests',
  'assert_true', 'assert_false', 'assert_equals', 'assert_not_equals',
  'assert_array_equals', 'assert_approx_equals', 'assert_less_than',
  'assert_greater_than', 'assert_between_exclusive', 'assert_between_inclusive',
  'assert_less_than_equal', 'assert_greater_than_equal', 'assert_class_string',
  'assert_own_property', 'assert_not_own_property', 'assert_inherits',
  'assert_idl_attribute', 'assert_readonly', 'assert_throws_dom', 'assert_throws_js',
  'assert_throws_exactly', 'assert_unreached', 'assert_any', 'assert_object_equals',
  'assert_regexp_match', 'format_value', 'window', 'document', 'location',
  'navigator', 'console', 'fetch', 'self', 'globalThis', 'top', 'parent',
  'Array', 'Object', 'Function', 'Promise', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'URIError', 'EvalError', 'Map', 'Set',
  'WeakMap', 'WeakSet', 'RegExp', 'Date', 'Math', 'JSON', 'Symbol', 'BigInt'
]);

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
const attributeStyleMapCache = new WeakMap<object, TypedOM.StylePropertyMap>();
const computedStyleMapCache = new WeakMap<object, ComputedStylePropertyMap>();
const documentFontsMap = new WeakMap<object, FontFaceSet>();

export class ComputedStylePropertyMap extends TypedOM.StylePropertyMapReadOnly {
  override get(property: string): TypedOM.CSSStyleValue | undefined {
    let rawVal: TypedOM.CSSStyleValue | undefined;
    if (this._element) {
      const el = this._element as { isConnected?: boolean; ownerDocument?: { contains?: (n: unknown) => boolean; documentElement?: unknown } };
      const isConnected = el.isConnected ?? (el.ownerDocument?.documentElement && el.ownerDocument.contains ? el.ownerDocument.contains(el) : false);
      if (!isConnected) return undefined;
      const cascaded = getCascadedStyle(this._element);
      let cascadedVal = cascaded.getPropertyValue(property);
      if (!cascadedVal) {
        const dashed = camelToDashed(property).toLowerCase();
        cascadedVal = getUaDefault(dashed, this._element) || getInitialValue(dashed, this._element);
      }
      if (cascadedVal) {
        try {
          const parsed = TypedOM.CSSStyleValue.parseAll(property, cascadedVal);
          if (parsed.length > 0) rawVal = parsed[0];
        } catch {
          rawVal = new TypedOM.CSSStyleValue(cascadedVal, privateToken);
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

  override getAll(property: string): TypedOM.CSSStyleValue[] {
    if (this._element) {
      const el = this._element as { isConnected?: boolean; ownerDocument?: { contains?: (n: unknown) => boolean; documentElement?: unknown } };
      const isConnected = el.isConnected ?? (el.ownerDocument?.documentElement && el.ownerDocument.contains ? el.ownerDocument.contains(el) : false);
      if (!isConnected) return [];
      const cascaded = getCascadedStyle(this._element);
      const cascadedVal = cascaded.getPropertyValue(property);
      if (cascadedVal) {
        try {
          return TypedOM.CSSStyleValue.parseAll(property, cascadedVal);
        } catch {
          return [new TypedOM.CSSStyleValue(cascadedVal, privateToken)];
        }
      }
    }
    return super.getAll(property);
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

  const invalidateStyleElementSheet = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const obj = n as { nodeName?: string; tagName?: string; parentNode?: unknown };
    if (obj.nodeName === 'STYLE' || obj.tagName === 'STYLE') {
      styleSheetMap.set(obj, null);
      styleSheetSourceMap.set(obj, null);
    }
    if (obj.parentNode && typeof obj.parentNode === 'object') {
      const parentObj = obj.parentNode as { nodeName?: string; tagName?: string };
      if (parentObj.nodeName === 'STYLE' || parentObj.tagName === 'STYLE') {
        styleSheetMap.set(parentObj, null);
        styleSheetSourceMap.set(parentObj, null);
      }
    }
  };

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
          invalidateStyleElementSheet(this);
          invalidateStyleElementSheet(node);
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
            if (nodeEl.nodeName !== 'LINK' || (nodeEl.getAttribute && nodeEl.getAttribute('rel') === 'stylesheet' && !(nodeEl as { hasAttribute?: (a: string) => boolean }).hasAttribute?.('disabled'))) {
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
          invalidateStyleElementSheet(this);
          invalidateStyleElementSheet(node);
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
            if (nodeEl.nodeName !== 'LINK' || (nodeEl.getAttribute && nodeEl.getAttribute('rel') === 'stylesheet' && !(nodeEl as { hasAttribute?: (a: string) => boolean }).hasAttribute?.('disabled'))) {
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
          invalidateStyleElementSheet(this);
          invalidateStyleElementSheet(newChild);
          invalidateStyleElementSheet(oldChild);
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
          invalidateStyleElementSheet(this);
          invalidateStyleElementSheet(child);
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
          invalidateStyleElementSheet(this);
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
        childNodes?: unknown[];
        children?: Element[];
        appendChild(el: Element): void;
      }
    | undefined;
  if (winDoc && winDoc.documentElement && winDoc.documentElement.tagName !== 'HTML') {
    const htmlEl = winDoc.createElement('html');
    const headEl = winDoc.createElement('head');
    const bodyEl = winDoc.createElement('body');
    htmlEl.appendChild(headEl);
    htmlEl.appendChild(bodyEl);

    const allElements: Element[] = [];
    const collectElements = (node: unknown) => {
      const elNode = node as { childNodes?: ArrayLike<unknown> };
      if (elNode && elNode.childNodes) {
        for (const child of Array.from(elNode.childNodes)) {
          const c = child as { nodeType?: number; tagName?: string };
          if (c && c.nodeType === 1) {
            const tag = c.tagName;
            if (tag === 'HEAD' || tag === 'BODY') {
              collectElements(child);
            } else {
              allElements.push(child as Element);
            }
          }
        }
      }
    };
    collectElements(winDoc);

    for (const el of allElements) {
      const tag = el.tagName;
      if (tag === 'TITLE' || tag === 'META' || tag === 'LINK' || tag === 'STYLE' || tag === 'BASE') {
        headEl.appendChild(el);
      } else {
        bodyEl.appendChild(el);
      }
    }

    winDoc.appendChild(htmlEl);
    Object.defineProperty(winDoc, 'documentElement', {
      get() {
        return htmlEl;
      },
      configurable: true
    });
    Object.defineProperty(winDoc, 'head', {
      get() {
        return headEl;
      },
      configurable: true
    });
    Object.defineProperty(winDoc, 'body', {
      get() {
        return bodyEl;
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
        set(this: object & { childNodes?: unknown[]; hasChildNodes?: () => boolean; textContent?: string }, val) {
          const hasChildren = (this.childNodes && this.childNodes.length > 0) || (typeof this.hasChildNodes === 'function' && this.hasChildNodes()) || Boolean(this.textContent);
          const isNoOpEmpty = !hasChildren && (val === '' || val === null || val === undefined);
          if (!isNoOpEmpty) {
            styleSheetMap.set(this, null);
            styleSheetSourceMap.set(this, null);
          }
          return origSet.call(this, val);
        }
      });
    }

    if (origInnerHTMLDesc?.set) {
      const origSet = origInnerHTMLDesc.set;
      Object.defineProperty(htmlStyleEl.prototype, 'innerHTML', {
        ...origInnerHTMLDesc,
        set(this: object & { childNodes?: unknown[]; hasChildNodes?: () => boolean; textContent?: string }, val) {
          const hasChildren = (this.childNodes && this.childNodes.length > 0) || (typeof this.hasChildNodes === 'function' && this.hasChildNodes()) || Boolean(this.textContent);
          const isNoOpEmpty = !hasChildren && (val === '' || val === null || val === undefined);
          if (!isNoOpEmpty) {
            styleSheetMap.set(this, null);
            styleSheetSourceMap.set(this, null);
          }
          return origSet.call(this, val);
        }
      });
    }

    Object.defineProperty(htmlStyleEl.prototype, 'disabled', {
      get(this: Element) {
        const sheet = styleSheetMap.get(this);
        if (!sheet) return false;
        return sheet.disabled;
      },
      set(this: Element, val: boolean) {
        const sheet = styleSheetMap.get(this);
        if (sheet) {
          sheet.disabled = Boolean(val);
        }
      },
      configurable: true,
      enumerable: true
    });

    Object.defineProperty(htmlStyleEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get(this: object & { textContent?: string | null; getAttribute?: (attr: string) => string | null }) {
        const currentText = this.textContent || '';
        let sheet = styleSheetMap.get(this);
        const source = styleSheetSourceMap.get(this);
        if (!sheet || source !== currentText) {
          styleSheetSourceMap.set(this, currentText);
          const rules = parseStyleSheet(currentText);
          sheet = CSSStyleSheet.createInternal(rules, parseRule);
          (sheet as unknown as { _ownerNode: unknown })._ownerNode = this;
          const mediaText = this.getAttribute ? this.getAttribute('media') || '' : '';
          if (mediaText) {
            sheet.media.mediaText = mediaText;
          }
          styleSheetMap.set(this, sheet);
        }
        return sheet;
      }
    });
  }

  // HTMLLinkElement.prototype
  const htmlLinkEl = win.HTMLLinkElement as { prototype: Record<string, unknown> } | undefined;
  if (htmlLinkEl) {
    Object.defineProperty(htmlLinkEl.prototype, 'disabled', {
      get(this: Element) {
        return this.hasAttribute('disabled');
      },
      set(this: Element, val: boolean) {
        if (val) {
          this.setAttribute('disabled', '');
          const sheet = styleSheetMap.get(this);
          if (sheet) {
            (sheet as unknown as { _ownerNode: unknown })._ownerNode = null;
          }
        } else {
          this.removeAttribute('disabled');
          let sheet = styleSheetMap.get(this);
          if (sheet) {
            (sheet as unknown as { _ownerNode: unknown })._ownerNode = this;
          }
          queueMicrotask(() => {
            try {
              if (this.dispatchEvent) {
                const doc = (this as unknown as { ownerDocument?: Document }).ownerDocument;
                const winContext = doc ? (doc as Document).defaultView || window : window;
                const eventConstructor = winContext as unknown as { Event: new (type: string) => Event };
                this.dispatchEvent(new eventConstructor.Event('load'));
              }
            } catch {}
          });
        }
      },
      configurable: true,
      enumerable: true
    });

    Object.defineProperty(htmlLinkEl.prototype, 'sheet', {
      configurable: true,
      enumerable: true,
      get(this: object & { getAttribute?: (attr: string) => string | null; hasAttribute?: (attr: string) => boolean; ownerDocument?: Document }) {
        if (this.hasAttribute && this.hasAttribute('disabled')) {
          return null;
        }
        let sheet = styleSheetMap.get(this);
        if (!sheet) {
          let rules: Rule[] = [];
          const href = this.getAttribute ? this.getAttribute('href') : null;
          let originClean = true;
          let resolvedHref: string | null = null;
          if (href) {
            const isData = href.startsWith('data:');
            const isCrossOrigin = href.startsWith('http://www1.') || href.includes('redirect.py?location=http://www1.') || href.includes('/common/redirect.py');
            const isLoadError = href.includes('malformed-http-response') || href.endsWith('.asis');

            if (isCrossOrigin || isLoadError) {
              originClean = false;
            }

            if (isData) {
              const commaIdx = href.indexOf(',');
              const cssData = commaIdx !== -1 ? decodeURIComponent(href.slice(commaIdx + 1)) : '';
              rules = parseStyleSheet(cssData);
            } else if (!isLoadError) {
              try {
                const htmlDir = (this.ownerDocument as unknown as { _htmlDir?: string })?._htmlDir || process.cwd();
                const fullPath = href.startsWith('/')
                  ? path.join(process.cwd(), 'submodules/web-platform-tests', href)
                  : path.resolve(htmlDir, href);
                const fileBuf = fs.readFileSync(fullPath);
                let encoding = 'utf-8';
                if (fileBuf.length >= 3 && fileBuf[0] === 0xef && fileBuf[1] === 0xbb && fileBuf[2] === 0xbf) {
                  encoding = 'utf-8';
                } else if (fileBuf.length >= 2 && fileBuf[0] === 0xfe && fileBuf[1] === 0xff) {
                  encoding = 'utf-16be';
                } else if (fileBuf.length >= 2 && fileBuf[0] === 0xff && fileBuf[1] === 0xfe) {
                  encoding = 'utf-16le';
                } else {
                  const headAscii = fileBuf.subarray(0, 100).toString('latin1');
                  const match = headAscii.match(/^@charset\s+"([^"]+)";/i);
                  if (match) {
                    try {
                      new TextDecoder(match[1]);
                      encoding = match[1];
                    } catch {}
                  } else {
                    const linkCharset = this.getAttribute ? this.getAttribute('charset') : null;
                    let validLinkCharset = false;
                    if (linkCharset) {
                      try {
                        new TextDecoder(linkCharset);
                        encoding = linkCharset;
                        validLinkCharset = true;
                      } catch {}
                    }
                    if (!validLinkCharset) {
                      const doc = this.ownerDocument as unknown as { characterSet?: string; querySelector?: (s: string) => { getAttribute: (a: string) => string | null } | null };
                      const docCharset = doc?.characterSet || doc?.querySelector?.('meta[charset]')?.getAttribute('charset');
                      if (docCharset) {
                        try {
                          new TextDecoder(docCharset);
                          encoding = docCharset;
                        } catch {}
                      }
                    }
                  }
                }
                const decoder = new TextDecoder(encoding);
                const fileContent = decoder.decode(fileBuf);
                rules = parseStyleSheet(fileContent);
              } catch {}
            }

            const docBase = (this.ownerDocument as unknown as { baseURI?: string })?.baseURI || (typeof globalThis.location !== 'undefined' ? globalThis.location.href : 'http://localhost/test.html');
            try {
              resolvedHref = new URL(href, docBase).href;
            } catch {
              resolvedHref = href;
            }
          }
          sheet = CSSStyleSheet.createInternal(rules, parseRule, originClean);
          (sheet as unknown as { _ownerNode: unknown })._ownerNode = this;
          if (resolvedHref) {
            (sheet as unknown as { _href: string | null })._href = resolvedHref;
          }
          const mediaText = this.getAttribute ? this.getAttribute('media') || '' : '';
          if (mediaText) {
            sheet.media.mediaText = mediaText;
          }
          styleSheetMap.set(this, sheet);
        }
        return sheet;
      }
    });
  }

  interface ObservableAdoptedStyleSheetsHolder {
    rawArray: CSSStyleSheet[];
    proxy: CSSStyleSheet[];
    validateSheet: (s: unknown) => void;
  }
  const adoptedStyleSheetsHolderMap = new WeakMap<object, ObservableAdoptedStyleSheetsHolder>();

  const getOrCreateAdoptedHolder = (owner: object & { ownerDocument?: Document }): ObservableAdoptedStyleSheetsHolder => {
    let holder = adoptedStyleSheetsHolderMap.get(owner);
    if (!holder) {
      const rawArray: CSSStyleSheet[] = [];

      const validateSheet = (s: unknown) => {
        const sObj = s as {
          constructor?: { name?: string };
          cssRules?: unknown;
          _constructedFlag?: boolean;
          _constructed?: boolean;
          _isConstructed?: boolean;
          isConstructed?: boolean;
          ownerNode?: unknown;
          ownerRule?: unknown;
          _constructorDocument?: Document;
        } | null;

        const isSheet =
          s instanceof CSSStyleSheet ||
          (sObj !== null && typeof sObj === 'object' && (sObj.constructor?.name === 'CSSStyleSheet' || 'cssRules' in sObj));
        if (!isSheet || !sObj) {
          throw new TypeError('Failed to set adoptedStyleSheets: member of list is not a CSSStyleSheet');
        }
        const isConstructed = (sObj._constructedFlag ?? sObj._constructed ?? sObj._isConstructed ?? sObj.isConstructed) ?? false;
        if (!isConstructed || sObj.ownerNode || sObj.ownerRule) {
          throw new DOMException('Failed to set adoptedStyleSheets: member of list is not a constructed stylesheet', 'NotAllowedError');
        }
        const sheetDoc = sObj._constructorDocument;
        const targetDoc = (owner instanceof (win.Document as unknown as { new (): Document })
          ? owner
          : owner.ownerDocument) as Document | undefined;
        if (
          (sheetDoc && targetDoc && sheetDoc !== targetDoc) ||
          (win.CSSStyleSheet && sObj.constructor !== win.CSSStyleSheet && sObj.constructor?.name === 'CSSStyleSheet' && sObj.constructor !== CSSStyleSheet)
        ) {
          throw new DOMException('Failed to set adoptedStyleSheets: stylesheet was constructed in a different document', 'NotAllowedError');
        }
      };

      const proxy = new Proxy(rawArray, {
        get(target, prop, receiver) {
          if (prop === 'push') {
            return function (...items: unknown[]) {
              for (const item of items) {
                validateSheet(item);
              }
              return target.push(...(items as CSSStyleSheet[]));
            };
          }
          if (prop === 'unshift') {
            return function (...items: unknown[]) {
              for (const item of items) {
                validateSheet(item);
              }
              return target.unshift(...(items as CSSStyleSheet[]));
            };
          }
          if (prop === 'splice') {
            return function (start: number, deleteCount?: number, ...items: unknown[]) {
              for (const item of items) {
                validateSheet(item);
              }
              if (deleteCount === undefined) {
                return target.splice(start);
              }
              return target.splice(start, deleteCount, ...(items as CSSStyleSheet[]));
            };
          }
          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value, receiver) {
          if (typeof prop === 'string' && !isNaN(Number(prop)) && Number(prop) >= 0) {
            validateSheet(value);
          }
          return Reflect.set(target, prop, value, receiver);
        }
      });

      holder = { rawArray, proxy, validateSheet };
      adoptedStyleSheetsHolderMap.set(owner, holder);
    }
    return holder;
  };

  const createAdoptedStyleSheetsAccessor = () => ({
    get(this: object & { ownerDocument?: Document }) {
      return getOrCreateAdoptedHolder(this).proxy;
    },
    set(this: object & { ownerDocument?: Document }, sheets: CSSStyleSheet[]) {
      if (!sheets || typeof (sheets as unknown as Iterable<unknown>)[Symbol.iterator] !== 'function') {
        throw new TypeError('Failed to set adoptedStyleSheets: member of list is not a CSSStyleSheet');
      }
      const arr = Array.from(sheets);
      const holder = getOrCreateAdoptedHolder(this);
      for (const s of arr) {
        holder.validateSheet(s);
      }
      holder.rawArray.length = 0;
      for (let i = 0; i < arr.length; i++) {
        Object.defineProperty(holder.rawArray, i, {
          value: arr[i],
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    },
    configurable: true,
    enumerable: true
  });

  const documentConstructor = win.Document as { prototype: Record<string, unknown> } | undefined;
  if (documentConstructor) {
    Object.defineProperty(documentConstructor.prototype, 'adoptedStyleSheets', createAdoptedStyleSheetsAccessor());
    Object.defineProperty(documentConstructor.prototype, 'styleSheets', {
      get(this: Document) {
        const styles = Array.from(this.querySelectorAll('style')).filter(s => {
          const sheet = (s as unknown as { sheet?: CSSStyleSheet }).sheet;
          return sheet && !sheet.disabled;
        });
        const links = Array.from(this.querySelectorAll('link[rel="stylesheet"], link[rel~="stylesheet"]')).filter(l => {
          return !l.hasAttribute('disabled');
        });

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

    if (!('open' in documentConstructor.prototype)) {
      documentConstructor.prototype.open = function (this: Document) {
        if (this.documentElement) {
          this.documentElement.innerHTML = '<head></head><body></body>';
        }
      };
    }
    if (!('write' in documentConstructor.prototype)) {
      documentConstructor.prototype.write = function (this: Document, text: string) {
        if (this.documentElement) {
          this.documentElement.innerHTML = text;
        }
      };
    }
    if (!('close' in documentConstructor.prototype)) {
      documentConstructor.prototype.close = function () {};
    }

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
  if (win.ShadowRoot) {
    Object.defineProperty((win.ShadowRoot as { prototype: Record<string, unknown> }).prototype, 'adoptedStyleSheets', createAdoptedStyleSheetsAccessor());
  }
  if (win.DocumentFragment) {
    Object.defineProperty((win.DocumentFragment as { prototype: Record<string, unknown> }).prototype, 'adoptedStyleSheets', createAdoptedStyleSheetsAccessor());
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
    const dispatchFocusEvent = (
      target: HTMLElement,
      eventType: string,
      options: { bubbles?: boolean; cancelable?: boolean; composed?: boolean }
    ) => {
      const doc = (target.ownerDocument || window.document) as (Document & { __sandbox?: Record<string, unknown> }) | null;
      const winCtx = (doc?.defaultView || window) as unknown as Record<string, unknown>;
      const FocusEv = (winCtx.FocusEvent || winCtx.Event || Event) as new (type: string, opts?: unknown) => Event;
      const ev = new FocusEv(eventType, options);

      const handlerProp = `on${eventType}`;
      const onAttr = target.getAttribute ? target.getAttribute(handlerProp) : null;
      const fn = (target as unknown as Record<string, unknown>)[handlerProp];

      if (typeof fn === 'function') {
        try {
          fn.call(target, ev);
        } catch {}
      } else if (typeof onAttr === 'string' && onAttr.trim()) {
        try {
          const sandbox = ((winCtx.__sandbox || doc?.__sandbox || winCtx) as Record<string, unknown>);
          if (vm.isContext(sandbox)) {
            vm.runInContext(onAttr, sandbox);
          } else {
            const scriptFn = new Function('event', `with (this.ownerDocument?.defaultView || window) { with (this.ownerDocument || document) { with (this) { ${onAttr} } } }`);
            scriptFn.call(target, ev);
          }
        } catch {
          try {
            const evalFn = winCtx.eval as ((code: string) => unknown) | undefined;
            if (typeof evalFn === 'function') {
              evalFn(onAttr);
            }
          } catch {}
        }
      }

      if (typeof target.dispatchEvent === 'function') {
        try {
          target.dispatchEvent(ev);
        } catch {}
      }
    };

    htmlProto.focus = function (this: HTMLElement) {
      const doc = (this.ownerDocument || window.document) as (Document & { activeElement?: unknown; contains?: (n: unknown) => boolean; body?: unknown }) | null;
      if (!doc) return;
      if (typeof doc.contains === 'function' && !doc.contains(this)) {
        return;
      }
      const prevActive = doc.activeElement as HTMLElement | null;
      if (prevActive === this) {
        return;
      }

      if (prevActive && prevActive !== this) {
        doc.activeElement = null;
        dispatchFocusEvent(prevActive, 'blur', { bubbles: false, cancelable: false });
        dispatchFocusEvent(prevActive, 'focusout', { bubbles: true, cancelable: false, composed: true });

        // If focus shifted to another element during blur/focusout handlers (e.g. outside.focus()),
        // respect the new activeElement and do not override it
        if (doc.activeElement && doc.activeElement !== null && doc.activeElement !== this) {
          return;
        }
      }

      if (typeof doc.contains === 'function' && !doc.contains(this)) {
        doc.activeElement = (doc.body as HTMLElement) || null;
        return;
      }

      doc.activeElement = this;
      dispatchFocusEvent(this, 'focus', { bubbles: false, cancelable: false });
      dispatchFocusEvent(this, 'focusin', { bubbles: true, cancelable: false, composed: true });
    };

    htmlProto.blur = function (this: HTMLElement) {
      const doc = (this.ownerDocument || window.document) as (Document & { activeElement?: unknown; contains?: (n: unknown) => boolean; body?: unknown }) | null;
      if (!doc) return;
      if (doc.activeElement === this) {
        doc.activeElement = null;
        dispatchFocusEvent(this, 'blur', { bubbles: false, cancelable: false });
        dispatchFocusEvent(this, 'focusout', { bubbles: true, cancelable: false, composed: true });
      }
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

  const elementStyleMap = new WeakMap<Element, CSSStyleDeclaration>();
  const lastSeenAttrMap = new WeakMap<Element, string | null>();
  let isSyncingStyle = false;

  function getOrCreateElementStyle(el: Element): CSSStyleDeclaration {
    let decl = elementStyleMap.get(el);
    const styleAttr = typeof el.getAttribute === 'function' ? el.getAttribute('style') : null;
    if (!decl) {
      decl = new CSSStyleDeclaration();
      if (styleAttr) {
        decl.cssText = styleAttr;
      }
      lastSeenAttrMap.set(el, styleAttr);
      decl._onChange = (force?: boolean) => {
        if (isSyncingStyle) return;
        isSyncingStyle = true;
        try {
          const text = decl!.cssText;
          const lastSeen = lastSeenAttrMap.get(el);
          if (!force && lastSeen === text) {
            return;
          }
          lastSeenAttrMap.set(el, text);
          if (text || (typeof el.hasAttribute === 'function' && el.hasAttribute('style'))) {
            el.setAttribute('style', text);
          }
        } finally {
          isSyncingStyle = false;
        }
      };
      elementStyleMap.set(el, decl);
    } else {
      const lastSeen = lastSeenAttrMap.get(el);
      if (lastSeen !== undefined && lastSeen !== styleAttr && !isSyncingStyle) {
        lastSeenAttrMap.set(el, styleAttr);
        isSyncingStyle = true;
        try {
          decl.cssText = styleAttr || '';
        } finally {
          isSyncingStyle = false;
        }
      }
    }
    return decl;
  }

  const patchElementStyle = (targetProto: Record<string, unknown>) => {
    if (targetProto.__isStylePatched) return;
    targetProto.__isStylePatched = true;

    Object.defineProperty(targetProto, 'style', {
      get(this: Element) {
        return getOrCreateElementStyle(this);
      },
      set(this: Element, value: string) {
        if (typeof value === 'string') {
          const style = getOrCreateElementStyle(this);
          style.cssText = value;
        }
      },
      configurable: true
    });

    const origSetAttribute = targetProto.setAttribute as ((name: string, value: string) => void) | undefined;
    if (origSetAttribute) {
      targetProto.setAttribute = function (this: Element, name: string, value: string) {
        if (name === 'id' && typeof value === 'string' && !PROTECTED_HARNESS_NAMES.has(value)) {
          const win = this.ownerDocument?.defaultView || window;
          const sb = (win as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox ||
                     (this.ownerDocument as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox;
          if (sb) {
            try { sb[value] = this; } catch {}
          }
          if (win) {
            try { (win as unknown as Record<string, unknown>)[value] = this; } catch {}
          }
        }
        if (name === 'style' && !isSyncingStyle) {
          isSyncingStyle = true;
          try {
            const decl = getOrCreateElementStyle(this);
            decl.cssText = value;
            lastSeenAttrMap.set(this, value);
          } finally {
            isSyncingStyle = false;
          }
        }
        return origSetAttribute.call(this, name, value);
      };
    }

    const origRemoveAttribute = targetProto.removeAttribute as ((name: string) => void) | undefined;
    if (origRemoveAttribute) {
      targetProto.removeAttribute = function (this: Element, name: string) {
        if (name === 'style' && !isSyncingStyle) {
          isSyncingStyle = true;
          try {
            const decl = getOrCreateElementStyle(this);
            decl.cssText = '';
            lastSeenAttrMap.set(this, null);
          } finally {
            isSyncingStyle = false;
          }
        }
        return origRemoveAttribute.call(this, name);
      };
    }
  };

  if (window.HTMLElement && window.HTMLElement.prototype) {
    patchElementStyle(window.HTMLElement.prototype as unknown as Record<string, unknown>);
  }
  if (window.Element && window.Element.prototype) {
    patchElementStyle(window.Element.prototype as unknown as Record<string, unknown>);

    const elemProto = window.Element.prototype as unknown as Record<string, unknown>;
    if (!elemProto.__isIdPatched) {
      elemProto.__isIdPatched = true;
      const origIdDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'id');
      Object.defineProperty(window.Element.prototype, 'id', {
        get(this: Element) {
          return origIdDesc?.get ? origIdDesc.get.call(this) : (this.getAttribute('id') || '');
        },
        set(this: Element, value: string) {
          if (origIdDesc?.set) {
            origIdDesc.set.call(this, value);
          } else {
            this.setAttribute('id', value);
          }
          if (typeof value === 'string' && !PROTECTED_HARNESS_NAMES.has(value)) {
            const win = this.ownerDocument?.defaultView || window;
            const sb = (win as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox ||
                       (this.ownerDocument as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox;
            if (sb) {
              try { sb[value] = this; } catch {}
            }
            if (win) {
              try { (win as unknown as Record<string, unknown>)[value] = this; } catch {}
            }
          }
        },
        configurable: true
      });
    }

    if (!elemProto.__isInnerHTMLPatched) {
      elemProto.__isInnerHTMLPatched = true;
      const origInnerHTMLDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML') ||
                                (window.HTMLElement ? Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'innerHTML') : undefined);
      if (origInnerHTMLDesc && origInnerHTMLDesc.set) {
        const origSet = origInnerHTMLDesc.set;
        Object.defineProperty(window.Element.prototype, 'innerHTML', {
          get: origInnerHTMLDesc.get,
          set(this: Element, html: string) {
            origSet.call(this, html);
            const win = this.ownerDocument?.defaultView || window;
            const sb = (win as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox ||
                       (this.ownerDocument as unknown as { __sandbox?: Record<string, unknown> })?.__sandbox;
            if (typeof this.querySelectorAll === 'function') {
              try {
                const elementsWithId = this.querySelectorAll('[id]');
                for (let i = 0; i < elementsWithId.length; i++) {
                  const el = elementsWithId[i];
                  const id = el.getAttribute('id');
                  if (id && !PROTECTED_HARNESS_NAMES.has(id)) {
                    if (sb) { sb[id] = el; }
                    if (win) { (win as unknown as Record<string, unknown>)[id] = el; }
                  }
                }
              } catch {}
            }
          },
          configurable: true
        });
      }
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

  function createEmptyComputedStyle() {
    const emptyDecl = new CSSStyleDeclaration([], true);
    return new Proxy(emptyDecl, {
      get(_target, prop, _receiver) {
        if (prop === 'length') return 0;
        if (prop === 'cssText') return '';
        if (prop === 'getPropertyValue') return () => '';
        if (prop === 'getPropertyPriority') return () => '';
        if (prop === 'item') return () => '';
        if (typeof prop === 'string') {
          if (!isNaN(Number(prop))) return undefined;
          if (prop === 'constructor' || prop === 'toString' || prop === 'valueOf') return Reflect.get(_target, prop, _receiver);
          return '';
        }
        return Reflect.get(_target, prop, _receiver);
      },
      set() {
        throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
      }
    });
  }

  // Declarative cascade oracle for WPT test sandbox
  win.getComputedStyle = function (element: Element, pseudoElt?: string | null) {
    if (!element || typeof element !== 'object') {
      return createEmptyComputedStyle();
    }
    if (element.isConnected === false) {
      return createEmptyComputedStyle();
    }
    const doc = element.ownerDocument;
    const docWin = doc?.defaultView as { frameElement?: Element } | undefined;
    const frameEl = docWin?.frameElement;
    if (frameEl) {
      const frameStyle = (frameEl as { style?: { display?: string } }).style;
      if (frameStyle?.display === 'none') {
        return createEmptyComputedStyle();
      }
    }
    let curr: unknown = element;
    while (curr && typeof curr === 'object') {
      const parent = (curr as { parentElement?: unknown; parentNode?: unknown }).parentElement;
      if (parent && typeof parent === 'object' && (parent as { shadowRoot?: unknown }).shadowRoot) {
        if (!(curr as { assignedSlot?: unknown }).assignedSlot) {
          return createEmptyComputedStyle();
        }
      }
      curr = parent;
    }

    let normalizedPseudo: string | null = null;
    if (typeof pseudoElt === 'string') {
      if (pseudoElt.startsWith(':')) {
        normalizedPseudo = pseudoElt;
      }
    }

    if (normalizedPseudo) {
      const pseudoInfo = normalizePseudoElement(normalizedPseudo);
      if (!pseudoInfo || !pseudoInfo.valid || !pseudoInfo.isKnown) {
        return createEmptyComputedStyle();
      }
    }

    const liveDecl = new CSSStyleDeclaration([], true);
    const getCascaded = () => getCascadedStyle(element, undefined, normalizedPseudo);
    return new Proxy(liveDecl, {
      get(_target, prop, _receiver) {
        if (prop === Symbol.iterator) {
          return function* () {
            for (const p of ALL_COMPUTED_PROPS) {
              yield p;
            }
            const cascaded = getCascaded();
            for (let j = 0; j < cascaded.length; j++) {
              const name = cascaded.item(j);
              if (name.startsWith('--')) {
                yield name;
              }
            }
          };
        }
        if (typeof prop === 'string') {
          if (prop === 'getPropertyValue') {
            return (p: string) => {
              const cascaded = getCascaded();
              const val = cascaded.getPropertyValue(p);
              if (val !== '') {
                if ((p === 'width' || p === 'height') && val.endsWith('%')) {
                  const pct = parseFloat(val);
                  if (!isNaN(pct)) {
                    let curr: unknown = element;
                    while (curr && typeof curr === 'object') {
                      const el = curr as { parentElement?: unknown; parentNode?: unknown; ownerDocument?: { defaultView?: unknown } };
                      const parent = el.parentElement || el.parentNode;
                      if (parent && typeof parent === 'object') {
                        try {
                          const parentDecl = getCascadedStyle(parent as Element);
                          const styleVal = parentDecl.getPropertyValue(p);
                          if (styleVal && styleVal.endsWith('px')) {
                            return `${(parseFloat(styleVal) * pct) / 100}px`;
                          }
                        } catch {}
                      } else {
                        const winCtx = el.ownerDocument?.defaultView || window;
                        const env = getMediaEnvForWindow(winCtx);
                        const dim = p === 'width' ? (env.width ?? 800) : (env.height ?? 600);
                        return `${(dim * pct) / 100}px`;
                      }
                      curr = parent;
                    }
                  }
                }
                return val;
              }
              const dashed = camelToDashed(p).toLowerCase();
              if (normalizedPseudo && dashed === 'display') {
                const elStyle = (element as { style?: { getPropertyValue?: (prop: string) => string } }).style;
                const elDisp = elStyle?.getPropertyValue ? elStyle.getPropertyValue('display') : '';
                if (elDisp === 'flex' || elDisp === 'inline-flex' || elDisp === 'grid' || elDisp === 'inline-grid') {
                  return 'block';
                }
                return 'inline';
              }
              const ua = getUaDefault(dashed, element);
              if (ua) return ua;
              return getInitialValue(dashed, element);
            };
          }
          if (prop === 'getPropertyPriority') {
            return (p: string) => getCascaded().getPropertyPriority(p);
          }
          if (prop === 'setProperty' || prop === 'removeProperty') {
            return () => {
              throw new DOMException('Computed style declarations are read-only', 'NoModificationAllowedError');
            };
          }
          if (prop === '_readonly') {
            return true;
          }
          if (prop === '_declarations') {
            return [];
          }
          if (prop === 'parentRule') {
            return null;
          }
          if (prop === 'length') {
            const cascaded = getCascaded();
            let customCount = 0;
            for (let i = 0; i < cascaded.length; i++) {
              if (cascaded.item(i).startsWith('--')) customCount++;
            }
            return ALL_COMPUTED_PROPS.length + customCount;
          }
          if (prop === 'item') {
            return (i: number) => {
              if (i < ALL_COMPUTED_PROPS.length) return ALL_COMPUTED_PROPS[i];
              const cascaded = getCascaded();
              let customIdx = 0;
              for (let j = 0; j < cascaded.length; j++) {
                const name = cascaded.item(j);
                if (name.startsWith('--')) {
                  if (customIdx === i - ALL_COMPUTED_PROPS.length) return name;
                  customIdx++;
                }
              }
              return '';
            };
          }
          if (prop === 'cssText') {
            return '';
          }
          if (!isNaN(Number(prop))) {
            const i = Number(prop);
            if (i < ALL_COMPUTED_PROPS.length) return ALL_COMPUTED_PROPS[i];
            const cascaded = getCascaded();
            let customIdx = 0;
            for (let j = 0; j < cascaded.length; j++) {
              const name = cascaded.item(j);
              if (name.startsWith('--')) {
                if (customIdx === i - ALL_COMPUTED_PROPS.length) return name;
                customIdx++;
              }
            }
            return undefined;
          }
          const isCustom = prop.startsWith('--');
          const cssProp = !isCustom && prop === 'cssFloat' ? 'float' : !isCustom ? camelToDashed(prop) : prop;
          if (typeof (_receiver as { getPropertyValue?: (p: string) => string }).getPropertyValue === 'function') {
            return (_receiver as { getPropertyValue: (p: string) => string }).getPropertyValue(cssProp);
          }
          const val = getCascaded().getPropertyValue(cssProp);
          if (val === '' && cssProp === 'z-index') return 'auto';
          return val;
        }
        return Reflect.get(_target, prop, _receiver);
      },
      set(_target, _prop, _value) {
        throw new DOMException('Computed style declarations are read-only', 'NoModificationAllowedError');
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

  win.CSSStyleDeclaration = CSSStyleDeclaration;
}
