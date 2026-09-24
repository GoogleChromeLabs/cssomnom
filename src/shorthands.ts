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
import { serialize } from './serializer.ts';
import type { ComponentValue } from './types.ts';
import { SHORTHANDS_DATA } from './data/gen/shorthands.ts';
import { SUPPORTED_PROPERTIES } from './data/gen/property-list.ts';
import { LOGICAL_MAPPING } from './data/gen/LogicalMapping.ts';

export interface ShorthandDefinition {
  longhands: readonly string[];
  expand: (value: ComponentValue[]) => Record<string, ComponentValue[]> | null;
  contract: (longhands: Record<string, ComponentValue[]>) => string | null;
  logicalLonghands?: readonly string[];
  physicalLonghands?: readonly string[];
  stub?: boolean;
}

const CSS_WIDE_KEYWORDS = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);
const REPEAT_KEYWORDS = new Set(['repeat', 'no-repeat', 'space', 'round', 'repeat-x', 'repeat-y']);
const ATTACHMENT_KEYWORDS = new Set(['scroll', 'fixed', 'local']);
const BOX_KEYWORDS = new Set(['border-box', 'padding-box', 'content-box', 'text', 'border-area']);
const CLIP_ONLY_BOX_KEYWORDS = new Set(['text', 'border-area']);
const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const IMAGE_FUNCTIONS = new Set([
  'url', 'src', 'image', 'image-set',
  'linear-gradient', 'radial-gradient', 'conic-gradient',
  'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient'
]);
const MATH_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp']);
const POSITION_OR_SIZE_KEYWORDS = new Set(['left', 'right', 'top', 'bottom', 'center', 'auto', 'cover', 'contain']);
const BORDER_WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);
const BORDER_STYLE_KEYWORDS = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);

const NAMED_COLORS = new Set([
  'transparent', 'currentcolor',
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
  'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
  'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
  'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime',
  'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slate50', 'slateblue',
  'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise',
  'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
  'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext', 'buttonface', 'buttontext', 'buttonborder',
  'field', 'fieldtext', 'highlight', 'highlighttext', 'mark', 'marktext', 'graytext'
]);

function filterSignificantTokens(values: ComponentValue[]): ComponentValue[] {
  return values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
}

function splitTokensByComma(tokens: ComponentValue[]): ComponentValue[][] {
  const res: ComponentValue[][] = [[]];
  for (const t of tokens) {
    if (t.type === 'comma') res.push([]);
    else res[res.length - 1].push(t);
  }
  return res;
}

function expandUniformLonghands(longhands: readonly string[], val: ComponentValue[]): Record<string, ComponentValue[]> {
  const res: Record<string, ComponentValue[]> = {};
  for (const lh of longhands) res[lh] = val;
  return res;
}

function tryExpandCssWide(
  filtered: ComponentValue[],
  longhands: readonly string[],
  extraKeywords?: Set<string>
): Record<string, ComponentValue[]> | null {
  if (filtered.length === 1 && filtered[0].type === 'ident') {
    const v = filtered[0].value.toLowerCase();
    if (CSS_WIDE_KEYWORDS.has(v) || extraKeywords?.has(v)) {
      return expandUniformLonghands(longhands, [filtered[0]]);
    }
  }
  return null;
}

function checkUniformCssWide(serializedVals: string[], checkVar = false): string | null | undefined {
  if (serializedVals.some(v => CSS_WIDE_KEYWORDS.has(v.toLowerCase()) || (checkVar && v.toLowerCase().startsWith('var(')))) {
    return serializedVals.every(v => v.toLowerCase() === serializedVals[0].toLowerCase()) ? serializedVals[0] : null;
  }
  return undefined;
}

function expandFourSides(data: ComponentValue[]): [ComponentValue[], ComponentValue[], ComponentValue[], ComponentValue[]] {
  const s0 = [data[0]];
  const s1 = data.length > 1 ? [data[1]] : s0;
  const s2 = data.length > 2 ? [data[2]] : s0;
  const s3 = data.length > 3 ? [data[3]] : s1;
  return [s0, s1, s2, s3];
}

function formatFourSides(a: string, b: string, c: string, d: string): string {
  if (a === b && a === c && a === d) return a;
  if (a === c && b === d) return `${a} ${b}`;
  if (b === d) return `${a} ${b} ${c}`;
  return `${a} ${b} ${c} ${d}`;
}

function getFunctionName(token: ComponentValue): string {
  if (token.type === 'function') {
    if ('name' in token && typeof token.name === 'string') return token.name.toLowerCase();
    if ('value' in token && typeof token.value === 'string') return token.value.toLowerCase();
  }
  return '';
}

function isRepeatKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && REPEAT_KEYWORDS.has(token.value.toLowerCase());
}

function isAttachmentKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && ATTACHMENT_KEYWORDS.has(token.value.toLowerCase());
}

function isBoxKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && BOX_KEYWORDS.has(token.value.toLowerCase());
}

function isClipOnlyBoxKeyword(keyword: string): boolean {
  return CLIP_ONLY_BOX_KEYWORDS.has(keyword.toLowerCase());
}

function isColorToken(token: ComponentValue): boolean {
  if (token.type === 'hash') return true;
  if (token.type === 'ident') return NAMED_COLORS.has(token.value.toLowerCase());
  if (token.type === 'function') return COLOR_FUNCTIONS.has(getFunctionName(token));
  return false;
}

function isImageToken(token: ComponentValue): boolean {
  if (token.type === 'ident' && token.value.toLowerCase() === 'none') return true;
  if (token.type === 'url') return true;
  if (token.type === 'function') return IMAGE_FUNCTIONS.has(getFunctionName(token));
  return false;
}

function isPositionOrSizeValue(token: ComponentValue): boolean {
  if (token.type === 'ident') return POSITION_OR_SIZE_KEYWORDS.has(token.value.toLowerCase());
  if (token.type === 'percentage' || token.type === 'dimension') return true;
  if (token.type === 'number' && token.value === 0) return true;
  if (token.type === 'function') return MATH_FUNCTIONS.has(getFunctionName(token));
  return false;
}

function extractSizeTokens(tokens: ComponentValue[], slashIdx: number): { size: ComponentValue[]; consumed: number } | null {
  if (slashIdx + 1 >= tokens.length) return null;
  const first = tokens[slashIdx + 1];
  if (first.type === 'ident' && ['cover', 'contain'].includes(first.value.toLowerCase())) {
    return { size: [first], consumed: 1 };
  }

  const isSizeVal = (t: ComponentValue) =>
    (t.type === 'ident' && t.value.toLowerCase() === 'auto') ||
    t.type === 'percentage' ||
    t.type === 'dimension' ||
    (t.type === 'number' && t.value === 0) ||
    (t.type === 'function' && MATH_FUNCTIONS.has(getFunctionName(t)));

  if (!isSizeVal(first)) return null;
  if (slashIdx + 2 < tokens.length && isSizeVal(tokens[slashIdx + 2])) {
    return { size: [first, tokens[slashIdx + 2]], consumed: 2 };
  }
  return { size: [first], consumed: 1 };
}

function mapBoxKeywords(keywords: string[]): { origin: string; clip: string } | null {
  if (keywords.length === 0) return { origin: 'padding-box', clip: 'border-box' };
  if (keywords.length === 1) {
    const a = keywords[0].toLowerCase();
    return isClipOnlyBoxKeyword(a) ? { origin: 'border-box', clip: a } : { origin: a, clip: a };
  }
  if (keywords.length === 2) {
    const a = keywords[0].toLowerCase();
    const b = keywords[1].toLowerCase();
    const aClip = isClipOnlyBoxKeyword(a);
    const bClip = isClipOnlyBoxKeyword(b);
    if (aClip && bClip) return { origin: 'border-box', clip: `${a} ${b}` };
    if (aClip) return { origin: b, clip: a };
    if (bClip) return { origin: a, clip: b };
    return { origin: a, clip: b };
  }
  if (keywords.length === 3) {
    const clips = keywords.filter(isClipOnlyBoxKeyword);
    const origins = keywords.filter(k => !isClipOnlyBoxKeyword(k));
    return clips.length === 2 && origins.length === 1 ? { origin: origins[0], clip: clips.join(' ') } : null;
  }
  return null;
}

