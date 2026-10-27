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

import { compareSpecificity } from '../specificity.ts';
import type { MatchedDeclaration } from './types.ts';

/**
 * Compares two declarations according to css-cascade-5 #cascade-sort.
 * 1. Origin & Importance: css-cascade-5 #cascade-origin, #style-attr, #cascade-layering, #importance
 *    (Important inline > Important layered > Important unlayered > Normal inline > Normal unlayered > Normal layered)
 * 2. Layer Order: css-cascade-5 #cascade-layering, #layer-ordering (Normal: ascending; Important: descending)
 * 3. Specificity: css-cascade-5 #cascade-specificity, selectors-4 #specificity-rules
 * 4. Order of Appearance: css-cascade-5 #cascade-order (ascending)
 */
export function compareCascadeDeclarations(a: MatchedDeclaration, b: MatchedDeclaration): number {
  const getPrecedence = (decl: MatchedDeclaration): number => {
    // Criterion 1: Origin & Importance (Important Author > Normal Author)
    // Criterion 2: Context (Shadow Encapsulation)
    //   - Normal: document / part (2) > shadow (1) > slotted (0)
    //   - Important: shadow (2) > document / part (1) > slotted (0)
    // Criterion 3: Element-Attached Styles (inline style)
    // Criterion 4: Cascade Layers (Normal: unlayered > layered; Important: layered > unlayered)
    let scopeScore = 0;
    if (decl.treeScope === 'slotted') {
      scopeScore = 0;
    } else if (decl.treeScope === 'shadow') {
      scopeScore = decl.important ? 2 : 1;
    } else {
      scopeScore = decl.important ? 1 : 2;
    }

    // 1. Important user-agent declarations (beat important author)
    // 2. Important author declarations
    // 3. Animation declarations (beats normal author)
    // 4. Normal author declarations
    // 5. Normal user-agent declarations
    if (decl.origin === 'user-agent') {
      if (decl.important) {
        return 3000;
      }
      return -100;
    }
    if (decl.origin === 'animation') {
      return 500;
    }

    if (decl.important) {
      const inlineBonus = decl.isInline ? 50 : 0;
      const layerTier = decl.layerOrder !== Infinity ? 20 : 10;
      return 1000 + scopeScore * 100 + inlineBonus + layerTier;
    } else {
      const inlineBonus = decl.isInline ? 50 : 0;
      const layerTier = decl.layerOrder === Infinity ? 20 : 10;
      return scopeScore * 100 + inlineBonus + layerTier;
    }
  };

  const precA = getPrecedence(a);
  const precB = getPrecedence(b);
  if (precA !== precB) {
    return precA - precB;
  }

  // Layer order within importance bucket: css-cascade-5 #cascade-layering, #layer-ordering
  if (a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // For important rules, earliest layer wins (lower index)
    if (a.layerOrder !== b.layerOrder) {
      return b.layerOrder - a.layerOrder;
    }
  } else if (!a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // For normal rules, latest layer wins (higher index)
    if (a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
  }

  // Compare Specificity: css-cascade-5 #cascade-specificity, selectors-4 #specificity-rules
  const specDiff = compareSpecificity(a.specificity, b.specificity);
  if (specDiff !== 0) {
    return specDiff;
  }

  // Compare Scope Proximity: css-cascade-6 #cascade-proximity
  // The declaration with the fewest generational or sibling hops between scoping root and subject wins.
  const proxA = a.scopeProximity ?? Infinity;
  const proxB = b.scopeProximity ?? Infinity;
  if (proxA !== proxB) {
    return proxB - proxA; // smaller proximity wins (higher precedence)
  }

  // Order of Appearance: css-cascade-5 #cascade-order (last declaration in document order wins)
  return a.sourceOrder - b.sourceOrder;
}

/**
 * Groups declarations by property name (case-sensitive for custom properties, lowercase for standard).
 * css-cascade-5 #cascading (grouping declared values for a given property)
 * css-variables-1 #defining-variables (custom property names are case-sensitive)
 * css-syntax-3 #consume-declaration: standard property names are ASCII case-insensitive
 */
export function groupDeclarationsByProperty(matchedDeclarations: MatchedDeclaration[]): Map<string, MatchedDeclaration[]> {
  const declarationsByProperty = new Map<string, MatchedDeclaration[]>();
  for (const decl of matchedDeclarations) {
    const key = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
    if (!declarationsByProperty.has(key)) {
      declarationsByProperty.set(key, []);
    }
    declarationsByProperty.get(key)!.push(decl);
  }
  return declarationsByProperty;
}
