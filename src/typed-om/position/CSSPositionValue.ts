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
import { isNumericValue, isLengthPercentage } from '../utils/type-guards.ts';

// Spec: CSS Typed OM Level 1 § 6 #positionvalue-objects
export function validatePositionCoord(val: unknown, paramName: string): void {
  if (!isNumericValue(val)) {
    throw new TypeError(`${paramName} must be a CSSNumericValue`);
  }
  if (!isLengthPercentage(val.type())) {
    throw new TypeError(`${paramName} must be a <length-percentage>`);
  }
}

export class CSSPositionValue extends CSSStyleValue {
  private _x: CSSNumericValue;
  private _y: CSSNumericValue;

  constructor(x: CSSNumericValue, y: CSSNumericValue) {
    super();
    validatePositionCoord(x, 'x');
    validatePositionCoord(y, 'y');
    this._x = x;
    this._y = y;
  }

  get x(): CSSNumericValue {
    return this._x;
  }

  set x(val: CSSNumericValue) {
    validatePositionCoord(val, 'x');
    this._x = val;
  }

  get y(): CSSNumericValue {
    return this._y;
  }

  set y(val: CSSNumericValue) {
    validatePositionCoord(val, 'y');
    this._y = val;
  }

  serialize(): string {
    return `${this._x.serialize()} ${this._y.serialize()}`;
  }

  override toString(): string {
    return `${this._x.toString()} ${this._y.toString()}`;
  }
}
