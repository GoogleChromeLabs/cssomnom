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

import { CSSTransformComponent, normalizeAngleUnits } from './CSSTransformComponent.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { DOMMatrix, DOMMatrixReadOnly } from '../../DOMMatrix.ts';
import { matchesLength, matchesLengthPercentage, matchesNumber, matchesAngle } from '../utils/type-guards.ts';
import { ensureNumeric } from '../utils/formatting.ts';

// Spec: CSS Typed OM Level 1 § 5.2 #csstranslate
export class CSSTranslate extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;

  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z?: number | CSSNumericValue) {
    super();
    this.x = ensureNumeric(x);
    this.y = ensureNumeric(y);
    if (z !== undefined) {
      this.z = ensureNumeric(z);
      this._is2D = false;
    } else {
      this._z = new CSSUnitValue(0, 'px');
      this._is2D = true;
    }
  }

  get x(): CSSNumericValue {
    return this._x;
  }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLengthPercentage(numericVal.type())) {
      throw new TypeError('CSSTranslate.x must be a length or percentage');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue {
    return this._y;
  }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLengthPercentage(numericVal.type())) {
      throw new TypeError('CSSTranslate.y must be a length or percentage');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue {
    return this._z;
  }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesLength(numericVal.type())) {
      throw new TypeError('CSSTranslate.z must be a length');
    }
    this._z = numericVal;
  }

  override get is2D(): boolean {
    return this._is2D;
  }
  override set is2D(value: boolean) {
    this._is2D = value;
    if (value) {
      this._z = new CSSUnitValue(0, 'px');
    }
  }

  toString(): string {
    if (this.is2D) return `translate(${this.x}, ${this.y})`;
    return `translate3d(${this.x}, ${this.y}, ${this.z})`;
  }

  override toMatrix(): DOMMatrix {
    const x = this.x.to('px').value;
    const y = this.y.to('px').value;
    const z = this.z.to('px').value;

    if (this.is2D) {
      return new DOMMatrix([1, 0, 0, 1, x, y]);
    } else {
      return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    }
  }
}

// Spec: CSS Typed OM Level 1 § 5.4 #cssscale
export class CSSScale extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;
  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z?: number | CSSNumericValue) {
    super();
    this.x = x;
    this.y = y;
    this.z = z !== undefined ? z : new CSSUnitValue(1, 'number');
    this.is2D = z === undefined;
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.x must be a unitless number');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.y must be a unitless number');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesNumber(numericVal.type())) {
      throw new TypeError('CSSScale.z must be a unitless number');
    }
    this._z = numericVal;
  }
  toString(): string {
    if (this.is2D) {
      if (this.x.equals(this.y)) {
        return `scale(${this.x})`;
      }
      return `scale(${this.x}, ${this.y})`;
    }
    return `scale3d(${this.x}, ${this.y}, ${this.z})`;
  }

  override toMatrix(): DOMMatrix {
    const x = this.x.to('number').value;
    const y = this.y.to('number').value;
    const z = this.z.to('number').value;

    if (this.is2D) {
      return new DOMMatrix([x, 0, 0, y, 0, 0]);
    } else {
      return new DOMMatrix([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
    }
  }
}

// Spec: CSS Typed OM Level 1 § 5.3 #cssrotate
export class CSSRotate extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;
  private _angle!: CSSNumericValue;

  constructor(angle: number | CSSNumericValue);
  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z: number | CSSNumericValue, angle: number | CSSNumericValue);
  constructor(xOrAngle: number | CSSNumericValue, y?: number | CSSNumericValue, z?: number | CSSNumericValue, angle?: number | CSSNumericValue) {
    super();
    if (y === undefined) {
      this.angle = ensureNumeric(xOrAngle);
      this._x = new CSSUnitValue(0, 'number');
      this._y = new CSSUnitValue(0, 'number');
      this._z = new CSSUnitValue(1, 'number');
      this.is2D = true;
    } else {
      this.x = ensureNumeric(xOrAngle);
      this.y = ensureNumeric(y);
      this.z = ensureNumeric(z!);
      this.angle = ensureNumeric(angle!);
      this.is2D = false;
    }
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.x must be a unitless number');
    }
    this._x = numericVal;
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.y must be a unitless number');
    }
    this._y = numericVal;
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesNumber(numericVal.type())) {
      throw new TypeError('CSSRotate.z must be a unitless number');
    }
    this._z = numericVal;
  }

  get angle(): CSSNumericValue { return this._angle; }
  set angle(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!(numericVal instanceof CSSNumericValue) || !matchesAngle(numericVal.type())) {
      throw new TypeError('CSSRotate.angle must be an angle');
    }
    this._angle = normalizeAngleUnits(numericVal);
  }

  toString(): string {
    if (this.is2D) return `rotate(${this.angle})`;
    return `rotate3d(${this.x}, ${this.y}, ${this.z}, ${this.angle})`;
  }

  override toMatrix(): DOMMatrix {
    const rad = this.angle.to('rad').value;

    if (this.is2D) {
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      return new DOMMatrix([c, s, -s, c, 0, 0]);
    } else {
      let x = this.x.to('number').value;
      let y = this.y.to('number').value;
      let z = this.z.to('number').value;

      const len = Math.hypot(x, y, z);
      if (len === 0) {
        x = 0;
        y = 0;
        z = 1;
      } else {
        x /= len;
        y /= len;
        z /= len;
      }

      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const t = 1 - c;

      return new DOMMatrix([
        t * x * x + c,
        t * x * y + s * z,
        t * x * z - s * y,
        0,
        t * x * y - s * z,
        t * y * y + c,
        t * y * z + s * x,
        0,
        t * x * z + s * y,
        t * y * z - s * x,
        t * z * z + c,
        0,
        0,
        0,
        0,
        1
      ]);
    }
  }
}

