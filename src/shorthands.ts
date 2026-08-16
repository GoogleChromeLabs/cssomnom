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

function isRepeatKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && ['repeat', 'no-repeat', 'space', 'round', 'repeat-x', 'repeat-y'].includes(token.value.toLowerCase());
}

function isAttachmentKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && ['scroll', 'fixed', 'local'].includes(token.value.toLowerCase());
}

function isBoxKeyword(token: ComponentValue): boolean {
  return token.type === 'ident' && ['border-box', 'padding-box', 'content-box', 'text', 'border-area'].includes(token.value.toLowerCase());
}

function isClipOnlyBoxKeyword(keyword: string): boolean {
  return ['text', 'border-area'].includes(keyword.toLowerCase());
}

function isColorToken(token: ComponentValue): boolean {
  if (token.type === 'hash') return true;
  if (token.type === 'ident') {
    const val = token.value.toLowerCase();
    return [
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
    ].includes(val);
  }
  if (token.type === 'function') {
    const name = ('name' in token ? token.name : ('value' in token ? token.value : ''))?.toString().toLowerCase();
    if (name) {
      return ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'].includes(name);
    }
  }
  return false;
}

function isImageToken(token: ComponentValue): boolean {
  if (token.type === 'ident' && token.value.toLowerCase() === 'none') {
    return true;
  }
  if (token.type === 'url') {
    return true;
  }
  if (token.type === 'function') {
    const name = ('name' in token ? token.name : ('value' in token ? token.value : ''))?.toString().toLowerCase();
    if (name) {
      return [
        'url', 'src', 'image', 'image-set',
        'linear-gradient', 'radial-gradient', 'conic-gradient',
        'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient'
      ].includes(name);
    }
  }
  return false;
}

function isPositionOrSizeValue(token: ComponentValue): boolean {
  if (token.type === 'ident') {
    return ['left', 'right', 'top', 'bottom', 'center', 'auto', 'cover', 'contain'].includes(token.value.toLowerCase());
  }
  if (token.type === 'percentage' || token.type === 'dimension') {
    return true;
  }
  if (token.type === 'number' && token.value === 0) {
    return true;
  }
  if (token.type === 'function') {
    const name = ('name' in token ? token.name : ('value' in token ? token.value : ''))?.toString().toLowerCase();
    if (name) {
      return ['calc', 'min', 'max', 'clamp'].includes(name);
    }
  }
  return false;
}

function extractSizeTokens(tokens: ComponentValue[], slashIdx: number): { size: ComponentValue[]; consumed: number } | null {
  if (slashIdx + 1 >= tokens.length) return null;
  const first = tokens[slashIdx + 1];
  if (first.type === 'ident' && ['cover', 'contain'].includes(first.value.toLowerCase())) {
    return { size: [first], consumed: 1 };
  }
  
  const isSizeVal = (t: ComponentValue) => {
    if (t.type === 'ident' && t.value.toLowerCase() === 'auto') return true;
    if (t.type === 'percentage' || t.type === 'dimension') return true;
    if (t.type === 'number' && t.value === 0) return true;
    if (t.type === 'function') {
      const name = ('name' in t ? t.name : ('value' in t ? t.value : ''))?.toString().toLowerCase();
      if (name && ['calc', 'min', 'max', 'clamp'].includes(name)) return true;
    }
    return false;
  };

  if (!isSizeVal(first)) return null;

  if (slashIdx + 2 < tokens.length) {
    const second = tokens[slashIdx + 2];
    if (isSizeVal(second)) {
      return { size: [first, second], consumed: 2 };
    }
  }
  return { size: [first], consumed: 1 };
}

function mapBoxKeywords(keywords: string[]): { origin: string; clip: string } | null {
  if (keywords.length === 0) {
    return { origin: 'padding-box', clip: 'border-box' };
  }
  if (keywords.length === 1) {
    const a = keywords[0].toLowerCase();
    if (isClipOnlyBoxKeyword(a)) {
      return { origin: 'border-box', clip: a };
    } else {
      return { origin: a, clip: a };
    }
  }
  if (keywords.length === 2) {
    const a = keywords[0].toLowerCase();
    const b = keywords[1].toLowerCase();
    const aClipOnly = isClipOnlyBoxKeyword(a);
    const bClipOnly = isClipOnlyBoxKeyword(b);
    if (aClipOnly && bClipOnly) {
      return { origin: 'border-box', clip: `${a} ${b}` };
    }
    if (aClipOnly) {
      return { origin: b, clip: a };
    }
    if (bClipOnly) {
      return { origin: a, clip: b };
    }
    return { origin: a, clip: b };
  }
  if (keywords.length === 3) {
    const clips = keywords.filter(isClipOnlyBoxKeyword);
    const origins = keywords.filter(k => !isClipOnlyBoxKeyword(k));
    if (clips.length === 2 && origins.length === 1) {
      return { origin: origins[0], clip: clips.join(' ') };
    }
    return null;
  }
  return null;
}