function parseRepeatTokens(tokens: ComponentValue[]): ComponentValue[] | null {
  if (tokens.length === 1) {
    const val = tokens[0].value?.toString().toLowerCase();
    if (val === 'repeat-x') return [{ type: 'ident', value: 'repeat' }, { type: 'ident', value: 'no-repeat' }];
    if (val === 'repeat-y') return [{ type: 'ident', value: 'no-repeat' }, { type: 'ident', value: 'repeat' }];
    return [tokens[0]];
  }
  return tokens.length === 2 ? tokens : null;
}

function normalizePositionTokens(tokens: ComponentValue[]): ComponentValue[] {
  if (tokens.length === 1) {
    const t0 = tokens[0];
    if (t0.type === 'ident') {
      const v = t0.value.toLowerCase();
      if (v === 'left' || v === 'right') return [t0, { type: 'ident', value: 'center' }];
      if (v === 'top' || v === 'bottom') return [{ type: 'ident', value: 'center' }, t0];
      if (v === 'center') return [t0, t0];
    } else {
      return [t0, { type: 'percentage', value: 50, sign: null }];
    }
  }
  if (tokens.length === 2 && tokens[0].type === 'ident' && tokens[1].type === 'ident') {
    const [t0, t1] = tokens;
    const v0 = t0.value.toLowerCase();
    const v1 = t1.value.toLowerCase();
    const isHoriz = (v: string) => v === 'left' || v === 'right';
    const isVert = (v: string) => v === 'top' || v === 'bottom';
    if ((isVert(v0) && isHoriz(v1)) || (isVert(v0) && v1 === 'center')) return [t1, t0];
  }
  return tokens;
}

function normalizeSizeTokens(tokens: ComponentValue[]): ComponentValue[] {
  if (tokens.length === 1) {
    const t0 = tokens[0];
    if (t0.type === 'ident' && ['cover', 'contain'].includes(t0.value.toLowerCase())) return [t0];
    return [t0, { type: 'ident', value: 'auto' }];
  }
  return tokens;
}

function joinWithWhitespace(tokens: ComponentValue[]): ComponentValue[] {
  const res: ComponentValue[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) res.push({ type: 'whitespace', value: ' ' });
    res.push(tokens[i]);
  }
  return res;
}

function expandBackground(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  const cssWide = tryExpandCssWide(filtered, SHORTHANDS_DATA['background']);
  if (cssWide) return cssWide;

  const layers = splitTokensByComma(values);
  const numLayers = layers.length;
  if (numLayers === 0) return null;

  const imageLayers: ComponentValue[][] = [];
  const positionLayers: ComponentValue[][] = [];
  const sizeLayers: ComponentValue[][] = [];
  const repeatLayers: ComponentValue[][] = [];
  const attachmentLayers: ComponentValue[][] = [];
  const originLayers: ComponentValue[][] = [];
  const clipLayers: ComponentValue[][] = [];
  let parsedColor: ComponentValue[] | null = null;

  for (let i = 0; i < numLayers; i++) {
    const layerClean = filterSignificantTokens(layers[i]);
    if (layerClean.length === 0) return null;

    const slashIdx = layerClean.findIndex(t => t.type === 'delim' && t.value === '/');
    let sizeTokens: ComponentValue[] | null = null;
    if (slashIdx !== -1) {
      const sizeResult = extractSizeTokens(layerClean, slashIdx);
      if (!sizeResult) return null;
      sizeTokens = sizeResult.size;
      layerClean.splice(slashIdx, 1 + sizeResult.consumed);
    }

    const repeatTokens: ComponentValue[] = [];
    const attachmentTokens: ComponentValue[] = [];
    const boxKeywords: string[] = [];
    let colorTokens: ComponentValue[] | null = null;
    let imageTokens: ComponentValue[] | null = null;
    const positionTokens: ComponentValue[] = [];

    for (const token of layerClean) {
      if (isRepeatKeyword(token)) {
        repeatTokens.push(token);
      } else if (isAttachmentKeyword(token)) {
        attachmentTokens.push(token);
      } else if (isBoxKeyword(token)) {
        boxKeywords.push(token.value as string);
      } else if (isColorToken(token)) {
        if (i !== numLayers - 1 || colorTokens !== null) return null;
        colorTokens = [token];
      } else if (isImageToken(token)) {
        if (imageTokens !== null) return null;
        imageTokens = [token];
      } else if (isPositionOrSizeValue(token)) {
        positionTokens.push(token);
      } else {
        return null;
      }
    }

    if ((sizeTokens !== null && positionTokens.length === 0) || positionTokens.length > 4) return null;

    const boxMapped = mapBoxKeywords(boxKeywords);
    if (!boxMapped) return null;

    const repeatMapped = parseRepeatTokens(repeatTokens);
    imageLayers.push(imageTokens || [{ type: 'ident', value: 'none' }]);
    positionLayers.push(
      positionTokens.length > 0
        ? joinWithWhitespace(normalizePositionTokens(positionTokens))
        : joinWithWhitespace([{ type: 'percentage', value: 0, sign: null }, { type: 'percentage', value: 0, sign: null }])
    );
    sizeLayers.push(sizeTokens !== null ? joinWithWhitespace(normalizeSizeTokens(sizeTokens)) : [{ type: 'ident', value: 'auto' }]);
    repeatLayers.push(repeatMapped ? joinWithWhitespace(repeatMapped) : [{ type: 'ident', value: 'repeat' }]);
    attachmentLayers.push(attachmentTokens.length > 0 ? joinWithWhitespace(attachmentTokens) : [{ type: 'ident', value: 'scroll' }]);
    originLayers.push([{ type: 'ident', value: boxMapped.origin }]);
    clipLayers.push(joinWithWhitespace(boxMapped.clip.split(' ').map(c => ({ type: 'ident', value: c }))));

    if (colorTokens !== null) parsedColor = colorTokens;
  }

  const joinLayers = (layerList: ComponentValue[][]): ComponentValue[] => {
    const res: ComponentValue[] = [];
    for (let i = 0; i < layerList.length; i++) {
      if (i > 0) res.push({ type: 'comma', value: ',' }, { type: 'whitespace', value: ' ' });
      res.push(...layerList[i]);
    }
    return res;
  };

  return {
    'background-image': joinLayers(imageLayers),
    'background-position': joinLayers(positionLayers),
    'background-size': joinLayers(sizeLayers),
    'background-repeat': joinLayers(repeatLayers),
    'background-attachment': joinLayers(attachmentLayers),
    'background-origin': joinLayers(originLayers),
    'background-clip': joinLayers(clipLayers),
    'background-color': parsedColor || [{ type: 'ident', value: 'transparent' }]
  };
}

