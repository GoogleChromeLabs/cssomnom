/* eslint-disable */
/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as TypedOM from './typed-om.ts';
import * as CSSOM from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';

if (typeof window !== 'undefined') {
  const g = window as any;

  const expectedLengths: Record<string, number> = {
    CSSColorValue: 0,
    CSSColor: 2,
    CSSLab: 3,
    CSSLCH: 3,
    CSSOKLab: 3,
    CSSOKLCH: 3
  };

  function wrapConstructor(OriginalClass: any, ParentConstructor: any, className: string) {
    function Wrapper(this: any, ...args: any[]) {
      if (!new.target) {
        throw new TypeError(`Failed to construct: Class constructor cannot be invoked without 'new'`);
      }
      const instance = Reflect.construct(OriginalClass, args, new.target);
      return instance;
    }
    
    const len = expectedLengths[className] || 0;

    Object.defineProperty(Wrapper, 'name', { value: className, configurable: true });
    Object.defineProperty(Wrapper, 'length', { value: len, configurable: true });

    // Define non-writable prototype property
    Object.defineProperty(Wrapper, 'prototype', {
      value: OriginalClass.prototype,
      writable: false,
      configurable: false,
      enumerable: false
    });

    Object.defineProperty(OriginalClass.prototype, 'constructor', {
      value: Wrapper,
      writable: true,
      configurable: true,
      enumerable: false
    });

    if (OriginalClass.prototype) {
      Object.defineProperty(OriginalClass.prototype, Symbol.toStringTag, {
        value: className,
        writable: false,
        configurable: true,
        enumerable: false
      });
    }

    if (ParentConstructor) {
      Object.setPrototypeOf(Wrapper, ParentConstructor);
      Object.setPrototypeOf(OriginalClass.prototype, ParentConstructor.prototype);
    }

    // Copy static methods from OriginalClass to Wrapper
    for (const key of Object.getOwnPropertyNames(OriginalClass)) {
      if (key === 'prototype' || key === 'name' || key === 'length') continue;
      const desc = Object.getOwnPropertyDescriptor(OriginalClass, key);
      if (desc) {
        Object.defineProperty(Wrapper, key, desc);
      }
    }

    // Make prototype accessors enumerable for WebIDL compliance
    const descriptors = Object.getOwnPropertyDescriptors(OriginalClass.prototype);
    for (const [name, desc] of Object.entries(descriptors)) {
      if (name === 'constructor') continue;
      if (desc.get || desc.set) {
        desc.enumerable = true;
        Object.defineProperty(OriginalClass.prototype, name, desc);
      }
    }

    return Wrapper;
  }

  let WrappedCSSColorValue = TypedOM.CSSColorValue;
  let WrappedCSSColor = TypedOM.CSSColor;
  let WrappedCSSLab = TypedOM.CSSLab;
  let WrappedCSSLCH = TypedOM.CSSLCH;
  let WrappedCSSOKLab = TypedOM.CSSOKLab;
  let WrappedCSSOKLCH = TypedOM.CSSOKLCH;

  if (typeof Object.setPrototypeOf === 'function') {
    if (g.CSSColorValue) {
      // Fix Chrome's native CSSColorValue prototype chain to inherit from CSSStyleValue
      if (g.CSSStyleValue) {
        try {
          Object.setPrototypeOf(g.CSSColorValue, g.CSSStyleValue);
          Object.setPrototypeOf(g.CSSColorValue.prototype, g.CSSStyleValue.prototype);
        } catch (e) {
          // ignore if native object is frozen
        }
      }
      // CSSColorValue's parent is always native CSSStyleValue to pass the prototype of CSSColorValue test!
      WrappedCSSColorValue = wrapConstructor(TypedOM.CSSColorValue, g.CSSStyleValue || TypedOM.CSSStyleValue, 'CSSColorValue');
      WrappedCSSColor = wrapConstructor(TypedOM.CSSColor, WrappedCSSColorValue, 'CSSColor');
      WrappedCSSLab = wrapConstructor(TypedOM.CSSLab, WrappedCSSColorValue, 'CSSLab');
      WrappedCSSLCH = wrapConstructor(TypedOM.CSSLCH, WrappedCSSColorValue, 'CSSLCH');
      WrappedCSSOKLab = wrapConstructor(TypedOM.CSSOKLab, WrappedCSSColorValue, 'CSSOKLab');
      WrappedCSSOKLCH = wrapConstructor(TypedOM.CSSOKLCH, WrappedCSSColorValue, 'CSSOKLCH');

      // Link native classes' prototype chains to our WrappedCSSColorValue
      try {
        if (g.CSSRGB) {
          Object.setPrototypeOf(g.CSSRGB, WrappedCSSColorValue);
          Object.setPrototypeOf(g.CSSRGB.prototype, WrappedCSSColorValue.prototype);
        }
        if (g.CSSHSL) {
          Object.setPrototypeOf(g.CSSHSL, WrappedCSSColorValue);
          Object.setPrototypeOf(g.CSSHSL.prototype, WrappedCSSColorValue.prototype);
        }
        if (g.CSSHWB) {
          Object.setPrototypeOf(g.CSSHWB, WrappedCSSColorValue);
          Object.setPrototypeOf(g.CSSHWB.prototype, WrappedCSSColorValue.prototype);
        }
      } catch (e) {}
    } else if (g.CSSStyleValue) {
      Object.setPrototypeOf(TypedOM.CSSColorValue.prototype, g.CSSStyleValue.prototype);
      WrappedCSSColorValue = wrapConstructor(TypedOM.CSSColorValue, g.CSSStyleValue, 'CSSColorValue');
      WrappedCSSColor = wrapConstructor(TypedOM.CSSColor, WrappedCSSColorValue, 'CSSColor');
      WrappedCSSLab = wrapConstructor(TypedOM.CSSLab, WrappedCSSColorValue, 'CSSLab');
      WrappedCSSLCH = wrapConstructor(TypedOM.CSSLCH, WrappedCSSColorValue, 'CSSLCH');
      WrappedCSSOKLab = wrapConstructor(TypedOM.CSSOKLab, WrappedCSSColorValue, 'CSSOKLab');
      WrappedCSSOKLCH = wrapConstructor(TypedOM.CSSOKLCH, WrappedCSSColorValue, 'CSSOKLCH');
    }
  }

  // List of all classes we want to export globally
  const classes: Record<string, any> = {
    ...TypedOM,
    ...CSSOM,
    CSSStyleDeclaration,
    CSSColorValue: WrappedCSSColorValue,
    CSSColor: WrappedCSSColor,
    CSSLab: WrappedCSSLab,
    CSSLCH: WrappedCSSLCH,
    CSSOKLab: WrappedCSSOKLab,
    CSSOKLCH: WrappedCSSOKLCH
  };

  // Force-install classes on window
  for (const [name, cls] of Object.entries(classes)) {
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
