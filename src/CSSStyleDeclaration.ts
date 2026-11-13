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
import { CSSRule } from './rules/base.ts';
import { ParseHooks } from './parse-hooks.ts';
import { isValidDashedIdent, parseComponentValues, validateCustomPropertyValue, validateDeclarationValue, assembleUnicodeRanges, parseStyleAttribute } from './parser.ts';
import { serialize, serializeDeclarations, serializeFontFamily } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import type { Declaration, ComponentValue } from './types.ts';
import { SHORTHANDS, LONGHAND_TO_SHORTHAND, getShorthandAllLonghands, type ShorthandDefinition } from './shorthands.ts';
import { SHORTHANDS_DATA } from './data/gen/shorthands.ts';
import { resolveLogicalProperty, LOGICAL_PROPERTY_INFO, LOGICAL_MAPPING } from './data/gen/LogicalMapping.ts';
import { SUPPORTED_PROPERTIES, CUSTOM_IDENT_PROPERTIES, FONT_FACE_DESCRIPTORS, PAGE_ALLOWED_PROPERTIES, PAGE_DESCRIPTOR_PROPERTIES, POSITION_TRY_ALLOWED_PROPERTIES } from './data/gen/property-list.ts';
import { camelToDashed } from './utils.ts';
import { CSSStyleProperties } from './data/gen/properties.ts';
import { applyWebIDLInterface } from './webidl.ts';

const CSS_WIDE_KEYWORDS = /* @__PURE__ */ new Set('inherit,initial,unset,revert,revert-layer'.split(','));
const LOGICAL_SHORTHANDS = /* @__PURE__ */ new Set('margin,padding,inset,scroll-margin,scroll-padding,border-width,border-style,border-color'.split(','));

const proxyToTarget = new WeakMap<CSSStyleDeclaration, CSSStyleDeclaration>();

/** @internal */
export function unwrapStyle<T extends CSSStyleDeclaration>(style: T): T {
  return (proxyToTarget.get(style) as T | undefined) ?? style;
}

function createStyleProxy<T extends CSSStyleDeclaration>(target: T): T {
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          const index = Number(prop);
          const decl = t._declarations[index];
          return decl ? decl.name : undefined;
        }
        
        if (prop in t && (typeof (t as Record<string | symbol, unknown>)[prop] !== 'undefined' || prop.startsWith('_'))) {
          return (t as Record<string | symbol, unknown>)[prop];
        }

        if (prop.startsWith('--')) {
          return t._allowCustomProperties ? t.getPropertyValue(prop) : undefined;
        }

        const cssProp = prop === 'cssFloat' ? 'float' : camelToDashed(prop);
        if (t._isPropertySupported(cssProp)) {
          return t.getPropertyValue(cssProp);
        }
      }
      return (t as Record<string | symbol, unknown>)[prop];
    },
    set(t, prop, value) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          return false;
        }
        if (prop in t && (typeof (t as Record<string | symbol, unknown>)[prop] !== 'undefined' || prop.startsWith('_'))) {
          (t as Record<string | symbol, unknown>)[prop] = value;
          return true;
        }

        if (prop.startsWith('--')) {
          if (t._allowCustomProperties) t.setProperty(prop, value);
          return true;
        }

        let cssProp = prop;
        if (prop === 'cssFloat') {
          cssProp = 'float';
        } else {
          cssProp = camelToDashed(prop);
        }
        if (t._isPropertySupported(cssProp)) {
          t.setProperty(cssProp, value);
          return true;
        }
      }
      (t as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
    has(t, prop) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          const index = Number(prop);
          return index >= 0 && index < t._declarations.length;
        }
        if (prop in t) return true;
        if (prop.startsWith('--')) return true;
        const dashed = camelToDashed(prop);
        if (t._isPropertySupported(dashed)) return true;
        if (prop in SHORTHANDS) return true;
        if (prop in LONGHAND_TO_SHORTHAND) return true;
      }
      return Reflect.has(t, prop);
    },
    ownKeys(t) {
      return Array.from({ length: t.length }, (_, i) => String(i));
    },
    getOwnPropertyDescriptor(t, prop) {
      const i = typeof prop === 'string' ? Number(prop) : NaN;
      if (Number.isInteger(i) && i >= 0 && i < t.length && String(i) === prop) {
        return { value: t.item(i), writable: false, enumerable: true, configurable: true };
      }
      const desc = Reflect.getOwnPropertyDescriptor(t, prop);
      return desc ? { ...desc, enumerable: false } : undefined;
    },
  }) as T;
  proxyToTarget.set(proxy, target);
  return proxy;
}

