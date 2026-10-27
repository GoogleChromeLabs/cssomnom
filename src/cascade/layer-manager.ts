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

import {
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSImportRule,
  CSSMediaRule,
  CSSSupportsRule,
  CSSGroupingRule,
  CSSStyleRule,
} from '../CSSOM.ts';
import { MediaParser } from '../MediaParser.ts';
import { supports } from '../parser-api.ts';
import type { Rule, MediaEnvironment, ElementLike } from '../types.ts';

interface LayerState {
  nextLayerIndex: number;
}

/**
 * Hierarchical tree of cascade layers to support implicit sublayer ordering.
 * css-cascade-5 #layer-names
 * css-cascade-5 #layer-ordering
 */
class LayerTree {
  public name: string;
  public fullPath: string;
  public children: Map<string, LayerTree> = new Map();

  constructor(name: string = '', fullPath: string = '') {
    this.name = name;
    this.fullPath = fullPath;
  }

  public getOrCreateChild(name: string): LayerTree {
    let child = this.children.get(name);
    if (!child) {
      const childFullPath = this.fullPath ? `${this.fullPath}.${name}` : name;
      child = new LayerTree(name, childFullPath);
      this.children.set(name, child);
    }
    return child;
  }

  /**
   * Registers a layer path e.g. "A.B.C" into the tree.
   */
  public registerPath(path: string): LayerTree {
    const parts = path.split('.');
    return parts.reduce((current: LayerTree, part) => {
      const trimmed = part.trim();
      return trimmed ? current.getOrCreateChild(trimmed) : current;
    }, this);
  }
}

/**
 * Assigns order numbers to layers according to css-cascade-5 #layer-ordering:
 * "Cascade layers are sorted by the order in which they first are declared,
 * with nested layers grouped within their parent layer.
 * Unlayered rules are sorted later than any layered rules within the same parent layer (if any)."
 */
function assignLayerOrders(
  root: LayerTree,
  layerDeclarationOrder: Map<string, number>
): void {
  let orderCounter = 1;

  function traverse(node: LayerTree): void {
    // 1. Visit all explicitly nested child layers in appearance order
    for (const child of node.children.values()) {
      traverse(child);
    }

    // 2. Rules directly inside this layer belong to its implicit sub-layer,
    // which is sorted AFTER all nested child layers of that parent layer.
    // (For root fullPath === '', this corresponds to the unlayered outer layer).
    layerDeclarationOrder.set(node.fullPath, orderCounter++);
  }

  traverse(root);
}

/**
 * Discovers and registers @layer declarations in layer order.
 * css-cascade-5 #layer-declaration
 * css-cascade-5 #layer-names
 * css-cascade-5 #layer-ordering
 */
