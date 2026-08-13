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

import type { CSSUnparsedValue } from './CSSUnparsedValue.ts';

// Spec: CSS Typed OM Level 1 § 3.4 #variable-reference-value-objects
export class CSSVariableReferenceValue {
  private _variable!: string;
  private _fallback: CSSUnparsedValue | null = null;

  constructor(variable: string, fallback: CSSUnparsedValue | null = null) {
    this.variable = variable;
    if (fallback !== null && fallback !== undefined) {
      if (!(fallback && typeof fallback === 'object' && 'constructor' in fallback && (fallback.constructor.name === 'CSSUnparsedValue' || (fallback as { [Symbol.iterator]?: unknown })[Symbol.iterator]))) {
        throw new TypeError("Fallback must be a CSSUnparsedValue or null.");
      }
      this._fallback = fallback;
    } else {
      this._fallback = null;
    }
  }

  get variable(): string {
    return this._variable;
  }

  set variable(value: string) {
    if (typeof value !== 'string' || !value.startsWith('--') || value === '--') {
      throw new TypeError("Variable name must start with '--' and not be empty.");
    }
    this._variable = value;
  }

  get fallback(): CSSUnparsedValue | null {
    return this._fallback;
  }

  toString(): string {
    if (this._fallback !== null) {
      return `var(${this._variable},${this._fallback.toString()})`;
    }
    return `var(${this._variable})`;
  }
}