export class CSSStyleDeclaration extends CSSStyleProperties {
  [index: number]: string;
  [property: string]: unknown;
  /** @internal */ _declarations: Declaration[];
  /** @internal */ _rawDeclarations: Declaration[];
  /** @internal */ _declMap: Map<string, Declaration>;
  /** @internal */ _readonly: boolean = false;
  /** @internal */ _parentRule: CSSRule | null = null;
  /** @internal */ _onChange: ((force?: boolean) => void) | null = null;

  get parentRule(): CSSRule | null { return this._parentRule; }
  get onChange(): ((force?: boolean) => void) | null { return this._onChange; }
  set onChange(fn: ((force?: boolean) => void) | null) { this._onChange = fn ?? null; }

  /** @internal */
  protected get _filterDeclarationsInConstructor(): boolean {
    return false;
  }

  /** @internal */
  get _allowCustomProperties(): boolean {
    return true;
  }

  /** @internal */
  protected get _allowImportant(): boolean {
    return true;
  }

  /** @internal */
  protected get _useDirectDeclMap(): boolean {
    return true;
  }

  constructor(
    parentRuleOrDeclarations?: CSSRule | Declaration[] | null,
    onChangeOrReadonly?: ((force?: boolean) => void) | boolean | null
  ) {
    super();
    this._declarations = [];
    this._rawDeclarations = [];
    this._declMap = new Map();

    let declarations: Declaration[] = [];
    if (Array.isArray(parentRuleOrDeclarations)) {
      declarations = parentRuleOrDeclarations;
      this._readonly = typeof onChangeOrReadonly === 'boolean' ? onChangeOrReadonly : false;
      if (typeof onChangeOrReadonly === 'function') {
        this._onChange = onChangeOrReadonly;
      }
    } else {
      this._parentRule = parentRuleOrDeclarations ?? null;
      this._readonly = typeof onChangeOrReadonly === 'boolean' ? onChangeOrReadonly : false;
      if (typeof onChangeOrReadonly === 'function') {
        this._onChange = onChangeOrReadonly;
      }
    }

    for (const d of declarations) {
      this._ingestDeclaration(d, this._filterDeclarationsInConstructor, true);
    }
    
    return createStyleProxy(this);

  }

  private _ingestDeclaration(decl: Declaration, filterSupported: boolean, isTopLevel: boolean): void {
    if (decl.name === '--') return;
    if (decl.important && !this._allowImportant) return;
    const normalizedName = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
    if (normalizedName.startsWith('--') && !this._allowCustomProperties) return;
    if (filterSupported && !normalizedName.startsWith('--') && !this._isPropertySupported(normalizedName)) {
      return;
    }
    decl.name = normalizedName;
    if (isTopLevel) {
      this._rawDeclarations.push(decl);
    }
    const shorthand = SHORTHANDS[decl.name];
    if (shorthand) {
      const ser = serialize(decl.value);
      const hasVar = ser.includes('var(') || ser.includes('env(');
      if (!hasVar) {
        const expanded = shorthand.expand(decl.value);
        if (expanded) {
          for (const [lh, val] of Object.entries(expanded)) {
            this._ingestDeclaration({
              type: 'declaration',
              name: lh,
              value: val,
              important: decl.important,
              fromAll: decl.name === 'all' || decl.fromAll,
            }, filterSupported, false);
          }
          return;
        }
      }
    }
    this._addDeclaration(decl);
  }

  // cssom-1 #concept-declarations-specified-order
  private _addDeclaration(d: Declaration) {
    const shorthand = SHORTHANDS[d.name];
    if (shorthand) {
      for (const lh of shorthand.longhands) {
        const existing = this._declMap.get(lh);
        if (existing && (!existing.important || d.important)) {
          const index = this._declarations.indexOf(existing);
          if (index !== -1) this._declarations.splice(index, 1);
          this._declMap.delete(lh);
        }
      }
    }
    const existing = this._declMap.get(d.name);
    if (existing) {
      if (existing.important && !d.important) return;
      const index = this._declarations.indexOf(existing);
      if (index !== -1) this._declarations.splice(index, 1);
    }
    this._declarations.push(d);
    this._declMap.set(d.name, d);
  }