function parseRepeatTokens(tokens: ComponentValue[]): ComponentValue[] | null {
  if (tokens.length === 1) {
    const val = tokens[0].value?.toString().toLowerCase();
    if (val === 'repeat-x') {
      return [
        { type: 'ident', value: 'repeat' },
        { type: 'ident', value: 'no-repeat' }
      ] as ComponentValue[];
    }
    if (val === 'repeat-y') {
      return [
        { type: 'ident', value: 'no-repeat' },
        { type: 'ident', value: 'repeat' }
      ] as ComponentValue[];
    }
    return [tokens[0]];
  }
  if (tokens.length === 2) {
    return tokens;
  }
  return null;
}

function normalizePositionTokens(tokens: ComponentValue[]): ComponentValue[] {
  if (tokens.length === 1) {
    const t0 = tokens[0];
    if (t0.type === 'ident') {
      const v = t0.value.toLowerCase();
      if (v === 'left' || v === 'right') {
        return [t0, { type: 'ident', value: 'center' }];
      }
      if (v === 'top' || v === 'bottom') {
        return [{ type: 'ident', value: 'center' }, t0];
      }
      if (v === 'center') {
        return [t0, t0];
      }
    } else {
      return [t0, { type: 'percentage', value: 50, sign: null }];
    }
  }
  if (tokens.length === 2) {
    const t0 = tokens[0];
    const t1 = tokens[1];
    if (t0.type === 'ident' && t1.type === 'ident') {
      const v0 = t0.value.toLowerCase();
      const v1 = t1.value.toLowerCase();
      const isHoriz = (v: string) => ['left', 'right'].includes(v);
      const isVert = (v: string) => ['top', 'bottom'].includes(v);
      
      if (isVert(v0) && isHoriz(v1)) {
        return [t1, t0];
      }
      if (v0 === 'center' && isVert(v1)) {
        return [t0, t1];
      }
      if (isHoriz(v0) && v1 === 'center') {
        return [t0, t1];
      }
      if (isVert(v0) && v1 === 'center') {
        return [t1, t0];
      }
    }
  }
  return tokens;
}

function normalizeSizeTokens(tokens: ComponentValue[]): ComponentValue[] {
  if (tokens.length === 1) {
    const t0 = tokens[0];
    if (t0.type === 'ident' && ['cover', 'contain'].includes(t0.value.toLowerCase())) {
      return [t0];
    }
    return [t0, { type: 'ident', value: 'auto' }];
  }
  return tokens;
}



function joinWithWhitespace(tokens: ComponentValue[]): ComponentValue[] {
  const res: ComponentValue[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) {
      res.push({ type: 'whitespace', value: ' ' });
    }
    res.push(tokens[i]);
  }
  return res;
}