function scanLayers(
  list: Rule[],
  root: LayerTree,
  state: LayerState = { nextLayerIndex: 1 },
  prefix: string = '',
  env?: Partial<MediaEnvironment>,
  isInsideStyleRule: boolean = false
): void {
  for (const r of list) {
    if (!isInsideStyleRule && r instanceof CSSLayerStatementRule) {
      const names = r.nameList || [];
      for (const n of names) {
        const fullName = prefix ? `${prefix}.${n}` : n;
        root.registerPath(fullName);
      }
    } else if (r instanceof CSSLayerBlockRule) {
      const rawName = r.name;
      let fullName: string;
      if (!rawName) {
        fullName = prefix ? `${prefix}.__anon_${state.nextLayerIndex++}` : `__anon_${state.nextLayerIndex++}`;
      } else {
        fullName = prefix ? `${prefix}.${rawName}` : rawName;
      }
      root.registerPath(fullName);
      r._assignedLayerName = fullName;
      const childRules = r.cssRules;
      if (childRules && childRules.length > 0) {
        scanLayers(Array.from(childRules), root, state, fullName, env, isInsideStyleRule);
      }
    } else if (r instanceof CSSImportRule) {
      const mediaText = r.media?.mediaText;
      if (mediaText && !MediaParser.evaluate(mediaText, env)) {
        // Condition is false; does not contribute to layer ordering
        continue;
      }
      if (r.supportsText && !supports(r.supportsText)) {
        continue;
      }

      const rawLayer = r.layerName;
      if (rawLayer !== null && rawLayer !== undefined) {
        let fullName: string;
        if (rawLayer === '') {
          fullName = prefix ? `${prefix}.__anon_${state.nextLayerIndex++}` : `__anon_${state.nextLayerIndex++}`;
        } else {
          fullName = prefix ? `${prefix}.${rawLayer}` : rawLayer;
        }
        r._assignedLayerName = fullName;
        root.registerPath(fullName);
        const importedSheet = r.styleSheet;
        if (importedSheet && importedSheet.cssRules) {
          scanLayers(Array.from(importedSheet.cssRules), root, state, fullName, env, isInsideStyleRule);
        }
      } else {
        const importedSheet = r.styleSheet;
        if (importedSheet && importedSheet.cssRules) {
          scanLayers(Array.from(importedSheet.cssRules), root, state, prefix, env, isInsideStyleRule);
        }
      }
    } else if (r instanceof CSSMediaRule) {
      // css-cascade-5 #layer-ordering: Layers defined inside conditional group rule
      // do not contribute to layer order unless condition is true
      const mediaText = r.media.mediaText;
      if (mediaText && !MediaParser.evaluate(mediaText, env)) {
        continue;
      }
      const childRules = r.cssRules;
      if (childRules && childRules.length > 0) {
        scanLayers(Array.from(childRules), root, state, prefix, env, isInsideStyleRule);
      }
    } else if (r instanceof CSSSupportsRule) {
      // css-cascade-5 #layer-ordering: Layers defined inside conditional group rule
      // do not contribute to layer order unless condition is true
      if (r.conditionText && !supports(r.conditionText)) {
        continue;
      }
      const childRules = r.cssRules;
      if (childRules && childRules.length > 0) {
        scanLayers(Array.from(childRules), root, state, prefix, env, isInsideStyleRule);
      }
    } else if (r instanceof CSSStyleRule) {
      if (r.cssRules && r.cssRules.length > 0) {
        scanLayers(Array.from(r.cssRules), root, state, prefix, env, true);
      }
    } else if (r instanceof CSSGroupingRule && r.cssRules) {
      scanLayers(Array.from(r.cssRules), root, state, prefix, env, isInsideStyleRule);
    }
  }
}

/**
 * Builds the layer declaration order map from a rule list.
 * css-cascade-5 #layer-ordering
 */
export function getLayerDeclarationOrder(
  ruleList: Rule[],
  env?: Partial<MediaEnvironment>
): Map<string, number> {
  const root = new LayerTree();
  const state: LayerState = { nextLayerIndex: 1 };
  scanLayers(ruleList, root, state, '', env);
  const layerDeclarationOrder = new Map<string, number>();
  assignLayerOrders(root, layerDeclarationOrder);
  return layerDeclarationOrder;
}

/**
 * Resolves media environment parameters from a DOM element or window.
 * mediaqueries-4 #media
 */
export function resolveMediaEnvironment(element?: ElementLike | null): Partial<MediaEnvironment> | undefined {
  if (!element || typeof element !== 'object') return undefined;
  const doc = (element as { ownerDocument?: { defaultView?: Record<string, unknown> } }).ownerDocument;
  const win = doc?.defaultView;
  if (!win) return undefined;

  let width = 800;
  let height = 600;
  if (typeof win.innerWidth === 'number' && !isNaN(win.innerWidth)) width = win.innerWidth;
  if (typeof win.innerHeight === 'number' && !isNaN(win.innerHeight)) height = win.innerHeight;
  const frameEl = win.frameElement as {
    width?: string | number;
    height?: string | number;
    style?: { width?: string; height?: string };
    getAttribute?: (n: string) => string | null;
  } | undefined;
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
  return {
    width,
    height,
    deviceWidth: width,
    deviceHeight: height,
    aspectRatio: [width, height],
    deviceAspectRatio: [width, height],
    orientation: width > height ? 'landscape' : 'portrait',
  };
}
