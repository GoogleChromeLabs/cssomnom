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

import { CSSStyleSheet } from '../../../src/index.ts';
import { calculateSpecificity, compareSpecificity } from '../../../src/specificity.ts';
import type { ComplexSelector, CompoundSelector } from '../../../src/types.ts';
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

function getSubjectCompound(complex: ComplexSelector): CompoundSelector | null {
  for (let i = complex.items.length - 1; i >= 0; i--) {
    const it = complex.items[i];
    if (it.type === 'compound-selector') {
      return it;
    }
  }
  return null;
}

function canComplexSelectorsOverlap(selA: ComplexSelector, selB: ComplexSelector): boolean {
  const compA = getSubjectCompound(selA);
  const compB = getSubjectCompound(selB);
  if (!compA || !compB) return true;

  // 1. Incompatible type selectors
  const typeA = compA.selectors.find(s => s.type === 'type-selector');
  const typeB = compB.selectors.find(s => s.type === 'type-selector');
  if (typeA && typeB && typeA.name.toLowerCase() !== typeB.name.toLowerCase()) {
    return false;
  }

  // 2. Incompatible ID selectors
  const idA = compA.selectors.find(s => s.type === 'id-selector');
  const idB = compB.selectors.find(s => s.type === 'id-selector');
  if (idA && idB && idA.name !== idB.name) {
    return false;
  }

  // 3. Pseudo-element matching
  const pseudoElemA = compA.selectors.find(s => s.type === 'pseudo-element-selector');
  const pseudoElemB = compB.selectors.find(s => s.type === 'pseudo-element-selector');
  const pseudoNameA = pseudoElemA ? pseudoElemA.name.toLowerCase() : null;
  const pseudoNameB = pseudoElemB ? pseudoElemB.name.toLowerCase() : null;
  if (pseudoNameA !== pseudoNameB) {
    return false;
  }

  return true;
}

/**
 * Checks if two rules' selectors can plausibly match the same element or target.
 * Uses structured selector AST when available to eliminate incompatible type, ID,
 * or pseudo-element combinations.
 */
export function canSelectorsOverlap(rA: RuleRecord, rB: RuleRecord): boolean {
  if (rA.selector === rB.selector) return true;
  if (!rA.selectorAST || !rB.selectorAST) {
    return true;
  }

  for (const selA of rA.selectorAST.selectors) {
    if (selA.type !== 'complex-selector') continue;
    for (const selB of rB.selectorAST.selectors) {
      if (selB.type !== 'complex-selector') continue;
      if (canComplexSelectorsOverlap(selA, selB)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Stage 2 Verification: Cascade & Source-Order Conflict Detection.
 * Detects whether source order between competing rules
 * (rules with identical specificity defining identical properties) was swapped.
 */
export function checkCascadeConflicts(
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
      if (!canSelectorsOverlap(rA, rB)) continue;

      // Check for shared properties
      const sharedProps: string[] = [];
      for (const prop of rA.declarations.keys()) {
        if (rB.declarations.has(prop)) {
          sharedProps.push(prop);
        }
      }
      if (sharedProps.length === 0) continue;

      // Check specificity equality
      const specA = calculateSpecificity(rA.selectorAST ?? rA.selector)[0] || [0, 0, 0];
      const specB = calculateSpecificity(rB.selectorAST ?? rB.selector)[0] || [0, 0, 0];

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
          description: `Cascade conflict: '${rA.selector}' preceded '${rB.selector}' before, but succeeds it after for property [${sharedProps.join(', ')}] with specificity (${specA.join(',')})`,
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
export const checkCascadeInversions = checkCascadeConflicts;