function expandBackground(values: ComponentValue[]): Record<string, ComponentValue[]> | null {
  const layers: ComponentValue[][] = [];
  let currentLayer: ComponentValue[] = [];
  for (const val of values) {
    if (val.type === 'comma') {
      layers.push(currentLayer);
      currentLayer = [];
    } else {
      currentLayer.push(val);
    }
  }
  layers.push(currentLayer);

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
    const layer = layers[i];
    const layerClean = layer.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
    if (layerClean.length === 0) {
      return null;
    }

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
        if (i !== numLayers - 1) return null;
        if (colorTokens !== null) return null;
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

    if (sizeTokens !== null && positionTokens.length === 0) return null;
    if (positionTokens.length > 4) return null;

    const boxMapped = mapBoxKeywords(boxKeywords);
    if (!boxMapped) return null;

    const repeatMapped = parseRepeatTokens(repeatTokens);
    const repeatFinal = repeatMapped ? joinWithWhitespace(repeatMapped) : [{ type: 'ident', value: 'repeat' } as ComponentValue];

    const positionFinal = positionTokens.length > 0 
      ? joinWithWhitespace(normalizePositionTokens(positionTokens))
      : joinWithWhitespace([{ type: 'percentage', value: 0, sign: null } as ComponentValue, { type: 'percentage', value: 0, sign: null } as ComponentValue]);

    const sizeFinal = sizeTokens !== null 
      ? joinWithWhitespace(normalizeSizeTokens(sizeTokens))
      : [{ type: 'ident', value: 'auto' } as ComponentValue];

    const imageFinal = imageTokens || [{ type: 'ident', value: 'none' } as ComponentValue];

    const attachmentFinal = attachmentTokens.length > 0 
      ? joinWithWhitespace(attachmentTokens) 
      : [{ type: 'ident', value: 'scroll' } as ComponentValue];

    const originFinal = [{ type: 'ident', value: boxMapped.origin } as ComponentValue];
    const clipFinal = joinWithWhitespace(boxMapped.clip.split(' ').map(c => ({ type: 'ident', value: c } as ComponentValue)));

    imageLayers.push(imageFinal);
    positionLayers.push(positionFinal);
    sizeLayers.push(sizeFinal);
    repeatLayers.push(repeatFinal);
    attachmentLayers.push(attachmentFinal);
    originLayers.push(originFinal);
    clipLayers.push(clipFinal);

    if (colorTokens !== null) {
      parsedColor = colorTokens;
    }
  }

  const joinLayers = (layers: ComponentValue[][]): ComponentValue[] => {
    const res: ComponentValue[] = [];
    for (let i = 0; i < layers.length; i++) {
      if (i > 0) {
        res.push({ type: 'comma', value: ',' });
        res.push({ type: 'whitespace', value: ' ' });
      }
      res.push(...layers[i]);
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
    'background-color': parsedColor || [{ type: 'ident', value: 'transparent' } as ComponentValue]
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

  const splitLayers = (tokens: ComponentValue[]): ComponentValue[][] => {
    const res: ComponentValue[][] = [];
    let current: ComponentValue[] = [];
    for (const t of tokens) {
      if (t.type === 'comma') {
        res.push(current);
        current = [];
      } else {
        current.push(t);
      }
    }
    res.push(current);
    return res;
  };

  const imageLayers = splitLayers(image);
  const positionLayers = splitLayers(position);
  const sizeLayers = splitLayers(size);
  const repeatLayers = splitLayers(repeat);
  const attachmentLayers = splitLayers(attachment);
  const originLayers = splitLayers(origin);
  const clipLayers = splitLayers(clip);

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

    const hasImage = imgVal !== 'none' && imgVal !== '';
    if (hasImage) {
      parts.push(imgVal);
    }

    const isInitialPosition = posVal !== '' && ['0% 0%', 'left top', '0% center', 'center left', 'left center'].includes(posVal.toLowerCase());
    const isInitialSize = sizeVal !== '' && ['auto', 'auto auto'].includes(sizeVal.toLowerCase());

    if (posVal !== '' && sizeVal !== '') {
      if (!isInitialSize) {
        parts.push(`${posVal} / ${sizeVal}`);
      } else if (!isInitialPosition) {
        parts.push(posVal);
      }
    }

    const isInitialRepeat = repVal !== '' && ['repeat', 'repeat repeat'].includes(repVal.toLowerCase());
    if (repVal !== '' && !isInitialRepeat) {
      const tokens = repeatLayers[i].filter(t => t.type !== 'whitespace' && t.type !== 'EOF');
      if (tokens.length === 2) {
        const v0 = tokens[0].value?.toString().toLowerCase();
        const v1 = tokens[1].value?.toString().toLowerCase();
        if (v0 === 'repeat' && v1 === 'no-repeat') {
          parts.push('repeat-x');
        } else if (v0 === 'no-repeat' && v1 === 'repeat') {
          parts.push('repeat-y');
        } else if (v0 === v1) {
          parts.push(v0);
        } else {
          parts.push(`${v0} ${v1}`);
        }
      } else {
        parts.push(repVal);
      }
    }

    if (attVal !== '' && attVal.toLowerCase() !== 'scroll') {
      parts.push(attVal);
    }

    if (origVal !== '' && clipVal !== '') {
      const isClipOnly = ['text', 'border-area'].includes(clipVal.toLowerCase()) || clipVal.toLowerCase().includes('text') || clipVal.toLowerCase().includes('border-area');
      const defaultOrigin = isClipOnly ? 'border-box' : 'padding-box';

      if (origVal.toLowerCase() !== 'padding-box' || clipVal.toLowerCase() !== 'border-box') {
        if (isClipOnly) {
          if (origVal.toLowerCase() === defaultOrigin) {
            parts.push(clipVal);
          } else {
            parts.push(`${origVal} ${clipVal}`);
          }
        } else {
          if (origVal.toLowerCase() === clipVal.toLowerCase()) {
            parts.push(origVal);
          } else {
            parts.push(`${origVal} ${clipVal}`);
          }
        }
      }
    }

    if (i === numLayers - 1) {
      const colVal = serialize(color).trim();
      if (colVal !== '' && colVal.toLowerCase() !== 'transparent') {
        parts.push(colVal);
      }
    }

    if (parts.length === 0) {
      parts.push('none');
    }

    layerStrings.push(parts.join(' '));
  }

  return layerStrings.join(', ');
}

const LENGTH_UNITS = new Set([
  'px', 'em', 'rem', '%', 'vh', 'vw', 'ch', 'pt', 'cm', 'mm', 'in', 'pc', 'ex', 'cap', 'ic', 'lh',
  'cqw', 'cqh', 'vmin', 'vmax', 'vi', 'vb', 'q', 'rlh', 'dvh', 'svh', 'lvh', 'dvw', 'svw', 'lvw',
  'cqi', 'cqb', 'cqmin', 'cqmax'
]);

