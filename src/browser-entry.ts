/* eslint-disable */
/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as TypedOM from './typed-om.ts';
import * as CSSOM from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';

if (typeof window !== 'undefined') {
  const g = window as any;

  // List of all classes we want to export globally
  const classes: Record<string, any> = {
    ...TypedOM,
    ...CSSOM,
    CSSStyleDeclaration
  };

  // Force-install classes on window
  for (const [name, cls] of Object.entries(classes)) {
    if (!g[name]) {
      try {
        Object.defineProperty(g, name, {
          value: cls,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (e) {
        g[name] = cls;
      }
    }
  }

  // Patch global CSS namespace factories if missing
  if (!g.CSS) {
    g.CSS = {};
  }
  const units = [
    'px', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax', 'cm', 'mm', 'in', 'pt', 'pc',
    'deg', 'rad', 'grad', 'turn', 'ms', 's', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx', 'fr', 'percent'
  ];
  for (const unit of units) {
    if (!g.CSS[unit]) {
      g.CSS[unit] = (val: number) => new g.CSSUnitValue(val, unit);
    }
  }

  // Patch Element.prototype.computedStyleMap
  if (!Element.prototype.computedStyleMap) {
    Element.prototype.computedStyleMap = function computedStyleMap(this: Element) {
      if (!(this instanceof Element)) {
        throw new TypeError("Value of 'this' is not an Element");
      }
      return new g.StylePropertyMapReadOnly(this, window.getComputedStyle(this));
    } as any;
  }

  // Patch styleMap / attributeStyleMap
  const patchStyleMaps = (proto: any, brandCheck: (obj: any) => boolean) => {
    if (proto && !proto.attributeStyleMap) {
      Object.defineProperty(proto, 'attributeStyleMap', {
        get() {
          if (!brandCheck(this)) throw new TypeError("Value of 'this' is not of correct type");
          if (!this._attributeStyleMap) {
            this._attributeStyleMap = new g.StylePropertyMap(this.style);
          }
          return this._attributeStyleMap;
        },
        configurable: true
      });
    }
    if (proto && !proto.styleMap) {
      Object.defineProperty(proto, 'styleMap', {
        get() {
          if (!brandCheck(this)) throw new TypeError("Value of 'this' is not of correct type");
          if (!this._styleMap) {
            this._styleMap = new g.StylePropertyMap(this.style);
          }
          return this._styleMap;
        },
        configurable: true
      });
    }
  };

  if (typeof HTMLElement !== 'undefined') {
    patchStyleMaps(HTMLElement.prototype, (obj) => obj instanceof HTMLElement);
  }
  if (typeof SVGElement !== 'undefined') {
    patchStyleMaps(SVGElement.prototype, (obj) => obj instanceof SVGElement);
  }
  if (typeof MathMLElement !== 'undefined') {
    patchStyleMaps(MathMLElement.prototype, (obj) => obj instanceof MathMLElement);
  }

  if (typeof CSSStyleRule !== 'undefined' && !CSSStyleRule.prototype.styleMap) {
    Object.defineProperty(CSSStyleRule.prototype, 'styleMap', {
      get() {
        if (!(this instanceof CSSStyleRule)) throw new TypeError("Value of 'this' is not a CSSStyleRule");
        if (!this._styleMap) {
          this._styleMap = new g.StylePropertyMap(this.style);
        }
        return this._styleMap;
      },
      configurable: true
    });
  }
}
