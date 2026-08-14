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
import { CSSNumericValue } from './CSSNumericValue.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds, type CSSUnit } from '../../data/gen/units.ts';
import { formatNumber } from '../../utils/format.ts';

// Spec: CSS Typed OM Level 1 § 4.2 #unitvalue-objects
export class CSSUnitValue extends CSSNumericValue {
  value: number;
  unit: CSSUnit;

  constructor(value: number, unit: CSSUnit) {
    super();
    const normalizedUnit = typeof unit === 'string' ? unit.toLowerCase() as CSSUnit : unit;
    if (!unitToBase[normalizedUnit]) {
      throw new TypeError(`Invalid unit: ${unit}`);
    }
    this.value = value;
    this.unit = normalizedUnit;
  }

  override toString(): string {
    if (this.value === Infinity) {
      return this.unit === 'number' ? 'infinity' : `calc(infinity * 1${this.unit})`;
    }
    if (this.value === -Infinity) {
      return this.unit === 'number' ? '-infinity' : `calc(-infinity * 1${this.unit})`;
    }
    if (Number.isNaN(this.value)) {
      return this.unit === 'number' ? 'nan' : `calc(nan * 1${this.unit})`;
    }
    if (this.unit === 'number') {
      return formatNumber(this.value);
    }
    if (this.unit === 'percent') {
      return `${formatNumber(this.value)}%`;
    }
    return `${formatNumber(this.value)}${this.unit}`;
  }

  serialize(): string {
    return this.toString();
  }

  override type(): CSSNumericType {
    const t: CSSNumericType = {};
    const base = unitToBase[this.unit];
    if (!base || base === 'number') return t;
    if (base === 'percent') {
      t.percent = 1;
    } else {
      (t as Record<string, unknown>)[base] = 1;
    }
    return t;
  }

  override to(unit: string): CSSUnitValue {
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'to' on 'CSSNumericValue': 1 argument required, but only 0 present.");
    }
    if (!unitToBase[unit]) {
      throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
    }
    if (this.unit === unit) return this;
    const base = unitToBase[this.unit];
    const targetBase = unitToBase[unit];
    if (!base || base !== targetBase || base === 'number' || base === 'percent') {
      throw new TypeError(`Cannot convert ${this.unit} to ${unit}`);
    }

    let canonical: number;
    let targetFactor: number;

    if (base === 'length') {
      if (!unitToPixels[this.unit] || !unitToPixels[unit]) throw new TypeError('Unsupported length conversion');
      canonical = this.value * unitToPixels[this.unit];
      targetFactor = unitToPixels[unit];
    } else if (base === 'angle') {
      canonical = this.value * unitToRadians[this.unit];
      targetFactor = unitToRadians[unit];
    } else if (base === 'time') {
      canonical = this.value * unitToSeconds[this.unit];
      targetFactor = unitToSeconds[unit];
    } else if (base === 'resolution') {
      const toDppx: Record<string, number> = {
        'dppx': 1,
        'x': 1,
        'dpi': 1 / 96,
        'dpcm': 2.54 / 96
      };
      if (!toDppx[this.unit] || !toDppx[unit]) throw new TypeError('Unsupported resolution conversion');
      canonical = this.value * toDppx[this.unit];
      targetFactor = toDppx[unit];
    } else {
      throw new TypeError(`Unsupported conversion for ${base}`);
    }

    return new CSSUnitValue(canonical / targetFactor, unit as CSSUnit);
  }
}
