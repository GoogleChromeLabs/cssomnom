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

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CSSNumericValue,
  CSSUnitValue,
  CSSMathSum,
  CSSMathProduct,
  CSSMathMin,
  CSSMathMax,
  CSSMathClamp,
  CSSMathNegate,
} from '../src/typed-om.ts';
import { simplify } from '../src/math-parser.ts';

describe('Phase 117: CSS Math Tree Simplification & Canonical Typed OM AST Parsing', () => {
  describe('CSSNumericValue.parse() single value & homogeneous sum simplification (CSS Values 4 § 10.7)', () => {
    it('parses dimension token into CSSUnitValue', () => {
      const result = CSSNumericValue.parse('10px');
      assert.strictEqual(result instanceof CSSUnitValue, true);
      assert.strictEqual((result as CSSUnitValue).value, 10);
      assert.strictEqual((result as CSSUnitValue).unit, 'px');
    });

    it('parses calc(10px) into CSSMathSum containing 1 CSSUnitValue', () => {
      const result = CSSNumericValue.parse('calc(10px)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual(sum.values[0] instanceof CSSUnitValue, true);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 10);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'px');
    });

    it('simplifies compatible length units in calc(1px + 1in) to 97px', () => {
      const result = CSSNumericValue.parse('calc(1px + 1in)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual(sum.values[0] instanceof CSSUnitValue, true);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 97);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'px');
    });

    it('simplifies homogeneous time units in calc(1s + 2s) to 3s', () => {
      const result = CSSNumericValue.parse('calc(1s + 2s)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual(sum.values[0] instanceof CSSUnitValue, true);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 3);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 's');
    });

    it('simplifies homogeneous angle units in calc(90deg + 180deg) to 270deg', () => {
      const result = CSSNumericValue.parse('calc(90deg + 180deg)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 270);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'deg');
    });

    it('simplifies subtraction with homogeneous units calc(20px - 5px) to 15px', () => {
      const result = CSSNumericValue.parse('calc(20px - 5px)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 15);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'px');
    });

    it('preserves heterogeneous terms in calc(10px + 5em)', () => {
      const result = CSSNumericValue.parse('calc(10px + 5em)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 2);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 10);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'px');
      assert.strictEqual((sum.values[1] as CSSUnitValue).value, 5);
      assert.strictEqual((sum.values[1] as CSSUnitValue).unit, 'em');
    });

    it('preserves negation node in calc(9em - 8px + 1vh)', () => {
      const result = CSSNumericValue.parse('calc(9em - 8px + 1vh)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 3);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 9);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'em');
      assert.strictEqual(sum.values[1] instanceof CSSMathNegate, true);
      assert.strictEqual(((sum.values[1] as CSSMathNegate).value as CSSUnitValue).value, 8);
      assert.strictEqual(((sum.values[1] as CSSMathNegate).value as CSSUnitValue).unit, 'px');
      assert.strictEqual((sum.values[2] as CSSUnitValue).value, 1);
      assert.strictEqual((sum.values[2] as CSSUnitValue).unit, 'vh');
    });
  });

  describe('Multiplication and division canonicalization', () => {
    it('simplifies multiplication calc(100% * 2)', () => {
      const result = CSSNumericValue.parse('calc(100% * 2)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 200);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'percent');
    });

    it('simplifies division calc(20px / 2)', () => {
      const result = CSSNumericValue.parse('calc(20px / 2)');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 1);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 10);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'px');
    });

    it('supports division of same unit yielding unitless number via .div()', () => {
      const a = new CSSUnitValue(20, 'px');
      const b = new CSSUnitValue(10, 'px');
      const divRes = a.div(b);
      assert.strictEqual(divRes instanceof CSSUnitValue, true);
      assert.strictEqual((divRes as CSSUnitValue).value, 2);
      assert.strictEqual((divRes as CSSUnitValue).unit, 'number');
    });

    it('throws RangeError on division by zero', () => {
      const a = new CSSUnitValue(20, 'px');
      const zero = new CSSUnitValue(0, 'number');
      assert.throws(() => {
        a.div(zero);
      }, RangeError);
    });
  });

  describe('Min, Max, Clamp AST preservation and simplification', () => {
    it('parses min(10px, 20px, 5px) into CSSMathMin with all arguments', () => {
      const result = CSSNumericValue.parse('min(10px, 20px, 5px)');
      assert.strictEqual(result instanceof CSSMathMin, true);
      const minNode = result as CSSMathMin;
      assert.strictEqual(minNode.values.length, 3);

      const simplified = simplify(result);
      assert.strictEqual(simplified instanceof CSSUnitValue, true);
      assert.strictEqual((simplified as CSSUnitValue).value, 5);
      assert.strictEqual((simplified as CSSUnitValue).unit, 'px');
    });

    it('parses max(10px, 20px, 5px) and simplifies to maximum', () => {
      const result = CSSNumericValue.parse('max(10px, 20px, 5px)');
      assert.strictEqual(result instanceof CSSMathMax, true);
      const simplified = simplify(result);
      assert.strictEqual(simplified instanceof CSSUnitValue, true);
      assert.strictEqual((simplified as CSSUnitValue).value, 20);
      assert.strictEqual((simplified as CSSUnitValue).unit, 'px');
    });

    it('parses clamp(10px, 25px, 20px) and simplifies correctly', () => {
      const result = CSSNumericValue.parse('clamp(10px, 25px, 20px)');
      assert.strictEqual(result instanceof CSSMathClamp, true);
      const simplified = simplify(result);
      assert.strictEqual(simplified instanceof CSSUnitValue, true);
      assert.strictEqual((simplified as CSSUnitValue).value, 20);
      assert.strictEqual((simplified as CSSUnitValue).unit, 'px');
    });
  });

  describe('Complex AST expressions and error handling', () => {
    it('parses calc(9em - 8px + 1vh + (2 * min(10px, 20%))) into flattened CSSMathSum', () => {
      const result = CSSNumericValue.parse('calc(9em - 8px + 1vh + (2 * min(10px, 20%)))');
      assert.strictEqual(result instanceof CSSMathSum, true);
      const sum = result as CSSMathSum;
      assert.strictEqual(sum.values.length, 4);
      assert.strictEqual((sum.values[0] as CSSUnitValue).value, 9);
      assert.strictEqual((sum.values[0] as CSSUnitValue).unit, 'em');
      assert.strictEqual(sum.values[1] instanceof CSSMathNegate, true);
      assert.strictEqual((sum.values[2] as CSSUnitValue).value, 1);
      assert.strictEqual((sum.values[2] as CSSUnitValue).unit, 'vh');
      assert.strictEqual(sum.values[3] instanceof CSSMathProduct, true);
      const prod = sum.values[3] as CSSMathProduct;
      assert.strictEqual(prod.values.length, 2);
      assert.strictEqual((prod.values[0] as CSSUnitValue).value, 2);
      assert.strictEqual((prod.values[0] as CSSUnitValue).unit, 'number');
      assert.strictEqual(prod.values[1] instanceof CSSMathMin, true);
    });

    it('throws SyntaxError for unsupported functions like sign()', () => {
      assert.throws(() => {
        CSSNumericValue.parse('calc(1 / sign(10em - 10rem))');
      }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
    });

    it('throws SyntaxError for incompatible units in sum', () => {
      assert.throws(() => {
        CSSNumericValue.parse('calc(10px + 1s)');
      }, (err: unknown) => err instanceof DOMException && err.name === 'SyntaxError');
    });
  });
});
