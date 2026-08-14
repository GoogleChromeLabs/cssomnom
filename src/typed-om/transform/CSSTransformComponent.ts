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

import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSMathSum, CSSMathProduct, CSSMathNegate, CSSMathInvert } from '../numeric/math/CSSMathOperations.ts';
import { DOMMatrix } from '../../DOMMatrix.ts';

// Spec: CSS Typed OM Level 1 § 7.3 #dom-cssrotate-angle
// Spec: CSS Transforms 2 § 3 #transform-functions
export function normalizeAngleUnits(node: CSSNumericValue): CSSNumericValue {
  if (node instanceof CSSUnitValue) {
    if (node.unit === 'turn') return new CSSUnitValue(node.value * 360, 'deg');
    if (node.unit === 'grad') return new CSSUnitValue(node.value * 0.9, 'deg');
    if (node.unit === 'rad') return new CSSUnitValue(node.value * (180 / Math.PI), 'deg');
    return node;
  }
  if (node instanceof CSSMathSum) {
    return new CSSMathSum(...node.values.map(normalizeAngleUnits));
  }
  if (node instanceof CSSMathProduct) {
    return new CSSMathProduct(...node.values.map(normalizeAngleUnits));
  }
  if (node instanceof CSSMathNegate) {
    return new CSSMathNegate(normalizeAngleUnits(node.value));
  }
  if (node instanceof CSSMathInvert) {
    return new CSSMathInvert(normalizeAngleUnits(node.value));
  }
  return node;
}

// Spec: CSS Typed OM Level 1 § 5.1 #csstransformcomponent
export abstract class CSSTransformComponent extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSTransformComponent) {
      throw new TypeError("CSSTransformComponent cannot be directly constructed");
    }
  }
  protected _is2D: boolean = true;
  get is2D(): boolean {
    return this._is2D;
  }
  set is2D(val: boolean) {
    this._is2D = val;
  }
  abstract toString(): string;

  toMatrix(): DOMMatrix {
    throw new Error('toMatrix() not implemented for this transform component.');
  }
}
