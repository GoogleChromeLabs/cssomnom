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

import { degToRad, angleFromVector } from './utils.ts';

// 4x4 matrix multiplication writing into destination array
export function multiplyArrays(a: Float64Array, b: Float64Array, out: Float64Array = new Float64Array(16)): Float64Array {
  const res = out === a || out === b ? new Float64Array(16) : out;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      res[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
    }
  }
  if (res !== out) out.set(res);
  return out;
}

export function transpose(m: Float64Array | Float32Array | number[]): Float64Array {
  const out = new Float64Array(16);
  out[0] = m[0];   out[1] = m[4];   out[2] = m[8];   out[3] = m[12];
  out[4] = m[1];   out[5] = m[5];   out[6] = m[9];   out[7] = m[13];
  out[8] = m[2];   out[9] = m[6];   out[10] = m[10]; out[11] = m[14];
  out[12] = m[3];  out[13] = m[7];  out[14] = m[11]; out[15] = m[15];
  return out;
}

export function invertMatrix(m: Float64Array): { success: boolean; result: Float64Array } {
  const s0 = m[0] * m[5] - m[1] * m[4], s1 = m[0] * m[6] - m[2] * m[4], s2 = m[0] * m[7] - m[3] * m[4];
  const s3 = m[1] * m[6] - m[2] * m[5], s4 = m[1] * m[7] - m[3] * m[5], s5 = m[2] * m[7] - m[3] * m[6];
  const c0 = m[8] * m[13] - m[9] * m[12], c1 = m[8] * m[14] - m[10] * m[12], c2 = m[8] * m[15] - m[11] * m[12];
  const c3 = m[9] * m[14] - m[10] * m[13], c4 = m[9] * m[15] - m[11] * m[13], c5 = m[10] * m[15] - m[11] * m[14];

  const det = s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
  if (!Number.isFinite(det) || det === 0) {
    return { success: false, result: new Float64Array(16).fill(NaN) };
  }
  const invDet = 1 / det;
  const out = new Float64Array(16);

  out[0] = ( m[5] * c5 - m[6] * c4 + m[7] * c3) * invDet;
  out[1] = (-m[1] * c5 + m[2] * c4 - m[3] * c3) * invDet;
  out[2] = ( m[13] * s5 - m[14] * s4 + m[15] * s3) * invDet;
  out[3] = (-m[9] * s5 + m[10] * s4 - m[11] * s3) * invDet;

  out[4] = (-m[4] * c5 + m[6] * c2 - m[7] * c1) * invDet;
  out[5] = ( m[0] * c5 - m[2] * c2 + m[3] * c1) * invDet;
  out[6] = (-m[12] * s5 + m[14] * s2 - m[15] * s1) * invDet;
  out[7] = ( m[8] * s5 - m[10] * s2 + m[11] * s1) * invDet;

  out[8] = ( m[4] * c4 - m[5] * c2 + m[7] * c0) * invDet;
  out[9] = (-m[0] * c4 + m[1] * c2 - m[3] * c0) * invDet;
  out[10] = ( m[12] * s4 - m[13] * s2 + m[15] * s0) * invDet;
  out[11] = (-m[8] * s4 + m[9] * s2 - m[11] * s0) * invDet;

  out[12] = (-m[4] * c3 + m[5] * c1 - m[6] * c0) * invDet;
  out[13] = ( m[0] * c3 - m[1] * c1 + m[2] * c0) * invDet;
  out[14] = (-m[12] * s3 + m[13] * s1 - m[14] * s0) * invDet;
  out[15] = ( m[8] * s3 - m[9] * s1 + m[10] * s0) * invDet;

  return { success: true, result: out };
}

function parseIdentityOrNone(str: string): { is2D: boolean; values: Float64Array } | null {
  if (str === '' || str.toLowerCase() === 'none') {
    const values = new Float64Array(16);
    values[0] = 1;
    values[5] = 1;
    values[10] = 1;
    values[15] = 1;
    return { is2D: true, values };
  }
  return null;
}

