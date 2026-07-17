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

// Normative specifications:
// Geometry APIs: https://drafts.fxtf.org/geometry/#dommatrix

function multiplyArrays(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[r * 4 + k] * b[k * 4 + c];
      }
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

function transpose(m: Float64Array | Float32Array | number[]): Float64Array {
  const out = new Float64Array(16);
  out[0] = m[0];   out[1] = m[4];   out[2] = m[8];   out[3] = m[12];
  out[4] = m[1];   out[5] = m[5];   out[6] = m[9];   out[7] = m[13];
  out[8] = m[2];   out[9] = m[6];   out[10] = m[10]; out[11] = m[14];
  out[12] = m[3];  out[13] = m[7];  out[14] = m[11]; out[15] = m[15];
  return out;
}

function getRz(deg: number): Float64Array {
  const rad = deg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new Float64Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function getRy(deg: number): Float64Array {
  const rad = deg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new Float64Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function getRx(deg: number): Float64Array {
  const rad = deg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new Float64Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function invertMatrix(M: Float64Array): { success: boolean; result: Float64Array } {
  const out = new Float64Array(16);
  const m11 = M[0], m12 = M[1], m13 = M[2], m14 = M[3];
  const m21 = M[4], m22 = M[5], m23 = M[6], m24 = M[7];
  const m31 = M[8], m32 = M[9], m33 = M[10], m34 = M[11];
  const m41 = M[12], m42 = M[13], m43 = M[14], m44 = M[15];

  // Row 1 cofactors
  const c11 = m22 * (m33 * m44 - m43 * m34) - m32 * (m23 * m44 - m43 * m24) + m42 * (m23 * m34 - m33 * m24);
  const c12 = -(m12 * (m33 * m44 - m43 * m34) - m32 * (m13 * m44 - m43 * m14) + m42 * (m13 * m34 - m33 * m14));
  const c13 = m12 * (m23 * m44 - m43 * m24) - m22 * (m13 * m44 - m43 * m14) + m42 * (m13 * m24 - m23 * m14);
  const c14 = -(m12 * (m23 * m34 - m33 * m24) - m22 * (m13 * m34 - m33 * m14) + m32 * (m13 * m24 - m23 * m14));

  // Determinant
  const det = m11 * c11 + m21 * c12 + m31 * c13 + m41 * c14;

  if (det === 0) {
    const nanResult = new Float64Array(16);
    nanResult.fill(NaN);
    return { success: false, result: nanResult };
  }

  const detInv = 1 / det;

  // Assign Row 1 cofactors to Column 1 of output
  out[0] = c11 * detInv;
  out[1] = c12 * detInv;
  out[2] = c13 * detInv;
  out[3] = c14 * detInv;

  // Row 2 cofactors
  const c21 = -(m21 * (m33 * m44 - m43 * m34) - m31 * (m23 * m44 - m43 * m24) + m41 * (m23 * m34 - m33 * m24));
  const c22 = m11 * (m33 * m44 - m43 * m34) - m31 * (m13 * m44 - m43 * m14) + m41 * (m13 * m34 - m33 * m14);
  const c23 = -(m11 * (m23 * m44 - m43 * m24) - m21 * (m13 * m44 - m43 * m14) + m41 * (m13 * m24 - m23 * m14));
  const c24 = m11 * (m23 * m34 - m33 * m24) - m21 * (m13 * m34 - m33 * m14) + m31 * (m13 * m24 - m23 * m14);

  // Assign Row 2 cofactors to Column 2 of output
  out[4] = c21 * detInv;
  out[5] = c22 * detInv;
  out[6] = c23 * detInv;
  out[7] = c24 * detInv;

  // Row 3 cofactors
  const c31 = m21 * (m32 * m44 - m42 * m34) - m31 * (m22 * m44 - m42 * m24) + m41 * (m22 * m34 - m32 * m24);
  const c32 = -(m11 * (m32 * m44 - m42 * m34) - m31 * (m12 * m44 - m42 * m14) + m41 * (m12 * m34 - m32 * m14));
  const c33 = m11 * (m22 * m44 - m42 * m24) - m21 * (m12 * m44 - m42 * m14) + m41 * (m12 * m24 - m22 * m14);
  const c34 = -(m11 * (m22 * m34 - m32 * m24) - m21 * (m12 * m34 - m32 * m14) + m31 * (m12 * m24 - m22 * m14));

  // Assign Row 3 cofactors to Column 3 of output
  out[8] = c31 * detInv;
  out[9] = c32 * detInv;
  out[10] = c33 * detInv;
  out[11] = c34 * detInv;

  // Row 4 cofactors
  const c41 = -(m21 * (m32 * m43 - m42 * m33) - m31 * (m22 * m43 - m42 * m23) + m41 * (m22 * m33 - m32 * m23));
  const c42 = m11 * (m32 * m43 - m42 * m33) - m31 * (m12 * m43 - m42 * m13) + m41 * (m12 * m33 - m32 * m13);
  const c43 = -(m11 * (m22 * m43 - m42 * m23) - m21 * (m12 * m43 - m42 * m13) + m41 * (m12 * m23 - m22 * m13));
  const c44 = m11 * (m22 * m33 - m32 * m23) - m21 * (m12 * m33 - m32 * m13) + m31 * (m12 * m23 - m22 * m13);

  // Assign Row 4 cofactors to Column 4 of output
  out[12] = c41 * detInv;
  out[13] = c42 * detInv;
  out[14] = c43 * detInv;
  out[15] = c44 * detInv;

  return { success: true, result: out };
}

function parseMatrixString(str: string): { is2D: boolean; values: Float64Array } {
  const clean = str.trim().replace(/\s+/g, ' ');
  
  if (clean === '' || clean.toLowerCase() === 'none') {
    const values = new Float64Array(16);
    values[0] = 1;
    values[5] = 1;
    values[10] = 1;
    values[15] = 1;
    return { is2D: true, values };
  }
  
  const matrixMatch = clean.match(/^matrix\(([^)]+)\)$/i);
  if (matrixMatch) {
    const parts = matrixMatch[1].split(/[\s,]+/).filter(Boolean);
    if (parts.length === 6) {
      const numbers = parts.map(Number);
      if (numbers.some(isNaN)) {
        throw new DOMException(`Invalid matrix values in string: "${str}"`, 'SyntaxError');
      }
      const values = new Float64Array(16);
      values[0] = numbers[0]; // a
      values[1] = numbers[1]; // b
      values[2] = 0;
      values[3] = 0;
      values[4] = numbers[2]; // c
      values[5] = numbers[3]; // d
      values[6] = 0;
      values[7] = 0;
      values[8] = 0;
      values[9] = 0;
      values[10] = 1;         // m33
      values[11] = 0;
      values[12] = numbers[4]; // e
      values[13] = numbers[5]; // f
      values[14] = 0;
      values[15] = 1;         // m44
      return { is2D: true, values };
    }
  }

  const matrix3dMatch = clean.match(/^matrix3d\(([^)]+)\)$/i);
  if (matrix3dMatch) {
    const parts = matrix3dMatch[1].split(/[\s,]+/).filter(Boolean);
    if (parts.length === 16) {
      const numbers = parts.map(Number);
      if (numbers.some(isNaN)) {
        throw new DOMException(`Invalid matrix3d values in string: "${str}"`, 'SyntaxError');
      }
      return { is2D: false, values: new Float64Array(numbers) };
    }
  }

  if (parseTransformListHook) {
    return parseTransformListHook(str);
  }

  throw new DOMException(`Failed to parse DOMMatrix string: "${str}"`, 'SyntaxError');
}

export let parseTransformListHook: ((str: string) => { is2D: boolean; values: Float64Array }) | null = null;

export function setParseTransformListHook(hook: (str: string) => { is2D: boolean; values: Float64Array }) {
  parseTransformListHook = hook;
}

export interface DOMPointInit {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
}

export class DOMPointReadOnly {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static fromPoint(other?: DOMPointInit): DOMPointReadOnly {
    return new DOMPointReadOnly(other?.x ?? 0, other?.y ?? 0, other?.z ?? 0, other?.w ?? 1);
  }

  toJSON() {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }
}

export class DOMPoint extends DOMPointReadOnly {
  override x: number;
  override y: number;
  override z: number;
  override w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    super(x, y, z, w);
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static override fromPoint(other?: DOMPointInit): DOMPoint {
    return new DOMPoint(other?.x ?? 0, other?.y ?? 0, other?.z ?? 0, other?.w ?? 1);
  }
}

interface DOMMatrixInit {
  a?: number; b?: number; c?: number; d?: number; e?: number; f?: number;
  m11?: number; m12?: number; m13?: number; m14?: number;
  m21?: number; m22?: number; m23?: number; m24?: number;
  m31?: number; m32?: number; m33?: number; m34?: number;
  m41?: number; m42?: number; m43?: number; m44?: number;
  is2D?: boolean;
  toFloat64Array?: () => number[] | Float64Array;
}

function parseMatrixInit(init: unknown): { is2D: boolean; values: Float64Array } {
  if (!init || typeof init !== 'object') {
    throw new TypeError('Invalid matrix initialization object');
  }
  const dict = init as DOMMatrixInit;
  if (typeof dict.toFloat64Array === 'function') {
    const arr = dict.toFloat64Array();
    if (arr.length !== 16) {
      throw new TypeError('toFloat64Array returned array must have exactly 16 elements');
    }
    return { is2D: dict.is2D ?? true, values: transpose(arr) };
  }

  const has3D = (
    (dict.m13 !== undefined && dict.m13 !== 0) ||
    (dict.m14 !== undefined && dict.m14 !== 0) ||
    (dict.m23 !== undefined && dict.m23 !== 0) ||
    (dict.m24 !== undefined && dict.m24 !== 0) ||
    (dict.m31 !== undefined && dict.m31 !== 0) ||
    (dict.m32 !== undefined && dict.m32 !== 0) ||
    (dict.m33 !== undefined && dict.m33 !== 1) ||
    (dict.m34 !== undefined && dict.m34 !== 0) ||
    (dict.m43 !== undefined && dict.m43 !== 0) ||
    (dict.m44 !== undefined && dict.m44 !== 1)
  );

  const is2D = dict.is2D ?? !has3D;

  if (is2D && has3D) {
    throw new TypeError('DOMMatrixInit: is2D is true but 3D components are present and non-default');
  }

  const values = new Float64Array(16);
  values[0] = dict.m11 ?? dict.a ?? 1;
  values[1] = dict.m12 ?? dict.b ?? 0;
  values[2] = dict.m13 ?? 0;
  values[3] = dict.m14 ?? 0;
  values[4] = dict.m21 ?? dict.c ?? 0;
  values[5] = dict.m22 ?? dict.d ?? 1;
  values[6] = dict.m23 ?? 0;
  values[7] = dict.m24 ?? 0;
  values[8] = dict.m31 ?? 0;
  values[9] = dict.m32 ?? 0;
  values[10] = dict.m33 ?? 1;
  values[11] = dict.m34 ?? 0;
  values[12] = dict.m41 ?? dict.e ?? 0;
  values[13] = dict.m42 ?? dict.f ?? 0;
  values[14] = dict.m43 ?? 0;
  values[15] = dict.m44 ?? 1;

  return { is2D, values };
}

export class DOMMatrixReadOnly {
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
  protected _values: Float64Array;
  protected _is2D: boolean;

  constructor(init?: string | number[] | DOMMatrixReadOnly | Float64Array | Float32Array | unknown) {
    if (init === undefined) {
      this._is2D = true;
      this._values = new Float64Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);
    } else if (typeof init === 'string') {
      const parsed = parseMatrixString(init);
      this._is2D = parsed.is2D;
      this._values = parsed.values;
    } else if (Array.isArray(init) || init instanceof Float64Array || init instanceof Float32Array || (typeof init === 'object' && init !== null && Symbol.iterator in init)) {
      const arr = Array.from(init as number[]);
      if (arr.length === 6) {
        this._is2D = true;
        this._values = new Float64Array([
          arr[0], arr[1], 0, 0,
          arr[2], arr[3], 0, 0,
          0, 0, 1, 0,
          arr[4], arr[5], 0, 1
        ]);
      } else if (arr.length === 16) {
        this._is2D = false;
        this._values = new Float64Array(arr);
      } else {
        throw new TypeError('Sequence must have length 6 or 16');
      }
    } else if (typeof init === 'object' && init !== null) {
      const parsed = parseMatrixInit(init);
      this._is2D = parsed.is2D;
      this._values = parsed.values;
    } else {
      throw new TypeError('Invalid matrix initialization argument');
    }
  }

  static fromMatrix(other: unknown): DOMMatrixReadOnly {
    return new DOMMatrixReadOnly(other);
  }

  static fromFloat32Array(array: Float32Array): DOMMatrixReadOnly {
    if (array.length !== 16) {
      throw new TypeError('fromFloat32Array: array must have exactly 16 elements');
    }
    return new DOMMatrixReadOnly(transpose(array));
  }

  static fromFloat64Array(array: Float64Array): DOMMatrixReadOnly {
    if (array.length !== 16) {
      throw new TypeError('fromFloat64Array: array must have exactly 16 elements');
    }
    return new DOMMatrixReadOnly(transpose(array));
  }

  get is2D(): boolean { return this._is2D; }

  get m11(): number { return this._values[0]; }
  get m12(): number { return this._values[1]; }
  get m13(): number { return this._values[2]; }
  get m14(): number { return this._values[3]; }
  get m21(): number { return this._values[4]; }
  get m22(): number { return this._values[5]; }
  get m23(): number { return this._values[6]; }
  get m24(): number { return this._values[7]; }
  get m31(): number { return this._values[8]; }
  get m32(): number { return this._values[9]; }
  get m33(): number { return this._values[10]; }
  get m34(): number { return this._values[11]; }
  get m41(): number { return this._values[12]; }
  get m42(): number { return this._values[13]; }
  get m43(): number { return this._values[14]; }
  get m44(): number { return this._values[15]; }

  get a(): number { return this._values[0]; }
  get b(): number { return this._values[1]; }
  get c(): number { return this._values[4]; }
  get d(): number { return this._values[5]; }
  get e(): number { return this._values[12]; }
  get f(): number { return this._values[13]; }

  multiply(other: unknown): DOMMatrix {
    return DOMMatrix.fromMatrix(this).multiplySelf(other);
  }

  translate(tx = 0, ty = 0, tz = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).translateSelf(tx, ty, tz);
  }

  scale(sx = 1, sy?: number, sz = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).scaleSelf(sx, sy, sz, ox, oy, oz);
  }

  rotate(rotX = 0, rotY?: number, rotZ?: number): DOMMatrix {
    return DOMMatrix.fromMatrix(this).rotateSelf(rotX, rotY, rotZ);
  }

  rotateAxisAngle(x = 0, y = 0, z = 0, angle = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).rotateAxisAngleSelf(x, y, z, angle);
  }

  rotate3d(rx = 0, ry = 0, rz = 0, angle = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).rotate3dSelf(rx, ry, rz, angle);
  }

  skewX(sx = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).skewXSelf(sx);
  }

  skewY(sy = 0): DOMMatrix {
    return DOMMatrix.fromMatrix(this).skewYSelf(sy);
  }

  inverse(): DOMMatrix {
    const res = DOMMatrix.fromMatrix(this);
    const { success, result } = invertMatrix(res._values);
    res._values = result;
    if (!success) {
      res._is2D = false;
    }
    return res;
  }

  toFloat32Array(): Float32Array {
    return new Float32Array(transpose(this._values));
  }

  toFloat64Array(): Float64Array {
    return transpose(this._values);
  }

  toString(): string {
    if (this._is2D) {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    } else {
      return `matrix3d(${Array.from(this._values).join(', ')})`;
    }
  }

  flipX(): DOMMatrix {
    const res = DOMMatrix.fromMatrix(this);
    res._values[0] = -res._values[0];
    res._values[4] = -res._values[4];
    res._values[8] = -res._values[8];
    res._values[12] = -res._values[12];
    return res;
  }

  flipY(): DOMMatrix {
    const res = DOMMatrix.fromMatrix(this);
    res._values[1] = -res._values[1];
    res._values[5] = -res._values[5];
    res._values[9] = -res._values[9];
    res._values[13] = -res._values[13];
    return res;
  }

  rotateFromVector(x = 0, y = 0): DOMMatrix {
    let angle = 0;
    if (x !== 0 || y !== 0) {
      angle = Math.atan2(y, x) * 180 / Math.PI;
    }
    return this.rotate(angle);
  }

  scale3d(scale = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    return this.scale(scale, scale, scale, ox, oy, oz);
  }

  transformPoint(point?: DOMPointInit): DOMPoint {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    const z = point?.z ?? 0;
    const w = point?.w ?? 1;

    const nx = this.m11 * x + this.m21 * y + this.m31 * z + this.m41 * w;
    const ny = this.m12 * x + this.m22 * y + this.m32 * z + this.m42 * w;
    const nz = this.m13 * x + this.m23 * y + this.m33 * z + this.m43 * w;
    const nw = this.m14 * x + this.m24 * y + this.m34 * z + this.m44 * w;

    const DOMPointClass = (globalThis as unknown as Record<string, typeof DOMPoint>).DOMPoint || DOMPoint;
    return new DOMPointClass(nx, ny, nz, nw);
  }

  toJSON() {
    return {
      a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f,
      m11: this.m11, m12: this.m12, m13: this.m13, m14: this.m14,
      m21: this.m21, m22: this.m22, m23: this.m23, m24: this.m24,
      m31: this.m31, m32: this.m32, m33: this.m33, m34: this.m34,
      m41: this.m41, m42: this.m42, m43: this.m43, m44: this.m44,
      is2D: this.is2D
    };
  }
}

