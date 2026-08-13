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

import type { ComponentValue } from '../../types.ts';
import { CSSColorValue } from './CSSColorValue.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { checkBrand } from '../utils/validation.ts';
import { isAlphaUnity, formatAlpha, createKeywordValue } from '../utils/formatting.ts';
import {
  rectifyColorRGBComp,
  rectifyColorPercent,
  rectifyColorNumber,
  rectifyColorNumberOrPercent,
  rectifyColorAngle
} from './color-rectify.ts';
import { createCSSStyleValue } from '../values/style-value-factory.ts';

// Spec: CSS Typed OM Level 2 § 2.1 #cssrgb
export class CSSRGB extends CSSColorValue {
  private _r!: CSSNumericValue | CSSKeywordValue;
  private _g!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    r: number | string | CSSNumericValue | CSSKeywordValue,
    g: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.r = r;
    this.g = g;
    this.b = b;
    this.alpha = alpha;
  }

  get r(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._r; }
  set r(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._r = rectifyColorRGBComp(val); }

  get g(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._g; }
  set g(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._g = rectifyColorRGBComp(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._b = rectifyColorRGBComp(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSRGB); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSRGB); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    // CSS Color 4 #css-serialization-of-srgb:
    // "For compatibility, the legacy form with comma separators is used; exactly one ASCII space follows each comma."
    // Alpha is omitted if unity, and serialized as a unitless <number> otherwise.
    // Note: HSL and HWB serialize using modern space-separated syntax, but sRGB is legacy for web compat.
    const r = this.r.toString();
    const g = this.g.toString();
    const b = this.b.toString();

    if (isAlphaUnity(this.alpha)) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${formatAlpha(this.alpha)})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.2 #csshsl
export class CSSHSL extends CSSColorValue {
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _s!: CSSNumericValue | CSSKeywordValue;
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue | CSSKeywordValue,
    s: number | string | CSSNumericValue | CSSKeywordValue,
    l: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.h = h;
    this.s = s;
    this.l = l;
    this.alpha = alpha;
  }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._h = rectifyColorAngle(val, true); }

  get s(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._s; }
  set s(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._s = rectifyColorPercent(val); }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._l = rectifyColorPercent(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHSL); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHSL); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `hsl(${this.h} ${this.s} ${this.l})`;
    }
    return `hsl(${this.h} ${this.s} ${this.l} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.3 #csshwb
export class CSSHWB extends CSSColorValue {
  private _h!: CSSNumericValue;
  private _w!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    h: number | string | CSSNumericValue,
    w: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.h = h;
    this.w = w;
    this.b = b;
    this.alpha = alpha;
  }

  get h(): CSSNumericValue { checkBrand(this, CSSHWB); return this._h; }
  set h(val: number | string | CSSNumericValue) {
    checkBrand(this, CSSHWB);
    const rectified = rectifyColorAngle(val);
    if (!(rectified instanceof CSSNumericValue)) {
      throw new TypeError(`CSSHWB.h must be a CSSNumericValue`);
    }
    this._h = rectified;
  }

  get w(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._w; }
  set w(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._w = rectifyColorPercent(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._b = rectifyColorPercent(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSHWB); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSHWB); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `hwb(${this.h} ${this.w} ${this.b})`;
    }
    return `hwb(${this.h} ${this.w} ${this.b} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.4 #csslab
export class CSSLab extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _a!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._l = rectifyColorPercent(val); }

  get a(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._a; }
  set a(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._a = rectifyColorNumber(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._b = rectifyColorNumber(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLab); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLab); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `lab(${this.l} ${this.a} ${this.b})`;
    }
    return `lab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.5 #csslch
export class CSSLCH extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _c!: CSSNumericValue | CSSKeywordValue;
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._l = rectifyColorPercent(val); }

  get c(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._c; }
  set c(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._c = rectifyColorPercent(val); }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._h = rectifyColorAngle(val, true); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSLCH); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSLCH); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `lch(${this.l} ${this.c} ${this.h})`;
    }
    return `lch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.6 #cssoklab
