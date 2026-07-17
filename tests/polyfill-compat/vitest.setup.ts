/* eslint-disable */
import { CSS, CSSRGB, CSSMathProduct, StylePropertyMap, StylePropertyMapReadOnly, CSSUnitValue } from '../../src/index.ts';

// Expose global CSS object expected by polyfill tests
(globalThis as any).CSS = CSS;



// Monkeypatch StylePropertyMap.prototype.get to return undefined instead of null for compatibility with polyfill tests
const originalGet = StylePropertyMap.prototype.get;
(StylePropertyMap.prototype as any).get = function(property: string) {
  const val = originalGet.call(this, property);
  return val === null ? undefined : val;
};

// -------------------------------------------------------------
// DOM Prototype Patching for StylePropertyMap compatibility
// -------------------------------------------------------------

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'attributeStyleMap', {
    get() {
      if (!this._attributeStyleMap) {
        this._attributeStyleMap = new StylePropertyMap(this.style);
      }
      return this._attributeStyleMap;
    },
    configurable: true,
  });
}

if (typeof Element !== 'undefined') {
  // Read-only wrapper for computedStyleMap
  class ComputedStylePropertyMap extends StylePropertyMapReadOnly {
    private _style: any;
    constructor(style: any) {
      super([]);
      this._style = style;
    }
    override get(property: string) {
      return new StylePropertyMap(this._style).get(property);
    }
    override getAll(property: string) {
      return new StylePropertyMap(this._style).getAll(property);
    }
    override has(property: string) {
      return new StylePropertyMap(this._style).has(property);
    }
  }

  (Element.prototype as any).computedStyleMap = function() {
    if (!this._computedStyleMap) {
      // In jsdom, window.getComputedStyle is available
      const style = window.getComputedStyle(this);
      this._computedStyleMap = new ComputedStylePropertyMap(style);
    }
    return this._computedStyleMap;
  };
}
