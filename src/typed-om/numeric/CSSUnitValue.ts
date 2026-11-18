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

const RESOLUTION_TO_DPPX: Record<string, number> = {
  dppx: 1,
  x: 1,
  dpi: 1 / 96,
  dpcm: 2.54 / 96,
};
const FREQUENCY_TO_HZ: Record<string, number> = {
  hz: 1,
  khz: 1000,
};

// css-values-4 #canonical-unit
export function getCanonicalUnitInfo(unit: string): { base: string; canonicalUnit: CSSUnit; factor: number } | null {
  const base = unitToBase[unit];
  if (base === 'length' && unitToPixels[unit]) return { base, canonicalUnit: 'px', factor: unitToPixels[unit] };
  if (base === 'angle' && unitToRadians[unit]) return { base, canonicalUnit: 'deg', factor: unitToRadians[unit] / unitToRadians['deg'] };
  if (base === 'time' && unitToSeconds[unit]) return { base, canonicalUnit: 's', factor: unitToSeconds[unit] };
  if (base === 'frequency' && FREQUENCY_TO_HZ[unit]) return { base, canonicalUnit: 'hz', factor: FREQUENCY_TO_HZ[unit] };
  if (base === 'resolution' && RESOLUTION_TO_DPPX[unit]) return { base, canonicalUnit: 'dppx', factor: RESOLUTION_TO_DPPX[unit] };
  return null;
}

// css-typed-om #simple-numeric
export class CSSUnitValue extends CSSNumericValue {
  private _value: number;
  private _unit: CSSUnit;

  constructor(value: number, unit: CSSUnit) {
    super();
    const normalizedUnit = typeof unit === 'string' ? unit.toLowerCase() as CSSUnit : unit;
    if (!unitToBase[normalizedUnit]) {
      throw new TypeError(`Invalid unit: ${unit}`);
    }
    this._value = value;
    this._unit = normalizedUnit;
  }

  // Prototype getters/setters used purely for WPT idlharness conformance even though instance fields have better ergonomics.
  // TODO: reconsider this if perf or ergonomics make the test failures worth it.
  get value(): number { return this._value; }
  set value(val: number) { this._value = Number(val); }
  get unit(): CSSUnit { return this._unit; }

  override toString(): string {
    if (this._value === Infinity) {
      return this._unit === 'number' ? 'infinity' : `calc(infinity * 1${this._unit})`;
    }
    if (this._value === -Infinity) {
      return this._unit === 'number' ? '-infinity' : `calc(-infinity * 1${this._unit})`;
    }
    if (Number.isNaN(this._value)) {
      return this._unit === 'number' ? 'nan' : `calc(nan * 1${this._unit})`;
    }
    if (this._unit === 'number') {
      return formatNumber(this._value);
    }
    if (this._unit === 'percent') {
      return `${formatNumber(this._value)}%`;
    }
    return `${formatNumber(this._value)}${this._unit}`;
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
    const fromInfo = getCanonicalUnitInfo(this.unit);
    const toInfo = getCanonicalUnitInfo(unit);
    if (!fromInfo || !toInfo || fromInfo.base !== toInfo.base) {
      throw new TypeError(`Cannot convert ${this.unit} to ${unit}`);
    }
    return new CSSUnitValue((this.value * fromInfo.factor) / toInfo.factor, unit as CSSUnit);
  }
}