export class CSSOKLab extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _a!: CSSNumericValue | CSSKeywordValue;
  private _b!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    a: number | string | CSSNumericValue | CSSKeywordValue,
    b: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._l = rectifyColorPercent(val); }

  get a(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._a; }
  set a(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._a = rectifyColorNumber(val); }

  get b(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._b; }
  set b(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._b = rectifyColorNumber(val); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLab); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLab); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `oklab(${this.l} ${this.a} ${this.b})`;
    }
    return `oklab(${this.l} ${this.a} ${this.b} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.7 #cssoklch
export class CSSOKLCH extends CSSColorValue {
  private _l!: CSSNumericValue | CSSKeywordValue;
  private _c!: CSSNumericValue | CSSKeywordValue;
  private _h!: CSSNumericValue | CSSKeywordValue;
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    l: number | string | CSSNumericValue | CSSKeywordValue,
    c: number | string | CSSNumericValue | CSSKeywordValue,
    h: number | string | CSSNumericValue | CSSKeywordValue,
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._l; }
  set l(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._l = rectifyColorPercent(val); }

  get c(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._c; }
  set c(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._c = rectifyColorPercent(val); }

  get h(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._h; }
  set h(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._h = rectifyColorAngle(val, true); }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSOKLCH); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) { checkBrand(this, CSSOKLCH); this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    if (isAlphaUnity(this.alpha)) {
      return `oklch(${this.l} ${this.c} ${this.h})`;
    }
    return `oklch(${this.l} ${this.c} ${this.h} / ${this.alpha})`;
  }
}

// Spec: CSS Typed OM Level 2 § 2.8 #csscolor
export class CSSColor extends CSSColorValue {
  private _colorSpace!: CSSKeywordValue;
  private _channels!: (CSSNumericValue | CSSKeywordValue)[];
  private _alpha!: CSSNumericValue | CSSKeywordValue;

  constructor(
    colorSpace: CSSKeywordValue | string,
    channels: (number | string | CSSNumericValue | CSSKeywordValue)[],
    alpha: number | string | CSSNumericValue | CSSKeywordValue = 1
  ) {
    super();
    this.colorSpace = colorSpace;
    this._channels = channels.map(c => rectifyColorNumberOrPercent(c));
    this.alpha = alpha;
  }

  get colorSpace(): CSSKeywordValue { checkBrand(this, CSSColor); return this._colorSpace; }
  set colorSpace(val: CSSKeywordValue | string) {
    checkBrand(this, CSSColor);
    this._colorSpace = typeof val === 'string' ? createKeywordValue(val) : val;
  }

  get channels(): (CSSNumericValue | CSSKeywordValue)[] { checkBrand(this, CSSColor); return this._channels; }
  set channels(val: (number | string | CSSNumericValue | CSSKeywordValue)[]) {
    checkBrand(this, CSSColor);
    if (!Array.isArray(val)) {
      throw new TypeError("channels must be an array");
    }
    this._channels = val.map(c => rectifyColorNumberOrPercent(c));
  }

  get alpha(): CSSNumericValue | CSSKeywordValue { checkBrand(this, CSSColor); return this._alpha; }
  set alpha(val: number | string | CSSNumericValue | CSSKeywordValue) {
    checkBrand(this, CSSColor);
    this._alpha = rectifyColorNumberOrPercent(val);
  }

  override toString(): string {
    let channelsStr = '';
    for (let i = 0; i < this.channels.length; i++) {
      if (i > 0) channelsStr += ' ';
      channelsStr += this.channels[i].toString();
    }
    if (isAlphaUnity(this.alpha)) {
      return `color(${this.colorSpace.value} ${channelsStr})`;
    }
    return `color(${this.colorSpace.value} ${channelsStr} / ${this.alpha})`;
  }
}

type ColorReifier = (args: (CSSNumericValue | CSSKeywordValue)[], alpha: number | CSSNumericValue | CSSKeywordValue) => CSSColorValue | null;

export const COLOR_REIFIERS: Record<string, ColorReifier> = {
  rgb: (args, alpha) => new CSSRGB(args[0], args[1], args[2], alpha),
  rgba: (args, alpha) => new CSSRGB(args[0], args[1], args[2], alpha),
  hsl: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHSL(h, args[1], args[2], alpha);
  },
  hsla: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHSL(h, args[1], args[2], alpha);
  },
  hwb: (args, alpha) => {
    let h = args[0];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSHWB(h as CSSNumericValue, args[1], args[2], alpha);
  },
  lab: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value, 'percent');
    }
    let a = args[1];
    let b = args[2];
    if (a instanceof CSSUnitValue && a.unit === 'percent') {
      a = new CSSUnitValue(a.value * 1.25, 'number');
    }
    if (b instanceof CSSUnitValue && b.unit === 'percent') {
      b = new CSSUnitValue(b.value * 1.25, 'number');
    }
    return new CSSLab(l, a, b, alpha);
  },
  lch: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value, 'percent');
    }
    let c = args[1];
    if (c instanceof CSSUnitValue && c.unit === 'number') {
      c = new CSSUnitValue(c.value / 1.5, 'percent');
    }
    let h = args[2];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSLCH(l, c, h, alpha);
  },
  oklab: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value * 100, 'percent');
    }
    let a = args[1];
    let b = args[2];
    if (a instanceof CSSUnitValue && a.unit === 'percent') {
      a = new CSSUnitValue(a.value * 0.004, 'number');
    }
    if (b instanceof CSSUnitValue && b.unit === 'percent') {
      b = new CSSUnitValue(b.value * 0.004, 'number');
    }
    return new CSSOKLab(l, a, b, alpha);
  },
  oklch: (args, alpha) => {
    let l = args[0];
    if (l instanceof CSSUnitValue && l.unit === 'number') {
      l = new CSSUnitValue(l.value * 100, 'percent');
    }
    let c = args[1];
    if (c instanceof CSSUnitValue && c.unit === 'number') {
      c = new CSSUnitValue(c.value / 0.004, 'percent');
    }
    let h = args[2];
    if (h instanceof CSSUnitValue && h.unit === 'number') {
      h = new CSSUnitValue(h.value, 'deg');
    }
    return new CSSOKLCH(l, c, h, alpha);
  },
};

export function parseColorArgs(
  nameLower: string,
  fnValue: ComponentValue[]
): { args: (CSSNumericValue | CSSKeywordValue)[]; alpha: CSSNumericValue | CSSKeywordValue } | null {
  const tokens: ComponentValue[] = [];
  let slashIndex = -1;

  for (const t of fnValue) {
    if (t.type === 'whitespace' || t.type === 'comment') continue;
    if (t.type === 'delim' && t.value === '/') {
      if (slashIndex !== -1) return null;
      slashIndex = tokens.length;
      continue;
    }
    tokens.push(t);
  }

  if (tokens.length === 0) return null;

  const hasCommas = tokens.some(t => t.type === 'comma');
  const extractedArgs: (CSSNumericValue | CSSKeywordValue)[] = [];

  if (hasCommas) {
    if (slashIndex !== -1) return null;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (i % 2 === 1) {
        if (token.type !== 'comma') return null;
      } else {
        if (token.type === 'comma') return null;
        const val = createCSSStyleValue(token);
        if (val === null || (val.constructor.name !== 'CSSUnitValue' && val.constructor.name !== 'CSSKeywordValue' && !(val instanceof CSSUnitValue) && !(val instanceof CSSKeywordValue))) return null;
        extractedArgs.push(val as CSSNumericValue | CSSKeywordValue);
      }
    }
  } else {
    for (const token of tokens) {
      if (token.type === 'comma') return null;
      const val = createCSSStyleValue(token);
      if (val === null || (val.constructor.name !== 'CSSUnitValue' && val.constructor.name !== 'CSSKeywordValue' && !(val instanceof CSSUnitValue) && !(val instanceof CSSKeywordValue))) return null;
      extractedArgs.push(val as CSSNumericValue | CSSKeywordValue);
    }
  }

  if (nameLower === 'color') {
    if (extractedArgs.length < 2) return null;
    const alpha = slashIndex !== -1 ? extractedArgs[extractedArgs.length - 1] : new CSSUnitValue(1, 'number');
    const channels = slashIndex !== -1 ? extractedArgs.slice(1, -1) : extractedArgs.slice(1);
    return { args: [extractedArgs[0], ...channels], alpha };
  }

  if (slashIndex !== -1) {
    if (slashIndex !== extractedArgs.length - 1) return null;
    if (extractedArgs.length !== 4) return null;
    return { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] };
  } else {
    if (hasCommas && extractedArgs.length === 4) {
      return { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] };
    }
    if (extractedArgs.length === 3) {
      return { args: extractedArgs, alpha: new CSSUnitValue(1, 'number') };
    }
  }
  return null;
}