// Spec: CSS Typed OM Level 1 § 5.5 #cssskew
export class CSSSkew extends CSSTransformComponent {
  private _ax!: CSSNumericValue;
  private _ay!: CSSNumericValue;
  constructor(ax: number | CSSNumericValue, ay: number | CSSNumericValue) {
    super();
    this.ax = ax;
    this.ay = ay;
    this.is2D = true;
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkew.ax must be an angle');
    }
    this._ax = normalizeAngleUnits(numericVal);
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkew.ay must be an angle');
    }
    this._ay = normalizeAngleUnits(numericVal);
  }
  toString(): string {
    if (this.ay instanceof CSSUnitValue && this.ay.value === 0) return `skew(${this.ax})`;
    return `skew(${this.ax}, ${this.ay})`;
  }
  override toMatrix(): DOMMatrix {
    const axRad = this.ax.to('rad').value;
    const ayRad = this.ay.to('rad').value;
    return new DOMMatrix([1, Math.tan(ayRad), Math.tan(axRad), 1, 0, 0]);
  }
}

// Spec: CSS Typed OM Level 1 § 5.5 #cssskewx
export class CSSSkewX extends CSSTransformComponent {
  private _ax!: CSSNumericValue;
  constructor(ax: number | CSSNumericValue) {
    super();
    this.ax = ax;
    this.is2D = true;
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkewX.ax must be an angle');
    }
    this._ax = numericVal;
  }
  toString(): string {
    return `skewX(${this.ax})`;
  }
  override toMatrix(): DOMMatrix {
    const axRad = this.ax.to('rad').value;
    return new DOMMatrix([1, 0, Math.tan(axRad), 1, 0, 0]);
  }
}

// Spec: CSS Typed OM Level 1 § 5.5 #cssskewy
export class CSSSkewY extends CSSTransformComponent {
  private _ay!: CSSNumericValue;
  constructor(ay: number | CSSNumericValue) {
    super();
    this.ay = ay;
    this.is2D = true;
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: number | CSSNumericValue) {
    const numericVal = ensureNumeric(val);
    if (!matchesAngle(numericVal.type())) {
      throw new TypeError('CSSSkewY.ay must be an angle');
    }
    this._ay = numericVal;
  }
  toString(): string {
    return `skewY(${this.ay})`;
  }
  override toMatrix(): DOMMatrix {
    const ayRad = this.ay.to('rad').value;
    return new DOMMatrix([1, Math.tan(ayRad), 0, 1, 0, 0]);
  }
}

