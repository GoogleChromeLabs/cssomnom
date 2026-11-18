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
import { isAlphaUnity, formatAlpha, createKeywordValue } from '../utils/formatting.ts';
import {
  rectifyColorRGBComp,
  rectifyColorPercent,
  rectifyColorNumber,
  rectifyColorNumberOrPercent,
  rectifyColorAngle
} from './color-rectify.ts';
import { createCSSStyleValue } from '../values/style-value-factory.ts';
import { matchesAngle } from '../utils/type-guards.ts';
import { applyWebIDLInterface } from '../../webidl.ts';

// css-typed-om #cssrgb
export type CSSColorRGBComp = CSSNumericValue | CSSKeywordValue | number | string;
export type CSSColorPercent = CSSNumericValue | CSSKeywordValue | number | string;
export type CSSColorNumber = CSSNumericValue | CSSKeywordValue | number | string;
export type CSSColorAngle = CSSNumericValue | CSSKeywordValue | number | string;

type ColorChannel = CSSNumericValue | CSSKeywordValue;

function assertMinArgs(name: string, actual: number, required: number): void {
  if (actual < required) {
    throw new TypeError(`Failed to construct '${name}': ${required} arguments required, but only ${actual} present.`);
  }
}

function formatSpaceColor(fn: string, c1: ColorChannel, c2: ColorChannel, c3: ColorChannel, alpha: ColorChannel): string {
  return isAlphaUnity(alpha) ? `${fn}(${c1} ${c2} ${c3})` : `${fn}(${c1} ${c2} ${c3} / ${alpha})`;
}