function contractBackground(longhands: Record<string, ComponentValue[]>): string | null {
  const image = longhands['background-image'];
  const position = longhands['background-position'];
  const size = longhands['background-size'];
  const repeat = longhands['background-repeat'];
  const attachment = longhands['background-attachment'];
  const origin = longhands['background-origin'];
  const clip = longhands['background-clip'];
  const color = longhands['background-color'];

  if (!image || !position || !size || !repeat || !attachment || !origin || !clip || !color) {
    return null;
  }

  const imageLayers = splitTokensByComma(image);
  const positionLayers = splitTokensByComma(position);
  const sizeLayers = splitTokensByComma(size);
  const repeatLayers = splitTokensByComma(repeat);
  const attachmentLayers = splitTokensByComma(attachment);
  const originLayers = splitTokensByComma(origin);
  const clipLayers = splitTokensByComma(clip);

  const numLayers = imageLayers.length;
  if (
    positionLayers.length !== numLayers ||
    sizeLayers.length !== numLayers ||
    repeatLayers.length !== numLayers ||
    attachmentLayers.length !== numLayers ||
    originLayers.length !== numLayers ||
    clipLayers.length !== numLayers
  ) {
    return null;
  }

  const layerStrings: string[] = [];

  for (let i = 0; i < numLayers; i++) {
    const imgVal = serialize(imageLayers[i]).trim();
    const posVal = serialize(positionLayers[i]).trim();
    const sizeVal = serialize(sizeLayers[i]).trim();
    const repVal = serialize(repeatLayers[i]).trim();
    const attVal = serialize(attachmentLayers[i]).trim();
    const origVal = serialize(originLayers[i]).trim();
    const clipVal = serialize(clipLayers[i]).trim();

    const parts: string[] = [];
    if (imgVal !== 'none' && imgVal !== '') parts.push(imgVal);

    const isInitialPosition = posVal !== '' && ['0% 0%', 'left top', '0% center', 'center left', 'left center'].includes(posVal.toLowerCase());
    const isInitialSize = sizeVal !== '' && ['auto', 'auto auto'].includes(sizeVal.toLowerCase());

    if (posVal !== '' && sizeVal !== '') {
      if (!isInitialSize) parts.push(`${posVal} / ${sizeVal}`);
      else if (!isInitialPosition) parts.push(posVal);
    }

    const isInitialRepeat = repVal !== '' && ['repeat', 'repeat repeat'].includes(repVal.toLowerCase());
    if (repVal !== '' && !isInitialRepeat) {
      const tokens = repeatLayers[i].filter(t => t.type !== 'whitespace' && t.type !== 'EOF');
      if (tokens.length === 2) {
        const v0 = tokens[0].value?.toString().toLowerCase();
        const v1 = tokens[1].value?.toString().toLowerCase();
        if (v0 === 'repeat' && v1 === 'no-repeat') parts.push('repeat-x');
        else if (v0 === 'no-repeat' && v1 === 'repeat') parts.push('repeat-y');
        else if (v0 === v1 && v0) parts.push(v0);
        else parts.push(`${v0} ${v1}`);
      } else {
        parts.push(repVal);
      }
    }

    if (attVal !== '' && attVal.toLowerCase() !== 'scroll') parts.push(attVal);

    if (origVal !== '' && clipVal !== '') {
      const isClipOnly = ['text', 'border-area'].includes(clipVal.toLowerCase()) || clipVal.toLowerCase().includes('text') || clipVal.toLowerCase().includes('border-area');
      const defaultOrigin = isClipOnly ? 'border-box' : 'padding-box';

      if (origVal.toLowerCase() !== 'padding-box' || clipVal.toLowerCase() !== 'border-box') {
        if (isClipOnly) {
          parts.push(origVal.toLowerCase() === defaultOrigin ? clipVal : `${origVal} ${clipVal}`);
        } else {
          parts.push(origVal.toLowerCase() === clipVal.toLowerCase() ? origVal : `${origVal} ${clipVal}`);
        }
      }
    }

    if (i === numLayers - 1) {
      const colVal = serialize(color).trim();
      if (colVal !== '' && colVal.toLowerCase() !== 'transparent') parts.push(colVal);
    }

    if (parts.length === 0) parts.push('none');
    layerStrings.push(parts.join(' '));
  }

  return layerStrings.join(', ');
}

const LENGTH_UNITS = new Set([
  'px', 'em', 'rem', '%', 'vh', 'vw', 'ch', 'pt', 'cm', 'mm', 'in', 'pc', 'ex', 'cap', 'ic', 'lh',
  'cqw', 'cqh', 'vmin', 'vmax', 'vi', 'vb', 'q', 'rlh', 'dvh', 'svh', 'lvh', 'dvw', 'svw', 'lvw',
  'cqi', 'cqb', 'cqmin', 'cqmax'
]);

function isValidLengthOrPercentage(val: ComponentValue, allowNegative: boolean = true): boolean {
  if (val.type === 'ident') {
    const kw = (val.value ?? '').toString().toLowerCase();
    return kw === 'auto' || CSS_WIDE_KEYWORDS.has(kw);
  }
  if (val.type === 'dimension') {
    if (!allowNegative && typeof val.value === 'number' && val.value < 0) return false;
    return LENGTH_UNITS.has((val.unit ?? '').toLowerCase());
  }
  if (val.type === 'percentage') {
    return allowNegative || typeof val.value !== 'number' || val.value >= 0;
  }
  if (val.type === 'number' && val.value === 0) return true;
  if (val.type === 'function') {
    const fnName = getFunctionName(val);
    return MATH_FUNCTIONS.has(fnName) || fnName === 'env';
  }
  return false;
}

const expandBox = (physical: readonly string[], logical: readonly string[]) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;

  const isLogical = filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'logical';
  const data = isLogical ? filtered.slice(1) : filtered;
  if (data.length < 1 || data.length > 4) return null;

  const isLengthBox = physical[0].startsWith('margin') || physical[0].startsWith('padding') || physical[0] === 'top' || physical[0].startsWith('scroll-') || (physical[0].startsWith('border-') && physical[0].endsWith('-width'));
  const allowNegative = !physical[0].startsWith('padding') && !physical[0].startsWith('scroll-padding') && !(physical[0].startsWith('border-') && physical[0].endsWith('-width'));
  if (isLengthBox && !data.every(v => isValidLengthOrPercentage(v, allowNegative))) {
    return null;
  }

  const target = isLogical ? logical : physical;
  const [s0, s1, s2, s3] = expandFourSides(data);
  return {
    [target[0]]: s0,
    [target[1]]: s1,
    [target[2]]: s2,
    [target[3]]: s3,
  };
};

const contractBox = (physical: readonly string[], logical: readonly string[]) => (values: Record<string, ComponentValue[]>): string | null => {
  const t = values[physical[0]];
  const r = values[physical[1]];
  const b = values[physical[2]];
  const l = values[physical[3]];

  if (t && r && b && l) {
    const serialized = [t, r, b, l].map(v => serialize(v).trim());
    const cssWide = checkUniformCssWide(serialized);
    if (cssWide !== undefined) return cssWide;
    return formatFourSides(serialized[0], serialized[1], serialized[2], serialized[3]);
  }

  const lbs = values[logical[0]];
  const lbe = values[logical[2]];
  const lis = values[logical[1]];
  const lie = values[logical[3]];

  if (lbs && lbe && lis && lie) {
    const [sbs, sis, sbe, sie] = [lbs, lis, lbe, lie].map(v => serialize(v).trim());
    const cssWide = checkUniformCssWide([sbs, sis, sbe, sie]);
    if (cssWide !== undefined) return cssWide;
    return `logical ${formatFourSides(sbs, sis, sbe, sie)}`;
  }

  return null;
};

const expandTwoValue = (longhands: readonly string[]) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = filterSignificantTokens(values);
  if (filtered.length < 1 || filtered.length > 2) return null;
  const isNonNeg = longhands[0].startsWith('padding') || longhands[0].endsWith('-width');
  if (isNonNeg) {
    for (const v of filtered) {
      if ((v.type === 'dimension' || v.type === 'percentage' || v.type === 'number') && typeof v.value === 'number' && v.value < 0) {
        return null;
      }
    }
  }
  return {
    [longhands[0]]: [filtered[0]],
    [longhands[1]]: filtered.length > 1 ? [filtered[1]] : [filtered[0]],
  };
};

const contractTwoValue = (longhands: readonly string[]) => (values: Record<string, ComponentValue[]>): string | null => {
  const v1 = values[longhands[0]];
  const v2 = values[longhands[1]];
  if (!v1 || !v2) return null;
  const s1 = serialize(v1).trim();
  const s2 = serialize(v2).trim();
  const cssWide = checkUniformCssWide([s1, s2]);
  if (cssWide !== undefined) return cssWide;
  return s1 === s2 ? s1 : `${s1} ${s2}`;
};

function formatBorderSideValue(widthVal: string, styleVal: string, colorVal: string): string | null {
  const w = widthVal.trim();
  const s = styleVal.trim();
  const c = colorVal.trim();
  const cssWide = checkUniformCssWide([w, s, c]);
  if (cssWide !== undefined) return cssWide;

  const isInitialWidth = w.toLowerCase() === 'medium';
  const isInitialStyle = s.toLowerCase() === 'none';
  const isInitialColor = c.toLowerCase() === 'currentcolor';

  if (isInitialWidth && isInitialStyle && isInitialColor) return 'none';

  const parts: string[] = [];
  if (!isInitialWidth) parts.push(w);
  if (!isInitialStyle) parts.push(s);
  if (!isInitialColor) parts.push(c);
  return parts.length === 0 ? 'none' : parts.join(' ');
}

