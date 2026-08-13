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

import type { CSSNumericType } from './CSSNumericType.ts';
import type { CSSUnitValue } from './CSSUnitValue.ts';
import type { CSSMathSum } from './math/CSSMathOperations.ts';
import { CSSStyleValue } from '../values/CSSStyleValue.ts';

// Spec: CSS Typed OM Level 1 § 4.1 #numericvalue-objects
export abstract class CSSNumericValue extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSNumericValue) {
      throw new TypeError("CSSNumericValue cannot be directly constructed");
    }
  }
  abstract serialize(): string;
  abstract type(): CSSNumericType;

  to(_unit: string): CSSUnitValue {
    throw new Error("Numeric methods not initialized");
  }

  toSum(..._units: string[]): CSSMathSum {
    throw new Error("Numeric methods not initialized");
  }

  static parse(_css: string): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  add(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  sub(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  mul(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  div(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  min(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  max(..._values: (number | CSSNumericValue)[]): CSSNumericValue {
    throw new Error("Numeric methods not initialized");
  }

  equals(..._values: (number | CSSNumericValue)[]): boolean {
    throw new Error("Numeric methods not initialized");
  }
}
