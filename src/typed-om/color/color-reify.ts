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

import type { ComponentValue, HashToken, IdentToken, CSSFunction } from '../../types.ts';
import { CSSColorValue } from './CSSColorValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSRGB, CSSColor, COLOR_REIFIERS, parseColorArgs } from './color-spaces.ts';
import { SYSTEM_COLORS, NAMED_COLORS_RGB } from '../../data/gen/color-values.ts';
import { parseHexColor } from '../../cascade/color-resolver.ts';
import { tokenize } from '../../tokenizer.ts';
import { parseComponentValues } from '../../parser.ts';

function createRgbFromTuple(r: number, g: number, b: number, alpha: number): CSSRGB {
  return new CSSRGB(
    new CSSUnitValue(r, 'number'),
    new CSSUnitValue(g, 'number'),
    new CSSUnitValue(b, 'number'),
    new CSSUnitValue(alpha * 100, 'percent')
  );
}

export function reifyColor(v: ComponentValue): CSSColorValue | CSSKeywordValue | null {
  if (v.type === 'hash') {
    const parsed = parseHexColor((v as HashToken).value);
    return parsed ? createRgbFromTuple(parsed[0], parsed[1], parsed[2], parsed[3]) : null;
  }

  if (v.type === 'ident') {
    const name = (v as IdentToken).value.toLowerCase();
    if (name in NAMED_COLORS_RGB) {
      const [r, g, b, a] = NAMED_COLORS_RGB[name];
      return createRgbFromTuple(r, g, b, a ?? 1);
    }
    if (SYSTEM_COLORS.has(name)) {
      return new CSSKeywordValue(name);
    }
  }

  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();

    if (nameLower in COLOR_REIFIERS || nameLower === 'color') {
      const parsed = parseColorArgs(nameLower, fn.value);
      if (!parsed) return null;

      if (nameLower === 'color') {
        const colorSpace = parsed.args[0];
        if (!(colorSpace instanceof CSSKeywordValue)) return null;
        return new CSSColor(colorSpace, parsed.args.slice(1), parsed.alpha);
      }

      const reifier = COLOR_REIFIERS[nameLower];
      if (reifier) {
        return reifier(parsed.args, parsed.alpha);
      }
    }
  }
  return null;
}

export function parseColor(css: string): CSSColorValue | CSSKeywordValue {
  const tokens = tokenize(css);
  const componentValues = parseComponentValues(tokens);

  let singleValue: ComponentValue | null = null;
  for (const v of componentValues) {
    if (v.type === 'whitespace' || v.type === 'comment') {
      continue;
    }
    if (singleValue !== null) {
      throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
    }
    singleValue = v;
  }

  if (!singleValue) {
    throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
  }

  const color = reifyColor(singleValue);
  if (color) return color;

  throw new DOMException(`Invalid color value: ${css}`, 'SyntaxError');
}

CSSColorValue.parse = parseColor;