function isValidLengthOrPercentage(val: ComponentValue): boolean {
  if (val.type === 'ident') {
    const kw = (val.value ?? '').toString().toLowerCase();
    return ['auto', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(kw);
  }
  if (val.type === 'dimension') {
    return LENGTH_UNITS.has((val.unit ?? '').toLowerCase());
  }
  if (val.type === 'percentage') return true;
  if (val.type === 'number' && val.value === 0) return true;
  if (val.type === 'function') {
    const fnName = ('name' in val ? val.name : ('value' in val ? val.value : ''))?.toString().toLowerCase();
    return ['calc', 'min', 'max', 'clamp', 'env'].includes(fnName);
  }
  return false;
}

const expandBox = (physical: readonly string[], logical: readonly string[]) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
  if (filtered.length === 0) return null;

  let isLogical = false;
  let offset = 0;
  if (filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'logical') {
    isLogical = true;
    offset = 1;
  }

  const data = filtered.slice(offset);
  if (data.length < 1 || data.length > 4) return null;

  const isLengthBox = physical[0].startsWith('margin') || physical[0].startsWith('padding') || physical[0] === 'top' || physical[0].startsWith('scroll-');
  if (isLengthBox && !data.every(isValidLengthOrPercentage)) {
    return null;
  }

  const result: Record<string, ComponentValue[]> = {};
  if (isLogical) {
    const blockStart = [data[0]];
    const inlineStart = data.length > 1 ? [data[1]] : blockStart;
    const blockEnd = data.length > 2 ? [data[2]] : blockStart;
    const inlineEnd = data.length > 3 ? [data[3]] : inlineStart;

    result[logical[0]] = blockStart;
    result[logical[1]] = inlineStart;
    result[logical[2]] = blockEnd;
    result[logical[3]] = inlineEnd;
  } else {
    const top = [data[0]];
    const right = data.length > 1 ? [data[1]] : top;
    const bottom = data.length > 2 ? [data[2]] : top;
    const left = data.length > 3 ? [data[3]] : right;

    result[physical[0]] = top;
    result[physical[1]] = right;
    result[physical[2]] = bottom;
    result[physical[3]] = left;
  }
  return result;
};

const contractBox = (physical: readonly string[], logical: readonly string[]) => (values: Record<string, ComponentValue[]>): string | null => {
  const CSS_WIDE = ['initial', 'inherit', 'unset', 'revert', 'revert-layer'];
  const t = values[physical[0]];
  const r = values[physical[1]];
  const b = values[physical[2]];
  const l = values[physical[3]];

  if (t && r && b && l) {
    const st = serialize(t).trim();
    const sr = serialize(r).trim();
    const sb = serialize(b).trim();
    const sl = serialize(l).trim();

    if ([st, sr, sb, sl].some(s => CSS_WIDE.includes(s.toLowerCase()))) {
      if (st === sr && st === sb && st === sl) return st;
      return null;
    }

    if (st === sr && st === sb && st === sl) return st;
    if (st === sb && sr === sl) return `${st} ${sr}`;
    if (sr === sl) return `${st} ${sr} ${sb}`;
    return `${st} ${sr} ${sb} ${sl}`;
  }

  const lbs = values[logical[0]];
  const lbe = values[logical[2]];
  const lis = values[logical[1]];
  const lie = values[logical[3]];

  if (lbs && lbe && lis && lie) {
    const sbs = serialize(lbs).trim();
    const sbe = serialize(lbe).trim();
    const sis = serialize(lis).trim();
    const sie = serialize(lie).trim();

    if ([sbs, sbe, sis, sie].some(s => CSS_WIDE.includes(s.toLowerCase()))) {
      if (sbs === sbe && sbs === sis && sbs === sie) return sbs;
      return null;
    }
    
    let res = 'logical ';
    if (sbs === sbe && sbs === sis && sbs === sie) res += sbs;
    else if (sbs === sbe && sis === sie) res += `${sbs} ${sis}`;
    else if (sis === sie) res += `${sbs} ${sis} ${sbe}`;
    else res += `${sbs} ${sis} ${sbe} ${sie}`;
    return res;
  }

  return null;
};

const expandTwoValue = (longhands: readonly string[]) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
  if (filtered.length < 1 || filtered.length > 2) return null;
  const result: Record<string, ComponentValue[]> = {};
  result[longhands[0]] = [filtered[0]];
  result[longhands[1]] = filtered.length > 1 ? [filtered[1]] : [filtered[0]];
  return result;
};

const contractTwoValue = (longhands: readonly string[]) => (values: Record<string, ComponentValue[]>): string | null => {
  const v1 = values[longhands[0]];
  const v2 = values[longhands[1]];
  if (!v1 || !v2) return null;
  const s1 = serialize(v1).trim();
  const s2 = serialize(v2).trim();
  const CSS_WIDE = ['initial', 'inherit', 'unset', 'revert', 'revert-layer'];
  if (CSS_WIDE.includes(s1.toLowerCase()) || CSS_WIDE.includes(s2.toLowerCase())) {
    return s1 === s2 ? s1 : null;
  }
  return s1 === s2 ? s1 : `${s1} ${s2}`;
};

