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
import { serialize } from '../serializer.ts';
import { resolveLogicalProperty, LOGICAL_MAPPING } from '../data/gen/LogicalMapping.ts';
import {
  COLOR_PROPERTIES,
  SVG_PRESENTATION_ATTRIBUTES,
  DEFAULT_PROPERTY_VALUES,
} from '../data/gen/cascade-data.ts';
import { NAMED_COLORS } from '../data/gen/colors.ts';
import { camelToDashed } from '../utils.ts';
import type { Declaration } from '../types.ts';
import { INHERITED_PROPERTIES } from './types.ts';
import {
  SYSTEM_COLORS,
  normalizeComputedColor,
  formatAlpha,
} from './color-resolver.ts';
import {
  getUaDefault,
  getInitialValue,
} from './value-processor.ts';

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

  constructor(
    declarations: Declaration[] = [],
    readonlyFlag: boolean = false,
    parentStyle: CSSStyleDeclaration | null = null,
    element: unknown = null
  ) {
    super(declarations, readonlyFlag);
    this._parentStyle = parentStyle;
    this._element = element;
    this.parentRule = null;
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
      const direct = super.getPropertyValue(dashed);
      if (direct === 'auto') {
        return '0px';
      }
    }

    if (dashed === 'margin-left' || dashed === 'margin-right') {
      const direct = super.getPropertyValue(dashed);
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

    const rawVal = super.getPropertyValue(dashed).trim();

    if (dashed === 'min-width' || dashed === 'min-height') {
      if (rawVal === 'auto' || rawVal === '') {
        if (shouldPreserveAutoMinSize(this._element)) {
          return 'auto';
        }
        return '0px';
      }
    }

    if (rawVal) {
      const lowerRaw = rawVal.trim().toLowerCase();
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
      if (dashed === 'box-shadow') {
        const tokens = rawVal.split(/\s+/);
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
      return rawVal;
    }

    if (this._parentStyle && INHERITED_PROPERTIES.has(dashed)) {
      const parentVal = this._parentStyle.getPropertyValue(dashed);
      if (parentVal) {
        return parentVal;
      }
    }

    if (this._element && (dashed === 'display' || dashed === 'margin')) {
      const el = this._element as { tagName?: string; nodeName?: string };
      const tag = (el?.tagName || el?.nodeName || '').toUpperCase();
      if (tag) {
        return getUaDefault(dashed, this._element);
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
