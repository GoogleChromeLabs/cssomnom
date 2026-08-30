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
  CSSGroupingRule,
  CSSRule,
} from '../CSSOM.ts';
import { serialize } from '../serializer.ts';
import type { Rule, ASTAtRule } from '../types.ts';

export interface LayerState {
  nextLayerIndex: number;
}

/**
 * Discovers and registers @layer declarations in layer order.
 * css-cascade-5 § 6.4.1 #layer-declaration
 * css-cascade-5 § 6.4.2 #layer-names
 * css-cascade-5 § 6.4.3 #layer-ordering
 */
export function scanLayers(
  list: (Rule | CSSRule)[],
  layerDeclarationOrder: Map<string, number>,
  state: LayerState = { nextLayerIndex: 1 },
  prefix: string = '',
  isInsideStyleRule: boolean = false
): void {
  const registerLayer = (name: string) => {
    const clean = name.trim();
    // css-cascade-5 § 6.4.3 #layer-ordering (sorted by the order in which they first are declared)
    if (clean && !layerDeclarationOrder.has(clean)) {
      layerDeclarationOrder.set(clean, state.nextLayerIndex++);
    }
  };

  for (const r of list) {
    if (
      !isInsideStyleRule && (
        r instanceof CSSLayerStatementRule ||
        ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && !(r as ASTAtRule).block)
      )
    ) {
      // css-cascade-5 § 6.4.1 #layer-declaration, § 6.4.4.2 #layer-empty (Layer Statement Rules)
      // css-cascade-5 § 6.4.2 #layer-names (nested layers concatenated with period)
      const names = (r as CSSLayerStatementRule).nameList || [];
      for (const n of names) {
        const fullName = prefix ? `${prefix}.${n}` : n;
        registerLayer(fullName);
      }
    } else if (
      r instanceof CSSLayerBlockRule ||
      ((r as ASTAtRule).type === 'at-rule' && (r as ASTAtRule).name === 'layer' && (r as ASTAtRule).block)
    ) {
      // css-cascade-5 § 6.4.1 #layer-declaration, § 6.4.4.1 #layer-block (Layer Block Rules)
      const rawName = (r as CSSLayerBlockRule).name || serialize((r as ASTAtRule).prelude || []).trim();
      let fullName: string;
      if (!rawName) {
        // css-cascade-5 § 6.4.2.1 #unnamed-layers (Anonymous Layers: unique anonymous segment)
        fullName = prefix ? `${prefix}.__anon_${state.nextLayerIndex}` : `__anon_${state.nextLayerIndex}`;
        registerLayer(fullName);
      } else {
        // css-cascade-5 § 6.4.2 #layer-names (nested layers grouped within parent layer per § 6.4.3)
        fullName = prefix ? `${prefix}.${rawName}` : rawName;
        registerLayer(fullName);
      }
      (r as unknown as { _assignedLayerName?: string })._assignedLayerName = fullName;
      if (r instanceof CSSGroupingRule && r.cssRules) {
        scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), layerDeclarationOrder, state, fullName, isInsideStyleRule);
      }
    } else if ('style' in r && 'selectorText' in r) {
      if ('cssRules' in r && (r as { cssRules?: unknown }).cssRules) {
        scanLayers(Array.from((r as { cssRules: ArrayLike<Rule | CSSRule> }).cssRules), layerDeclarationOrder, state, prefix, true);
      }
    } else if (r instanceof CSSGroupingRule && r.cssRules) {
      scanLayers(Array.from(r.cssRules as ArrayLike<Rule | CSSRule>), layerDeclarationOrder, state, prefix, isInsideStyleRule);
    }
  }
}

/**
 * Builds the layer declaration order map from a rule list.
 * css-cascade-5 § 6.4.3 #layer-ordering
 */
export function getLayerDeclarationOrder(ruleList: (Rule | CSSRule)[]): Map<string, number> {
  const layerDeclarationOrder = new Map<string, number>();
  const state: LayerState = { nextLayerIndex: 1 };
  scanLayers(ruleList, layerDeclarationOrder, state);
  return layerDeclarationOrder;
}

/**
 * Compares two layer orders according to CSS Cascade 5 § 6.1 #cascade-layering and § 6.4.3 #layer-ordering.
 * In normal cascade: latest layer order wins (aLayer - bLayer).
 * In important cascade: earliest layer order wins (bLayer - aLayer).
 */
export function compareLayerOrder(aLayer: number, bLayer: number, important: boolean): number {
  if (aLayer === bLayer) return 0;
  if (important) {
    // css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering: earliest layer wins
    return bLayer - aLayer;
  }
  // css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering: latest layer wins
  return aLayer - bLayer;
}