const expandBorderSide = (prefix: string) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
  if (filtered.length === 0 || filtered.length > 3) return null;

  const widthProp = `${prefix}-width`;
  const styleProp = `${prefix}-style`;
  const colorProp = `${prefix}-color`;
  const result: Record<string, ComponentValue[]> = {};

  if (filtered.length === 1 && filtered[0].type === 'ident') {
    const v = filtered[0].value.toLowerCase();
    if (['initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(v)) {
      result[widthProp] = [filtered[0]];
      result[styleProp] = [filtered[0]];
      result[colorProp] = [filtered[0]];
      return result;
    }
  }

  result[widthProp] = [{ type: 'ident', value: 'medium' }];
  result[styleProp] = [{ type: 'ident', value: 'none' }];
  result[colorProp] = [{ type: 'ident', value: 'currentcolor' }];

  for (const val of filtered) {
    if (val.type === 'ident') {
      const v = val.value.toLowerCase();
      if (['thin', 'medium', 'thick'].includes(v)) {
        result[widthProp] = [val];
      } else if (['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(v)) {
        result[styleProp] = [val];
      } else {
        result[colorProp] = [val];
      }
    } else if (val.type === 'dimension' || val.type === 'percentage' || val.type === 'number') {
      result[widthProp] = [val];
    } else if (val.type === 'hash' || val.type === 'function') {
      result[colorProp] = [val];
    } else {
      result[colorProp] = [val];
    }
  }

  return result;
};

const contractBorderSide = (prefix: string) => (values: Record<string, ComponentValue[]>): string | null => {
  const CSS_WIDE = ['initial', 'inherit', 'unset', 'revert', 'revert-layer'];
  const widthProp = `${prefix}-width`;
  const styleProp = `${prefix}-style`;
  const colorProp = `${prefix}-color`;

  const w = values[widthProp];
  const s = values[styleProp];
  const c = values[colorProp];
  if (!w || !s || !c) return null;

  const sw = serialize(w).trim();
  const ss = serialize(s).trim();
  const sc = serialize(c).trim();

  if ([sw, ss, sc].some(str => CSS_WIDE.includes(str.toLowerCase()))) {
    if (sw.toLowerCase() === ss.toLowerCase() && sw.toLowerCase() === sc.toLowerCase()) {
      return sw;
    }
    return null;
  }

  if (sw === ss && sw === sc) {
    return sw;
  }

  return `${sw} ${sw} ${ss} ${sc}`.includes('medium none currentcolor') ? `${sw} ${ss} ${sc}` : `${sw} ${ss} ${sc}`; // Simplified for now
};

const expandBorderRadius = (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
  if (filtered.length === 0) return null;

  if (filtered[0].type === 'ident' && filtered[0].value.toLowerCase() === 'logical') {
    return null;
  }

  const slashIndex = filtered.findIndex(v => v.type === 'delim' && v.value === '/');
  
  let hValues: ComponentValue[];
  let vValues: ComponentValue[];

  if (slashIndex !== -1) {
    hValues = filtered.slice(0, slashIndex);
    vValues = filtered.slice(slashIndex + 1);
    
    if (hValues.length === 0 || hValues.length > 4 || vValues.length === 0 || vValues.length > 4) {
      return null;
    }
    if (vValues.findIndex(v => v.type === 'delim' && v.value === '/') !== -1) {
      return null;
    }
  } else {
    hValues = filtered;
    vValues = filtered;
    if (hValues.length > 4) return null;
  }

  const expandSide = (data: ComponentValue[]) => {
    const tl = [data[0]];
    const tr = data.length > 1 ? [data[1]] : tl;
    const br = data.length > 2 ? [data[2]] : tl;
    const bl = data.length > 3 ? [data[3]] : tr;
    return [tl, tr, br, bl];
  };

  const hExpanded = expandSide(hValues);
  const vExpanded = expandSide(vValues);

  const result: Record<string, ComponentValue[]> = {};
  const physical = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];

  for (let i = 0; i < 4; i++) {
    const h = hExpanded[i];
    const v = vExpanded[i];
    
    if (serialize(h) === serialize(v)) {
      result[physical[i]] = h;
    } else {
      result[physical[i]] = [...h, { type: 'whitespace', value: ' ' }, ...v];
    }
  }

  return result;
};

const contractBorderRadius = (values: Record<string, ComponentValue[]>): string | null => {
  const CSS_WIDE = ['initial', 'inherit', 'unset', 'revert', 'revert-layer'];
  const physical = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];

  const hasPhysical = physical.every(prop => values[prop] !== undefined);
  if (!hasPhysical) return null;

  const longhands = physical.map(prop => values[prop]);
  const serialized = longhands.map(lh => serialize(lh).trim());
  if (serialized.some(s => CSS_WIDE.includes(s.toLowerCase()))) {
    if (serialized.every(s => s.toLowerCase() === serialized[0].toLowerCase())) {
      return serialized[0];
    }
    return null;
  }

  const parsed = longhands.map(lh => {
    const filtered = lh.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
    const h = [filtered[0]];
    const v = filtered.length > 1 ? [filtered[1]] : [filtered[0]];
    return { h, v };
  });

  const hValues = parsed.map(p => p.h);
  const vValues = parsed.map(p => p.v);

  const contractSide = (data: ComponentValue[][]) => {
    const tl = serialize(data[0]).trim();
    const tr = serialize(data[1]).trim();
    const br = serialize(data[2]).trim();
    const bl = serialize(data[3]).trim();

    if (tl === tr && tl === br && tl === bl) return tl;
    if (tl === br && tr === bl) return `${tl} ${tr}`;
    if (tr === bl) return `${tl} ${tr} ${br}`;
    return `${tl} ${tr} ${br} ${bl}`;
  };

  const hStr = contractSide(hValues);
  const vStr = contractSide(vValues);

  if (hStr === vStr) {
    return hStr;
  } else {
    return `${hStr} / ${vStr}`;
  }
};

