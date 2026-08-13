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
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { DOMMatrix, DOMMatrixReadOnly } from '../src/typed-om.ts';

describe('DOMMatrixReadOnly & DOMMatrix', () => {
    describe('Constructor & Identity', () => {
        test('Empty constructor creates 2D identity matrix', () => {
            const m = new DOMMatrixReadOnly();
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.m11, 1); assert.strictEqual(m.m12, 0); assert.strictEqual(m.m13, 0); assert.strictEqual(m.m14, 0);
            assert.strictEqual(m.m21, 0); assert.strictEqual(m.m22, 1); assert.strictEqual(m.m23, 0); assert.strictEqual(m.m24, 0);
            assert.strictEqual(m.m31, 0); assert.strictEqual(m.m32, 0); assert.strictEqual(m.m33, 1); assert.strictEqual(m.m34, 0);
            assert.strictEqual(m.m41, 0); assert.strictEqual(m.m42, 0); assert.strictEqual(m.m43, 0); assert.strictEqual(m.m44, 1);
            
            // 2D components shorthand
            assert.strictEqual(m.a, 1);
            assert.strictEqual(m.b, 0);
            assert.strictEqual(m.c, 0);
            assert.strictEqual(m.d, 1);
            assert.strictEqual(m.e, 0);
            assert.strictEqual(m.f, 0);
        });

        test('Constructor with 6-number sequence creates 2D matrix', () => {
            const m = new DOMMatrixReadOnly([2, 4, 6, 8, 10, 12]);
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.a, 2);
            assert.strictEqual(m.b, 4);
            assert.strictEqual(m.c, 6);
            assert.strictEqual(m.d, 8);
            assert.strictEqual(m.e, 10);
            assert.strictEqual(m.f, 12);
            
            assert.strictEqual(m.m11, 2);
            assert.strictEqual(m.m12, 4);
            assert.strictEqual(m.m21, 6);
            assert.strictEqual(m.m22, 8);
            assert.strictEqual(m.m41, 10);
            assert.strictEqual(m.m42, 12);
        });

        test('Constructor with 16-number sequence creates 3D matrix', () => {
            const m = new DOMMatrixReadOnly([
                1, 2, 3, 4,
                5, 6, 7, 8,
                9, 10, 11, 12,
                13, 14, 15, 16
            ]);
            assert.strictEqual(m.is2D, false);
            assert.strictEqual(m.m11, 1);
            assert.strictEqual(m.m12, 2);
            assert.strictEqual(m.m13, 3);
            assert.strictEqual(m.m14, 4);
            assert.strictEqual(m.m21, 5);
            assert.strictEqual(m.m22, 6);
            assert.strictEqual(m.m23, 7);
            assert.strictEqual(m.m24, 8);
            assert.strictEqual(m.m31, 9);
            assert.strictEqual(m.m32, 10);
            assert.strictEqual(m.m33, 11);
            assert.strictEqual(m.m34, 12);
            assert.strictEqual(m.m41, 13);
            assert.strictEqual(m.m42, 14);
            assert.strictEqual(m.m43, 15);
            assert.strictEqual(m.m44, 16);
        });

        test('Constructor with invalid sequence throws', () => {
            assert.throws(() => {
                new DOMMatrixReadOnly([1, 2, 3]);
            }, TypeError);
        });
    });

    describe('String Parsing & Serialization', () => {
        test('Parse matrix(...) string', () => {
            const m = new DOMMatrixReadOnly('matrix(1, 2, 3, 4, 5, 6)');
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.a, 1);
            assert.strictEqual(m.b, 2);
            assert.strictEqual(m.c, 3);
            assert.strictEqual(m.d, 4);
            assert.strictEqual(m.e, 5);
            assert.strictEqual(m.f, 6);
            assert.strictEqual(m.toString(), 'matrix(1, 2, 3, 4, 5, 6)');
        });

        test('Parse matrix3d(...) string', () => {
            const str = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1)';
            const m = new DOMMatrixReadOnly(str);
            assert.strictEqual(m.is2D, false);
            assert.strictEqual(m.m41, 10);
            assert.strictEqual(m.m42, 20);
            assert.strictEqual(m.m43, 30);
            assert.strictEqual(m.toString(), str);
        });
    });

    describe('Immutability vs Mutability', () => {
        test('DOMMatrixReadOnly is immutable', () => {
            const m = new DOMMatrixReadOnly([1, 0, 0, 1, 0, 0]);
            // Attempt to assign to a, should fail in typescript/runtime if read-only or getter-only
            assert.throws(() => {
                (m as unknown as { a: number }).a = 5;
            });
            // translate returns a new matrix, does not modify m
            const m2 = m.translate(10, 20);
            assert.notStrictEqual(m, m2);
            assert.strictEqual(m.e, 0);
            assert.strictEqual(m.f, 0);
            assert.strictEqual(m2.e, 10);
            assert.strictEqual(m2.f, 20);
        });

        test('DOMMatrix is mutable', () => {
            const m = new DOMMatrix([1, 0, 0, 1, 0, 0]);
            m.a = 5;
            assert.strictEqual(m.a, 5);
            assert.strictEqual(m.m11, 5);
            
            // translateSelf modifies in-place
            const m2 = m.translateSelf(10, 20);
            assert.strictEqual(m, m2);
            assert.strictEqual(m.e, 10);
            assert.strictEqual(m.f, 20);
        });
    });

    describe('Matrix Multiplications', () => {
        test('Multiply 2D matrices', () => {
            // translate by (10, 20) * translate by (5, 5)
            const m1 = new DOMMatrix([1, 0, 0, 1, 10, 20]);
            const m2 = new DOMMatrix([1, 0, 0, 1, 5, 5]);
            const res = m1.multiply(m2);
            assert.strictEqual(res.e, 15);
            assert.strictEqual(res.f, 25);
        });
    });

    describe('Transform Math', () => {
        test('Translate', () => {
            const m = new DOMMatrixReadOnly().translate(10, 20, 30);
            assert.strictEqual(m.is2D, false); // 3D translation makes it 3D
            assert.strictEqual(m.m41, 10);
            assert.strictEqual(m.m42, 20);
            assert.strictEqual(m.m43, 30);
        });

        test('Scale', () => {
            const m = new DOMMatrixReadOnly().scale(2, 3);
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.a, 2);
            assert.strictEqual(m.d, 3);
        });

        test('Rotate Z (2D)', () => {
            // rotate(90) around Z
            const m = new DOMMatrixReadOnly().rotate(90);
            // cos(90deg) = 0, sin(90deg) = 1
            // matrix(cos, sin, -sin, cos, 0, 0)
            assert.ok(Math.abs(m.a) < 1e-7);
            assert.ok(Math.abs(m.b - 1) < 1e-7);
            assert.ok(Math.abs(m.c + 1) < 1e-7);
            assert.ok(Math.abs(m.d) < 1e-7);
        });
    });

    describe('Inversion', () => {
        test('Invert a 2D translation matrix', () => {
            const m = new DOMMatrixReadOnly([1, 0, 0, 1, 10, 20]);
            const inv = m.inverse();
            assert.strictEqual(inv.e, -10);
            assert.strictEqual(inv.f, -20);
        });
    });

    describe('Regression Tests', () => {
        test('Translation followed by scaling is composed in correct sequence (post-multiplication)', () => {
            const m = new DOMMatrix();
            m.translateSelf(10, 20);
            m.scaleSelf(2, 3);
            // Post-multiplication: point P is first translated, then scaled.
            // P = [x, y] -> translate(10, 20) -> [x+10, y+20] -> scale(2, 3) -> [2x+20, 3y+60]
            // Translation terms should be: e = 20, f = 60
            assert.strictEqual(m.e, 20, 'e should be 20 (10 * 2)');
            assert.strictEqual(m.f, 60, 'f should be 60 (20 * 3)');
        });

        test('toFloat64Array() returns column-major array', () => {
            // Row-major internal:
            // [
            //   1,  2,  3,  4,
            //   5,  6,  7,  8,
            //   9, 10, 11, 12,
            //  13, 14, 15, 16
            // ]
            // Column-major output should be:
            // [
            //   1,  5,  9, 13,
            //   2,  6, 10, 14,
            //   3,  7, 11, 15,
            //   4,  8, 12, 16
            // ]
            const m = new DOMMatrix([
                1, 2, 3, 4,
                5, 6, 7, 8,
                9, 10, 11, 12,
                13, 14, 15, 16
            ]);
            const arr = m.toFloat64Array();
            assert.deepStrictEqual(Array.from(arr), [
                1, 5, 9, 13,
                2, 6, 10, 14,
                3, 7, 11, 15,
                4, 8, 12, 16
            ]);
        });

        test('fromFloat64Array() expects column-major array and populates internal row-major values', () => {
            const colMajor = new Float64Array([
                1, 5, 9, 13,
                2, 6, 10, 14,
                3, 7, 11, 15,
                4, 8, 12, 16
            ]);
            const m = DOMMatrix.fromFloat64Array(colMajor);
            // Should transpose back to internal row-major:
            assert.strictEqual(m.m11, 1);
            assert.strictEqual(m.m12, 2);
            assert.strictEqual(m.m13, 3);
            assert.strictEqual(m.m14, 4);
            assert.strictEqual(m.m21, 5);
            assert.strictEqual(m.m22, 6);
            assert.strictEqual(m.m23, 7);
            assert.strictEqual(m.m24, 8);
        });

        test('Empty string and "none" constructor args parse successfully', () => {
            const m1 = new DOMMatrix('');
            assert.strictEqual(m1.is2D, true);
            assert.strictEqual(m1.toString(), 'matrix(1, 0, 0, 1, 0, 0)');

            const m2 = new DOMMatrix('none');
            assert.strictEqual(m2.is2D, true);
            assert.strictEqual(m2.toString(), 'matrix(1, 0, 0, 1, 0, 0)');
        });

        test('Array inputs that are not exactly 6 or 16 throw TypeError', () => {
            assert.throws(() => {
                new DOMMatrix([1, 2, 3, 4, 5]);
            }, TypeError);

            assert.throws(() => {
                DOMMatrix.fromFloat64Array(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
            }, TypeError);

            assert.throws(() => {
                DOMMatrix.fromFloat64Array(new Float64Array([1, 2, 3, 4, 5, 6]));
            }, TypeError);

            assert.throws(() => {
                DOMMatrix.fromFloat32Array(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
            }, TypeError);

            assert.throws(() => {
                DOMMatrix.fromFloat32Array(new Float32Array([1, 2, 3, 4, 5, 6]));
            }, TypeError);
        });

        test('is2D setter behaviour', () => {
            const m = new DOMMatrix();
            assert.strictEqual(m.is2D, true);
            m.is2D = false;
            assert.strictEqual(m.is2D, false);
            m.is2D = true;
            assert.strictEqual(m.is2D, true);

            const m3d = new DOMMatrix([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0.5,
                0, 0, 0, 1
            ]);
            assert.strictEqual(m3d.is2D, false);
            assert.throws(() => {
                m3d.is2D = true;
            }, TypeError);
        });
    });

    describe('Geometry IDL Conformance Methods (Phase 72.4)', () => {
        test('flipX and flipY return new matrix with flipped axes', () => {
            const m = new DOMMatrixReadOnly([2, 4, 6, 8, 10, 12]);
            const fx = m.flipX();
            assert.notStrictEqual(m, fx);
            assert.strictEqual(fx.a, -2);
            assert.strictEqual(fx.b, 4);
            assert.strictEqual(fx.c, -6);
            assert.strictEqual(fx.d, 8);
            assert.strictEqual(fx.e, -10);
            assert.strictEqual(fx.f, 12);

            const fy = m.flipY();
            assert.notStrictEqual(m, fy);
            assert.strictEqual(fy.a, 2);
            assert.strictEqual(fy.b, -4);
            assert.strictEqual(fy.c, 6);
            assert.strictEqual(fy.d, -8);
            assert.strictEqual(fy.e, 10);
            assert.strictEqual(fy.f, -12);
        });

        test('rotateFromVector and rotateFromVectorSelf', () => {
            const m = new DOMMatrixReadOnly([1, 0, 0, 1, 0, 0]);
            // 45 degrees vector: x = 10, y = 10
            const rotated = m.rotateFromVector(10, 10);
            assert.notStrictEqual(m, rotated);
            const angle = Math.atan2(10, 10) * 180 / Math.PI; // 45
            const expected = m.rotate(angle);
            assert.ok(Math.abs(rotated.a - expected.a) < 1e-7);
            assert.ok(Math.abs(rotated.b - expected.b) < 1e-7);

            // test rotateFromVectorSelf
            const mutable = new DOMMatrix([1, 0, 0, 1, 0, 0]);
            const res = mutable.rotateFromVectorSelf(10, 10);
            assert.strictEqual(mutable, res);
            assert.ok(Math.abs(mutable.a - expected.a) < 1e-7);
            assert.ok(Math.abs(mutable.b - expected.b) < 1e-7);
        });

        test('scale3d and scale3dSelf', () => {
            const m = new DOMMatrixReadOnly([1, 0, 0, 1, 0, 0]);
            const scaled = m.scale3d(2, 10, 20, 30);
            assert.notStrictEqual(m, scaled);
            assert.strictEqual(scaled.is2D, false);
            const expected = m.scale(2, 2, 2, 10, 20, 30);
            assert.strictEqual(scaled.toString(), expected.toString());

            const mutable = new DOMMatrix([1, 0, 0, 1, 0, 0]);
            const res = mutable.scale3dSelf(2, 10, 20, 30);
            assert.strictEqual(mutable, res);
            assert.strictEqual(mutable.is2D, false);
            assert.strictEqual(mutable.toString(), expected.toString());
        });

        test('transformPoint with DOMPointInit', () => {
            const m = new DOMMatrixReadOnly().translate(10, 20, 30);
            const pt = m.transformPoint({ x: 0, y: 0, z: 0, w: 1 });
            assert.strictEqual(pt.x, 10);
            assert.strictEqual(pt.y, 20);
            assert.strictEqual(pt.z, 30);
            assert.strictEqual(pt.w, 1);

            const pt2 = m.transformPoint({ x: 5, y: 5, z: 5, w: 1 });
            assert.strictEqual(pt2.x, 15);
            assert.strictEqual(pt2.y, 25);
            assert.strictEqual(pt2.z, 35);
            assert.strictEqual(pt2.w, 1);
        });

        test('toJSON serialization', () => {
            const m = new DOMMatrixReadOnly([1, 2, 3, 4, 5, 6]);
            const json = m.toJSON();
            assert.strictEqual(json.a, 1);
            assert.strictEqual(json.b, 2);
            assert.strictEqual(json.c, 3);
            assert.strictEqual(json.d, 4);
            assert.strictEqual(json.e, 5);
            assert.strictEqual(json.f, 6);
            assert.strictEqual(json.is2D, true);
        });

        test('setMatrixValue with CSS transform list', () => {
            const m = new DOMMatrix([1, 0, 0, 1, 0, 0]);
            const res = m.setMatrixValue('rotate(90deg) translate(10px, 20px)');
            assert.strictEqual(m, res);
            assert.strictEqual(m.is2D, true);
            const expected = new DOMMatrix().rotateSelf(90).translateSelf(10, 20);
            assert.ok(Math.abs(m.a - expected.a) < 1e-7);
            assert.ok(Math.abs(m.b - expected.b) < 1e-7);
            assert.ok(Math.abs(m.e - expected.e) < 1e-7);
            assert.ok(Math.abs(m.f - expected.f) < 1e-7);
        });
    });

    describe('Phase 92: Modernization, Performance & Spec Conformance', () => {
        test('Direct DOMMatrixReadOnly cloning fast-path', () => {
            const original2D = new DOMMatrixReadOnly([2, 3, 4, 5, 6, 7]);
            const clone2D = new DOMMatrixReadOnly(original2D);
            assert.strictEqual(clone2D.is2D, true);
            assert.strictEqual(clone2D.a, 2);
            assert.strictEqual(clone2D.b, 3);
            assert.strictEqual(clone2D.c, 4);
            assert.strictEqual(clone2D.d, 5);
            assert.strictEqual(clone2D.e, 6);
            assert.strictEqual(clone2D.f, 7);

            const mutableClone = new DOMMatrix(original2D);
            assert.strictEqual(mutableClone.is2D, true);
            mutableClone.a = 99;
            assert.strictEqual(mutableClone.a, 99);
            assert.strictEqual(original2D.a, 2); // original unchanged

            const original3D = new DOMMatrixReadOnly([
                1, 2, 3, 4,
                5, 6, 7, 8,
                9, 10, 11, 12,
                13, 14, 15, 16
            ]);
            const clone3D = new DOMMatrixReadOnly(original3D);
            assert.strictEqual(clone3D.is2D, false);
            assert.strictEqual(clone3D.m33, 11);
        });

        test('isIdentity attribute reflects identity status', () => {
            const m = new DOMMatrix();
            assert.strictEqual(m.isIdentity, true);
            assert.strictEqual(new DOMMatrixReadOnly().isIdentity, true);

            m.translateSelf(10, 0);
            assert.strictEqual(m.isIdentity, false);

            m.translateSelf(-10, 0);
            assert.strictEqual(m.isIdentity, true);

            m.m13 = 1;
            assert.strictEqual(m.isIdentity, false);
        });

        test('Getter inheritance on DOMMatrix subclass', () => {
            const m = new DOMMatrix();
            // Verify getters inherited from DOMMatrixReadOnly work
            assert.strictEqual(m.m11, 1);
            assert.strictEqual(m.a, 1);
            assert.strictEqual(m.m22, 1);
            assert.strictEqual(m.d, 1);
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.isIdentity, true);

            m.m11 = 42;
            assert.strictEqual(m.m11, 42);
            assert.strictEqual(m.a, 42);

            m.b = 10;
            assert.strictEqual(m.b, 10);
            assert.strictEqual(m.m12, 10);
        });

        test('In-place 2D affine fast-paths for multiplySelf and preMultiplySelf', () => {
            // M1: translate(10, 20)
            const m1 = new DOMMatrix([1, 0, 0, 1, 10, 20]);
            // M2: scale(2, 3)
            const m2 = new DOMMatrix([2, 0, 0, 3, 0, 0]);

            // Post-multiplication: M1 * M2
            m1.multiplySelf(m2);
            assert.strictEqual(m1.is2D, true);
            assert.strictEqual(m1.a, 2);
            assert.strictEqual(m1.d, 3);
            assert.strictEqual(m1.e, 20); // 10 * 2
            assert.strictEqual(m1.f, 60); // 20 * 3

            // Pre-multiplication: M2 * M1
            const m3 = new DOMMatrix([1, 0, 0, 1, 10, 20]);
            const m4 = new DOMMatrix([2, 0, 0, 3, 0, 0]);
            m3.preMultiplySelf(m4);
            assert.strictEqual(m3.is2D, true);
            assert.strictEqual(m3.a, 2);
            assert.strictEqual(m3.d, 3);
            assert.strictEqual(m3.e, 10); // translation not scaled when pre-multiplied by scale
            assert.strictEqual(m3.f, 20);
        });

        test('In-place 2D affine fast-paths for scaleSelf with origin and scaleNonUniform', () => {
            const m = new DOMMatrix([1, 0, 0, 1, 10, 20]);
            m.scaleSelf(2, 4, 1, 5, 5, 0); // scale with origin (5, 5)
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.a, 2);
            assert.strictEqual(m.d, 4);
            // e = (10 + 5) * 2 - 5 = 25
            // f = (20 + 5) * 4 - 5 = 95
            assert.strictEqual(m.e, 25);
            assert.strictEqual(m.f, 95);

            const m2 = new DOMMatrix().scaleNonUniformSelf(3, 5);
            assert.strictEqual(m2.is2D, true);
            assert.strictEqual(m2.a, 3);
            assert.strictEqual(m2.d, 5);
        });

        test('In-place 2D affine fast-path for invertSelf and non-invertible singularity handling', () => {
            // Invertible 2D matrix
            const m = new DOMMatrix([2, 0, 0, 4, 10, 20]);
            m.invertSelf();
            assert.strictEqual(m.is2D, true);
            assert.strictEqual(m.a, 0.5);
            assert.strictEqual(m.d, 0.25);
            assert.strictEqual(m.e, -5);
            assert.strictEqual(m.f, -5);

            // Singular 2D matrix: det = 1*4 - 2*2 = 0
            const singular2D = new DOMMatrix([1, 2, 2, 4, 5, 6]);
            singular2D.invertSelf();
            assert.strictEqual(singular2D.is2D, false);
            assert.ok(Number.isNaN(singular2D.m11));
            assert.ok(Number.isNaN(singular2D.m12));
            assert.ok(Number.isNaN(singular2D.m21));
            assert.ok(Number.isNaN(singular2D.m22));
            assert.ok(Number.isNaN(singular2D.m41));
            assert.ok(Number.isNaN(singular2D.m42));
            assert.ok(Number.isNaN(singular2D.m44));

            // Matrix containing NaN elements
            const nanMatrix = new DOMMatrix([NaN, 0, 0, 1, 0, 0]);
            const invNaN = nanMatrix.inverse();
            assert.strictEqual(invNaN.is2D, false);
            assert.ok(Number.isNaN(invNaN.m11));
        });

        test('3D Euler angle compound rotations in rotateSelf', () => {
            const m = new DOMMatrix();
            m.rotateSelf(30, 45, 60);
            assert.strictEqual(m.is2D, false);

            // Compute expected by multiplying Rz(60) * Ry(45) * Rx(30)
            const expected = new DOMMatrix()
                .rotateAxisAngleSelf(0, 0, 1, 60)
                .rotateAxisAngleSelf(0, 1, 0, 45)
                .rotateAxisAngleSelf(1, 0, 0, 30);

            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    const key = `m${i}${j}` as 'm11' | 'm12' | 'm13' | 'm14' | 'm21' | 'm22' | 'm23' | 'm24' | 'm31' | 'm32' | 'm33' | 'm34' | 'm41' | 'm42' | 'm43' | 'm44';
                    const val = m[key];
                    const exp = expected[key];
                    assert.ok(Math.abs(val - exp) < 1e-7, `${key} mismatch: ${val} vs ${exp}`);
                }
            }
        });

        test('rotateAxisAngleSelf preserves 2D when rotating around Z axis', () => {
            const m = new DOMMatrix();
            m.rotateAxisAngleSelf(0, 0, 1, 90);
            assert.strictEqual(m.is2D, true);
            assert.ok(Math.abs(m.a) < 1e-7);
            assert.ok(Math.abs(m.b - 1) < 1e-7);

            m.rotateAxisAngleSelf(0, 1, 0, 90);
            assert.strictEqual(m.is2D, false);
        });

        test('DOMMatrixInit alias conflict validation throws TypeError', () => {
            assert.throws(() => new DOMMatrix({ a: 1, m11: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ b: 1, m12: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ c: 1, m21: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ d: 1, m22: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ e: 1, m41: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ f: 1, m42: 2 }), TypeError);
            assert.throws(() => new DOMMatrix({ is2D: true, m13: 1 }), TypeError);
            assert.throws(() => new DOMMatrix({ is2D: true, m33: 2 }), TypeError);

            // Non-conflicting aliases should pass
            const valid = new DOMMatrix({ a: 2, m11: 2, b: 3, m12: 3 });
            assert.strictEqual(valid.a, 2);
            assert.strictEqual(valid.b, 3);
            assert.strictEqual(valid.is2D, true);
        });

        test('2D transformPoint fast path with default and custom coordinates', () => {
            const m = new DOMMatrix([2, 0, 0, 3, 10, 20]);
            // 2D fast path with default z=0, w=1
            const pt2D = m.transformPoint({ x: 5, y: 4 });
            assert.strictEqual(pt2D.x, 20); // 2 * 5 + 10
            assert.strictEqual(pt2D.y, 32); // 3 * 4 + 20
            assert.strictEqual(pt2D.z, 0);
            assert.strictEqual(pt2D.w, 1);

            // 3D point input falls back to general transform
            const pt3D = m.transformPoint({ x: 5, y: 4, z: 2, w: 1 });
            assert.strictEqual(pt3D.x, 20);
            assert.strictEqual(pt3D.y, 32);
            assert.strictEqual(pt3D.z, 2);
            assert.strictEqual(pt3D.w, 1);
        });
    });
});