export class DOMMatrix extends DOMMatrixReadOnly {
  static override fromMatrix(other: unknown): DOMMatrix {
    return new DOMMatrix(other);
  }

  static override fromFloat32Array(array: Float32Array): DOMMatrix {
    if (array.length !== 16) {
      throw new TypeError('fromFloat32Array: array must have exactly 16 elements');
    }
    return new DOMMatrix(transpose(array));
  }

  static override fromFloat64Array(array: Float64Array): DOMMatrix {
    if (array.length !== 16) {
      throw new TypeError('fromFloat64Array: array must have exactly 16 elements');
    }
    return new DOMMatrix(transpose(array));
  }

  override get is2D(): boolean {
    return this._is2D;
  }

  override set is2D(val: boolean) {
    if (val) {
      const has3D = (
        this.m13 !== 0 ||
        this.m14 !== 0 ||
        this.m23 !== 0 ||
        this.m24 !== 0 ||
        this.m31 !== 0 ||
        this.m32 !== 0 ||
        this.m33 !== 1 ||
        this.m34 !== 0 ||
        this.m43 !== 0 ||
        this.m44 !== 1
      );
      if (has3D) {
        throw new TypeError('Failed to set is2D to true: 3D components are present and non-default');
      }
    }
    this._is2D = val;
  }