export const ALL_SHORTHAND_LONGHANDS: readonly string[] = Object.freeze(
  Array.from(SUPPORTED_PROPERTIES).filter(prop => {
    if (prop === 'all' || prop === 'direction' || prop === 'unicode-bidi' || prop.startsWith('--')) {
      return false;
    }
    if (prop in SHORTHANDS_DATA) {
      return false;
    }
    if (prop in LOGICAL_MAPPING) {
      return false;
    }
    return true;
  })
);

const CSS_WIDE_KEYWORDS = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);

function isCSSWideKeywordOrVar(tokens: ComponentValue[]): boolean {
  const nonWs = tokens.filter(t => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'EOF');
  if (nonWs.length === 1) {
    const t = nonWs[0];
    if (t.type === 'ident' && CSS_WIDE_KEYWORDS.has(t.value.toLowerCase())) {
      return true;
    }
    if (t.type === 'function') {
      const name = ('name' in t && typeof t.name === 'string') ? t.name : ('value' in t && typeof t.value === 'string') ? t.value : '';
      if (name.toLowerCase() === 'var') {
        return true;
      }
    }
  }
  return nonWs.some(t => {
    if (t.type !== 'function') return false;
    const name = ('name' in t && typeof t.name === 'string') ? t.name : ('value' in t && typeof t.value === 'string') ? t.value : '';
    return name.toLowerCase() === 'var';
  });
}

function expandAll(value: ComponentValue[]): Record<string, ComponentValue[]> | null {
  if (!value || value.length === 0) return null;
  if (!isCSSWideKeywordOrVar(value)) return null;
  const result: Record<string, ComponentValue[]> = {};
  for (const lh of ALL_SHORTHAND_LONGHANDS) {
    result[lh] = value;
  }
  return result;
}

function contractAll(longhands: Record<string, ComponentValue[]>): string | null {
  let firstVal: string | null = null;
  for (const lh of ALL_SHORTHAND_LONGHANDS) {
    const valTokens = longhands[lh];
    if (!valTokens || valTokens.length === 0) return null;
    const serialized = serialize(valTokens).trim();
    if (firstVal === null) {
      firstVal = serialized;
    } else if (serialized !== firstVal) {
      return null;
    }
  }
  if (!firstVal) return null;
  const lower = firstVal.toLowerCase();
  if (CSS_WIDE_KEYWORDS.has(lower) || lower.startsWith('var(')) {
    return firstVal;
  }
  return null;
}