  get length() {
    return this._declarations.length;
  }

  item(index: number): string {
    return this._declarations[index]?.name || '';
  }

  /** @internal */
  protected _getLonghandForContraction(lh: string): { value: ComponentValue[]; important: boolean } | null {
    const self = unwrapStyle(this);
    const decl = self._getWinningDeclaration(lh);
    if (decl && decl.value.length > 0) {
      return { value: decl.value, important: decl.important };
    }
    return null;
  }

  private _serializeDirectShorthand(property: string, shorthand: ShorthandDefinition): string {
    const directDecl = this._getWinningDeclaration(property);
    if (directDecl) {
      const directIdx = this._declarations.indexOf(directDecl);
      const allLonghands = getShorthandAllLonghands(shorthand);
      const hasOverridingLonghand = this._declarations.some((d, idx) => {
        if (!allLonghands.includes(d.name)) return false;
        if (d.important && !directDecl.important) return true;
        if (d.important === directDecl.important && idx > directIdx) return true;
        return false;
      });
      if (hasOverridingLonghand) return '';
      return serialize(directDecl.value).trim();
    }
    return '';
  }

  // cssom-1 #dom-cssstyledeclaration-getpropertyvalue
  getPropertyValue(property: string): string {
    const self = unwrapStyle(this);
    if (!property.startsWith('--')) property = property.toLowerCase();
    else if (!isValidDashedIdent(property)) return '';

    const map = self._useDirectDeclMap ? self._declMap : null;

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      if (map && !map.has('all')) {
        const hasSubLonghands = (lh: string): boolean =>
          map.has(lh) || (lh in SHORTHANDS && SHORTHANDS[lh].longhands.every(sub => map.has(sub)));
        let canContract = shorthand.longhands.every(hasSubLonghands);
        if (!canContract && shorthand.logicalLonghands) {
          canContract = shorthand.logicalLonghands.every(lh => map.has(lh));
        }
        if (!canContract) {
          if (!map.has(property)) return '';
          return self._serializeDirectShorthand(property, shorthand);
        }
      }

      const longhandValues: Record<string, ComponentValue[]> = {};
      let anySet = false;
      let important: boolean | null = null;
      let consistentImportant = true;

      const allLonghandsToCheck = getShorthandAllLonghands(shorthand);
      
      for (const lh of allLonghandsToCheck) {
        const item = self._getLonghandForContraction(lh);
        if (item && item.value.length > 0) {
          anySet = true;
          longhandValues[lh] = item.value;
          const isImp = item.important;
          if (important === null) important = isImp;
          else if (important !== isImp) {
            consistentImportant = false;
          }
        }
      }

      if (anySet && consistentImportant) {
        const lhKeys = Object.keys(longhandValues);
        const hasLogicalKey = lhKeys.some(lh => lh in LOGICAL_MAPPING);
        let wm = 'horizontal-tb';
        let dir = 'ltr';

        if (hasLogicalKey) {
          wm = self.getPropertyValue('writing-mode') || 'horizontal-tb';
          dir = self.getPropertyValue('direction') || 'ltr';

          // css-logical-1 #box
          // css-logical-1 #logical-shorthand-keyword
          // Conflict detection for dynamic logical property mappings
          const physicalToLogicalSet = new Map<string, { lh: string; decl: Declaration | null }>();
          for (const lh of lhKeys) {
            const physicalProp = resolveLogicalProperty(lh, wm, dir);
            const decl = self._getWinningDeclaration(lh);
            if (physicalToLogicalSet.has(physicalProp)) {
              const other = physicalToLogicalSet.get(physicalProp)!;
              const oneIsAll = decl?.name === 'all' || decl?.fromAll || other.decl?.name === 'all' || other.decl?.fromAll;
              if (!oneIsAll) {
                const val1 = serialize(longhandValues[lh]).trim();
                const val2 = serialize(longhandValues[other.lh]).trim();
                if (val1 !== val2) {
                  return '';
                }
              }
            }
            if (decl && decl.name !== 'all' && !decl.fromAll) {
              physicalToLogicalSet.set(physicalProp, { lh, decl });
            } else if (!physicalToLogicalSet.has(physicalProp)) {
              physicalToLogicalSet.set(physicalProp, { lh, decl });
            }
          }
        }

        const valuesForContractor: Record<string, ComponentValue[]> = {};
        let anyLogical = false;

        const allLonghands = shorthand.logicalLonghands 
          ? [...shorthand.longhands, ...shorthand.logicalLonghands]
          : shorthand.longhands;

        for (const lh of allLonghands) {
          const val = longhandValues[lh];
          if (val) {
            valuesForContractor[lh] = val;
            if (hasLogicalKey && resolveLogicalProperty(lh, wm, dir) !== lh) anyLogical = true;
            if (shorthand.logicalLonghands?.includes(lh)) anyLogical = true;
          }
        }

        const hasAllLonghands = shorthand.longhands.every(lh => valuesForContractor[lh]);
        const hasAllLogicals = shorthand.logicalLonghands?.every(lh => valuesForContractor[lh]);

        if (hasAllLonghands) {
          const res = shorthand.contract(valuesForContractor);
          if (res) return res;
        }

        if (hasAllLogicals && anyLogical) {
          let res = shorthand.contract(valuesForContractor);
          if (res && !res.startsWith('logical') && LOGICAL_SHORTHANDS.has(property) && !CSS_WIDE_KEYWORDS.has(res.trim().toLowerCase())) {
            res = 'logical ' + res;
          }
          return res || '';
        }
      }

      return self._serializeDirectShorthand(property, shorthand);
    } else if (property in SHORTHANDS_DATA) {
      const shorthandLonghands = (SHORTHANDS_DATA as Record<string, readonly string[]>)[property];
      if (shorthandLonghands && shorthandLonghands.length > 0) {
        let allCssWide: string | null = null;
        let allMatch = true;
        let firstPrio: string | null = null;
        let allSamePriority = true;

        for (const lh of shorthandLonghands) {
          if (map && !map.has('all') && !map.has(lh) && !(lh in SHORTHANDS) && !(lh in SHORTHANDS_DATA)) {
            allMatch = false;
            break;
          }
          const val = self.getPropertyValue(lh);
          if (!val) {
            allMatch = false;
            break;
          }
          const trimmed = val.trim().toLowerCase();
          if (CSS_WIDE_KEYWORDS.has(trimmed)) {
            const prio = self.getPropertyPriority(lh);
            if (firstPrio === null) firstPrio = prio;
            else if (firstPrio !== prio) allSamePriority = false;

            if (allCssWide === null) allCssWide = trimmed;
            else if (allCssWide !== trimmed) {
              allMatch = false;
              break;
            }
          } else {
            allMatch = false;
            break;
          }
        }

        if (allMatch && allCssWide && allSamePriority) {
          return allCssWide;
        }
      }
    }

