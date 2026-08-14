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
 * Compares two declarations according to CSS Cascade 5 § 6 #cascade-sort.
 * 1. Origin & Importance (Important inline > Important layered > Important unlayered > Normal inline > Normal unlayered > Normal layered)
 * 2. Layer Order (Normal: ascending; Important: descending)
 * 3. Specificity (selectors-4 § 4 #specificity-rules)
 * 4. Order of Appearance / Source Order (ascending)
 */
export function compareCascadeDeclarations(a: MatchedDeclaration, b: MatchedDeclaration): number {
  const getPrecedence = (decl: MatchedDeclaration): number => {
    if (decl.important) {
      if (decl.isInline) return 60; // Important inline
      if (decl.layerOrder !== Infinity) return 50; // Important layered
      return 40; // Important unlayered
    } else {
      if (decl.isInline) return 30; // Normal inline
      if (decl.layerOrder === Infinity) return 20; // Normal unlayered
      return 10; // Normal layered
    }
  };

  const precA = getPrecedence(a);
  const precB = getPrecedence(b);
  if (precA !== precB) {
    return precA - precB;
  }

  // Layer order within importance bucket
  if (a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // !important layered: REVERSE layer order (lower layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return b.layerOrder - a.layerOrder;
    }
  } else if (!a.important && a.layerOrder !== Infinity && b.layerOrder !== Infinity) {
    // Normal layered: normal layer order (higher layerOrder wins!)
    if (a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
  }

  // Compare Specificity: selectors-4 § 4 #specificity-rules
  const specDiff = compareSpecificity(a.specificity, b.specificity);
  if (specDiff !== 0) {
    return specDiff;
  }

  // Source Order
  return a.sourceOrder - b.sourceOrder;
}

/**
 * Groups declarations by property name (case-sensitive for custom properties, lowercase for standard).
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