function parseBorderTriplet(
  filtered: ComponentValue[],
  allowAutoStyle = false
): { widthVal: ComponentValue[]; styleVal: ComponentValue[]; colorVal: ComponentValue[] } {
  let widthVal: ComponentValue[] = [{ type: 'ident', value: 'medium' }];
  let styleVal: ComponentValue[] = [{ type: 'ident', value: 'none' }];
  let colorVal: ComponentValue[] = [{ type: 'ident', value: 'currentcolor' }];

  for (const val of filtered) {
    if (val.type === 'ident') {
      const v = val.value.toLowerCase();
      if (BORDER_WIDTH_KEYWORDS.has(v)) {
        widthVal = [val];
      } else if (BORDER_STYLE_KEYWORDS.has(v) || (allowAutoStyle && v === 'auto')) {
        styleVal = [val];
      } else {
        colorVal = [val];
      }
    } else if (val.type === 'dimension' || val.type === 'percentage' || val.type === 'number') {
      widthVal = [val];
    } else {
      colorVal = [val];
    }
  }

  return { widthVal, styleVal, colorVal };
}

export const BORDER_IMAGE_LONGHANDS = [
  'border-image-source',
  'border-image-slice',
  'border-image-width',
  'border-image-outset',
  'border-image-repeat',
] as const;

export const BORDER_ALL_LONGHANDS = [
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  ...BORDER_IMAGE_LONGHANDS,
] as const;

function createInitialBorderImageValues(source: ComponentValue[] = [{ type: 'ident', value: 'none' }]): Record<string, ComponentValue[]> {
  return {
    'border-image-source': source,
    'border-image-slice': [{ type: 'percentage', value: 100, sign: null }],
    'border-image-width': [{ type: 'number', value: 1, sign: null, numberType: 'integer' }],
    'border-image-outset': [{ type: 'number', value: 0, sign: null, numberType: 'integer' }],
    'border-image-repeat': [{ type: 'ident', value: 'stretch' }],
  };
}

export function isInitialBorderImage(values: Record<string, ComponentValue[]>): boolean {
  const src = values['border-image-source'];
  const slice = values['border-image-slice'];
  const width = values['border-image-width'];
  const outset = values['border-image-outset'];
  const repeat = values['border-image-repeat'];

  if (!src || !slice || !width || !outset || !repeat) return false;

  const sSrc = serialize(src).trim().toLowerCase();
  const sSlice = serialize(slice).trim().toLowerCase();
  const sWidth = serialize(width).trim().toLowerCase();
  const sOutset = serialize(outset).trim().toLowerCase();
  const sRepeat = serialize(repeat).trim().toLowerCase();

  return (
    (sSrc === 'none' || sSrc === '') &&
    (sSlice === '100%' || sSlice === '100% 100% 100% 100%' || sSlice === '') &&
    (sWidth === '1' || sWidth === '1 1 1 1' || sWidth === '') &&
    (sOutset === '0' || sOutset === '0px' || sOutset === '0s' || sOutset === '0 0 0 0' || sOutset === '') &&
    (sRepeat === 'stretch' || sRepeat === 'stretch stretch' || sRepeat === '')
  );
}

const expandBorderSide = (prefix: string) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0 || filtered.length > 3) return null;

  const longhands = [`${prefix}-width`, `${prefix}-style`, `${prefix}-color`];
  const cssWide = tryExpandCssWide(filtered, longhands);
  if (cssWide) return cssWide;

  const { widthVal, styleVal, colorVal } = parseBorderTriplet(filtered);
  return {
    [longhands[0]]: widthVal,
    [longhands[1]]: styleVal,
    [longhands[2]]: colorVal,
  };
};

const contractBorderSide = (prefix: string) => (values: Record<string, ComponentValue[]>): string | null => {
  const w = values[`${prefix}-width`];
  const s = values[`${prefix}-style`];
  const c = values[`${prefix}-color`];
  if (!w || !s || !c) return null;
  return formatBorderSideValue(serialize(w), serialize(s), serialize(c));
};

function expandBorder(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0 || filtered.length > 3) return null;

  const cssWide = tryExpandCssWide(filtered, BORDER_ALL_LONGHANDS);
  if (cssWide) return cssWide;

  const { widthVal, styleVal, colorVal } = parseBorderTriplet(filtered);
  return {
    'border-top-width': widthVal,
    'border-right-width': widthVal,
    'border-bottom-width': widthVal,
    'border-left-width': widthVal,
    'border-top-style': styleVal,
    'border-right-style': styleVal,
    'border-bottom-style': styleVal,
    'border-left-style': styleVal,
    'border-top-color': colorVal,
    'border-right-color': colorVal,
    'border-bottom-color': colorVal,
    'border-left-color': colorVal,
    ...createInitialBorderImageValues(),
  };
}

function contractBorder(values: Record<string, ComponentValue[]>): string | null {
  for (const lh of BORDER_ALL_LONGHANDS) {
    if (!values[lh]) return null;
  }

  const allSerialized = BORDER_ALL_LONGHANDS.map(lh => serialize(values[lh]).trim());
  const cssWide = checkUniformCssWide(allSerialized);
  if (cssWide !== undefined) return cssWide;
  if (!isInitialBorderImage(values)) return null;

  const [w0, w1, w2, w3, s0, s1, s2, s3, c0, c1, c2, c3] = allSerialized;
  if (w0 !== w1 || w0 !== w2 || w0 !== w3) return null;
  if (s0 !== s1 || s0 !== s2 || s0 !== s3) return null;
  if (c0 !== c1 || c0 !== c2 || c0 !== c3) return null;

  return formatBorderSideValue(w0, s0, c0);
}

function expandBorderImage(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;

  const cssWide = tryExpandCssWide(filtered, BORDER_IMAGE_LONGHANDS);
  if (cssWide) return cssWide;

  if (filtered.length === 1 && filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'none') {
    return createInitialBorderImageValues();
  }

  if (filtered.some(t => t.type === 'function' && getFunctionName(t) === 'var')) {
    return expandUniformLonghands(BORDER_IMAGE_LONGHANDS, values);
  }

  let source: ComponentValue[] = [{ type: 'ident', value: 'none' }];
  for (const token of filtered) {
    if (token.type === 'url' || (token.type === 'function' && ['linear-gradient', 'radial-gradient', 'conic-gradient', 'image', 'image-set'].includes(getFunctionName(token)))) {
      source = [token];
    }
  }
  return createInitialBorderImageValues(source);
}

function contractBorderImage(values: Record<string, ComponentValue[]>): string | null {
  for (const lh of BORDER_IMAGE_LONGHANDS) {
    if (!values[lh]) return null;
  }

  const allVals = BORDER_IMAGE_LONGHANDS.map(lh => serialize(values[lh]).trim());
  const cssWide = checkUniformCssWide(allVals, true);
  if (cssWide !== undefined) return cssWide;
  if (isInitialBorderImage(values)) return 'none';

  const [sSrc, sSlice, sWidth, sOutset, sRepeat] = allVals;
  const isSliceInit = sSlice === '100%' || sSlice === '100% 100% 100% 100%';
  const isWidthInit = sWidth === '1' || sWidth === '1 1 1 1';
  const isOutsetInit = sOutset === '0' || sOutset === '0px' || sOutset === '0s' || sOutset === '0 0 0 0';
  const isRepeatInit = sRepeat === 'stretch' || sRepeat === 'stretch stretch';

  return isSliceInit && isWidthInit && isOutsetInit && isRepeatInit ? sSrc : null;
}

function expandOutline(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0 || filtered.length > 3) return null;

  const longhands = ['outline-color', 'outline-style', 'outline-width'];
  const cssWide = tryExpandCssWide(filtered, longhands);
  if (cssWide) return cssWide;

  const { widthVal, styleVal, colorVal } = parseBorderTriplet(filtered, true);
  return {
    'outline-color': colorVal,
    'outline-style': styleVal,
    'outline-width': widthVal,
  };
}