// css-typed-om #cssrgb
export class CSSRGB extends CSSColorValue {
  private _r!: ColorChannel;
  private _g!: ColorChannel;
  private _b!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    r: CSSColorRGBComp,
    g: CSSColorRGBComp,
    b: CSSColorRGBComp,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSRGB', arguments.length, 3);
    super();
    this.r = r;
    this.g = g;
    this.b = b;
    this.alpha = alpha;
  }

  get r(): ColorChannel { return this._r; }
  set r(val: CSSColorRGBComp) { this._r = rectifyColorRGBComp(val); }

  get g(): ColorChannel { return this._g; }
  set g(val: CSSColorRGBComp) { this._g = rectifyColorRGBComp(val); }

  get b(): ColorChannel { return this._b; }
  set b(val: CSSColorRGBComp) { this._b = rectifyColorRGBComp(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string {
    // css-color-4 #css-serialization-of-srgb: legacy comma form with unitless alpha when non-unity
    const r = this.r.toString();
    const g = this.g.toString();
    const b = this.b.toString();
    return isAlphaUnity(this.alpha) ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${formatAlpha(this.alpha)})`;
  }
}

// css-typed-om #csshsl
export class CSSHSL extends CSSColorValue {
  private _h!: ColorChannel;
  private _s!: ColorChannel;
  private _l!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    h: CSSColorAngle,
    s: CSSColorPercent,
    l: CSSColorPercent,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSHSL', arguments.length, 3);
    super();
    this.h = h;
    this.s = s;
    this.l = l;
    this.alpha = alpha;
  }

  get h(): ColorChannel { return this._h; }
  set h(val: CSSColorAngle) { this._h = rectifyColorAngle(val); }

  get s(): ColorChannel { return this._s; }
  set s(val: CSSColorPercent) { this._s = rectifyColorPercent(val); }

  get l(): ColorChannel { return this._l; }
  set l(val: CSSColorPercent) { this._l = rectifyColorPercent(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('hsl', this.h, this.s, this.l, this.alpha); }
}

// css-typed-om #csshwb
export class CSSHWB extends CSSColorValue {
  private _h!: CSSNumericValue;
  private _w!: ColorChannel;
  private _b!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    h: CSSNumericValue,
    w: CSSColorPercent,
    b: CSSColorPercent,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSHWB', arguments.length, 3);
    super();
    this.h = h;
    this.w = w;
    this.b = b;
    this.alpha = alpha;
  }

  get h(): CSSNumericValue { return this._h; }
  set h(val: CSSNumericValue) {
    if (!(val instanceof CSSNumericValue) || typeof val === 'number') {
      throw new TypeError('CSSHWB.h must be a CSSNumericValue');
    }
    if (!matchesAngle(val.type())) {
      throw new DOMException('CSSHWB.h must have angle type', 'SyntaxError');
    }
    this._h = val;
  }

  get w(): ColorChannel { return this._w; }
  set w(val: CSSColorPercent) { this._w = rectifyColorPercent(val); }

  get b(): ColorChannel { return this._b; }
  set b(val: CSSColorPercent) { this._b = rectifyColorPercent(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('hwb', this.h, this.w, this.b, this.alpha); }
}

// css-typed-om #csslab
export class CSSLab extends CSSColorValue {
  private _l!: ColorChannel;
  private _a!: ColorChannel;
  private _b!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    l: CSSColorPercent,
    a: CSSColorNumber,
    b: CSSColorNumber,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSLab', arguments.length, 3);
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): ColorChannel { return this._l; }
  set l(val: CSSColorPercent) { this._l = rectifyColorPercent(val); }

  get a(): ColorChannel { return this._a; }
  set a(val: CSSColorNumber) { this._a = rectifyColorNumber(val); }

  get b(): ColorChannel { return this._b; }
  set b(val: CSSColorNumber) { this._b = rectifyColorNumber(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('lab', this.l, this.a, this.b, this.alpha); }
}

// css-typed-om #csslch
export class CSSLCH extends CSSColorValue {
  private _l!: ColorChannel;
  private _c!: ColorChannel;
  private _h!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    l: CSSColorPercent,
    c: CSSColorPercent,
    h: CSSColorAngle,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSLCH', arguments.length, 3);
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): ColorChannel { return this._l; }
  set l(val: CSSColorPercent) { this._l = rectifyColorPercent(val); }

  get c(): ColorChannel { return this._c; }
  set c(val: CSSColorPercent) { this._c = rectifyColorPercent(val); }

  get h(): ColorChannel { return this._h; }
  set h(val: CSSColorAngle) { this._h = rectifyColorAngle(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('lch', this.l, this.c, this.h, this.alpha); }
}

// css-typed-om #cssoklab
export class CSSOKLab extends CSSColorValue {
  private _l!: ColorChannel;
  private _a!: ColorChannel;
  private _b!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    l: CSSColorPercent,
    a: CSSColorNumber,
    b: CSSColorNumber,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSOKLab', arguments.length, 3);
    super();
    this.l = l;
    this.a = a;
    this.b = b;
    this.alpha = alpha;
  }

  get l(): ColorChannel { return this._l; }
  set l(val: CSSColorPercent) { this._l = rectifyColorPercent(val); }

  get a(): ColorChannel { return this._a; }
  set a(val: CSSColorNumber) { this._a = rectifyColorNumber(val); }

  get b(): ColorChannel { return this._b; }
  set b(val: CSSColorNumber) { this._b = rectifyColorNumber(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('oklab', this.l, this.a, this.b, this.alpha); }
}

// css-typed-om #cssoklch
export class CSSOKLCH extends CSSColorValue {
  private _l!: ColorChannel;
  private _c!: ColorChannel;
  private _h!: ColorChannel;
  private _alpha!: ColorChannel;

  constructor(
    l: CSSColorPercent,
    c: CSSColorPercent,
    h: CSSColorAngle,
    alpha: CSSColorPercent = new CSSUnitValue(100, 'percent')
  ) {
    assertMinArgs('CSSOKLCH', arguments.length, 3);
    super();
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  get l(): ColorChannel { return this._l; }
  set l(val: CSSColorPercent) { this._l = rectifyColorPercent(val); }

  get c(): ColorChannel { return this._c; }
  set c(val: CSSColorPercent) { this._c = rectifyColorPercent(val); }

  get h(): ColorChannel { return this._h; }
  set h(val: CSSColorAngle) { this._h = rectifyColorAngle(val); }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorPercent) { this._alpha = rectifyColorPercent(val); }

  override toString(): string { return formatSpaceColor('oklch', this.l, this.c, this.h, this.alpha); }
}

// css-typed-om #csscolor
export class CSSColor extends CSSColorValue {
  private _colorSpace!: CSSKeywordValue;
  private _channels!: ColorChannel[];
  private _alpha!: ColorChannel;

  constructor(
    colorSpace: CSSKeywordValue | string,
    channels: (ColorChannel | number | string)[],
    alpha: CSSColorNumber = new CSSUnitValue(1, 'number')
  ) {
    assertMinArgs('CSSColor', arguments.length, 2);
    if (typeof colorSpace !== 'string' && !(colorSpace instanceof CSSKeywordValue)) {
      throw new TypeError('CSSColor colorSpace must be a string or CSSKeywordValue');
    }
    if (!Array.isArray(channels)) {
      throw new TypeError('CSSColor channels must be an array');
    }
    super();
    this.colorSpace = colorSpace;
    this.channels = channels;
    this.alpha = alpha;
  }

  get colorSpace(): CSSKeywordValue { return this._colorSpace; }
  set colorSpace(val: CSSKeywordValue | string) {
    if (typeof val !== 'string' && !(val instanceof CSSKeywordValue)) {
      throw new TypeError('CSSColor colorSpace must be a string or CSSKeywordValue');
    }
    this._colorSpace = typeof val === 'string' ? createKeywordValue(val) : val;
  }

  get channels(): ColorChannel[] { return this._channels; }
  set channels(val: (ColorChannel | number | string)[]) {
    if (!Array.isArray(val)) {
      throw new TypeError('channels must be an array');
    }
    this._channels = val.map(c => rectifyColorNumberOrPercent(c));
  }

  get alpha(): ColorChannel { return this._alpha; }
  set alpha(val: CSSColorNumber) { this._alpha = rectifyColorNumberOrPercent(val); }

  override toString(): string {
    const channelsStr = this.channels.map(c => c.toString()).join(' ');
    return isAlphaUnity(this.alpha)
      ? `color(${this.colorSpace.value} ${channelsStr})`
      : `color(${this.colorSpace.value} ${channelsStr} / ${this.alpha})`;
  }
}

for (const cls of [CSSRGB, CSSHSL, CSSHWB, CSSLab, CSSLCH, CSSOKLab, CSSOKLCH, CSSColor]) {
  applyWebIDLInterface(cls, { prototypeOnly: true });
}

type ColorReifier = (args: ColorChannel[], alpha: ColorChannel) => CSSColorValue | null;

function scaleUnit(v: ColorChannel, from: 'number' | 'percent', to: 'percent' | 'number' | 'deg', factor = 1): ColorChannel {
  return v instanceof CSSUnitValue && v.unit === from ? new CSSUnitValue(v.value * factor, to) : v;
}

const toPercentAlpha = (a: ColorChannel) => scaleUnit(a, 'number', 'percent', 100);
const toDegAngle = (h: ColorChannel) => scaleUnit(h, 'number', 'deg');

const reifyRgb: ColorReifier = (args, alpha) => new CSSRGB(args[0], args[1], args[2], toPercentAlpha(alpha));
const reifyHsl: ColorReifier = (args, alpha) => new CSSHSL(toDegAngle(args[0]), args[1], args[2], toPercentAlpha(alpha));

export const COLOR_REIFIERS: Record<string, ColorReifier> = {
  rgb: reifyRgb,
  rgba: reifyRgb,
  hsl: reifyHsl,
  hsla: reifyHsl,
  hwb: (args, alpha) => new CSSHWB(toDegAngle(args[0]) as CSSNumericValue, args[1], args[2], toPercentAlpha(alpha)),
  lab: (args, alpha) => new CSSLab(
    scaleUnit(args[0], 'number', 'percent'),
    scaleUnit(args[1], 'percent', 'number', 1.25),
    scaleUnit(args[2], 'percent', 'number', 1.25),
    toPercentAlpha(alpha),
  ),
  lch: (args, alpha) => new CSSLCH(
    scaleUnit(args[0], 'number', 'percent'),
    scaleUnit(args[1], 'number', 'percent', 1 / 1.5),
    toDegAngle(args[2]),
    toPercentAlpha(alpha),
  ),
  oklab: (args, alpha) => new CSSOKLab(
    scaleUnit(args[0], 'number', 'percent', 100),
    scaleUnit(args[1], 'percent', 'number', 0.004),
    scaleUnit(args[2], 'percent', 'number', 0.004),
    toPercentAlpha(alpha),
  ),
  oklch: (args, alpha) => new CSSOKLCH(
    scaleUnit(args[0], 'number', 'percent', 100),
    scaleUnit(args[1], 'number', 'percent', 1 / 0.004),
    toDegAngle(args[2]),
    toPercentAlpha(alpha),
  ),
};

function reifyColorToken(token: ComponentValue): ColorChannel | null {
  if (token.type === 'comma') return null;
  const val = createCSSStyleValue(token);
  if (val === null) return null;
  if (val instanceof CSSUnitValue || val instanceof CSSKeywordValue ||
      val.constructor.name === 'CSSUnitValue' || val.constructor.name === 'CSSKeywordValue') {
    return val as ColorChannel;
  }
  return null;
}

export function parseColorArgs(
  nameLower: string,
  fnValue: ComponentValue[]
): { args: ColorChannel[]; alpha: ColorChannel } | null {
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
  if (hasCommas && slashIndex !== -1) return null;

  const extractedArgs: ColorChannel[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (hasCommas && i % 2 === 1) {
      if (token.type !== 'comma') return null;
      continue;
    }
    const val = reifyColorToken(token);
    if (!val) return null;
    extractedArgs.push(val);
  }

  if (nameLower === 'color') {
    if (extractedArgs.length < 2) return null;
    const alpha = slashIndex !== -1 ? extractedArgs[extractedArgs.length - 1] : new CSSUnitValue(1, 'number');
    const channels = slashIndex !== -1 ? extractedArgs.slice(1, -1) : extractedArgs.slice(1);
    return { args: [extractedArgs[0], ...channels], alpha };
  }

  if (slashIndex !== -1) {
    return slashIndex === extractedArgs.length - 1 && extractedArgs.length === 4
      ? { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] }
      : null;
  }
  if (hasCommas && extractedArgs.length === 4) {
    return { args: extractedArgs.slice(0, 3), alpha: extractedArgs[3] };
  }
  if (extractedArgs.length === 3) {
    return { args: extractedArgs, alpha: new CSSUnitValue(1, 'number') };
  }
  return null;
}