export const SHORTHANDS: Record<string, ShorthandDefinition> = {
  'border-block': {
    longhands: SHORTHANDS_DATA['border-block'],
    physicalLonghands: ['border-top-width', 'border-top-style', 'border-top-color', 'border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    logicalLonghands: ['border-block-start-width', 'border-block-start-style', 'border-block-start-color', 'border-block-end-width', 'border-block-end-style', 'border-block-end-color'],
    expand: (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
      const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
      if (filtered.length === 0) return null;
      return {
        'border-block-start': values,
        'border-block-end': values,
      };
    },
    contract: (values: Record<string, ComponentValue[]>): string | null => {
      const sVal = values['border-block-start'];
      const eVal = values['border-block-end'];
      const start = sVal ? serialize(sVal).trim() : contractBorderSide('border-block-start')(values);
      const end = eVal ? serialize(eVal).trim() : contractBorderSide('border-block-end')(values);
      if (start && end && start === end) return start;
      return null;
    },
  },
  'border-block-color': {
    longhands: SHORTHANDS_DATA['border-block-color'],
    physicalLonghands: ['border-top-color', 'border-bottom-color'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-block-color']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-block-color']),
  },
  'border-block-end': {
    longhands: SHORTHANDS_DATA['border-block-end'],
    physicalLonghands: ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    expand: expandBorderSide('border-block-end'),
    contract: contractBorderSide('border-block-end'),
  },
  'border-block-start': {
    longhands: SHORTHANDS_DATA['border-block-start'],
    physicalLonghands: ['border-top-width', 'border-top-style', 'border-top-color'],
    expand: expandBorderSide('border-block-start'),
    contract: contractBorderSide('border-block-start'),
  },
  'border-block-style': {
    longhands: SHORTHANDS_DATA['border-block-style'],
    physicalLonghands: ['border-top-style', 'border-bottom-style'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-block-style']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-block-style']),
  },
  'border-block-width': {
    longhands: SHORTHANDS_DATA['border-block-width'],
    physicalLonghands: ['border-top-width', 'border-bottom-width'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-block-width']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-block-width']),
  },
  'border': {
    longhands: SHORTHANDS_DATA['border'],
    expand: expandBorderSide('border'),
    contract: contractBorderSide('border'),
  },
  'outline': {
    longhands: SHORTHANDS_DATA['outline'],
    expand: expandBorderSide('outline'),
    contract: contractBorderSide('outline'),
  },
  'border-color': {
    longhands: SHORTHANDS_DATA['border-color'],
    expand: expandBox(['border-top-color','border-right-color','border-bottom-color','border-left-color'], ['border-block-start-color','border-inline-start-color','border-block-end-color','border-inline-end-color']),
    contract: contractBox(['border-top-color','border-right-color','border-bottom-color','border-left-color'], ['border-block-start-color','border-inline-start-color','border-block-end-color','border-inline-end-color']),
    logicalLonghands: ['border-block-start-color','border-inline-start-color','border-block-end-color','border-inline-end-color'],
  },
  'border-inline': {
    longhands: SHORTHANDS_DATA['border-inline'],
    physicalLonghands: ['border-left-width', 'border-left-style', 'border-left-color', 'border-right-width', 'border-right-style', 'border-right-color'],
    logicalLonghands: ['border-inline-start-width', 'border-inline-start-style', 'border-inline-start-color', 'border-inline-end-width', 'border-inline-end-style', 'border-inline-end-color'],
    expand: (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
      const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
      if (filtered.length === 0) return null;
      return {
        'border-inline-start': values,
        'border-inline-end': values,
      };
    },
    contract: (values: Record<string, ComponentValue[]>): string | null => {
      const sVal = values['border-inline-start'];
      const eVal = values['border-inline-end'];
      const start = sVal ? serialize(sVal).trim() : contractBorderSide('border-inline-start')(values);
      const end = eVal ? serialize(eVal).trim() : contractBorderSide('border-inline-end')(values);
      if (start && end && start === end) return start;
      return null;
    },
  },
  'border-inline-color': {
    longhands: SHORTHANDS_DATA['border-inline-color'],
    physicalLonghands: ['border-left-color', 'border-right-color'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-inline-color']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-inline-color']),
  },
  'border-inline-end': {
    longhands: SHORTHANDS_DATA['border-inline-end'],
    physicalLonghands: ['border-right-width', 'border-right-style', 'border-right-color'],
    expand: expandBorderSide('border-inline-end'),
    contract: contractBorderSide('border-inline-end'),
  },
  'border-inline-start': {
    longhands: SHORTHANDS_DATA['border-inline-start'],
    physicalLonghands: ['border-left-width', 'border-left-style', 'border-left-color'],
    expand: expandBorderSide('border-inline-start'),
    contract: contractBorderSide('border-inline-start'),
  },
  'border-inline-style': {
    longhands: SHORTHANDS_DATA['border-inline-style'],
    physicalLonghands: ['border-left-style', 'border-right-style'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-inline-style']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-inline-style']),
  },
  'border-inline-width': {
    longhands: SHORTHANDS_DATA['border-inline-width'],
    physicalLonghands: ['border-left-width', 'border-right-width'],
    expand: expandTwoValue(SHORTHANDS_DATA['border-inline-width']),
    contract: contractTwoValue(SHORTHANDS_DATA['border-inline-width']),
  },
  'border-radius': {
    longhands: SHORTHANDS_DATA['border-radius'],
    logicalLonghands: ['border-start-start-radius', 'border-start-end-radius', 'border-end-end-radius', 'border-end-start-radius'],
    expand: expandBorderRadius,
    contract: contractBorderRadius,
  },
  'border-style': {
    longhands: SHORTHANDS_DATA['border-style'],
    expand: expandBox(['border-top-style','border-right-style','border-bottom-style','border-left-style'], ['border-block-start-style','border-inline-start-style','border-block-end-style','border-inline-end-style']),
    contract: contractBox(['border-top-style','border-right-style','border-bottom-style','border-left-style'], ['border-block-start-style','border-inline-start-style','border-block-end-style','border-inline-end-style']),
    logicalLonghands: ['border-block-start-style','border-inline-start-style','border-block-end-style','border-inline-end-style'],
  },
  'border-width': {
    longhands: SHORTHANDS_DATA['border-width'],
    expand: expandBox(['border-top-width','border-right-width','border-bottom-width','border-left-width'], ['border-block-start-width','border-inline-start-width','border-block-end-width','border-inline-end-width']),
    contract: contractBox(['border-top-width','border-right-width','border-bottom-width','border-left-width'], ['border-block-start-width','border-inline-start-width','border-block-end-width','border-inline-end-width']),
    logicalLonghands: ['border-block-start-width','border-inline-start-width','border-block-end-width','border-inline-end-width'],
  },
  'inset': {
    longhands: SHORTHANDS_DATA['inset'],
    expand: expandBox(['top','right','bottom','left'], ['inset-block-start','inset-inline-start','inset-block-end','inset-inline-end']),
    contract: contractBox(['top','right','bottom','left'], ['inset-block-start','inset-inline-start','inset-block-end','inset-inline-end']),
    logicalLonghands: ['inset-block-start','inset-inline-start','inset-block-end','inset-inline-end'],
  },
  'inset-block': {
    longhands: SHORTHANDS_DATA['inset-block'],
    physicalLonghands: ['top', 'bottom'],
    expand: expandTwoValue(SHORTHANDS_DATA['inset-block']),
    contract: contractTwoValue(SHORTHANDS_DATA['inset-block']),
  },
  'inset-inline': {
    longhands: SHORTHANDS_DATA['inset-inline'],
    physicalLonghands: ['left', 'right'],
    expand: expandTwoValue(SHORTHANDS_DATA['inset-inline']),
    contract: contractTwoValue(SHORTHANDS_DATA['inset-inline']),
  },
  'margin': {
    longhands: SHORTHANDS_DATA['margin'],
    expand: expandBox(['margin-top','margin-right','margin-bottom','margin-left'], ['margin-block-start','margin-inline-start','margin-block-end','margin-inline-end']),
    contract: contractBox(['margin-top','margin-right','margin-bottom','margin-left'], ['margin-block-start','margin-inline-start','margin-block-end','margin-inline-end']),
    logicalLonghands: ['margin-block-start','margin-inline-start','margin-block-end','margin-inline-end'],
  },
  'margin-block': {
    longhands: SHORTHANDS_DATA['margin-block'],
    physicalLonghands: ['margin-top', 'margin-bottom'],
    expand: expandTwoValue(SHORTHANDS_DATA['margin-block']),
    contract: contractTwoValue(SHORTHANDS_DATA['margin-block']),
  },
  'margin-inline': {
    longhands: SHORTHANDS_DATA['margin-inline'],
    physicalLonghands: ['margin-left', 'margin-right'],
    expand: expandTwoValue(SHORTHANDS_DATA['margin-inline']),
    contract: contractTwoValue(SHORTHANDS_DATA['margin-inline']),
  },
  'padding': {
    longhands: SHORTHANDS_DATA['padding'],
    expand: expandBox(['padding-top','padding-right','padding-bottom','padding-left'], ['padding-block-start','padding-inline-start','padding-block-end','padding-inline-end']),
    contract: contractBox(['padding-top','padding-right','padding-bottom','padding-left'], ['padding-block-start','padding-inline-start','padding-block-end','padding-inline-end']),
    logicalLonghands: ['padding-block-start','padding-inline-start','padding-block-end','padding-inline-end'],
  },
  'padding-block': {
    longhands: SHORTHANDS_DATA['padding-block'],
    physicalLonghands: ['padding-top', 'padding-bottom'],
    expand: expandTwoValue(SHORTHANDS_DATA['padding-block']),
    contract: contractTwoValue(SHORTHANDS_DATA['padding-block']),
  },
  'padding-inline': {
    longhands: SHORTHANDS_DATA['padding-inline'],
    physicalLonghands: ['padding-left', 'padding-right'],
    expand: expandTwoValue(SHORTHANDS_DATA['padding-inline']),
    contract: contractTwoValue(SHORTHANDS_DATA['padding-inline']),
  },
  'scroll-margin': {
    longhands: SHORTHANDS_DATA['scroll-margin'],
    expand: expandBox(['scroll-margin-top','scroll-margin-right','scroll-margin-bottom','scroll-margin-left'], ['scroll-margin-block-start','scroll-margin-inline-start','scroll-margin-block-end','scroll-margin-inline-end']),
    contract: contractBox(['scroll-margin-top','scroll-margin-right','scroll-margin-bottom','scroll-margin-left'], ['scroll-margin-block-start','scroll-margin-inline-start','scroll-margin-block-end','scroll-margin-inline-end']),
    logicalLonghands: ['scroll-margin-block-start','scroll-margin-inline-start','scroll-margin-block-end','scroll-margin-inline-end'],
  },
  'scroll-padding': {
    longhands: SHORTHANDS_DATA['scroll-padding'],
    expand: expandBox(['scroll-padding-top','scroll-padding-right','scroll-padding-bottom','scroll-padding-left'], ['scroll-padding-block-start','scroll-padding-inline-start','scroll-padding-block-end','scroll-padding-inline-end']),
    contract: contractBox(['scroll-padding-top','scroll-padding-right','scroll-padding-bottom','scroll-padding-left'], ['scroll-padding-block-start','scroll-padding-inline-start','scroll-padding-block-end','scroll-padding-inline-end']),
    logicalLonghands: ['scroll-padding-block-start','scroll-padding-inline-start','scroll-padding-block-end','scroll-padding-inline-end'],
  },
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