function parseMatrix2D(str: string): { is2D: boolean; values: Float64Array } | null {
  const match = str.match(/^matrix\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 6) return null;
  const numbers = parts.map(Number);
  if (numbers.some(isNaN)) {
    throw new DOMException(`Invalid matrix values in string: "${str}"`, 'SyntaxError');
  }
  const values = new Float64Array(16);
  values[0] = numbers[0];  // a (m11)
  values[1] = numbers[1];  // b (m12)
  values[4] = numbers[2];  // c (m21)
  values[5] = numbers[3];  // d (m22)
  values[10] = 1;          // m33
  values[12] = numbers[4]; // e (m41)
  values[13] = numbers[5]; // f (m42)
  values[15] = 1;          // m44
  return { is2D: true, values };
}

function parseMatrix3D(str: string): { is2D: boolean; values: Float64Array } | null {
  const match = str.match(/^matrix3d\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 16) return null;
  const numbers = parts.map(Number);
  if (numbers.some(isNaN)) {
    throw new DOMException(`Invalid matrix3d values in string: "${str}"`, 'SyntaxError');
  }
  return { is2D: false, values: new Float64Array(numbers) };
}

function parseTransformHook(str: string): { is2D: boolean; values: Float64Array } | null {
  if (parseTransformListHook) {
    return parseTransformListHook(str);
  }
  return null;
}