function contractOutline(values: Record<string, ComponentValue[]>): string | null {
  const c = values['outline-color'];
  const s = values['outline-style'];
  const w = values['outline-width'];
  if (!c || !s || !w) return null;

  const sc = serialize(c).trim();
  const ss = serialize(s).trim();
  const sw = serialize(w).trim();

  const cssWide = checkUniformCssWide([sc, ss, sw]);
  if (cssWide !== undefined) return cssWide;

  const isInitialColor = sc.toLowerCase() === 'currentcolor';
  const isInitialStyle = ss.toLowerCase() === 'none';
  const isInitialWidth = sw.toLowerCase() === 'medium';

  if (isInitialColor && isInitialStyle && isInitialWidth) return 'none';

  const parts: string[] = [];
  if (!isInitialColor) parts.push(sc);
  if (!isInitialStyle) parts.push(ss);
  if (!isInitialWidth) parts.push(sw);
  return parts.length === 0 ? 'none' : parts.join(' ');
}

export const FONT_VARIANT_LONGHANDS = [
  'font-variant-ligatures',
  'font-variant-caps',
  'font-variant-alternates',
  'font-variant-numeric',
  'font-variant-east-asian',
  'font-variant-position',
  'font-variant-emoji',
] as const;

const FONT_VARIANT_LIGATURES_KEYWORDS = new Set([
  'common-ligatures', 'no-common-ligatures',
  'discretionary-ligatures', 'no-discretionary-ligatures',
  'historical-ligatures', 'no-historical-ligatures',
  'contextual', 'no-contextual'
]);
const FONT_VARIANT_CAPS_KEYWORDS = new Set([
  'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps', 'unicase', 'titling-caps'
]);
const FONT_VARIANT_NUMERIC_KEYWORDS = new Set([
  'lining-nums', 'oldstyle-nums', 'proportional-nums', 'tabular-nums',
  'diagonal-fractions', 'stacked-fractions', 'ordinal', 'slashed-zero'
]);
const FONT_VARIANT_EAST_ASIAN_KEYWORDS = new Set([
  'jis78', 'jis83', 'jis90', 'jis04', 'simplified', 'traditional',
  'full-width', 'proportional-width', 'ruby'
]);
const FONT_VARIANT_POSITION_KEYWORDS = new Set(['sub', 'super']);
const FONT_VARIANT_EMOJI_KEYWORDS = new Set(['text', 'emoji', 'unicode']);
const FONT_VARIANT_ALTERNATES_FUNCTIONS = new Set([
  'stylistic', 'styleset', 'character-variant', 'swash', 'ornaments', 'annotation'
]);

function expandFontVariant(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;

  const wide = tryExpandCssWide(filtered, FONT_VARIANT_LONGHANDS);
  if (wide) return wide;

  if (filtered.length === 1 && filtered[0].type === 'ident') {
    const v = filtered[0].value.toLowerCase();
    if (v === 'normal') {
      return expandUniformLonghands(FONT_VARIANT_LONGHANDS, [{ type: 'ident', value: 'normal' }]);
    }
    if (v === 'none') {
      const res = expandUniformLonghands(FONT_VARIANT_LONGHANDS, [{ type: 'ident', value: 'normal' }]);
      res['font-variant-ligatures'] = [{ type: 'ident', value: 'none' }];
      return res;
    }
  }

  const buckets: Record<string, ComponentValue[]> = {
    'font-variant-ligatures': [],
    'font-variant-caps': [],
    'font-variant-alternates': [],
    'font-variant-numeric': [],
    'font-variant-east-asian': [],
    'font-variant-position': [],
    'font-variant-emoji': [],
  };

  for (const token of filtered) {
    if (token.type === 'ident') {
      const val = token.value.toLowerCase();
      if (val === 'normal') continue;
      if (val === 'none' || FONT_VARIANT_LIGATURES_KEYWORDS.has(val)) buckets['font-variant-ligatures'].push(token);
      else if (FONT_VARIANT_CAPS_KEYWORDS.has(val)) buckets['font-variant-caps'].push(token);
      else if (val === 'historical-forms') buckets['font-variant-alternates'].push(token);
      else if (FONT_VARIANT_NUMERIC_KEYWORDS.has(val)) buckets['font-variant-numeric'].push(token);
      else if (FONT_VARIANT_EAST_ASIAN_KEYWORDS.has(val)) buckets['font-variant-east-asian'].push(token);
      else if (FONT_VARIANT_POSITION_KEYWORDS.has(val)) buckets['font-variant-position'].push(token);
      else if (FONT_VARIANT_EMOJI_KEYWORDS.has(val)) buckets['font-variant-emoji'].push(token);
      else return null;
    } else if (token.type === 'function' && FONT_VARIANT_ALTERNATES_FUNCTIONS.has(getFunctionName(token))) {
      buckets['font-variant-alternates'].push(token);
    } else {
      return null;
    }
  }

  const norm: ComponentValue[] = [{ type: 'ident', value: 'normal' }];
  const res: Record<string, ComponentValue[]> = {};
  for (const lh of FONT_VARIANT_LONGHANDS) {
    res[lh] = buckets[lh].length > 0 ? joinWithWhitespace(buckets[lh]) : norm;
  }
  return res;
}

function contractFontVariant(values: Record<string, ComponentValue[]>): string | null {
  for (const lh of FONT_VARIANT_LONGHANDS) {
    if (!values[lh]) return null;
  }

  const allVals = FONT_VARIANT_LONGHANDS.map(lh => serialize(values[lh]).trim());
  const wide = checkUniformCssWide(allVals);
  if (wide !== undefined) return wide;

  if (allVals.every(v => v.toLowerCase() === 'normal')) return 'normal';
  if (allVals[0].toLowerCase() === 'none') {
    return allVals.slice(1).every(v => v.toLowerCase() === 'normal') ? 'none' : null;
  }

  const nonNormal = allVals.filter(v => v.toLowerCase() !== 'normal');
  return nonNormal.length === 0 ? 'normal' : nonNormal.join(' ');
}

export const FONT_LONGHANDS = [
  'font-style',
  'font-variant-caps',
  'font-variant-ligatures',
  'font-variant-alternates',
  'font-variant-numeric',
  'font-variant-east-asian',
  'font-variant-position',
  'font-variant-emoji',
  'font-weight',
  'font-stretch',
  'font-size',
  'line-height',
  'font-family',
] as const;

const SYSTEM_FONT_KEYWORDS = new Set([
  ...CSS_WIDE_KEYWORDS,
  'caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar'
]);
const FONT_STRETCH_KEYWORDS = new Set([
  'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed',
  'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'
]);
const FONT_SIZE_KEYWORDS = new Set([
  'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'
]);

function expandFont(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;

  if (filtered.length === 1 && filtered[0].type === 'ident' && SYSTEM_FONT_KEYWORDS.has(filtered[0].value.toLowerCase())) {
    return expandUniformLonghands(FONT_LONGHANDS, [filtered[0]]);
  }

  const norm: ComponentValue[] = [{ type: 'ident', value: 'normal' }];
  let styleVal: ComponentValue[] = norm;
  let capsVal: ComponentValue[] = norm;
  let weightVal: ComponentValue[] = norm;
  let stretchVal: ComponentValue[] = norm;
  let lineHeightVal: ComponentValue[] = norm;

  let i = 0;
  while (i < filtered.length) {
    const token = filtered[i];
    if (token.type === 'ident') {
      const v = token.value.toLowerCase();
      if (v === 'italic' || v === 'oblique') { styleVal = [token]; i++; continue; }
      if (v === 'small-caps') { capsVal = [token]; i++; continue; }
      if (v === 'bold' || v === 'bolder' || v === 'lighter') { weightVal = [token]; i++; continue; }
      if (FONT_STRETCH_KEYWORDS.has(v)) { stretchVal = [token]; i++; continue; }
      if (v === 'normal') { i++; continue; }
    } else if (token.type === 'number' && typeof token.value === 'number' && token.value >= 1 && token.value <= 1000) {
      weightVal = [token];
      i++;
      continue;
    }
    break;
  }

  if (i >= filtered.length) return null;
  const sizeToken = filtered[i];
  const isSizeValid =
    sizeToken.type === 'dimension' ||
    sizeToken.type === 'percentage' ||
    (sizeToken.type === 'number' && sizeToken.value === 0) ||
    (sizeToken.type === 'ident' && FONT_SIZE_KEYWORDS.has(sizeToken.value.toLowerCase())) ||
    (sizeToken.type === 'function' && MATH_FUNCTIONS.has(getFunctionName(sizeToken)));
  if (!isSizeValid) return null;
  const sizeVal: ComponentValue[] = [sizeToken];
  i++;

  if (i < filtered.length && filtered[i].type === 'delim' && filtered[i].value === '/') {
    i++;
    if (i >= filtered.length) return null;
    const lhToken = filtered[i];
    const isLhValid =
      lhToken.type === 'number' ||
      lhToken.type === 'dimension' ||
      lhToken.type === 'percentage' ||
      (lhToken.type === 'ident' && lhToken.value.toLowerCase() === 'normal') ||
      (lhToken.type === 'function' && MATH_FUNCTIONS.has(getFunctionName(lhToken)));
    if (!isLhValid) return null;
    lineHeightVal = [lhToken];
    i++;
  }

  if (i >= filtered.length) return null;
  const lastConsumed = lineHeightVal !== norm ? lineHeightVal[0] : sizeToken;
  const lastIdx = values.indexOf(lastConsumed);
  let familyVal: ComponentValue[];
  if (lastIdx !== -1) {
    familyVal = values.slice(lastIdx + 1).filter(t => t.type !== 'EOF');
    while (familyVal.length > 0 && (familyVal[0].type === 'whitespace' || familyVal[0].type === 'comment')) {
      familyVal.shift();
    }
  } else {
    familyVal = filtered.slice(i);
  }

  const res = expandUniformLonghands(FONT_LONGHANDS, norm);
  res['font-style'] = styleVal;
  res['font-variant-caps'] = capsVal;
  res['font-weight'] = weightVal;
  res['font-stretch'] = stretchVal;
  res['font-size'] = sizeVal;
  res['line-height'] = lineHeightVal;
  res['font-family'] = familyVal;
  return res;
}