  override get m11(): number { return this._values[0]; }
  override get m12(): number { return this._values[1]; }
  override get m13(): number { return this._values[2]; }
  override get m14(): number { return this._values[3]; }
  override get m21(): number { return this._values[4]; }
  override get m22(): number { return this._values[5]; }
  override get m23(): number { return this._values[6]; }
  override get m24(): number { return this._values[7]; }
  override get m31(): number { return this._values[8]; }
  override get m32(): number { return this._values[9]; }
  override get m33(): number { return this._values[10]; }
  override get m34(): number { return this._values[11]; }
  override get m41(): number { return this._values[12]; }
  override get m42(): number { return this._values[13]; }
  override get m43(): number { return this._values[14]; }
  override get m44(): number { return this._values[15]; }

  override get a(): number { return this._values[0]; }
  override get b(): number { return this._values[1]; }
  override get c(): number { return this._values[4]; }
  override get d(): number { return this._values[5]; }
  override get e(): number { return this._values[12]; }
  override get f(): number { return this._values[13]; }

  set m11(val: number) { this._values[0] = val; }
  set m12(val: number) { this._values[1] = val; }
  set m13(val: number) { this._values[2] = val; if (val !== 0) this._is2D = false; }
  set m14(val: number) { this._values[3] = val; if (val !== 0) this._is2D = false; }
  set m21(val: number) { this._values[4] = val; }
  set m22(val: number) { this._values[5] = val; }
  set m23(val: number) { this._values[6] = val; if (val !== 0) this._is2D = false; }
  set m24(val: number) { this._values[7] = val; if (val !== 0) this._is2D = false; }
  set m31(val: number) { this._values[8] = val; if (val !== 0) this._is2D = false; }
  set m32(val: number) { this._values[9] = val; if (val !== 0) this._is2D = false; }
  set m33(val: number) { this._values[10] = val; if (val !== 1) this._is2D = false; }
  set m34(val: number) { this._values[11] = val; if (val !== 0) this._is2D = false; }
  set m41(val: number) { this._values[12] = val; }
  set m42(val: number) { this._values[13] = val; }
  set m43(val: number) { this._values[14] = val; if (val !== 0) this._is2D = false; }
  set m44(val: number) { this._values[15] = val; if (val !== 1) this._is2D = false; }