    const winner = self._getWinningDeclaration(property);
    if (winner) {
      if (winner.name === 'all') {
        return serialize(winner.value);
      }
      const isCustom = winner.name.startsWith('--');
      if (isCustom) {
        if (winner.raw !== undefined && winner.raw.includes('/*')) {
          return winner.raw.trim();
        }
        const serialized = serialize(winner.value, isCustom).trim();
        if (serialized === '') {
          return ' ';
        }
        return serialized;
      }
      if (winner.name === 'font-family') {
        return serializeFontFamily(winner.value);
      }
      if (winner.name === 'flex-basis' && serialize(winner.value).trim() === '0') {
        return '0px';
      }
      return serialize(winner.value, isCustom);
    }
    return '';
  }

  /** @internal */
  protected _getExactWinningDeclaration(property: string): Declaration | null {
    const self = unwrapStyle(this);
    if (!property.startsWith('--')) property = property.toLowerCase();
    const exact = self._declMap.get(property);

    const isCoveredByAll = !property.startsWith('--') && property !== 'direction' && property !== 'unicode-bidi' && property !== 'all';
    const allDecl = isCoveredByAll ? self._declMap.get('all') : undefined;

    if (!allDecl) return exact ?? null;
    if (!exact) return allDecl;
    if (exact.important !== allDecl.important) return exact.important ? exact : allDecl;
    return self._declarations.indexOf(allDecl) > self._declarations.indexOf(exact) ? allDecl : exact;
  }

  /** @internal */
  protected _getWinningDeclaration(property: string): Declaration | null {
    const self = unwrapStyle(this);
    const exact = self._getExactWinningDeclaration(property);
    if (!exact) return null;

    const shorthands = LONGHAND_TO_SHORTHAND[property];
    if (shorthands && !exact.important) {
      let exactIdx = -1;
      for (const sh of shorthands) {
        const shDecl = self._declMap.get(sh);
        if (shDecl) {
          if (shDecl.important) {
            return null;
          }
          if (exactIdx === -1) exactIdx = self._declarations.indexOf(exact);
          const shIdx = self._declarations.indexOf(shDecl);
          if (shIdx > exactIdx) {
            return null;
          }
        }
      }
    }
    return exact;
  }

  // cssom-1 #dom-cssstyledeclaration-getpropertypriority
  getPropertyPriority(property: string): string {
    const self = unwrapStyle(this);
    if (!property.startsWith('--')) property = property.toLowerCase();
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      if (self.getPropertyValue(property) === '') {
        return '';
      }
      const checkSet = (longhands: readonly string[]) => {
        let importantCount = 0;
        const values: Record<string, ComponentValue[]> = {};
        for (const lh of longhands) {
          const item = self._getLonghandForContraction(lh);
          if (item && item.value.length > 0) {
            values[lh] = item.value;
            if (item.important) importantCount++;
          }
        }
        return { importantCount, values };
      };

      for (const set of [shorthand.longhands, shorthand.logicalLonghands, shorthand.physicalLonghands]) {
        if (set && set.length > 0) {
          const res = checkSet(set);
          if (res.importantCount === set.length && shorthand.contract(res.values)) {
            return 'important';
          }
        }
      }

      const directDecl = self._getWinningDeclaration(property);
      if (directDecl && directDecl.important) {
        return 'important';
      }
      return '';
    }

    const winner = self._getWinningDeclaration(property);
    return (winner && winner.important) ? 'important' : '';
  }

  // cssom-1 #dom-cssstyledeclaration-setproperty
  setProperty(property: string, value: string | null, priority: string = ''): void {
    this._setPropertyInternal(property, value, priority, true, false);
  }

  /** @internal */
  _setPropertyInternal(property: string, value: string | null, priority: string = '', notify: boolean = true, fromAll: boolean = false): void {
    // 1. If the readonly flag is set, then throw a NoModificationAllowedError exception.
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    if (property === '--') return;
    if (property.startsWith('--') && !this._allowCustomProperties) return;
    if (!property.startsWith('--')) property = property.toLowerCase();
    // 2. If property is not a custom property and not a supported CSS property, return.
    if (!property.startsWith('--') && !this._isPropertySupported(property)) {
      return;
    }

    // 4. If priority is not the empty string and is not an ASCII case-insensitive match for the string "important", then return.
    const normalizedPriority = (priority ?? '').trim().toLowerCase();
    if (normalizedPriority !== '' && normalizedPriority !== 'important') {
      return;
    }
    const isImportant = normalizedPriority === 'important';
    if (isImportant && !this._allowImportant) return;

    // 3. If value is the empty string (or null), invoke removeProperty(property) and return.
    if (value === null || value === '') {
      this.removeProperty(property);
      return;
    }

    if (value === undefined && !property.startsWith('--') && !CUSTOM_IDENT_PROPERTIES.has(property)) {
      return;
    }

    const valueStr = typeof value === 'string' ? value : String(value);
    const tokens = tokenize(valueStr, property === 'unicode-range');
    if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
      return;
    }
    const compVals = parseComponentValues(tokens);

    if (property.startsWith('--')) {
      if (!isValidDashedIdent(property) || !validateCustomPropertyValue(compVals)) {
        return;
      }
    } else {
      // css-syntax-3 #consume-declaration
      // css-variables-1 #using-variables
      if (!validateDeclarationValue(compVals)) {
        return;
      }
      if (ParseHooks.validatePropertyValue && !ParseHooks.validatePropertyValue(property, valueStr, value)) {
        return;
      }
    }

    if (property === 'all') {
      this._declarations = this._declarations.filter(d => d.name !== 'all');
      this._declMap.delete('all');
    }

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const hasVar = valueStr.includes('var(') || valueStr.includes('env(');
      if (!hasVar) {
        const expanded = shorthand.expand(compVals);
        if (expanded) {
          if (ParseHooks.validatePropertyValue) {
            for (const [lh, val] of Object.entries(expanded)) {
              if (!ParseHooks.validatePropertyValue(lh, serialize(val), val)) {
                return;
              }
            }
          }
          for (const [lh, val] of Object.entries(expanded)) {
            this._setPropertyInternal(lh, serialize(val), normalizedPriority, false, property === 'all' || fromAll);
          }
          if (notify) {
            const allLh = getShorthandAllLonghands(shorthand);
            this._rawDeclarations = this._rawDeclarations.filter(d => d.name !== property && !allLh.includes(d.name));
            this._rawDeclarations.push({ type: 'declaration', name: property, value: compVals, important: isImportant });
            this._onChange?.();
          }
          return;
        }
      }
      if (hasVar && validateDeclarationValue(compVals)) {
        for (const lh of shorthand.longhands) {
          this.removeProperty(lh);
        }
      } else if (!shorthand.stub) {
        return;
      }
    }

    const existing = this._declMap.get(property);
    if (property === 'unicode-range') {
      const assembled = assembleUnicodeRanges(compVals);
      if (!assembled) return;
      compVals.splice(0, compVals.length, ...assembled);
    }

    if (existing) {
      existing.value = compVals;
      existing.important = isImportant;
      existing.fromAll = fromAll;
      if (property.startsWith('--')) existing.raw = valueStr ?? undefined;
      
      // cssom-1 #set-a-css-declaration
      const idx = this._declarations.indexOf(existing);
      if (idx !== -1) {
        const info = LOGICAL_PROPERTY_INFO[property];
        const needsAppend = this._declarations.slice(idx + 1).some(d => {
          if (d.name === 'all') return true;
          if (!info) return false;
          const otherInfo = LOGICAL_PROPERTY_INFO[d.name];
          return otherInfo && otherInfo.group === info.group && otherInfo.logic !== info.logic;
        });
        if (needsAppend) {
          this._declarations.splice(idx, 1);
          this._declarations.push(existing);
        }
      }
    } else {
      const decl: Declaration = {
        type: 'declaration',
        name: property,
        value: compVals,
        important: isImportant,
        fromAll: fromAll || undefined,
        raw: property.startsWith('--') ? (valueStr ?? undefined) : undefined,
      };
      this._declarations.push(decl);
      this._declMap.set(property, decl);
    }

    if (notify) {
      this._rawDeclarations = this._rawDeclarations.filter(d => d.name !== property);
      this._rawDeclarations.push({
        type: 'declaration',
        name: property,
        value: compVals,
        important: isImportant,
        raw: property.startsWith('--') ? (valueStr ?? undefined) : undefined,
      });
      this._onChange?.();
    }
  }

  // cssom-1 #dom-cssstyledeclaration-removeproperty
  removeProperty(property: string): string {
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    if (!property.startsWith('--')) property = property.toLowerCase();
    if (property === 'all') {
      const value = this.getPropertyValue('all');
      const isRetained = (name: string) => name === 'direction' || name === 'unicode-bidi' || name.startsWith('--');
      const prevLen = this._declarations.length;
      this._rawDeclarations = this._rawDeclarations.filter(d => isRetained(d.name));
      this._declarations = this._declarations.filter(d => {
        if (!isRetained(d.name)) {
          this._declMap.delete(d.name);
          return false;
        }
        return true;
      });
      if (this._declarations.length !== prevLen) {
        this._onChange?.();
      }
      return value;
    }

    const shorthand = SHORTHANDS[property];
    const propsToRemove = shorthand
      ? [property, ...shorthand.longhands, ...(shorthand.logicalLonghands ?? [])]
      : [property];

    const value = this.getPropertyValue(property);
    const removeSet = new Set(propsToRemove);
    this._rawDeclarations = this._rawDeclarations.filter(d => !removeSet.has(d.name));
    let changed = false;
    for (const p of propsToRemove) {
      const decl = this._declMap.get(p);
      if (decl) {
        const idx = this._declarations.indexOf(decl);
        if (idx !== -1) this._declarations.splice(idx, 1);
        this._declMap.delete(p);
        changed = true;
      }
    }
    if (changed) {
      this._onChange?.();
    }
    return value;
  }

  get cssText() {
    if (this._declarations.length === 0) return '';
    return serializeDeclarations(this._declarations);
  }

  private _applyCssText(value: string): boolean {
    const tokens = tokenize(value);
    let newStyle;
    try {
      newStyle = parseStyleAttribute(tokens);
    } catch {
      return false;
    }
    if (!newStyle) return false;

    this._declarations.length = 0;
    this._rawDeclarations = newStyle._rawDeclarations.filter(d => {
      if (d.important && !this._allowImportant) return false;
      if (d.name.startsWith('--')) return this._allowCustomProperties;
      return this._isPropertySupported(d.name.toLowerCase());
    });
    this._declMap.clear();

    for (const d of newStyle._declarations) {
      this._ingestDeclaration(d, true, false);
    }
    return true;
  }

  set cssText(value: string) {
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    if (this._applyCssText(value)) {
      this._onChange?.(true);
    }
  }

  /** @internal */
  _isPropertySupported(property: string): boolean {
    return SUPPORTED_PROPERTIES.has(property);
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.length; i++) {
      yield this.item(i);
    }
  }
}

