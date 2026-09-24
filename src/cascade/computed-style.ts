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

import { CSSStyleDeclaration } from '../CSSStyleDeclaration.ts';
import { tokenize } from '../tokenizer.ts';
import { Parser } from '../parser.ts';
import { serialize } from '../serializer.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from '../data/gen/LogicalMapping.ts';
import {
  COLOR_PROPERTIES,
  SVG_PRESENTATION_ATTRIBUTES,
  DEFAULT_PROPERTY_VALUES,
} from '../data/gen/cascade-data.ts';
import { NAMED_COLORS } from '../data/gen/colors.ts';
import { camelToDashed } from '../utils.ts';
import type { Declaration, CSSFunction } from '../types.ts';
import { INHERITED_PROPERTIES } from './types.ts';
import {
  SYSTEM_COLORS,
  normalizeComputedColor,
  formatAlpha,
} from './color-resolver.ts';
import {
  getUaDefault,
  getInitialValue,
  isSvgElement,
} from './value-processor.ts';
import { parseMathFunction, simplify } from '../math-parser.ts';
import { CSSUnitValue } from '../typed-om.ts';

export function shouldPreserveAutoMinSize(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const el = element as {
    getAttribute?: (attr: string) => string | null;
    parentElement?: unknown;
    parentNode?: unknown;
  };

  // 1. Check if element or any ancestor is display: none (no box generated)
  let curr: unknown = element;
  while (curr && typeof curr === 'object') {
    const currEl = curr as {
      parentElement?: unknown;
      parentNode?: unknown;
      getAttribute?: (attr: string) => string | null;
    };
    const styleAttr = currEl.getAttribute ? currEl.getAttribute('style') : null;
    if (styleAttr && /display\s*:\s*none\b/i.test(styleAttr)) {
      return false;
    }
    curr = currEl.parentElement || currEl.parentNode;
  }

  // 2. Check if element has non-default aspect-ratio (not 'auto')
  const styleAttr = el.getAttribute ? el.getAttribute('style') : null;
  if (styleAttr && /aspect-ratio\s*:/i.test(styleAttr)) {
    const match = styleAttr.match(/aspect-ratio\s*:\s*([^;]+)/i);
    if (match) {
      const val = match[1].trim().toLowerCase();
      if (val !== 'auto' && val !== '') {
        return true;
      }
    }
  }

  // 3. Check if parent is flex or grid container
  const parent = el.parentElement || el.parentNode;
  if (parent && typeof parent === 'object') {
    const parentEl = parent as {
      getAttribute?: (attr: string) => string | null;
    };
    const pStyle = parentEl.getAttribute ? parentEl.getAttribute('style') : null;
    if (pStyle) {
      if (/display\s*:\s*(?:inline-)?(?:flex|grid)\b/i.test(pStyle)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * CSSComputedStyleDeclaration represents the resolved/computed style declaration of a DOM element.
 * cssom-1 § 6.8 #resolved-values
 * cssom-1 § 6.4.3 #the-cssstyledeclaration-interface
 * css-cascade-5 § 7.2 #computed-values
 */
export class CSSComputedStyleDeclaration extends CSSStyleDeclaration {
  private _parentStyle: CSSStyleDeclaration | null;
  private _element: unknown;
  private _pseudoElement: string | null;

  constructor(
    declarations: Declaration[] = [],
    readonlyFlag: boolean = false,
    parentStyle: CSSStyleDeclaration | null = null,
    element: unknown = null,
    pseudoElement: string | null = null
  ) {
    super(declarations, readonlyFlag);
    this._parentStyle = parentStyle;
    this._element = element;
    this._pseudoElement = pseudoElement;
    this._parentRule = null;
  }

  override get cssText(): string {
    return '';
  }

  override set cssText(_value: string) {
    throw new DOMException('Computed style declarations are read-only', 'NoModificationAllowedError');
  }

  override setProperty(_property: string, _value: string | null, _priority?: string): void {
    throw new DOMException('Computed style declarations are read-only', 'NoModificationAllowedError');
  }

  override removeProperty(_property: string): string {
    throw new DOMException('Computed style declarations are read-only', 'NoModificationAllowedError');
  }

  override getPropertyValue(property: string): string {
    const isCustom = property.startsWith('--');
    if (isCustom) {
      const decl = this._declarations.find(d => d.name === property);
      if (!decl) return '';
      if (decl.raw !== undefined) {
        const trimmed = decl.raw.trim();
        return trimmed === '' ? ' ' : trimmed;
      }
      const ser = serialize(decl.value, true).trim();
      return ser === '' ? ' ' : ser;
    }
    const dashed = camelToDashed(property).toLowerCase();
    if (dashed !== 'writing-mode' && dashed !== 'direction' && dashed in LOGICAL_MAPPING) {
      const wm = super.getPropertyValue('writing-mode') || 'horizontal-tb';
      const dir = super.getPropertyValue('direction') || 'ltr';
      const resolvedPhysical = resolveLogicalProperty(dashed, wm, dir);
      if (resolvedPhysical !== dashed) {
        return this.getPropertyValue(resolvedPhysical);
      }
    }

    // cssom-1 § 6.2 & § 6.4.3: Synthesize computed shorthand getters
    if (dashed === 'border-top') {
      const w = this.getPropertyValue('border-top-width') || '0px';
      const s = this.getPropertyValue('border-top-style') || 'none';
      const c = this.getPropertyValue('border-top-color') || 'rgb(0, 0, 0)';
      return `${w} ${s} ${c}`;
    }
    if (dashed === 'border-right') {
      const w = this.getPropertyValue('border-right-width') || '0px';
      const s = this.getPropertyValue('border-right-style') || 'none';
      const c = this.getPropertyValue('border-right-color') || 'rgb(0, 0, 0)';
      return `${w} ${s} ${c}`;
    }
    if (dashed === 'border-bottom') {
      const w = this.getPropertyValue('border-bottom-width') || '0px';
      const s = this.getPropertyValue('border-bottom-style') || 'none';
      const c = this.getPropertyValue('border-bottom-color') || 'rgb(0, 0, 0)';
      return `${w} ${s} ${c}`;
    }
    if (dashed === 'border-left') {
      const w = this.getPropertyValue('border-left-width') || '0px';
      const s = this.getPropertyValue('border-left-style') || 'none';
      const c = this.getPropertyValue('border-left-color') || 'rgb(0, 0, 0)';
      return `${w} ${s} ${c}`;
    }
    if (dashed === 'border') {
      const top = this.getPropertyValue('border-top');
      const right = this.getPropertyValue('border-right');
      const bottom = this.getPropertyValue('border-bottom');
      const left = this.getPropertyValue('border-left');
      if (top === right && top === bottom && top === left) {
        return top;
      }
      return '';
    }

    if (dashed === 'background') {
      const color = this.getPropertyValue('background-color') || 'rgba(0, 0, 0, 0)';
      const image = this.getPropertyValue('background-image') || 'none';
      const repeat = this.getPropertyValue('background-repeat') || 'repeat';
      const attachment = this.getPropertyValue('background-attachment') || 'scroll';
      const position = this.getPropertyValue('background-position') || '0% 0%';
      const size = this.getPropertyValue('background-size') || 'auto';
      const origin = this.getPropertyValue('background-origin') || 'padding-box';
      const clip = this.getPropertyValue('background-clip') || 'border-box';
      return `${color} ${image} ${repeat} ${attachment} ${position} / ${size} ${origin} ${clip}`;
    }

    // cssom-1 § 6.8: Resolved values for relative positioning offsets
    if (dashed === 'left' || dashed === 'right' || dashed === 'top' || dashed === 'bottom') {
      const direct = super.getPropertyValue(dashed);
      if (direct === '0' || direct === '0px') return '0px';
      if (!direct || direct === 'auto') {
        const pos = super.getPropertyValue('position');
        if (pos === 'relative') {
          return '0px';
        }
        return 'auto';
      }
      return direct;
    }

    // cssom-1 § 6.8 & CSS 2.1 § 10.3.3: Resolving auto margins in block layout
    if (dashed === 'margin-top' || dashed === 'margin-bottom') {
      const direct = super.getPropertyValue(dashed).trim();
      if (direct === 'auto' || direct === '0' || direct === '0px') {
        return '0px';
      }
    }

    if (dashed === 'margin-left' || dashed === 'margin-right') {
      const direct = super.getPropertyValue(dashed).trim();
      if (direct === '0' || direct === '0px') {
        return '0px';
      }
      if (direct === 'auto' && this._element && typeof this._element === 'object') {
        const el = this._element as { parentElement?: unknown; parentNode?: unknown };
        const parent = el.parentElement || el.parentNode;
        if (parent && typeof parent === 'object') {
          let parentWidth: number | null = null;
          let elWidth: number | null = null;
          if (this._parentStyle) {
            const pw = this._parentStyle.getPropertyValue('width');
            if (pw && pw.endsWith('px')) {
              parentWidth = parseFloat(pw);
            }
          }
          const ew = this.getPropertyValue('width');
          if (ew && ew.endsWith('px')) {
            elWidth = parseFloat(ew);
          }
          if (parentWidth !== null && elWidth !== null && parentWidth >= elWidth) {
            const remaining = parentWidth - elWidth;
            const leftAuto = (super.getPropertyValue('margin-left') || '').trim() === 'auto' || (this._declarations.some(d => d.name === 'margin-left' && serialize(d.value).trim() === 'auto'));
            const rightAuto = (super.getPropertyValue('margin-right') || '').trim() === 'auto' || (this._declarations.some(d => d.name === 'margin-right' && serialize(d.value).trim() === 'auto'));
            if (leftAuto && rightAuto) {
              return `${remaining / 2}px`;
            } else if (leftAuto || rightAuto) {
              return `${remaining}px`;
            }
          }
        }
        return '0px';
      }
    }

    // css-pseudo-4 § 2: Restricted properties on ::first-letter and ::first-line
    // Position cannot be altered by ::first-letter or ::first-line and always computes to static
    if (dashed === 'position' && (this._pseudoElement === '::first-letter' || this._pseudoElement === '::first-line')) {
      return 'static';
    }

    let rawVal = super.getPropertyValue(dashed).trim();

    // css-images-4 § 5.1 #image-set-notation: computed value resolves strings to url() and adds default 1dppx
    if (dashed === 'background-image' && rawVal.toLowerCase().includes('image-set(')) {
      rawVal = rawVal.replace(/image-set\(\s*(["'])([^"']+)\1\s*\)/g, 'image-set(url("$2") 1dppx)');
    }

    if (dashed === 'min-width' || dashed === 'min-height') {
      if (rawVal === 'auto' || rawVal === '') {
        if (shouldPreserveAutoMinSize(this._element)) {
          return 'auto';
        }
        return '0px';
      }
    }

    // CSSOM § 6.5 & CSS Transforms 2 § 3.2: getComputedStyle() returns the resolved value, which for perspective-origin is the used value (percentages resolved against reference box width/height).
    if (dashed === 'perspective-origin') {
      let elWidth = 0;
      let elHeight = 0;
      const w = this.getPropertyValue('width');
      if (w && w.endsWith('px')) elWidth = parseFloat(w) || 0;
      const h = this.getPropertyValue('height');
      if (h && h.endsWith('px')) elHeight = parseFloat(h) || 0;

      const fs = parseFloat(this.getPropertyValue('font-size')) || 16;

      const resolveAxis = (token: string, baseLength: number): string => {
        const lower = token.toLowerCase();
        if (lower === 'left' || lower === 'top') return '0px';
        if (lower === 'right' || lower === 'bottom') return `${baseLength}px`;
        if (lower === 'center') return `${baseLength * 0.5}px`;
        if (lower.endsWith('%')) {
          const pct = parseFloat(lower);
          return isNaN(pct) ? '0px' : `${(pct / 100) * baseLength}px`;
        }
        if (lower.endsWith('px')) return lower;
        if (lower.endsWith('em')) return `${parseFloat(lower) * fs}px`;
        if (lower.endsWith('rem')) return `${parseFloat(lower) * 16}px`;
        if (lower === '0') return '0px';
        return token;
      };

      const tokens = rawVal ? rawVal.trim().split(/\s+/) : ['50%', '50%'];
      if (tokens.length === 1) {
        const tok = tokens[0];
        if (tok === 'top' || tok === 'bottom') {
          return `${elWidth * 0.5}px ${resolveAxis(tok, elHeight)}`;
        }
        return `${resolveAxis(tok, elWidth)} ${elHeight * 0.5}px`;
      }
      if (tokens.length >= 2) {
        let xTok = tokens[0];
        let yTok = tokens[1];
        if (xTok === 'top' || xTok === 'bottom' || yTok === 'left' || yTok === 'right') {
          const tmp = xTok;
          xTok = yTok;
          yTok = tmp;
        }
        return `${resolveAxis(xTok, elWidth)} ${resolveAxis(yTok, elHeight)}`;
      }
    }

    // svg2 § 13.2 #presentation-attributes
    const isSvg = isSvgElement(this._element);
    if (isSvg) {
      if (dashed === 'baseline-shift') {
        return rawVal || 'baseline';
      }
      if (dashed === 'flood-color' || dashed === 'lighting-color' || dashed === 'stop-color' || dashed === 'stroke') {
        return rawVal;
      }
    }

    if (rawVal) {
      const lowerRaw = rawVal.trim().toLowerCase();

      // css-values-4 § 10.10 #calc-computed-value
      if (dashed === 'width' || dashed === 'height' || lowerRaw.startsWith('calc(')) {
        try {
          const tokens = new Parser(tokenize(rawVal)).parseComponentValues();
          const fn = tokens.find(t => t.type === 'function' && (t as { name: string }).name === 'calc');
          if (fn && 'value' in fn && Array.isArray((fn as { value: unknown }).value)) {
            const mathNode = parseMathFunction('calc', (fn as CSSFunction).value);
            if (mathNode) {
              const simplified = simplify(mathNode);
              if (simplified instanceof CSSUnitValue) {
                return simplified.toString();
              }
            }
          }
        } catch {
          // Fallback to rawVal
        }
      }

      // css-masking-1 § 5.1 #clip-property, css21 § 11.1.2 #clipping-properties
      if (dashed === 'clip' && lowerRaw.startsWith('rect(') && lowerRaw.endsWith(')')) {
        const inner = rawVal.trim().slice(5, -1).trim();
        const parts = inner.split(/[\s,]+/);
        if (parts.length === 4) {
          const fs = parseFloat(this.getPropertyValue('font-size')) || 16;
          const resolvedParts = parts.map(part => {
            const pLower = part.toLowerCase();
            if (pLower === 'auto') return 'auto';
            if (pLower.endsWith('px')) return pLower;
            if (pLower.endsWith('em')) return `${parseFloat(pLower) * fs}px`;
            if (pLower.endsWith('rem')) return `${parseFloat(pLower) * 16}px`;
            if (pLower.endsWith('ch') || pLower.endsWith('ex')) return `${parseFloat(pLower) * (fs * 0.5)}px`;
            if (pLower === '0') return '0px';
            return part;
          });
          return `rect(${resolvedParts.join(', ')})`;
        }
      }
      // css-cascade-5 § 7.3.2 #inherit
      if (lowerRaw === 'inherit') {
        if (this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 7.3.1 #initial
      if (lowerRaw === 'initial') {
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 7.3.3 #unset
      if (lowerRaw === 'unset') {
        if (INHERITED_PROPERTIES.has(dashed) && this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getInitialValue(dashed, this._element);
      }
      // css-cascade-5 § 6.2 #default
      if (lowerRaw === 'revert' || lowerRaw === 'revert-layer' || lowerRaw === 'revert-rule') {
        if (INHERITED_PROPERTIES.has(dashed) && this._parentStyle) {
          const parentVal = this._parentStyle.getPropertyValue(dashed);
          if (parentVal) return parentVal;
        }
        return getUaDefault(dashed, this._element);
      }
      if (dashed === 'box-shadow' || dashed === 'text-shadow') {
        // css-backgrounds-3 § 3.10 #box-shadow, css-text-decor-3 § 4 #text-shadow
        // Token-aware parsing preserves rgb(...) colors intact
        const p = new Parser(tokenize(rawVal)).parseComponentValues();
        const nonWsNodes = p.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
        const tokens = nonWsNodes.map(t => serialize([t]));
        const normalizedTokens = tokens.map(t => {
          const lower = t.toLowerCase();
          if (lower in SYSTEM_COLORS) {
            const [r, g, b] = SYSTEM_COLORS[lower];
            return `rgb(${r}, ${g}, ${b})`;
          }
          if (lower in NAMED_COLORS) {
            const [r, g, b, a] = NAMED_COLORS[lower];
            if (a !== undefined && a < 1) return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
            return `rgb(${r}, ${g}, ${b})`;
          }
          return t;
        });
        const colorToken = normalizedTokens.find(t => t.startsWith('rgb'));
        const otherTokens = normalizedTokens.filter(t => !t.startsWith('rgb'));
        if (colorToken) {
          return `${colorToken} ${otherTokens.join(' ')}`;
        }
        return normalizedTokens.join(' ');
      }
      if (COLOR_PROPERTIES.has(dashed)) {
        return normalizeComputedColor(rawVal);
      }
      if (dashed.endsWith('-width') && (dashed.startsWith('border-') || dashed.startsWith('outline-'))) {
        if (lowerRaw === 'medium') {
          const side = dashed.replace(/-width$/, '');
          const style = this.getPropertyValue(`${side}-style`);
          return style === 'none' || style === 'hidden' ? '0px' : '3px';
        }
        if (lowerRaw === 'thin') return '1px';
        if (lowerRaw === 'thick') return '5px';
        if (lowerRaw === '0') return '0px';
      }
      if (dashed === 'line-height') {
        const fs = parseFloat(this.getPropertyValue('font-size')) || 16;
        if (lowerRaw === 'normal') {
          return 'normal';
        }
        if (lowerRaw.endsWith('em')) {
          const num = parseFloat(lowerRaw);
          if (!isNaN(num)) return `${num * fs}px`;
        } else if (lowerRaw.endsWith('%')) {
          const pct = parseFloat(lowerRaw);
          if (!isNaN(pct)) return `${(pct * fs) / 100}px`;
        } else if (lowerRaw.endsWith('px')) {
          return rawVal;
        } else if (!isNaN(Number(lowerRaw))) {
          const num = parseFloat(lowerRaw);
          return `${num * fs}px`;
        }
        return rawVal;
      }
      return rawVal;
    }

    if (this._parentStyle && INHERITED_PROPERTIES.has(dashed)) {
      const parentVal = this._parentStyle.getPropertyValue(dashed);
      if (parentVal) {
        return parentVal;
      }
    }

    if (this._element && (dashed === 'display' || dashed === 'margin' || dashed.startsWith('margin-'))) {
      const el = this._element as { tagName?: string; nodeName?: string };
      const tag = (el?.tagName || el?.nodeName || '').toUpperCase();
      if (tag) {
        const ua = getUaDefault(dashed, this._element);
        if (ua) return ua;
      }
    }

    if (dashed.endsWith('-width') && (dashed.startsWith('border-') || dashed.startsWith('outline-'))) {
      const side = dashed.replace(/-width$/, '');
      const style = this.getPropertyValue(`${side}-style`);
      return style === 'none' || style === 'hidden' ? '0px' : '3px';
    }
    if (dashed.endsWith('-style') && (dashed.startsWith('border-') || dashed.startsWith('outline-'))) {
      return 'none';
    }

    if (dashed === 'color' || (dashed.endsWith('-color') && (dashed.startsWith('border-') || dashed.startsWith('outline-')))) {
      return 'rgb(0, 0, 0)';
    }
    if (dashed === 'background-color') return 'rgba(0, 0, 0, 0)';
    if (SVG_PRESENTATION_ATTRIBUTES.has(dashed)) {
      return DEFAULT_PROPERTY_VALUES[dashed] ?? '';
    }

    return '';
  }
}
