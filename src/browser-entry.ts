/* eslint-disable */
/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as TypedOM from './typed-om.ts';
import * as CSSOM from './CSSOM.ts';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.ts';

if (typeof window !== 'undefined') {
  const g = window as any;

  const expectedLengths: Record<string, number> = {
    CSSStyleValue: 0,
    StylePropertyMapReadOnly: 0,
    StylePropertyMap: 0,
    CSSNumericArray: 0,
    CSSTranslate: 2,
    CSSRotate: 1,
    CSSScale: 2,
    CSSMatrixComponent: 1,
    CSSImageValue: 0,
    CSSColorValue: 0,
    CSSMathValue: 0,
    CSSTransformComponent: 0,
    CSSVariableReferenceValue: 1,
    CSSRGB: 3,
    CSSHSL: 3,
    CSSHWB: 3,
    CSSLab: 3,
    CSSLCH: 3,
    CSSOKLab: 3,
    CSSOKLCH: 3,
    CSSColor: 2,
  };

  const classNames = [
    'CSSStyleValue',
    'CSSKeywordValue',
    'CSSVariableReferenceValue',
    'CSSUnparsedValue',
    'CSSImageValue',
    'CSSNumericValue',
    'CSSUnitValue',
    'CSSMathValue',
    'CSSMathSum',
    'CSSMathProduct',
    'CSSMathNegate',
    'CSSMathInvert',
    'CSSMathMin',
    'CSSMathMax',
    'CSSMathClamp',
    'CSSNumericArray',
    'CSSTransformValue',
    'CSSTransformComponent',
    'CSSTranslate',
    'CSSRotate',
    'CSSScale',
    'CSSSkew',
    'CSSSkewX',
    'CSSSkewY',
    'CSSPerspective',
    'CSSMatrixComponent',
    'CSSColorValue',
    'CSSRGB',
    'CSSHSL',
    'CSSHWB',
    'CSSLab',
    'CSSLCH',
    'CSSOKLab',
    'CSSOKLCH',
    'CSSColor',
    'StylePropertyMapReadOnly',
    'StylePropertyMap'
  ];

  const wrappedConstructors = new Map<any, any>();

  function wrapConstructor(OriginalClass: any, className: string) {
    const parentOriginal = Object.getPrototypeOf(OriginalClass);
    let ParentConstructor: any = null;
    if (parentOriginal && parentOriginal !== Function.prototype && parentOriginal !== Object.prototype) {
      ParentConstructor = wrappedConstructors.get(parentOriginal) || parentOriginal;
    }

    function Wrapper(this: any, ...args: any[]) {
      if (!new.target) {
        throw new TypeError(`Failed to construct '${className}': Class constructor cannot be invoked without 'new'`);
      }
      const instance = Reflect.construct(OriginalClass, args, new.target);
      return instance;
    }

    const len = expectedLengths[className] || 0;

    Object.defineProperty(Wrapper, 'name', { value: className, configurable: true });
    Object.defineProperty(Wrapper, 'length', { value: len, configurable: true });

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

    if (ParentConstructor && ParentConstructor.prototype) {
      Object.setPrototypeOf(Wrapper, ParentConstructor);
      Object.setPrototypeOf(OriginalClass.prototype, ParentConstructor.prototype);
    }

    const copyStaticMethods = (fromCls: any) => {
      if (!fromCls || fromCls === Function.prototype || fromCls === Object.prototype) return;
      copyStaticMethods(Object.getPrototypeOf(fromCls));
      for (const key of Object.getOwnPropertyNames(fromCls)) {
        if (key === 'prototype' || key === 'name' || key === 'length') continue;
        const desc = Object.getOwnPropertyDescriptor(fromCls, key);
        if (desc) {
          desc.enumerable = true;
          Object.defineProperty(Wrapper, key, desc);
          if (fromCls !== OriginalClass) {
            Object.defineProperty(OriginalClass, key, desc);
          }
        }
      }
    };
    copyStaticMethods(OriginalClass);

    if (OriginalClass.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(OriginalClass.prototype);
      for (const [name, desc] of Object.entries(descriptors)) {
        if (name === 'constructor') continue;
        desc.enumerable = true;
        Object.defineProperty(OriginalClass.prototype, name, desc);
      }
    }

    wrappedConstructors.set(OriginalClass, Wrapper);
    return Wrapper;
  }

  const wrappedClasses: Record<string, any> = {};

  for (const name of classNames) {
    const OriginalClass = (TypedOM as any)[name] || (CSSOM as any)[name];
    if (OriginalClass) {
      wrappedClasses[name] = wrapConstructor(OriginalClass, name);
    }
  }

  // List of all classes we want to export globally
  const classes: Record<string, any> = {
    ...TypedOM,
    ...CSSOM,
    CSSStyleDeclaration,
    ...wrappedClasses
  };

  delete classes.CSSPositionValue;
  try {
    delete g.CSSPositionValue;
  } catch (e) {}

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

  // Patch global CSS namespace factories
  if (!g.CSS) {
    g.CSS = {};
  }
  const units = [
    'px', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax', 'cm', 'mm', 'in', 'pt', 'pc',
    'deg', 'rad', 'grad', 'turn', 'ms', 's', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx', 'fr', 'percent'
  ];
  for (const unit of units) {
    g.CSS[unit] = (val: number) => new g.CSSUnitValue(val, unit);
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