// WebIDL § 3.6, § 3.7
applyWebIDLInterface(CSSStyleDeclaration);

// css-animations-1 #keyframes
export class CSSKeyframeStyleDeclaration extends CSSStyleDeclaration {
  /** @internal */
  protected override get _filterDeclarationsInConstructor(): boolean {
    return true;
  }

  /** @internal */
  override _isPropertySupported(property: string): boolean {
    return property !== 'animation-name' && super._isPropertySupported(property);
  }
}

// css-fonts-4 #om-fontface
export class CSSFontFaceDescriptors extends CSSStyleDeclaration {
  declare src?: string; declare fontDisplay?: string; declare unicodeRange?: string;

  /** @internal */
  override _isPropertySupported(property: string): boolean {
    return super._isPropertySupported(property) || FONT_FACE_DESCRIPTORS.has(property);
  }
}

export const PAGE_DESCRIPTORS_INTERNAL = Symbol('CSSPageDescriptors.internal');

export class CSSPageDescriptors extends CSSStyleDeclaration {
  /** @internal */
  protected override get _filterDeclarationsInConstructor(): boolean { return true; }

  constructor(declarations?: Declaration[], internalToken?: symbol) {
    if (internalToken !== PAGE_DESCRIPTORS_INTERNAL) throw new TypeError('Illegal constructor');
    super(declarations);
  }