function parseMatrixString(str: string): { is2D: boolean; values: Float64Array } {
  const clean = str.trim().replace(/\s+/g, ' ');
  
  const identity = parseIdentityOrNone(clean);
  if (identity) return identity;

  const m2d = parseMatrix2D(clean);
  if (m2d) return m2d;

  const m3d = parseMatrix3D(clean);
  if (m3d) return m3d;

  const fromHook = parseTransformHook(clean);
  if (fromHook) return fromHook;

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

export interface DOMMatrixInit {
  a?: number; b?: number; c?: number; d?: number; e?: number; f?: number;
  m11?: number; m12?: number; m13?: number; m14?: number;
  m21?: number; m22?: number; m23?: number; m24?: number;
  m31?: number; m32?: number; m33?: number; m34?: number;
  m41?: number; m42?: number; m43?: number; m44?: number;
  is2D?: boolean;
  toFloat64Array?: () => number[] | Float64Array;
}

const NON_2D_INDICES: [number, number][] = [
  [2, 0], [3, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 1], [11, 0], [14, 0], [15, 1]
];
const NON_2D_KEYS: [keyof DOMMatrixInit, number][] = [
  ['m13', 0], ['m14', 0], ['m23', 0], ['m24', 0], ['m31', 0], ['m32', 0], ['m33', 1], ['m34', 0], ['m43', 0], ['m44', 1]
];
const ALIASES: [keyof DOMMatrixInit, keyof DOMMatrixInit][] = [
  ['a', 'm11'], ['b', 'm12'], ['c', 'm21'], ['d', 'm22'], ['e', 'm41'], ['f', 'm42']
];

export function has3DComponents(init: DOMMatrixInit | DOMMatrixReadOnly | Float64Array | Float32Array | number[]): boolean {
  if (init instanceof DOMMatrixReadOnly) return !init.is2D;
  if (init instanceof Float64Array || init instanceof Float32Array || Array.isArray(init)) {
    if (init.length === 6) return false;
    if (init.length === 16) {
      return NON_2D_INDICES.some(([idx, expected]) => init[idx] !== expected);
    }
    return true;
  }
  return NON_2D_KEYS.some(([k, expected]) => init[k] !== undefined && init[k] !== expected);
}

function validateMatrixInitAliases(dict: DOMMatrixInit): void {
  for (const [k2d, k3d] of ALIASES) {
    if (dict[k2d] !== undefined && dict[k3d] !== undefined && dict[k2d] !== dict[k3d]) {
      throw new TypeError(`DOMMatrixInit: conflicting "${k2d}" and "${k3d}" values`);
    }
  }
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

  validateMatrixInitAliases(dict);
  const has3D = has3DComponents(dict);
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
    } else if (init instanceof DOMMatrixReadOnly) {
      this._is2D = init._is2D;
      this._values = new Float64Array(init._values);
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

  get isIdentity(): boolean {
    const m = this._values;
    return (
      m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 0 &&
      m[4] === 0 && m[5] === 1 && m[6] === 0 && m[7] === 0 &&
      m[8] === 0 && m[9] === 0 && m[10] === 1 && m[11] === 0 &&
      m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1
    );
  }

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

  scaleNonUniform(sx = 1, sy = 1): DOMMatrix {
    return this.scale(sx, sy, 1, 0, 0, 0);
  }

  scale3d(scale = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    return this.scale(scale, scale, scale, ox, oy, oz);
  }

  rotate(rotX = 0, rotY?: number, rotZ?: number): DOMMatrix {
    return DOMMatrix.fromMatrix(this).rotateSelf(rotX, rotY, rotZ);
  }

  rotateFromVector(x = 0, y = 0): DOMMatrix {
    return this.rotate(angleFromVector(x, y));
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

  inverse(): DOMMatrix {
    return DOMMatrix.fromMatrix(this).invertSelf();
  }

  transformPoint(point?: DOMPointInit): DOMPoint {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    const z = point?.z ?? 0;
    const w = point?.w ?? 1;

    let nx: number, ny: number, nz: number, nw: number;
    if (this._is2D && z === 0 && w === 1) {
      nx = this.a * x + this.c * y + this.e;
      ny = this.b * x + this.d * y + this.f;
      nz = 0;
      nw = 1;
    } else {
      nx = this.m11 * x + this.m21 * y + this.m31 * z + this.m41 * w;
      ny = this.m12 * x + this.m22 * y + this.m32 * z + this.m42 * w;
      nz = this.m13 * x + this.m23 * y + this.m33 * z + this.m43 * w;
      nw = this.m14 * x + this.m24 * y + this.m34 * z + this.m44 * w;
    }

    const DOMPointClass = (typeof globalThis !== 'undefined' && (globalThis as unknown as { DOMPoint?: typeof DOMPoint }).DOMPoint) || DOMPoint;
    return new DOMPointClass(nx, ny, nz, nw);
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

  toJSON() {
    return {
      a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f,
      m11: this.m11, m12: this.m12, m13: this.m13, m14: this.m14,
      m21: this.m21, m22: this.m22, m23: this.m23, m24: this.m24,
      m31: this.m31, m32: this.m32, m33: this.m33, m34: this.m34,
      m41: this.m41, m42: this.m42, m43: this.m43, m44: this.m44,
      is2D: this.is2D,
      isIdentity: this.isIdentity
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

  override set is2D(val: boolean) {
    if (val && has3DComponents(this._values)) {
      throw new TypeError('Failed to set is2D to true: 3D components are present and non-default');
    }
    this._is2D = val;
  }

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
    if (this._is2D && otherMatrix._is2D) {
      const M = this._values;
      const O = otherMatrix._values;
      const a1 = M[0], b1 = M[1], c1 = M[4], d1 = M[5], e1 = M[12], f1 = M[13];
      const a2 = O[0], b2 = O[1], c2 = O[4], d2 = O[5], e2 = O[12], f2 = O[13];
      M[0] = a1 * a2 + b1 * c2;
      M[1] = a1 * b2 + b1 * d2;
      M[4] = c1 * a2 + d1 * c2;
      M[5] = c1 * b2 + d1 * d2;
      M[12] = e1 * a2 + f1 * c2 + e2;
      M[13] = e1 * b2 + f1 * d2 + f2;
      return this;
    }
    multiplyArrays(this._values, otherMatrix._values, this._values);
    if (!otherMatrix._is2D) {
      this._is2D = false;
    }
    return this;
  }

  preMultiplySelf(other: unknown): DOMMatrix {
    const otherMatrix = DOMMatrix.fromMatrix(other);
    if (this._is2D && otherMatrix._is2D) {
      const M = this._values;
      const O = otherMatrix._values;
      const a1 = O[0], b1 = O[1], c1 = O[4], d1 = O[5], e1 = O[12], f1 = O[13];
      const a2 = M[0], b2 = M[1], c2 = M[4], d2 = M[5], e2 = M[12], f2 = M[13];
      M[0] = a1 * a2 + b1 * c2;
      M[1] = a1 * b2 + b1 * d2;
      M[4] = c1 * a2 + d1 * c2;
      M[5] = c1 * b2 + d1 * d2;
      M[12] = e1 * a2 + f1 * c2 + e2;
      M[13] = e1 * b2 + f1 * d2 + f2;
      return this;
    }
    multiplyArrays(otherMatrix._values, this._values, this._values);
    if (!otherMatrix._is2D) {
      this._is2D = false;
    }
    return this;
  }

  translateSelf(tx = 0, ty = 0, tz = 0): DOMMatrix {
    if (this._is2D && tz === 0) {
      this._values[12] += tx;
      this._values[13] += ty;
      return this;
    }
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
    if (this._is2D && sz === 1 && oz === 0) {
      const M = this._values;
      M[0] *= sx;
      M[1] *= actualSy;
      M[4] *= sx;
      M[5] *= actualSy;
      if (ox !== 0 || oy !== 0) {
        M[12] = (M[12] + ox) * sx - ox;
        M[13] = (M[13] + oy) * actualSy - oy;
      } else {
        M[12] *= sx;
        M[13] *= actualSy;
      }
      return this;
    }
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

  scaleNonUniformSelf(sx = 1, sy = 1): DOMMatrix {
    return this.scaleSelf(sx, sy, 1, 0, 0, 0);
  }

  scale3dSelf(scale = 1, ox = 0, oy = 0, oz = 0): DOMMatrix {
    return this.scaleSelf(scale, scale, scale, ox, oy, oz);
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

    if (rx === 0 && ry === 0) {
      if (rz === 0) return this;
      const rad = degToRad(rz);
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      if (this._is2D) {
        const M = this._values;
        const a = M[0], b = M[1], c0 = M[4], d0 = M[5], e = M[12], f = M[13];
        M[0] = a * c - b * s;
        M[1] = a * s + b * c;
        M[4] = c0 * c - d0 * s;
        M[5] = c0 * s + d0 * c;
        M[12] = e * c - f * s;
        M[13] = e * s + f * c;
        return this;
      }
    }

    const radZ = degToRad(rz);
    const cz = Math.cos(radZ);
    const sz = Math.sin(radZ);

    const radY = degToRad(ry);
    const cy = Math.cos(radY);
    const sy = Math.sin(radY);

    const radX = degToRad(rx);
    const cx = Math.cos(radX);
    const sx = Math.sin(radX);

    const r00 = cz * cy;
    const r01 = sz * cx + cz * sy * sx;
    const r02 = sz * sx - cz * sy * cx;
    const r10 = -sz * cy;
    const r11 = cz * cx - sz * sy * sx;
    const r12 = cz * sx + sz * sy * cx;
    const r20 = sy;
    const r21 = -cy * sx;
    const r22 = cy * cx;

    const M = this._values;
    for (let i = 0; i < 16; i += 4) {
      const m0 = M[i], m1 = M[i + 1], m2 = M[i + 2];
      M[i]     = m0 * r00 + m1 * r10 + m2 * r20;
      M[i + 1] = m0 * r01 + m1 * r11 + m2 * r21;
      M[i + 2] = m0 * r02 + m1 * r12 + m2 * r22;
    }

    if (rx !== 0 || ry !== 0) {
      this._is2D = false;
    }

    return this;
  }

  rotateFromVectorSelf(x = 0, y = 0): DOMMatrix {
    return this.rotateSelf(angleFromVector(x, y));
  }

  rotateAxisAngleSelf(x = 0, y = 0, z = 0, angle = 0): DOMMatrix {
    const len = Math.hypot(x, y, z);
    if (len === 0) return this;

    const ux = x / len;
    const uy = y / len;
    const uz = z / len;

    const rad = degToRad(angle);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const t = 1 - c;

    const r00 = t * ux * ux + c;
    const r01 = t * ux * uy + s * uz;
    const r02 = t * ux * uz - s * uy;
    const r10 = t * ux * uy - s * uz;
    const r11 = t * uy * uy + c;
    const r12 = t * uy * uz + s * ux;
    const r20 = t * ux * uz + s * uy;
    const r21 = t * uy * uz - s * ux;
    const r22 = t * uz * uz + c;

    const M = this._values;
    for (let i = 0; i < 16; i += 4) {
      const m0 = M[i], m1 = M[i + 1], m2 = M[i + 2];
      M[i]     = m0 * r00 + m1 * r10 + m2 * r20;
      M[i + 1] = m0 * r01 + m1 * r11 + m2 * r21;
      M[i + 2] = m0 * r02 + m1 * r12 + m2 * r22;
    }

    if (x !== 0 || y !== 0 || z !== 1) {
      this._is2D = false;
    }

    return this;
  }

  rotate3dSelf(rx = 0, ry = 0, rz = 0, angle = 0): DOMMatrix {
    return this.rotateAxisAngleSelf(rx, ry, rz, angle);
  }

  skewXSelf(sx = 0): DOMMatrix {
    if (sx === 0) return this;
    const rad = degToRad(sx);
    const s = Math.tan(rad);
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      M[idx + 0] += M[idx + 1] * s;
    }
    return this;
  }

  skewYSelf(sy = 0): DOMMatrix {
    if (sy === 0) return this;
    const rad = degToRad(sy);
    const s = Math.tan(rad);
    const M = this._values;
    for (let r = 0; r < 4; r++) {
      const idx = r * 4;
      M[idx + 1] += M[idx + 0] * s;
    }
    return this;
  }

  invertSelf(): DOMMatrix {
    if (this._is2D) {
      const a = this._values[0], b = this._values[1], c = this._values[4], d = this._values[5], e = this._values[12], f = this._values[13];
      const det = a * d - b * c;
      if (!Number.isFinite(det) || det === 0) {
        this._values.fill(NaN);
        this._is2D = false;
        return this;
      }
      const invDet = 1 / det;
      this._values[0] = d * invDet;
      this._values[1] = -b * invDet;
      this._values[4] = -c * invDet;
      this._values[5] = a * invDet;
      this._values[12] = (c * f - d * e) * invDet;
      this._values[13] = (b * e - a * f) * invDet;
      return this;
    }
    const { success, result } = invertMatrix(this._values);
    this._values = result;
    if (!success) {
      this._is2D = false;
    }
    return this;
  }

  setMatrixValue(value: string): DOMMatrix {
    const parsed = parseMatrixString(value);
    this._is2D = parsed.is2D;
    this._values = parsed.values;
    return this;
  }
}

// Inherit getters from DOMMatrixReadOnly onto DOMMatrix where DOMMatrix defines setters
for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(DOMMatrixReadOnly.prototype))) {
  if (desc.get && key !== 'constructor') {
    const subDesc = Object.getOwnPropertyDescriptor(DOMMatrix.prototype, key);
    if (subDesc && !subDesc.get && subDesc.set) {
      Object.defineProperty(DOMMatrix.prototype, key, {
        get: desc.get,
        set: subDesc.set,
        enumerable: subDesc.enumerable,
        configurable: true,
      });
    }
  }
}
