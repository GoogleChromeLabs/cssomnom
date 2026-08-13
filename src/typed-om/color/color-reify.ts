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
import { CSSColorValue, registerColorParser } from './CSSColorValue.ts';
import type { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSRGB, CSSColor, COLOR_REIFIERS, parseColorArgs } from './color-spaces.ts';
import { NAMED_COLORS } from '../../data/gen/colors.ts';
import { tokenize } from '../../tokenizer.ts';
import { ParseHooks } from '../../parse-hooks.ts';

const SYSTEM_COLORS = new Set([
  'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext',
  'buttonface', 'buttontext', 'buttonborder', 'field', 'fieldtext',
  'highlight', 'highlighttext', 'mark', 'marktext', 'graytext',
  'currentcolor',
  'activeborder', 'activecaption', 'appworkspace', 'background', 'buttonhighlight', 'buttonshadow',
  'inactiveborder', 'inactivecaption', 'inactivecaptiontext', 'infobackground', 'infotext',
  'menu', 'menutext', 'scrollbar', 'threeddarkshadow', 'threedface', 'threedhighlight',
  'threedlightshadow', 'threedshadow', 'window', 'windowframe', 'windowtext'
]);

export function reifyColor(v: ComponentValue): CSSColorValue | CSSKeywordValue | null {
  const normalizeAlpha = (a: CSSNumericValue | CSSKeywordValue) => {
    if (a instanceof CSSUnitValue && a.unit === 'number') {
      return a.value;
    }
    return a;
  };

  if (v.type === 'hash') {
    const hex = (v as HashToken).value;
    const len = hex.length;
    if (len !== 3 && len !== 4 && len !== 6 && len !== 8) {
      return null;
    }
    let r = 0, g = 0, b = 0, alpha = 1;
    if (len === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (len === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      alpha = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (len === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (len === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      alpha = parseInt(hex.slice(6, 8), 16) / 255;
    }
    return new CSSRGB(new CSSUnitValue(r, 'number'), new CSSUnitValue(g, 'number'), new CSSUnitValue(b, 'number'), alpha);
  }

  if (v.type === 'ident') {
    const name = (v as IdentToken).value.toLowerCase();
    if (name in NAMED_COLORS) {
      const parts = NAMED_COLORS[name];
      const r = parts[0];
      const g = parts[1];
      const b = parts[2];
      const alpha = parts.length > 3 ? parts[3]! : 1;
      return new CSSRGB(new CSSUnitValue(r, 'number'), new CSSUnitValue(g, 'number'), new CSSUnitValue(b, 'number'), alpha);
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
        return reifier(parsed.args, normalizeAlpha(parsed.alpha));
      }
    }
  }
  return null;
}

export function parseColor(css: string): CSSColorValue | CSSKeywordValue {
  const tokens = tokenize(css);
  const componentValues = ParseHooks.parseComponentValues(tokens);

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

// Register parse implementation on CSSColorValue
registerColorParser(parseColor);