  declare margin: string; declare marginTop: string; declare marginRight: string; declare marginBottom: string; declare marginLeft: string;
  declare 'margin-top': string; declare 'margin-right': string; declare 'margin-bottom': string; declare 'margin-left': string;
  declare size: string; declare pageOrientation: string; declare 'page-orientation': string; declare marks: string; declare bleed: string; declare pageMarginSafety?: string;

  /** @internal */
  override _isPropertySupported(property: string): boolean { return PAGE_ALLOWED_PROPERTIES.has(property); }
}

// WebIDL #es-attributes
function defineDescriptorProperties(proto: CSSStyleDeclaration, dashedProps: Iterable<string>, skip?: string) {
  for (const cssProp of dashedProps) {
    if (cssProp === skip) continue;
    const desc: PropertyDescriptor = {
      get(this: CSSStyleDeclaration): string { return this.getPropertyValue(cssProp); },
      set(this: CSSStyleDeclaration, val: unknown): void { this.setProperty(cssProp, val === null || val === undefined ? '' : String(val)); },
      enumerable: true,
      configurable: true,
    };
    Object.defineProperty(proto, cssProp, desc);
    if (cssProp.includes('-')) {
      Object.defineProperty(proto, cssProp.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), desc);
    }
  }
}

defineDescriptorProperties(CSSPageDescriptors.prototype, PAGE_DESCRIPTOR_PROPERTIES);

// css-anchor-position-1 #om-position-try
export class CSSPositionTryDescriptors extends CSSStyleDeclaration {
  /** @internal */
  protected override get _filterDeclarationsInConstructor(): boolean { return true; }
  /** @internal */
  override get _allowCustomProperties(): boolean { return false; }
  /** @internal */
  protected override get _allowImportant(): boolean { return false; }

  constructor(declarations?: Declaration[], internalToken?: symbol) {
    if (internalToken !== PAGE_DESCRIPTORS_INTERNAL) throw new TypeError('Illegal constructor');
    super(declarations);
  }

  /** @internal */
  override _isPropertySupported(property: string): boolean { return POSITION_TRY_ALLOWED_PROPERTIES.has(property); }
}

defineDescriptorProperties(CSSPositionTryDescriptors.prototype, POSITION_TRY_ALLOWED_PROPERTIES, 'inset-area');

export class CSSMarginDescriptors extends CSSStyleDeclaration {}

applyWebIDLInterface(CSSFontFaceDescriptors);
applyWebIDLInterface(CSSPageDescriptors);
applyWebIDLInterface(CSSPositionTryDescriptors);
applyWebIDLInterface(CSSMarginDescriptors);