const FONT_PRIMARY_LONGHANDS = [
  'font-style', 'font-variant-caps', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family',
] as const;
const FONT_OTHER_VARIANTS = [
  'font-variant-ligatures', 'font-variant-alternates', 'font-variant-numeric',
  'font-variant-east-asian', 'font-variant-position', 'font-variant-emoji',
] as const;

function contractFont(values: Record<string, ComponentValue[]>): string | null {
  for (const lh of FONT_PRIMARY_LONGHANDS) {
    if (!values[lh]) return null;
  }
  for (const lh of FONT_OTHER_VARIANTS) {
    if (values[lh] && serialize(values[lh]).trim().toLowerCase() !== 'normal') return null;
  }

  const sStyle = serialize(values['font-style']).trim();
  const sCaps = serialize(values['font-variant-caps']).trim();
  const sWeight = serialize(values['font-weight']).trim();
  const sStretch = serialize(values['font-stretch']).trim();
  const sSize = serialize(values['font-size']).trim();
  const sLineHeight = serialize(values['line-height']).trim();
  const sFamily = serialize(values['font-family'], false, 'font-family').trim();

  const wide = checkUniformCssWide([sStyle, sCaps, sWeight, sStretch, sSize, sLineHeight, sFamily]);
  if (wide !== undefined) return wide;
  if (!sSize || !sFamily) return null;

  const parts: string[] = [];
  if (sStyle.toLowerCase() !== 'normal') parts.push(sStyle);
  if (sCaps.toLowerCase() !== 'normal') parts.push(sCaps);
  if (sWeight.toLowerCase() !== 'normal' && sWeight !== '400') parts.push(sWeight);
  if (sStretch.toLowerCase() !== 'normal') parts.push(sStretch);
  parts.push(sLineHeight.toLowerCase() !== 'normal' ? `${sSize} / ${sLineHeight}` : sSize);
  parts.push(sFamily);

  return parts.join(' ');
}

export const LIST_STYLE_LONGHANDS = ['list-style-type', 'list-style-position', 'list-style-image'] as const;

function expandListStyle(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0 || filtered.length > 3) return null;

  const wide = tryExpandCssWide(filtered, LIST_STYLE_LONGHANDS);
  if (wide) return wide;

  let typeVal: ComponentValue[] = [{ type: 'ident', value: 'disc' }];
  let posVal: ComponentValue[] = [{ type: 'ident', value: 'outside' }];
  let imgVal: ComponentValue[] = [{ type: 'ident', value: 'none' }];
  let hasType = false;
  let hasPos = false;
  let hasImg = false;

  for (const token of filtered) {
    if (token.type === 'ident') {
      const v = token.value.toLowerCase();
      if ((v === 'inside' || v === 'outside') && !hasPos) {
        posVal = [token];
        hasPos = true;
      } else if (v === 'none') {
        if (!hasImg && !hasType) {
          imgVal = [token];
          typeVal = [token];
          hasImg = true;
          hasType = true;
        } else if (!hasImg) {
          imgVal = [token];
          hasImg = true;
        } else if (!hasType) {
          typeVal = [token];
          hasType = true;
        }
      } else if (!hasType) {
        typeVal = [token];
        hasType = true;
      } else {
        return null;
      }
    } else if ((token.type === 'url' || (token.type === 'function' && IMAGE_FUNCTIONS.has(getFunctionName(token)))) && !hasImg) {
      imgVal = [token];
      hasImg = true;
    } else {
      return null;
    }
  }

  return {
    'list-style-type': typeVal,
    'list-style-position': posVal,
    'list-style-image': imgVal,
  };
}

function contractListStyle(values: Record<string, ComponentValue[]>): string | null {
  const t = values['list-style-type'];
  const p = values['list-style-position'];
  const i = values['list-style-image'];
  if (!t || !p || !i) return null;

  const st = serialize(t).trim();
  const sp = serialize(p).trim();
  const si = serialize(i).trim();

  const wide = checkUniformCssWide([st, sp, si]);
  if (wide !== undefined) return wide;

  const parts: string[] = [];
  if (sp.toLowerCase() !== 'outside') parts.push(sp);
  if (si.toLowerCase() !== 'none') parts.push(si);
  if (st.toLowerCase() !== 'disc') parts.push(st);

  return parts.length === 0 ? 'disc' : parts.join(' ');
}

export const FLEX_LONGHANDS = ['flex-grow', 'flex-shrink', 'flex-basis'] as const;
const FLEX_BASIS_KEYWORDS = new Set(['auto', 'content', 'max-content', 'min-content', 'fit-content']);

function expandFlex(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0 || filtered.length > 3) return null;

  const wide = tryExpandCssWide(filtered, FLEX_LONGHANDS);
  if (wide) return wide;

  if (filtered.length === 1 && filtered[0].type === 'ident') {
    const v = filtered[0].value.toLowerCase();
    if (v === 'none') {
      return {
        'flex-grow': [{ type: 'number', value: 0, sign: null, numberType: 'integer' }],
        'flex-shrink': [{ type: 'number', value: 0, sign: null, numberType: 'integer' }],
        'flex-basis': [{ type: 'ident', value: 'auto' }],
      };
    }
    if (v === 'auto') {
      return {
        'flex-grow': [{ type: 'number', value: 1, sign: null, numberType: 'integer' }],
        'flex-shrink': [{ type: 'number', value: 1, sign: null, numberType: 'integer' }],
        'flex-basis': [{ type: 'ident', value: 'auto' }],
      };
    }
  }

  let grow: ComponentValue[] | null = null;
  let shrink: ComponentValue[] | null = null;
  let basis: ComponentValue[] | null = null;

  for (const token of filtered) {
    if (token.type === 'number') {
      if (grow === null) grow = [token];
      else if (shrink === null) shrink = [token];
      else return null;
    } else if (isValidLengthOrPercentage(token) || (token.type === 'ident' && FLEX_BASIS_KEYWORDS.has(token.value.toLowerCase()))) {
      if (basis === null) basis = [token];
      else return null;
    } else {
      return null;
    }
  }

  if (grow === null && basis === null) return null;
  const one: ComponentValue[] = [{ type: 'number', value: 1, sign: null, numberType: 'integer' }];
  return {
    'flex-grow': grow ?? one,
    'flex-shrink': shrink ?? one,
    'flex-basis': basis ?? (grow !== null
      ? [{ type: 'dimension', value: 0, unit: 'px', sign: null, numberType: 'integer' }]
      : [{ type: 'ident', value: 'auto' }]),
  };
}

