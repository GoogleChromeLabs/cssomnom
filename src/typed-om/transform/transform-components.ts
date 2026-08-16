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

function validateNumberish(val: unknown, name: string): CSSNumericValue {
  if (typeof val === 'number') {
    return new CSSUnitValue(val, 'number');
  }
  if (val instanceof CSSNumericValue && matchesNumber(val.type())) {
    return val;
  }
  throw new TypeError(`${name} must be a unitless number`);
}

// Spec: CSS Typed OM Level 1 § 5.2 #csstranslate
export class CSSTranslate extends CSSTransformComponent {
  private _x!: CSSNumericValue;
  private _y!: CSSNumericValue;
  private _z!: CSSNumericValue;

  constructor(x: CSSNumericValue, y: CSSNumericValue, z?: CSSNumericValue) {
    if (arguments.length < 2) {
      throw new TypeError("Failed to construct 'CSSTranslate': 2 arguments required, but only " + arguments.length + " present.");
    }
    super();
    this.x = x;
    this.y = y;
    if (z !== undefined) {
      this.z = z;
      this._is2D = false;
    } else {
      this._z = new CSSUnitValue(0, 'px');
      this._is2D = true;
    }
  }

  get x(): CSSNumericValue {
    return this._x;
  }
  set x(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesLengthPercentage(val.type())) {
      throw new TypeError('CSSTranslate.x must be a length or percentage');
    }
    this._x = val;
  }

  get y(): CSSNumericValue {
    return this._y;
  }
  set y(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesLengthPercentage(val.type())) {
      throw new TypeError('CSSTranslate.y must be a length or percentage');
    }
    this._y = val;
  }

  get z(): CSSNumericValue {
    return this._z;
  }
  set z(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesLength(val.type())) {
      throw new TypeError('CSSTranslate.z must be a length');
    }
    this._z = val;
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
    if (arguments.length < 2) {
      throw new TypeError("Failed to construct 'CSSScale': 2 arguments required, but only " + arguments.length + " present.");
    }
    super();
    this.x = x;
    this.y = y;
    if (z !== undefined) {
      this.z = z;
      this.is2D = false;
    } else {
      this.z = new CSSUnitValue(1, 'number');
      this.is2D = true;
    }
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    this._x = validateNumberish(val, 'CSSScale.x');
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    this._y = validateNumberish(val, 'CSSScale.y');
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    this._z = validateNumberish(val, 'CSSScale.z');
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

  constructor(angle: CSSNumericValue);
  constructor(x: number | CSSNumericValue, y: number | CSSNumericValue, z: number | CSSNumericValue, angle: CSSNumericValue);
  constructor(xOrAngle: number | CSSNumericValue, y?: number | CSSNumericValue, z?: number | CSSNumericValue, angle?: number | CSSNumericValue) {
    super();
    if (arguments.length === 1) {
      this.angle = xOrAngle as CSSNumericValue;
      this._x = new CSSUnitValue(0, 'number');
      this._y = new CSSUnitValue(0, 'number');
      this._z = new CSSUnitValue(1, 'number');
      this.is2D = true;
    } else if (arguments.length === 4) {
      this.x = xOrAngle;
      this.y = y!;
      this.z = z!;
      this.angle = angle as CSSNumericValue;
      this.is2D = false;
    } else {
      throw new TypeError("Failed to construct 'CSSRotate': 1 or 4 arguments required, but " + arguments.length + " present.");
    }
  }

  get x(): CSSNumericValue { return this._x; }
  set x(val: number | CSSNumericValue) {
    this._x = validateNumberish(val, 'CSSRotate.x');
  }

  get y(): CSSNumericValue { return this._y; }
  set y(val: number | CSSNumericValue) {
    this._y = validateNumberish(val, 'CSSRotate.y');
  }

  get z(): CSSNumericValue { return this._z; }
  set z(val: number | CSSNumericValue) {
    this._z = validateNumberish(val, 'CSSRotate.z');
  }

  get angle(): CSSNumericValue { return this._angle; }
  set angle(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesAngle(val.type())) {
      throw new TypeError('CSSRotate.angle must be an angle');
    }
    this._angle = val;
  }

  toString(): string {
    const normAngle = normalizeAngleUnits(this.angle);
    if (this.is2D) return `rotate(${normAngle})`;
    return `rotate3d(${this.x}, ${this.y}, ${this.z}, ${normAngle})`;
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
  constructor(ax: CSSNumericValue, ay: CSSNumericValue) {
    if (arguments.length < 2) {
      throw new TypeError("Failed to construct 'CSSSkew': 2 arguments required, but only " + arguments.length + " present.");
    }
    super();
    this.ax = ax;
    this.ay = ay;
    this._is2D = true;
  }
  override get is2D(): boolean {
    return true;
  }
  override set is2D(_val: boolean) {
    // Spec: CSS Typed OM Level 1 § 5.5 #dom-cssskew-is2d
    // "The is2D attribute of a CSSSkew, CSSSkewX, or CSSSkewY object must, on setting, do nothing."
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesAngle(val.type())) {
      throw new TypeError('CSSSkew.ax must be an angle');
    }
    this._ax = val;
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesAngle(val.type())) {
      throw new TypeError('CSSSkew.ay must be an angle');
    }
    this._ay = val;
  }
  toString(): string {
    const normAx = normalizeAngleUnits(this.ax);
    const normAy = normalizeAngleUnits(this.ay);
    if (this.ay instanceof CSSUnitValue && this.ay.value === 0) return `skew(${normAx})`;
    return `skew(${normAx}, ${normAy})`;
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
  constructor(ax: CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSSkewX': 1 argument required, but only 0 present.");
    }
    super();
    this.ax = ax;
    this._is2D = true;
  }
  override get is2D(): boolean {
    return true;
  }
  override set is2D(_val: boolean) {
    // Spec: CSS Typed OM Level 1 § 5.5 #dom-cssskew-is2d
    // "The is2D attribute of a CSSSkew, CSSSkewX, or CSSSkewY object must, on setting, do nothing."
  }
  get ax(): CSSNumericValue { return this._ax; }
  set ax(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesAngle(val.type())) {
      throw new TypeError('CSSSkewX.ax must be an angle');
    }
    this._ax = val;
  }
  toString(): string {
    return `skewX(${normalizeAngleUnits(this.ax)})`;
  }
  override toMatrix(): DOMMatrix {
    const axRad = this.ax.to('rad').value;
    return new DOMMatrix([1, 0, Math.tan(axRad), 1, 0, 0]);
  }
}

