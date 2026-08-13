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

import { NAMED_COLORS } from '../data/gen/colors.ts';

/**
 * System color definitions per CSS Color 4 § 6 #system-colors.
 */
export const SYSTEM_COLORS: Record<string, [number, number, number]> = {
  canvas: [255, 255, 255],
  canvastext: [0, 0, 0],
  linktext: [0, 0, 238],
  visitedtext: [85, 26, 139],
  activetext: [255, 0, 0],
  buttonface: [240, 240, 240],
  buttontext: [0, 0, 0],
  buttonborder: [118, 118, 118],
  field: [255, 255, 255],
  fieldtext: [0, 0, 0],
  highlight: [181, 213, 255],
  highlighttext: [0, 0, 0],
  selecteditem: [0, 103, 194],
  selecteditemtext: [255, 255, 255],
  mark: [255, 255, 0],
  marktext: [0, 0, 0],
  graytext: [128, 128, 128],
  accentcolor: [0, 103, 194],
  accentcolortext: [255, 255, 255],
  activeborder: [240, 240, 240],
  activecaption: [204, 204, 204],
  appworkspace: [171, 171, 171],
  background: [99, 99, 99],
  buttonhighlight: [255, 255, 255],
  buttonshadow: [160, 160, 160],
  captiontext: [0, 0, 0],
  inactiveborder: [244, 247, 252],
  inactivecaption: [191, 205, 219],
  inactivecaptiontext: [0, 0, 0],
  infobackground: [255, 255, 225],
  infotext: [0, 0, 0],
  menu: [240, 240, 240],
  menutext: [0, 0, 0],
  scrollbar: [200, 200, 200],
  threeddarkshadow: [113, 111, 100],
  threedface: [240, 240, 240],
  threedhighlight: [255, 255, 255],
  threedlightshadow: [227, 227, 227],
  threedshadow: [160, 160, 160],
  window: [255, 255, 255],
  windowframe: [100, 100, 100],
  windowtext: [0, 0, 0],
};

export function formatAlpha(a: number): string {
  if (a <= 0) return '0';
  if (a >= 1) return '1';
  return parseFloat(a.toFixed(4)).toString();
}

export function parseRgbComponents(content: string): [number, number, number, number] | null {
  let parts: string[];
  if (content.includes(',')) {
    parts = content.split(',').map(s => s.trim());
  } else {
    const slashIdx = content.indexOf('/');
    if (slashIdx !== -1) {
      const rgbPart = content.slice(0, slashIdx).trim();
      const aPart = content.slice(slashIdx + 1).trim();
      parts = [...rgbPart.split(/\s+/), aPart];
    } else {
      parts = content.trim().split(/\s+/);
    }
  }

  if (parts.length < 3 || parts.length > 4) return null;

  const parseComp = (val: string, max: number = 255): number | null => {
    val = val.trim();
    if (val.endsWith('%')) {
      const num = parseFloat(val.slice(0, -1));
      if (isNaN(num)) return null;
      return Math.min(max, Math.max(0, Math.round((num / 100) * max)));
    }
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    return Math.min(max, Math.max(0, Math.round(num)));
  };

  const parseAlpha = (val: string): number => {
    val = val.trim();
    if (val.endsWith('%')) {
      const num = parseFloat(val.slice(0, -1));
      if (isNaN(num)) return 1;
      return Math.min(1, Math.max(0, num / 100));
    }
    const num = parseFloat(val);
    if (isNaN(num)) return 1;
    return Math.min(1, Math.max(0, num));
  };

  const r = parseComp(parts[0], 255);
  const g = parseComp(parts[1], 255);
  const b = parseComp(parts[2], 255);
  if (r === null || g === null || b === null) return null;

  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1;
  return [r, g, b, a];
}

export function parseHslComponents(content: string): [number, number, number, number] | null {
  let parts: string[];
  if (content.includes(',')) {
    parts = content.split(',').map(s => s.trim());
  } else {
    const slashIdx = content.indexOf('/');
    if (slashIdx !== -1) {
      const hslPart = content.slice(0, slashIdx).trim();
      const aPart = content.slice(slashIdx + 1).trim();
      parts = [...hslPart.split(/\s+/), aPart];
    } else {
      parts = content.trim().split(/\s+/);
    }
  }

  if (parts.length < 3 || parts.length > 4) return null;

  const parseHue = (val: string): number => {
    val = val.trim().toLowerCase();
    if (val.endsWith('deg')) return parseFloat(val.slice(0, -3));
    if (val.endsWith('rad')) return (parseFloat(val.slice(0, -3)) * 180) / Math.PI;
    if (val.endsWith('turn')) return parseFloat(val.slice(0, -4)) * 360;
    return parseFloat(val) || 0;
  };

  const parsePct = (val: string): number => {
    val = val.trim();
    if (val.endsWith('%')) return Math.min(1, Math.max(0, parseFloat(val.slice(0, -1)) / 100));
    const n = parseFloat(val);
    return Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
  };

  const h = ((parseHue(parts[0]) % 360) + 360) % 360;
  const s = parsePct(parts[1]);
  const l = parsePct(parts[2]);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  const a = parts.length === 4 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
  return [r, g, b, isNaN(a) ? 1 : Math.min(1, Math.max(0, a))];
}

/**
 * Normalizes a CSS color value to its computed/resolved format.
 * css-color-4 § 4 #resolving-color-values
 * css-color-4 § 15 #named-colors
 * cssom-1 § 6.8 #resolved-values
 */
export function normalizeComputedColor(val: string): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // 1. Named colors (css-color-4 § 15 #named-colors)
  if (lower in NAMED_COLORS) {
    const [r, g, b, a] = NAMED_COLORS[lower];
    if (a !== undefined && a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  // 1.1 System colors (css-color-4 § 6 #system-colors)
  if (lower in SYSTEM_COLORS) {
    const [r, g, b] = SYSTEM_COLORS[lower];
    return `rgb(${r}, ${g}, ${b})`;
  }

  // 2. Hex colors (css-color-4 § 4.2 #hex-notation)
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  // 3. rgb() / rgba() function (css-color-4 § 4.1)
  const rgbMatch = /^(?:rgb|rgba)\s*\(\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (rgbMatch) {
    const parsed = parseRgbComponents(rgbMatch[1]);
    if (parsed) {
      const [r, g, b, a] = parsed;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  // 4. hsl() / hsla() function (css-color-4 § 4.3)
  const hslMatch = /^(?:hsl|hsla)\s*\(\s*([^)]+)\s*\)$/i.exec(trimmed);
  if (hslMatch) {
    const parsed = parseHslComponents(hslMatch[1]);
    if (parsed) {
      const [r, g, b, a] = parsed;
      if (a === 1) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
    }
  }

  return trimmed;
}
