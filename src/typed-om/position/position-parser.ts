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

import type { ComponentValue } from '../../types.ts';
import type { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSPositionValue } from './CSSPositionValue.ts';
import { CSSMathSum, CSSMathNegate } from '../numeric/math/CSSMathOperations.ts';
import { simplify } from '../../math-parser.ts';
import { createUnitValue } from '../utils/formatting.ts';
import { isToken } from '../utils/validation.ts';
import { isLengthPercentage } from '../utils/type-guards.ts';
import { createCSSStyleValue } from '../values/style-value-factory.ts';

// Spec: CSS Typed OM Level 1 § 3.3 #positionvalue-objects
// Spec: CSS Values and Units Level 4 § 10.1 #position-type
export function toPositionCoord(val: CSSStyleValue | CSSNumericValue | CSSKeywordValue | null): CSSNumericValue | null {
  if (!val) return null;
  if (val instanceof CSSKeywordValue) {
    const k = val.value.toLowerCase();
    if (k === 'left' || k === 'top') return createUnitValue(0, 'percent');
    if (k === 'center') return createUnitValue(50, 'percent');
    if (k === 'right' || k === 'bottom') return createUnitValue(100, 'percent');
    return null;
  }
  if (val instanceof CSSNumericValue && isLengthPercentage(val.type())) {
    return val;
  }
  return null;
}

export function tryParsePosition(trimmed: ComponentValue[], property?: string): CSSPositionValue | null {
  const components = trimmed.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
  if (components.length === 0) return null;

  // 1-value syntax: [ left | center | right | top | bottom | <length-percentage> ]
  if (components.length === 1) {
    const c0 = components[0];
    if (isToken(c0) && c0.type === 'ident') {
      const k = c0.value.toLowerCase();
      if (k === 'left') {
        return new CSSPositionValue(createUnitValue(0, 'percent'), createUnitValue(50, 'percent'));
      }
      if (k === 'right') {
        return new CSSPositionValue(createUnitValue(100, 'percent'), createUnitValue(50, 'percent'));
      }
      if (k === 'top') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(0, 'percent'));
      }
      if (k === 'bottom') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(100, 'percent'));
      }
      if (k === 'center') {
        return new CSSPositionValue(createUnitValue(50, 'percent'), createUnitValue(50, 'percent'));
      }
    }
    const sv = createCSSStyleValue(c0, property || 'left');
    const coord = toPositionCoord(sv);
    if (coord) {
      return new CSSPositionValue(coord, createUnitValue(50, 'percent'));
    }
  }

  // 2-value syntax:
  if (components.length === 2) {
    const c0 = components[0];
    const c1 = components[1];

    // Option B: Vertical keyword followed by Horizontal keyword (e.g. "top right")
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase()) &&
        isToken(c1) && c1.type === 'ident' && ['left', 'right', 'center'].includes(c1.value.toLowerCase())) {
      const yCoord = toPositionCoord(new CSSKeywordValue(c0.value));
      const xCoord = toPositionCoord(new CSSKeywordValue(c1.value));
      if (xCoord && yCoord) {
        return new CSSPositionValue(xCoord, yCoord);
      }
    }

    // Option A: Horizontal component followed by Vertical component
    // Disallow vertical keyword followed by length or length followed by horizontal keyword
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase())) {
      return null;
    }
    if (isToken(c1) && c1.type === 'ident' && ['left', 'right'].includes(c1.value.toLowerCase())) {
      return null;
    }

    const sv1 = createCSSStyleValue(c0, property || 'left');
    const sv2 = createCSSStyleValue(c1, property || 'top');
    const coord1 = toPositionCoord(sv1);
    const coord2 = toPositionCoord(sv2);
    if (coord1 && coord2) {
      return new CSSPositionValue(coord1, coord2);
    }
  }

  // 3-value syntax:
  if (components.length === 3) {
    const c0 = components[0];
    const c1 = components[1];
    const c2 = components[2];

    // Case 1: [ left | right ] <offset> [ top | bottom | center ]
    if (isToken(c0) && c0.type === 'ident' && ['left', 'right'].includes(c0.value.toLowerCase())) {
      const off = toPositionCoord(createCSSStyleValue(c1, 'left'));
      const vert = toPositionCoord(createCSSStyleValue(c2, 'top'));
      if (off && vert) {
        const xCoord = c0.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(xCoord, vert);
      }
    }

    // Case 2: [ left | right | center ] [ top | bottom ] <offset>
    if (isToken(c1) && c1.type === 'ident' && ['top', 'bottom'].includes(c1.value.toLowerCase())) {
      const horiz = toPositionCoord(createCSSStyleValue(c0, 'left'));
      const off = toPositionCoord(createCSSStyleValue(c2, 'top'));
      if (horiz && off) {
        const yCoord = c1.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(horiz, yCoord);
      }
    }

    // Case 3: [ top | bottom ] <offset> [ left | right | center ]
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase())) {
      const off = toPositionCoord(createCSSStyleValue(c1, 'top'));
      const horiz = toPositionCoord(createCSSStyleValue(c2, 'left'));
      if (off && horiz) {
        const yCoord = c0.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off)))
          : off;
        return new CSSPositionValue(horiz, yCoord);
      }
    }
  }

  // 4-value syntax:
  if (components.length === 4) {
    const c0 = components[0];
    const c1 = components[1];
    const c2 = components[2];
    const c3 = components[3];

    // Case A: [ left | right ] <offset1> [ top | bottom ] <offset2>
    if (isToken(c0) && c0.type === 'ident' && ['left', 'right'].includes(c0.value.toLowerCase()) &&
        isToken(c2) && c2.type === 'ident' && ['top', 'bottom'].includes(c2.value.toLowerCase())) {
      const off1 = toPositionCoord(createCSSStyleValue(c1, 'left'));
      const off2 = toPositionCoord(createCSSStyleValue(c3, 'top'));
      if (off1 && off2) {
        const xCoord = c0.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off1)))
          : off1;
        const yCoord = c2.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off2)))
          : off2;
        return new CSSPositionValue(xCoord, yCoord);
      }
    }

    // Case B: [ top | bottom ] <offset1> [ left | right ] <offset2>
    if (isToken(c0) && c0.type === 'ident' && ['top', 'bottom'].includes(c0.value.toLowerCase()) &&
        isToken(c2) && c2.type === 'ident' && ['left', 'right'].includes(c2.value.toLowerCase())) {
      const off1 = toPositionCoord(createCSSStyleValue(c1, 'top'));
      const off2 = toPositionCoord(createCSSStyleValue(c3, 'left'));
      if (off1 && off2) {
        const yCoord = c0.value.toLowerCase() === 'bottom'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off1)))
          : off1;
        const xCoord = c2.value.toLowerCase() === 'right'
          ? simplify(new CSSMathSum(createUnitValue(100, 'percent'), new CSSMathNegate(off2)))
          : off2;
        return new CSSPositionValue(xCoord, yCoord);
      }
    }
  }

  return null;
}