// Spec: CSS Typed OM Level 1 § 5.6 #cssperspective
export class CSSPerspective extends CSSTransformComponent {
  private _length!: CSSNumericValue | CSSKeywordValue;
  constructor(length: number | string | CSSNumericValue | CSSKeywordValue) {
    super();
    this.length = length;
    this.is2D = false;
  }
  get length(): CSSNumericValue | CSSKeywordValue { return this._length; }
  set length(val: number | string | CSSNumericValue | CSSKeywordValue) {
    let resolved: CSSNumericValue | CSSKeywordValue;
    if (typeof val === 'string') {
      try {
        resolved = CSSNumericValue.parse(val);
      } catch {
        resolved = new CSSKeywordValue(val);
      }
    } else if (typeof val === 'number') {
      resolved = ensureNumeric(val);
    } else {
      resolved = val;
    }

    if (resolved instanceof CSSNumericValue) {
      if (!matchesLength(resolved.type())) {
        throw new TypeError('CSSPerspective.length must be a length');
      }
    } else if (resolved instanceof CSSKeywordValue) {
      if (resolved.value.toLowerCase() !== 'none') {
        throw new TypeError('CSSPerspective.length keyword must be none');
      }
    } else {
      throw new TypeError('CSSPerspective.length must be a length or none keyword');
    }
    this._length = resolved;
  }
  toString(): string {
    if (this.length instanceof CSSKeywordValue) return `perspective(${this.length})`;
    if (this.length instanceof CSSUnitValue && this.length.value < 0) {
      return `perspective(calc(${this.length}))`;
    }
    return `perspective(${this.length})`;
  }
  override toMatrix(): DOMMatrix {
    if (this.length instanceof CSSKeywordValue) {
      return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    const val = this.length.to('px').value;
    if (val <= 0) {
      return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    return new DOMMatrix([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, -1 / val,
      0, 0, 0, 1
    ]);
  }
}

export interface CSSMatrixComponentOptions {
  is2D?: boolean;
}

// Spec: CSS Typed OM Level 1 § 5.7 #cssmatrixcomponent
export class CSSMatrixComponent extends CSSTransformComponent {
  public matrix: DOMMatrix;
  constructor(matrix: DOMMatrixReadOnly, options?: CSSMatrixComponentOptions) {
    super();
    this.matrix = new DOMMatrix(matrix);
    if (options && options.is2D !== undefined) {
      this.is2D = options.is2D;
    } else {
      this.is2D = matrix.is2D;
    }
  }

  toString(): string {
    if (this.is2D) {
      return `matrix(${this.matrix.a}, ${this.matrix.b}, ${this.matrix.c}, ${this.matrix.d}, ${this.matrix.e}, ${this.matrix.f})`;
    }
    return `matrix3d(${this.matrix.m11}, ${this.matrix.m12}, ${this.matrix.m13}, ${this.matrix.m14}, ${this.matrix.m21}, ${this.matrix.m22}, ${this.matrix.m23}, ${this.matrix.m24}, ${this.matrix.m31}, ${this.matrix.m32}, ${this.matrix.m33}, ${this.matrix.m34}, ${this.matrix.m41}, ${this.matrix.m42}, ${this.matrix.m43}, ${this.matrix.m44})`;
  }

  override toMatrix(): DOMMatrix {
    if (this.is2D) {
      return new DOMMatrix([
        this.matrix.a,
        this.matrix.b,
        this.matrix.c,
        this.matrix.d,
        this.matrix.e,
        this.matrix.f,
      ]);
    }
    const copy = DOMMatrix.fromMatrix(this.matrix);
    copy.is2D = false;
    return copy;
  }
}
