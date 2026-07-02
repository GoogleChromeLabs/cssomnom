/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { serialize } from './serializer.ts';
import type { ComponentValue } from './types.ts';
import { SHORTHANDS_DATA } from './data/shorthands.ts';

export interface ShorthandDefinition {
  longhands: readonly string[];
  expand: (value: ComponentValue[]) => Record<string, ComponentValue[]> | null;
  contract: (longhands: Record<string, ComponentValue[]>) => string | null;
  logicalLonghands?: readonly string[];
  physicalLonghands?: readonly string[];
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
  const t = values[physical[0]];
  const r = values[physical[1]];
  const b = values[physical[2]];
  const l = values[physical[3]];

  if (t && r && b && l) {
    const st = serialize(t).trim();
    const sr = serialize(r).trim();
    const sb = serialize(b).trim();
    const sl = serialize(l).trim();

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
  const s1 = serialize(v1);
  const s2 = serialize(v2);
  return s1 === s2 ? s1 : `${s1} ${s2}`;
};

const expandBorderSide = (prefix: string) => (values: ComponentValue[]): Record<string, ComponentValue[]> | null => {
  const filtered = values.filter(v => v.type !== 'whitespace' && v.type !== 'comment' && v.type !== 'EOF');
  if (filtered.length === 0 || filtered.length > 3) return null;

  const result: Record<string, ComponentValue[]> = {};
  const widthProp = `${prefix}-width`;
  const styleProp = `${prefix}-style`;
  const colorProp = `${prefix}-color`;

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
  const physical = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
  
  const longhands = physical.map(prop => values[prop]);
  if (longhands.some(v => !v)) return null;

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

export const SHORTHANDS: Record<string, ShorthandDefinition> = {
  'border-block': {
    longhands: SHORTHANDS_DATA['border-block'],
    physicalLonghands: ['border-top-width', 'border-top-style', 'border-top-color', 'border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    logicalLonghands: ['border-block-start-width', 'border-block-start-style', 'border-block-start-color', 'border-block-end-width', 'border-block-end-style', 'border-block-end-color'],
    expand: expandBorderSide('border-block'),
    contract: (values: Record<string, ComponentValue[]>): string | null => {
      const start = contractBorderSide('border-block-start')(values);
      const end = contractBorderSide('border-block-end')(values);
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
    expand: expandBorderSide('border-inline'),
    contract: (values: Record<string, ComponentValue[]>): string | null => {
      const start = contractBorderSide('border-inline-start')(values);
      const end = contractBorderSide('border-inline-end')(values);
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
};

export const LONGHAND_TO_SHORTHAND: Record<string, string[]> = {};
for (const [shorthand, def] of Object.entries(SHORTHANDS)) {
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

