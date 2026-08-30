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
 * Compares two declarations according to CSS Cascade 5 § 6.1 #cascade-sort.
 * 1. Origin & Importance: css-cascade-5 § 6.1 #cascade-origin, § 6.1 #style-attr, § 6.1 #cascade-layering, § 6.3 #importance
 *    (Important inline > Important layered > Important unlayered > Normal inline > Normal unlayered > Normal layered)
 * 2. Layer Order: css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering (Normal: ascending; Important: descending)
 * 3. Specificity: css-cascade-5 § 6.1 #cascade-specificity, selectors-4 § 15 #specificity-rules
 * 4. Order of Appearance: css-cascade-5 § 6.1 #cascade-order (ascending)
 */
export function compareCascadeDeclarations(a: MatchedDeclaration, b: MatchedDeclaration): number {
  const getPrecedence = (decl: MatchedDeclaration): number => {
    if (decl.important) {
      // css-cascade-5 § 6.1 #style-attr, § 6.3 #importance
      if (decl.isInline) return 60;
      // css-cascade-5 § 6.1 #cascade-layering, § 6.3 #importance, § 6.4.3 #layer-ordering
      if (decl.layerOrder !== Infinity) return 50;
      // css-cascade-5 § 6.1 #cascade-layering, § 6.3 #importance (unlayered is implicit final layer; loses to explicit layers)
      return 40;
    } else {
      // css-cascade-5 § 6.1 #style-attr
      if (decl.isInline) return 30;
      // css-cascade-5 § 6.1 #cascade-layering (unlayered is implicit final layer; wins over explicit layers)
      if (decl.layerOrder === Infinity) return 20;
      // css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering
      return 10;
    }
  };

  const precA = getPrecedence(a);
  const precB = getPrecedence(b);
  if (precA !== precB) {
    return precA - precB;
  }

  // Layer order within importance bucket: css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering
  if (a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering: for important rules, earliest layer wins (lower index)
    if (a.layerOrder !== b.layerOrder) {
      return b.layerOrder - a.layerOrder;
    }
  } else if (!a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // css-cascade-5 § 6.1 #cascade-layering, § 6.4.3 #layer-ordering: for normal rules, latest layer wins (higher index)
    if (a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
  }

  // Compare Specificity: css-cascade-5 § 6.1 #cascade-specificity, selectors-4 § 15 #specificity-rules
  const specDiff = compareSpecificity(a.specificity, b.specificity);
  if (specDiff !== 0) {
    return specDiff;
  }

  // Order of Appearance: css-cascade-5 § 6.1 #cascade-order (last declaration in document order wins)
  return a.sourceOrder - b.sourceOrder;
}

/**
 * Groups declarations by property name (case-sensitive for custom properties, lowercase for standard).
 * css-cascade-5 § 6 #cascading (grouping declared values for a given property)
 * css-variables-1 § 2 #defining-custom-properties (custom property names are case-sensitive)
 * css-values-4 § 3.1 #keywords (standard property names are ASCII case-insensitive)
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