function contractFlex(values: Record<string, ComponentValue[]>): string | null {
  const g = values['flex-grow'];
  const s = values['flex-shrink'];
  const b = values['flex-basis'];
  if (!g || !s || !b) return null;

  const sg = serialize(g).trim();
  const ss = serialize(s).trim();
  const sb = serialize(b).trim();

  const wide = checkUniformCssWide([sg, ss, sb]);
  if (wide !== undefined) return wide;

  if (sg.includes('var(') || ss.includes('var(') || sb.includes('var(')) {
    return sg === ss && sg === sb ? sg : null;
  }

  if (sb.toLowerCase() === 'auto') {
    if (sg === '0' && ss === '1') return 'initial';
    if (sg === '1' && ss === '1') return 'auto';
    if (sg === '0' && ss === '0') return 'none';
  }
  if ((sb === '0px' || sb === '0%' || sb === '0') && ss === '1') {
    return `${sg} 1 0px`;
  }
  return `${sg} ${ss} ${sb}`;
}

function contractOverflow(values: Record<string, ComponentValue[]>): string | null {
  const x = values['overflow-x'];
  const y = values['overflow-y'];
  if (!x || !y) return null;

  const sx = serialize(x).trim();
  const sy = serialize(y).trim();

  const wide = checkUniformCssWide([sx, sy]);
  if (wide !== undefined) return wide;

  if (sx.includes('var(') || sy.includes('var(')) {
    return sx === sy ? sx : null;
  }
  return sx === sy ? sx : `${sx} ${sy}`;
}

const LINE_CLAMP_LONGHANDS = ['max-lines', 'block-ellipsis', 'continue'] as const;

function expandLineClamp(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;

  const wide = tryExpandCssWide(filtered, LINE_CLAMP_LONGHANDS);
  if (wide) return wide;

  const autoToken: ComponentValue[] = [{ type: 'ident', value: 'auto' }];
  if (filtered.length === 1 && filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'none') {
    return {
      'max-lines': [{ type: 'ident', value: 'none' }],
      'block-ellipsis': autoToken,
      'continue': autoToken,
    };
  }

  return {
    'max-lines': filtered,
    'block-ellipsis': autoToken,
    'continue': autoToken,
  };
}

function contractLineClamp(values: Record<string, ComponentValue[]>): string | null {
  const lines = values['max-lines'];
  if (!lines) return null;
  const sLines = serialize(lines).trim();
  return sLines.toLowerCase() === 'none' ? 'none' : sLines;
}

const BORDER_RADIUS_PHYSICAL = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const;

function expandBorderRadius(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const filtered = filterSignificantTokens(values);
  if (filtered.length === 0) return null;
  if (filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'logical') return null;

  const slashIndex = filtered.findIndex(v => v.type === 'delim' && v.value === '/');
  let hValues: ComponentValue[];
  let vValues: ComponentValue[];

  if (slashIndex !== -1) {
    hValues = filtered.slice(0, slashIndex);
    vValues = filtered.slice(slashIndex + 1);
    if (hValues.length === 0 || hValues.length > 4 || vValues.length === 0 || vValues.length > 4) return null;
    if (vValues.some(v => v.type === 'delim' && v.value === '/')) return null;
  } else {
    if (filtered.length > 4) return null;
    hValues = filtered;
    vValues = filtered;
  }

  const hExpanded = expandFourSides(hValues);
  const vExpanded = expandFourSides(vValues);
  const result: Record<string, ComponentValue[]> = {};

  for (let i = 0; i < 4; i++) {
    const h = hExpanded[i];
    const v = vExpanded[i];
    result[BORDER_RADIUS_PHYSICAL[i]] = serialize(h) === serialize(v)
      ? h
      : [...h, { type: 'whitespace', value: ' ' }, ...v];
  }
  return result;
}

function contractBorderRadius(values: Record<string, ComponentValue[]>): string | null {
  if (!BORDER_RADIUS_PHYSICAL.every(prop => values[prop] !== undefined)) return null;

  const longhands = BORDER_RADIUS_PHYSICAL.map(prop => values[prop]);
  const serialized = longhands.map(lh => serialize(lh).trim());
  const wide = checkUniformCssWide(serialized);
  if (wide !== undefined) return wide;

  const parsed = longhands.map(lh => {
    const filtered = filterSignificantTokens(lh);
    return {
      h: serialize([filtered[0]]).trim(),
      v: serialize([filtered.length > 1 ? filtered[1] : filtered[0]]).trim(),
    };
  });

  const hStr = formatFourSides(parsed[0].h, parsed[1].h, parsed[2].h, parsed[3].h);
  const vStr = formatFourSides(parsed[0].v, parsed[1].v, parsed[2].v, parsed[3].v);
  return hStr === vStr ? hStr : `${hStr} / ${vStr}`;
}

export const ALL_SHORTHAND_LONGHANDS: readonly string[] = Object.freeze(
  Array.from(SUPPORTED_PROPERTIES).filter(prop => (
    prop !== 'all' &&
    prop !== 'direction' &&
    prop !== 'unicode-bidi' &&
    !prop.startsWith('--') &&
    !(prop in SHORTHANDS_DATA) &&
    !(prop in LOGICAL_MAPPING)
  ))
);

function isCSSWideKeywordOrVar(tokens: ComponentValue[]): boolean {
  const nonWs = filterSignificantTokens(tokens);
  if (nonWs.length === 1 && nonWs[0].type === 'ident' && CSS_WIDE_KEYWORDS.has(nonWs[0].value.toLowerCase())) {
    return true;
  }
  return nonWs.some(t => t.type === 'function' && getFunctionName(t) === 'var');
}

function expandAll(value: ComponentValue[]): Record<string, ComponentValue[]> | null {
  if (!value || value.length === 0 || !isCSSWideKeywordOrVar(value)) return null;
  return expandUniformLonghands(ALL_SHORTHAND_LONGHANDS, value);
}

function contractAll(longhands: Record<string, ComponentValue[]>): string | null {
  let firstVal: string | null = null;
  for (const lh of ALL_SHORTHAND_LONGHANDS) {
    const valTokens = longhands[lh];
    if (!valTokens || valTokens.length === 0) return null;
    const serialized = serialize(valTokens).trim();
    if (firstVal === null) firstVal = serialized;
    else if (serialized !== firstVal) return null;
  }
  if (!firstVal) return null;
  const lower = firstVal.toLowerCase();
  return CSS_WIDE_KEYWORDS.has(lower) || lower.startsWith('var(') ? firstVal : null;
}

function createBoxShorthand(
  name: keyof typeof SHORTHANDS_DATA,
  physical: readonly string[],
  logical: readonly string[],
): ShorthandDefinition {
  return {
    longhands: SHORTHANDS_DATA[name],
    logicalLonghands: logical,
    expand: expandBox(physical, logical),
    contract: contractBox(physical, logical),
  };
}

function createTwoValueShorthand(
  name: keyof typeof SHORTHANDS_DATA,
  physicalLonghands?: readonly string[],
): ShorthandDefinition {
  const longhands = SHORTHANDS_DATA[name];
  return {
    longhands,
    ...(physicalLonghands ? { physicalLonghands } : {}),
    expand: expandTwoValue(longhands),
    contract: contractTwoValue(longhands),
  };
}

function createBorderSideShorthand(
  prefix: string,
  longhands: readonly string[],
  physicalLonghands?: readonly string[],
): ShorthandDefinition {
  return {
    longhands,
    ...(physicalLonghands ? { physicalLonghands } : {}),
    expand: expandBorderSide(prefix),
    contract: contractBorderSide(prefix),
  };
}

function createBorderAxisShorthand(
  name: 'border-block' | 'border-inline',
  startProp: string,
  endProp: string,
  physicalLonghands: readonly string[],
  logicalLonghands: readonly string[],
): ShorthandDefinition {
  return {
    longhands: SHORTHANDS_DATA[name],
    physicalLonghands,
    logicalLonghands,
    expand: (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
      if (filterSignificantTokens(values).length === 0) return null;
      return { [startProp]: values, [endProp]: values };
    },
    contract: (values: Record<string, ComponentValue[]>): string | null => {
      const sVal = values[startProp];
      const eVal = values[endProp];
      const start = sVal ? serialize(sVal).trim() : contractBorderSide(startProp)(values);
      const end = eVal ? serialize(eVal).trim() : contractBorderSide(endProp)(values);
      return start && end && start === end ? start : null;
    },
  };
}