// Spec: CSS Typed OM Level 1 § 5.5 #cssskewy
export class CSSSkewY extends CSSTransformComponent {
  private _ay!: CSSNumericValue;
  constructor(ay: CSSNumericValue) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSSkewY': 1 argument required, but only 0 present.");
    }
    super();
    this.ay = ay;
    this._is2D = true;
  }
  override get is2D(): boolean {
    return true;
  }
  override set is2D(_val: boolean) {
    // Spec: CSS Typed OM Level 1 § 5.5 #dom-cssskew-is2d
    // "The is2D attribute of a CSSSkew, CSSSkewX, or CSSSkewY object must, on setting, do nothing."
  }
  get ay(): CSSNumericValue { return this._ay; }
  set ay(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || !matchesAngle(val.type())) {
      throw new TypeError('CSSSkewY.ay must be an angle');
    }
    this._ay = val;
  }
  toString(): string {
    return `skewY(${normalizeAngleUnits(this.ay)})`;
  }
  override toMatrix(): DOMMatrix {
    const ayRad = this.ay.to('rad').value;
    return new DOMMatrix([1, Math.tan(ayRad), 0, 1, 0, 0]);
  }
}

// Spec: CSS Typed OM Level 1 § 5.6 #cssperspective
export class CSSPerspective extends CSSTransformComponent {
  private _length!: CSSNumericValue | CSSKeywordValue;
  constructor(length: CSSNumericValue | CSSKeywordValue | string) {
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSPerspective': 1 argument required, but only 0 present.");
    }
    super();
    this._is2D = false;
    this.length = length;
  }
  override get is2D(): boolean {
    return false;
  }
  override set is2D(_val: boolean) {
    // Spec: CSS Typed OM Level 1 § 5.6 #dom-cssperspective-is2d
    // "The is2D attribute of a CSSPerspective object must, on setting, do nothing."
  }
  get length(): CSSNumericValue | CSSKeywordValue { return this._length; }
  set length(val: CSSNumericValue | CSSKeywordValue | string) {
    let resolved: CSSNumericValue | CSSKeywordValue;
    if (typeof val === 'string') {
      if (val.toLowerCase() === 'none') {
        resolved = new CSSKeywordValue('none');
      } else {
        throw new TypeError('CSSPerspective.length keyword string must be "none"');
      }
    } else if (val instanceof CSSKeywordValue) {
      if (val.value.toLowerCase() !== 'none') {
        throw new TypeError('CSSPerspective.length keyword must be none');
      }
      resolved = val;
    } else if (val instanceof CSSNumericValue) {
      if (!matchesLength(val.type())) {
        throw new TypeError('CSSPerspective.length must be a length');
      }
      resolved = val;
    } else {
      throw new TypeError('CSSPerspective.length must be a length CSSNumericValue or "none"');
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
    if (arguments.length < 1) {
      throw new TypeError("Failed to construct 'CSSMatrixComponent': 1 argument required, but only 0 present.");
    }
    if (!matrix || typeof matrix !== 'object' || !('a' in matrix && 'm11' in matrix)) {
      throw new TypeError("Failed to construct 'CSSMatrixComponent': parameter 1 is not of type 'DOMMatrixReadOnly'.");
    }
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