  set a(val: number) { this._values[0] = val; }
  set b(val: number) { this._values[1] = val; }
  set c(val: number) { this._values[4] = val; }
  set d(val: number) { this._values[5] = val; }
  set e(val: number) { this._values[12] = val; }
  set f(val: number) { this._values[13] = val; }

  multiplySelf(other: unknown): DOMMatrix {
    const otherMatrix = DOMMatrix.fromMatrix(other);
    this._values = multiplyArrays(this._values, otherMatrix._values);
    if (!otherMatrix.is2D) {
      this._is2D = false;
    }
    return this;
  }

  preMultiplySelf(other: unknown): DOMMatrix {
    const otherMatrix = DOMMatrix.fromMatrix(other);
    this._values = multiplyArrays(otherMatrix._values, this._values);
    if (!otherMatrix.is2D) {
      this._is2D = false;
    }
    return this;
  }

  translateSelf(tx = 0, ty = 0, tz = 0): DOMMatrix {
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      const m_r4 = M[idx + 3];
      M[idx + 0] += m_r4 * tx;
      M[idx + 1] += m_r4 * ty;
      M[idx + 2] += m_r4 * tz;
    }
    if (tz !== 0) {
      this._is2D = false;
    }
    return this;
  }

  scaleSelf(sx = 1, sy?: number, sz = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    const actualSy = sy ?? sx;
    
    const hasOrigin = ox !== 0 || oy !== 0 || oz !== 0;
    if (hasOrigin) {
      this.translateSelf(ox, oy, oz);
    }
    
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      M[idx + 0] *= sx;
      M[idx + 1] *= actualSy;
      M[idx + 2] *= sz;
    }
    
    if (sz !== 1 || oz !== 0) {
      this._is2D = false;
    }
    
    if (hasOrigin) {
      this.translateSelf(-ox, -oy, -oz);
    }
    
    return this;
  }

  rotateSelf(rotX = 0, rotY?: number, rotZ?: number): DOMMatrix {
    let rx = rotX;
    let ry = rotY;
    let rz = rotZ;
    
    if (ry === undefined && rz === undefined) {
      rz = rx;
      rx = 0;
      ry = 0;
    } else {
      ry = ry ?? 0;
      rz = rz ?? 0;
    }
    
    if (rz !== 0) {
      this._values = multiplyArrays(this._values, getRz(rz));
    }
    if (ry !== 0) {
      this._values = multiplyArrays(this._values, getRy(ry));
      this._is2D = false;
    }
    if (rx !== 0) {
      this._values = multiplyArrays(this._values, getRx(rx));
      this._is2D = false;
    }
    
    return this;
  }

  rotateAxisAngleSelf(x = 0, y = 0, z = 0, angle = 0): DOMMatrix {
    const len = Math.sqrt(x*x + y*y + z*z);
    if (len === 0) return this;
    
    const ux = x / len;
    const uy = y / len;
    const uz = z / len;
    
    const rad = angle * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const t = 1 - c;
    
    const R = new Float64Array([
      t*ux*ux + c,      t*ux*uy + s*uz,   t*ux*uz - s*uy,   0,
      t*ux*uy - s*uz,   t*uy*uy + c,      t*uy*uz + s*ux,   0,
      t*ux*uz + s*uy,   t*uy*uz - s*ux,   t*uz*uz + c,      0,
      0,                0,                0,                1
    ]);
    
    this._values = multiplyArrays(this._values, R);
    
    if (x !== 0 || y !== 0 || z !== 1) {
      this._is2D = false;
    }
    
    return this;
  }

  rotate3dSelf(rx = 0, ry = 0, rz = 0, angle = 0): DOMMatrix {
    return this.rotateAxisAngleSelf(rx, ry, rz, angle);
  }

  skewXSelf(sx = 0): DOMMatrix {
    const rad = sx * Math.PI / 180;
    const s = Math.tan(rad);
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      M[idx + 0] += M[idx + 1] * s;
    }
    return this;
  }

  skewYSelf(sy = 0): DOMMatrix {
    const rad = sy * Math.PI / 180;
    const s = Math.tan(rad);
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      M[idx + 1] += M[idx + 0] * s;
    }
    return this;
  }

  invertSelf(): DOMMatrix {
    const { success, result } = invertMatrix(this._values);
    this._values = result;
    if (!success) {
      this._is2D = false;
    }
    return this;
  }

  rotateFromVectorSelf(x = 0, y = 0): DOMMatrix {
    let angle = 0;
    if (x !== 0 || y !== 0) {
      angle = Math.atan2(y, x) * 180 / Math.PI;
    }
    return this.rotateSelf(angle);
  }

  scale3dSelf(scale = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    return this.scaleSelf(scale, scale, scale, ox, oy, oz);
  }

  setMatrixValue(value: string): DOMMatrix {
    const parsed = parseMatrixString(value);
    this._is2D = parsed.is2D;
    this._values = parsed.values;
    return this;
  }
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.DOMMatrixReadOnly) {
    g.DOMMatrixReadOnly = DOMMatrixReadOnly;
  }
  if (!g.DOMMatrix) {
    g.DOMMatrix = DOMMatrix;
  }
  if (!g.DOMPointReadOnly) {
    g.DOMPointReadOnly = DOMPointReadOnly;
  }
  if (!g.DOMPoint) {
    g.DOMPoint = DOMPoint;
  }
}
