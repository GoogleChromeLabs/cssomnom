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

import type { CSSNumericValue } from '../CSSNumericValue.ts';
import { CSSUnitValue } from '../CSSUnitValue.ts';
import { compareStrings } from '../../utils/validation.ts';

// Spec: CSS Values 4 § 10.7 #serialize-a-calculation-tree
// Sorts calculation tree terms: numbers first (ascending value), percents second (ascending value), dimensions third (alphabetical unit).
export function sortNumericNodes(nodes: CSSNumericValue[]): CSSNumericValue[] {
  const allSimple = nodes.every(n => n instanceof CSSUnitValue);
  if (!allSimple) return nodes;

  const getUnit = (n: unknown) => (n as { unit: string }).unit;
  const getValue = (n: unknown) => (n as { value: number }).value;

  const numbers = nodes.filter(n => getUnit(n) === 'number')
    .sort((a, b) => getValue(a) - getValue(b));
  const percents = nodes.filter(n => getUnit(n) === 'percent')
    .sort((a, b) => getValue(a) - getValue(b));
  const dimensions = nodes.filter(n => getUnit(n) !== 'number' && getUnit(n) !== 'percent')
    .sort((a, b) => compareStrings(getUnit(a), getUnit(b)));

  return [...numbers, ...percents, ...dimensions];
}