export const SHORTHANDS: Record<string, ShorthandDefinition> = {
  'border-block': createBorderAxisShorthand(
    'border-block',
    'border-block-start',
    'border-block-end',
    ['border-top-width', 'border-top-style', 'border-top-color', 'border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    ['border-block-start-width', 'border-block-start-style', 'border-block-start-color', 'border-block-end-width', 'border-block-end-style', 'border-block-end-color'],
  ),
  'border-block-color': createTwoValueShorthand('border-block-color', ['border-top-color', 'border-bottom-color']),
  'border-block-end': createBorderSideShorthand('border-block-end', SHORTHANDS_DATA['border-block-end'], ['border-bottom-width', 'border-bottom-style', 'border-bottom-color']),
  'border-block-start': createBorderSideShorthand('border-block-start', SHORTHANDS_DATA['border-block-start'], ['border-top-width', 'border-top-style', 'border-top-color']),
  'border-block-style': createTwoValueShorthand('border-block-style', ['border-top-style', 'border-bottom-style']),
  'border-block-width': createTwoValueShorthand('border-block-width', ['border-top-width', 'border-bottom-width']),
  'border': {
    longhands: BORDER_ALL_LONGHANDS,
    expand: expandBorder,
    contract: contractBorder,
  },
  'border-top': createBorderSideShorthand('border-top', ['border-top-width', 'border-top-style', 'border-top-color']),
  'border-right': createBorderSideShorthand('border-right', ['border-right-width', 'border-right-style', 'border-right-color']),
  'border-bottom': createBorderSideShorthand('border-bottom', ['border-bottom-width', 'border-bottom-style', 'border-bottom-color']),
  'border-left': createBorderSideShorthand('border-left', ['border-left-width', 'border-left-style', 'border-left-color']),
  'border-image': {
    longhands: BORDER_IMAGE_LONGHANDS,
    expand: expandBorderImage,
    contract: contractBorderImage,
  },
  'outline': {
    longhands: ['outline-color', 'outline-style', 'outline-width'],
    expand: expandOutline,
    contract: contractOutline,
  },
  'font-variant': {
    longhands: FONT_VARIANT_LONGHANDS,
    expand: expandFontVariant,
    contract: contractFontVariant,
  },
  'font': {
    longhands: FONT_LONGHANDS,
    expand: expandFont,
    contract: contractFont,
  },
  'list-style': {
    longhands: LIST_STYLE_LONGHANDS,
    expand: expandListStyle,
    contract: contractListStyle,
  },
  'overflow': {
    longhands: SHORTHANDS_DATA['overflow'],
    expand: expandTwoValue(SHORTHANDS_DATA['overflow']),
    contract: contractOverflow,
  },
  'flex': {
    longhands: FLEX_LONGHANDS,
    expand: expandFlex,
    contract: contractFlex,
  },
  '-webkit-flex': {
    longhands: FLEX_LONGHANDS,
    expand: expandFlex,
    contract: contractFlex,
  },
  'line-clamp': {
    longhands: LINE_CLAMP_LONGHANDS,
    expand: expandLineClamp,
    contract: contractLineClamp,
  },
  '-webkit-line-clamp': {
    longhands: LINE_CLAMP_LONGHANDS,
    expand: expandLineClamp,
    contract: contractLineClamp,
  },
  'border-color': createBoxShorthand(
    'border-color',
    ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    ['border-block-start-color', 'border-inline-start-color', 'border-block-end-color', 'border-inline-end-color'],
  ),
  'border-inline': createBorderAxisShorthand(
    'border-inline',
    'border-inline-start',
    'border-inline-end',
    ['border-left-width', 'border-left-style', 'border-left-color', 'border-right-width', 'border-right-style', 'border-right-color'],
    ['border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color', 'border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color'],
  ),
  'border-inline-color': createTwoValueShorthand('border-inline-color', ['border-left-color', 'border-right-color']),
  'border-inline-end': createBorderSideShorthand('border-inline-end', SHORTHANDS_DATA['border-inline-end'], ['border-right-width', 'border-right-style', 'border-right-color']),
  'border-inline-start': createBorderSideShorthand('border-inline-start', SHORTHANDS_DATA['border-inline-start'], ['border-left-width', 'border-left-style', 'border-left-color']),
  'border-inline-style': createTwoValueShorthand('border-inline-style', ['border-left-style', 'border-right-style']),
  'border-inline-width': createTwoValueShorthand('border-inline-width', ['border-left-width', 'border-right-width']),
  'border-radius': {
    longhands: SHORTHANDS_DATA['border-radius'],
    logicalLonghands: ['border-start-start-radius', 'border-start-end-radius', 'border-end-end-radius', 'border-end-start-radius'],
    expand: expandBorderRadius,
    contract: contractBorderRadius,
  },
  'border-style': createBoxShorthand(
    'border-style',
    ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    ['border-block-start-style', 'border-inline-start-style', 'border-block-end-style', 'border-inline-end-style'],
  ),
  'border-width': createBoxShorthand(
    'border-width',
    ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    ['border-block-start-width', 'border-inline-start-width', 'border-block-end-width', 'border-inline-end-width'],
  ),
  'inset': createBoxShorthand(
    'inset',
    ['top', 'right', 'bottom', 'left'],
    ['inset-block-start', 'inset-inline-start', 'inset-block-end', 'inset-inline-end'],
  ),
  'inset-block': createTwoValueShorthand('inset-block', ['top', 'bottom']),
  'inset-inline': createTwoValueShorthand('inset-inline', ['left', 'right']),
  'margin': createBoxShorthand(
    'margin',
    ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    ['margin-block-start', 'margin-inline-start', 'margin-block-end', 'margin-inline-end'],
  ),
  'margin-block': createTwoValueShorthand('margin-block', ['margin-top', 'margin-bottom']),
  'margin-inline': createTwoValueShorthand('margin-inline', ['margin-left', 'margin-right']),
  'padding': createBoxShorthand(
    'padding',
    ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    ['padding-block-start', 'padding-inline-start', 'padding-block-end', 'padding-inline-end'],
  ),
  'padding-block': createTwoValueShorthand('padding-block', ['padding-top', 'padding-bottom']),
  'padding-inline': createTwoValueShorthand('padding-inline', ['padding-left', 'padding-right']),
  'scroll-margin': createBoxShorthand(
    'scroll-margin',
    ['scroll-margin-top', 'scroll-margin-right', 'scroll-margin-bottom', 'scroll-margin-left'],
    ['scroll-margin-block-start', 'scroll-margin-inline-start', 'scroll-margin-block-end', 'scroll-margin-inline-end'],
  ),
  'scroll-padding': createBoxShorthand(
    'scroll-padding',
    ['scroll-padding-top', 'scroll-padding-right', 'scroll-padding-bottom', 'scroll-padding-left'],
    ['scroll-padding-block-start', 'scroll-padding-inline-start', 'scroll-padding-block-end', 'scroll-padding-inline-end'],
  ),
  'background': {
    longhands: SHORTHANDS_DATA['background'],
    expand: expandBackground,
    contract: contractBackground,
  },
  'all': {
    longhands: ALL_SHORTHAND_LONGHANDS,
    expand: expandAll,
    contract: contractAll,
  },
};

export const LONGHAND_TO_SHORTHAND: Record<string, string[]> = {};
for (const [shorthand, def] of Object.entries(SHORTHANDS)) {
  if (shorthand === 'all') continue;
  for (const longhand of def.longhands) {
    if (!LONGHAND_TO_SHORTHAND[longhand]) LONGHAND_TO_SHORTHAND[longhand] = [];
    LONGHAND_TO_SHORTHAND[longhand].push(shorthand);
  }
  if (def.logicalLonghands) {
    for (const longhand of def.logicalLonghands) {
      if (!LONGHAND_TO_SHORTHAND[longhand]) LONGHAND_TO_SHORTHAND[longhand] = [];
      LONGHAND_TO_SHORTHAND[longhand].push(shorthand);
    }
  }
}

