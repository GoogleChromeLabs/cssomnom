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

import { CSSStyleSheet } from '../../../../src/index.ts';
import { calculateSpecificity, compareSpecificity } from '../../../../src/specificity.ts';
import { extractRuleRecords, type RuleRecord } from './ast-diff.ts';

export interface CascadeConflict {
  selectorA: string;
  selectorB: string;
  property: string;
  specificity: [number, number, number];
  beforeIndices: [number, number];
  afterIndices: [number, number];
  description: string;
}

export interface CascadeCheckResult {
  valid: boolean;
  conflicts: CascadeConflict[];
}

/**
 * Checks if two selectors can plausibly match the same element or target.
 * Conservative heuristic:
 * - Same selector: definitely overlaps
 * - Both are class/attribute selectors without incompatible type selectors
 */
function canSelectorsOverlap(selA: string, selB: string): boolean {
  if (selA === selB) return true;

  // Simple heuristic: if both are class selectors on potential elements (e.g. .btn and .btn-primary)
  const isClassA = selA.startsWith('.');
  const isClassB = selB.startsWith('.');
  if (isClassA && isClassB) return true;

  // If one is an element and the other is a class (e.g. 'button' and '.btn'), they can overlap
  const isTagA = /^[a-z0-9_-]+$/i.test(selA);
  const isTagB = /^[a-z0-9_-]+$/i.test(selB);
  if ((isTagA && isClassB) || (isTagB && isClassA)) return true;

  return false;
}

/**
 * Level 2 Verification: Detects whether source order between competing rules
 * (rules with identical specificity defining identical properties) was swapped.
 */
export function checkCascadeInversions(
  beforeCss: string | string[],
  afterCss: string | string[]
): CascadeCheckResult {
  const beforeText = Array.isArray(beforeCss) ? beforeCss.join('\n') : beforeCss;
  const afterText = Array.isArray(afterCss) ? afterCss.join('\n') : afterCss;

  const sheetBefore = new CSSStyleSheet();
  sheetBefore.replaceSync(beforeText);

  const sheetAfter = new CSSStyleSheet();
  sheetAfter.replaceSync(afterText);

  const beforeRecords = extractRuleRecords(sheetBefore.cssRules);
  const afterRecords = extractRuleRecords(sheetAfter.cssRules);

  // Map each unique rule key to its after index
  const makeKey = (r: RuleRecord) => `${r.context} ::: ${r.selector}`;
  const afterIndexMap = new Map<string, number[]>();
  for (const r of afterRecords) {
    const k = makeKey(r);
    const list = afterIndexMap.get(k) || [];
    list.push(r.originalIndex);
    afterIndexMap.set(k, list);
  }

  const conflicts: CascadeConflict[] = [];

  // Compare every pair in beforeRecords
  for (let i = 0; i < beforeRecords.length; i++) {
    const rA = beforeRecords[i];
    for (let j = i + 1; j < beforeRecords.length; j++) {
      const rB = beforeRecords[j];

      // Only care if rules share the same context (e.g. both in top-level or same @media)
      if (rA.context !== rB.context) continue;

      // Check if selectors can plausibly match the same element
      if (!canSelectorsOverlap(rA.selector, rB.selector)) continue;

      // Check for shared properties
      const sharedProps: string[] = [];
      for (const prop of rA.declarations.keys()) {
        if (rB.declarations.has(prop)) {
          sharedProps.push(prop);
        }
      }
      if (sharedProps.length === 0) continue;

      // Check specificity equality
      const specA = calculateSpecificity(rA.selector)[0] || [0, 0, 0];
      const specB = calculateSpecificity(rB.selector)[0] || [0, 0, 0];

      if (compareSpecificity(specA, specB) !== 0) continue;

      // Both have identical specificity and share a property!
      // In beforeRecords, rA appears before rB (i < j).
      // Check order in afterRecords:
      const kA = makeKey(rA);
      const kB = makeKey(rB);
      const aIndices = afterIndexMap.get(kA);
      const bIndices = afterIndexMap.get(kB);

      if (!aIndices || !bIndices) continue;

      const afterPosA = aIndices[0];
      const afterPosB = bIndices[0];

      if (afterPosA > afterPosB) {
        conflicts.push({
          selectorA: rA.selector,
          selectorB: rB.selector,
          property: sharedProps.join(', '),
          specificity: specA,
          beforeIndices: [rA.originalIndex, rB.originalIndex],
          afterIndices: [afterPosA, afterPosB],
          description: `Cascade inversion: '${rA.selector}' preceded '${rB.selector}' before, but succeeds it after for property [${sharedProps.join(', ')}] with specificity (${specA.join(',')})`,
        });
      }
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

/** Backward compatibility alias */
export const verifyCascadeOrder = checkCascadeInversions;

