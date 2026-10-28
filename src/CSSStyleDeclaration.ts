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
import { SHORTHANDS, LONGHAND_TO_SHORTHAND, getShorthandAllLonghands } from './shorthands.ts';
import { SHORTHANDS_DATA } from './data/gen/shorthands.ts';
import { resolveLogicalProperty, LOGICAL_PROPERTY_INFO } from './data/gen/LogicalMapping.ts';
import { SUPPORTED_PROPERTIES, CUSTOM_IDENT_PROPERTIES } from './data/gen/property-list.ts';
import { camelToDashed } from './utils.ts';
import { CSSStyleProperties } from './data/gen/properties.ts';
import { applyWebIDLInterface } from './webidl.ts';

function createStyleProxy<T extends CSSStyleDeclaration>(target: T): T {
  return new Proxy(target, {
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
          return t.getPropertyValue(prop);
        }

        const isCustomProp = prop.startsWith('--');
        let cssProp = prop;
        if (!isCustomProp) {
          if (prop === 'cssFloat') {
            cssProp = 'float';
          } else {
            cssProp = camelToDashed(prop);
          }
        }
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
          t.setProperty(prop, value);
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
        for (const s of Object.values(SHORTHANDS)) {
          if (s.longhands.includes(prop)) return true;
        }
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
}

export class CSSStyleDeclaration extends CSSStyleProperties {
  [index: number]: string;
  [property: string]: unknown;
  /** @internal */ _declarations: Declaration[];
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

  constructor(
    parentRuleOrDeclarations?: CSSRule | Declaration[] | null,
    onChangeOrReadonly?: ((force?: boolean) => void) | boolean | null
  ) {
    super();
    this._declarations = [];
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

    const addDeclarationRecursive = (decl: Declaration) => {
      if (decl.name === '--') return;
      const normalizedName = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
      if (this._filterDeclarationsInConstructor && !normalizedName.startsWith('--') && !this._isPropertySupported(normalizedName)) {
        return;
      }
      decl.name = normalizedName;
      const shorthand = SHORTHANDS[decl.name];
      if (shorthand) {
        const hasVar = serialize(decl.value).includes('var(') || serialize(decl.value).includes('env(');
        if (!hasVar) {
          const expanded = shorthand.expand(decl.value);
          if (expanded) {
            for (const [lh, val] of Object.entries(expanded)) {
              addDeclarationRecursive({
                type: 'declaration',
                name: lh,
                value: val,
                important: decl.important,
                fromAll: decl.name === 'all' || decl.fromAll,
              });
            }
            return;
          }
        }
      }
      this._addDeclaration(decl);
    };

    for (const d of declarations) {
      addDeclarationRecursive(d);
    }
    
    return createStyleProxy(this);

  }

  // cssom-1 #concept-declarations-specified-order
  private _addDeclaration(d: Declaration) {
    const shorthand = SHORTHANDS[d.name];
    if (shorthand) {
      for (const lh of shorthand.longhands) {
        if (this._declMap.has(lh)) {
          const existing = this._declMap.get(lh)!;
          if (existing.important && !d.important) {
            continue;
          }
          const index = this._declarations.indexOf(existing);
          if (index !== -1) {
            this._declarations.splice(index, 1);
          }
          this._declMap.delete(lh);
        }
      }
    }
    if (this._declMap.has(d.name)) {
      const existing = this._declMap.get(d.name)!;
      if (existing.important && !d.important) {
        return;
      }
      const index = this._declarations.indexOf(existing);
      if (index !== -1) {
        this._declarations.splice(index, 1);
      }
      this._declarations.push(d);
      this._declMap.set(d.name, d);
    } else {
      this._declarations.push(d);
      this._declMap.set(d.name, d);
    }
  }

  get length() {
    return this._declarations.length;
  }

  item(index: number): string {
    return this._declarations[index]?.name || '';
  }

  /** @internal */
  protected _getLonghandForContraction(lh: string): { value: ComponentValue[]; important: boolean } | null {
    const decl = this._getWinningDeclaration(lh);
    if (decl && decl.value.length > 0) {
      return { value: decl.value, important: decl.important };
    }
    return null;
  }

  // cssom-1 #dom-cssstyledeclaration-getpropertyvalue
  getPropertyValue(property: string): string {
    if (!property.startsWith('--')) property = property.toLowerCase();
    else if (!isValidDashedIdent(property)) return '';
    const shorthandLonghands = SHORTHANDS[property]?.longhands || (SHORTHANDS_DATA as Record<string, readonly string[]>)[property];
    if (shorthandLonghands && shorthandLonghands.length > 0) {
      let allCssWide: string | null = null;
      let allMatch = true;
      let firstPrio: string | null = null;
      let allSamePriority = true;

      for (const lh of shorthandLonghands) {
        const val = this.getPropertyValue(lh);
        if (!val) {
          allMatch = false;
          break;
        }
        const prio = this.getPropertyPriority(lh);
        if (firstPrio === null) firstPrio = prio;
        else if (firstPrio !== prio) allSamePriority = false;

        const trimmed = val.trim().toLowerCase();
        if (['initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(trimmed)) {
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

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const longhandValues: Record<string, ComponentValue[]> = {};
      let anySet = false;
      let important: boolean | null = null;
      let consistentImportant = true;

      const allLonghandsToCheck = getShorthandAllLonghands(shorthand);
      
      for (const lh of allLonghandsToCheck) {
        const item = this._getLonghandForContraction(lh);
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
        const wm = this.getPropertyValue('writing-mode') || 'horizontal-tb';
        const dir = this.getPropertyValue('direction') || 'ltr';

        // css-logical-1 #box
        // css-logical-1 #logical-shorthand-keyword
        // Conflict detection for dynamic logical property mappings
        const physicalToLogicalSet = new Map<string, { lh: string; decl: Declaration | null }>();
        for (const lh of Object.keys(longhandValues)) {
          const physicalProp = resolveLogicalProperty(lh, wm, dir);
          const decl = this._getWinningDeclaration(lh);
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

        const valuesForContractor: Record<string, ComponentValue[]> = {};
        let anyLogical = false;

        const allLonghands = shorthand.logicalLonghands 
          ? [...shorthand.longhands, ...shorthand.logicalLonghands]
          : shorthand.longhands;

        for (const lh of allLonghands) {
          const val = longhandValues[lh];
          if (val) {
            valuesForContractor[lh] = val;
            if (resolveLogicalProperty(lh, wm, dir) !== lh) anyLogical = true;
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
          const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
          const LOGICAL_SHORTHANDS = new Set([
            'margin', 'padding', 'inset', 'scroll-margin', 'scroll-padding',
            'border-width', 'border-style', 'border-color'
          ]);
          if (res && !res.startsWith('logical') && LOGICAL_SHORTHANDS.has(property) && !CSS_WIDE_KEYWORDS.has(res.trim().toLowerCase())) {
            res = 'logical ' + res;
          }
          return res || '';
        }
      }

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

    const winner = this._getWinningDeclaration(property);
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
    if (!property.startsWith('--')) property = property.toLowerCase();
    const isCustom = property.startsWith('--');
    const isCoveredByAll = !isCustom && property !== 'direction' && property !== 'unicode-bidi' && property !== 'all';

    let winner: Declaration | null = null;

    for (let i = this._declarations.length - 1; i >= 0; i--) {
      const d = this._declarations[i];
      const isMatch = d.name === property;
      const isAll = d.name === 'all' && isCoveredByAll;

      if (isMatch || isAll) {
        if (!winner || (d.important && !winner.important)) {
          winner = d;
          if (winner.important) break;
        }
      }
    }
    return winner;
  }

  /** @internal */
  protected _getWinningDeclaration(property: string): Declaration | null {
    const exact = this._getExactWinningDeclaration(property);
    const shorthands = LONGHAND_TO_SHORTHAND[property];
    if (shorthands) {
      for (const sh of shorthands) {
        const shDecl = this._getExactWinningDeclaration(sh);
        if (shDecl) {
          if (shDecl.important && (!exact || !exact.important)) {
            return null;
          }
          if (exact && !exact.important && !shDecl.important) {
            const shIdx = this._declarations.indexOf(shDecl);
            const exactIdx = this._declarations.indexOf(exact);
            if (shIdx > exactIdx) {
              return null;
            }
          }
        }
      }
    }
    return exact;
  }

  // cssom-1 #dom-cssstyledeclaration-getpropertypriority
  getPropertyPriority(property: string): string {
    if (!property.startsWith('--')) property = property.toLowerCase();
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      if (this.getPropertyValue(property) === '') {
        return '';
      }
      const checkSet = (longhands: readonly string[]) => {
        let importantCount = 0;
        const values: Record<string, ComponentValue[]> = {};
        for (const lh of longhands) {
          const item = this._getLonghandForContraction(lh);
          if (item && item.value.length > 0) {
            values[lh] = item.value;
            if (item.important) importantCount++;
          }
        }
        return { importantCount, values };
      };

      const primaryResult = checkSet(shorthand.longhands);
      if (primaryResult.importantCount === shorthand.longhands.length && shorthand.longhands.length > 0) {
        if (shorthand.contract(primaryResult.values)) {
          return 'important';
        }
      }

      if (shorthand.logicalLonghands) {
        const logicalResult = checkSet(shorthand.logicalLonghands);
        if (logicalResult.importantCount === shorthand.logicalLonghands.length && shorthand.logicalLonghands.length > 0) {
          if (shorthand.contract(logicalResult.values)) {
            return 'important';
          }
        }
      }

      if (shorthand.physicalLonghands) {
        const physicalResult = checkSet(shorthand.physicalLonghands);
        if (physicalResult.importantCount === shorthand.physicalLonghands.length && shorthand.physicalLonghands.length > 0) {
          if (shorthand.contract(physicalResult.values)) {
            return 'important';
          }
        }
      }

      const directDecl = this._getWinningDeclaration(property);
      if (directDecl && directDecl.important) {
        return 'important';
      }
      return '';
    }

    const winner = this._getWinningDeclaration(property);
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

    // 3. If value is the empty string (or null), invoke removeProperty(property) and return.
    if (value === null || value === '') {
      this.removeProperty(property);
      return;
    }

    if (value === undefined && !property.startsWith('--') && !CUSTOM_IDENT_PROPERTIES.has(property)) {
      return;
    }

    const valueStr = typeof value === 'string' ? value : String(value);

    if (property.startsWith('--')) {
      if (!isValidDashedIdent(property)) {
        return;
      }
      const tokens = tokenize(valueStr);
      if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
        return;
      }
      const componentValues = parseComponentValues(tokens);
      if (!validateCustomPropertyValue(componentValues)) {
        return;
      }
    }

    const tokens = tokenize(valueStr, property === 'unicode-range');
    if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
      return;
    }

    if (property === 'all') {
      this._declarations = this._declarations.filter(d => d.name !== 'all');
      this._declMap.delete('all');
    }

    const compVals = parseComponentValues(tokens);
    if (!property.startsWith('--')) {
      // css-syntax-3 #consume-declaration
      // css-variables-1 #using-variables
      if (!validateDeclarationValue(compVals)) {
        return;
      }
      if (ParseHooks.validatePropertyValue && !ParseHooks.validatePropertyValue(property, valueStr, value)) {
        return;
      }
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

    const componentValues = parseComponentValues(tokens);

    if (property === 'unicode-range') {
      const assembled = assembleUnicodeRanges(componentValues);
      if (!assembled) {
        return;
      }
      componentValues.splice(0, componentValues.length, ...assembled);
    }

    if (existing) {
      existing.value = componentValues;
      existing.important = isImportant;
      existing.fromAll = fromAll;
      if (property.startsWith('--')) {
        existing.raw = valueStr ?? undefined;
      }
      
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
        value: componentValues,
        important: isImportant,
        fromAll: fromAll || undefined,
        raw: property.startsWith('--') ? (valueStr ?? undefined) : undefined,
      };
      this._declarations.push(decl);
      this._declMap.set(property, decl);
    }

    if (notify) {
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
      let changed = false;
      for (let i = this._declarations.length - 1; i >= 0; i--) {
        const d = this._declarations[i];
        if (d.name !== 'direction' && d.name !== 'unicode-bidi' && !d.name.startsWith('--')) {
          this._declarations.splice(i, 1);
          this._declMap.delete(d.name);
          changed = true;
        }
      }
      if (changed) {
        this._onChange?.();
      }
      return value;
    }

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const value = this.getPropertyValue(property);
      const allLh = new Set([
        ...shorthand.longhands,
        ...(shorthand.logicalLonghands || [])
      ]);
      let changed = false;
      for (const lh of allLh) {
        if (this._declMap.has(lh)) {
          const index = this._declarations.findIndex(d => d.name === lh);
          if (index !== -1) {
            this._declarations.splice(index, 1);
            this._declMap.delete(lh);
            changed = true;
          }
        }
      }
      const index = this._declarations.findIndex(d => d.name === property);
      if (index !== -1) {
        this._declarations.splice(index, 1);
        this._declMap.delete(property);
        changed = true;
      }
      if (changed) {
        this._onChange?.();
      }
      return value;
    }

    const value = this.getPropertyValue(property);
    const index = this._declarations.findIndex(d => d.name === property);
    if (index !== -1) {
      this._declarations.splice(index, 1);
      this._declMap.delete(property);
      this._onChange?.();
      return value;
    }
    return '';
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
    this._declMap.clear();

    for (const d of newStyle._declarations) {
      if (d.name === '--') continue;
      const normalizedName = d.name.startsWith('--') ? d.name : d.name.toLowerCase();
      if (!normalizedName.startsWith('--') && !this._isPropertySupported(normalizedName)) {
        continue;
      }
      d.name = normalizedName;
      const shorthand = SHORTHANDS[d.name];
      if (shorthand) {
        const hasVar = serialize(d.value).includes('var(') || serialize(d.value).includes('env(');
        if (!hasVar) {
          const expanded = shorthand.expand(d.value);
          if (expanded) {
            for (const [lh, val] of Object.entries(expanded)) {
              this._addDeclaration({
                type: 'declaration',
                name: lh,
                value: val,
                important: d.important,
                fromAll: d.name === 'all' || d.fromAll,
              });
            }
            continue;
          }
        }
      }
      this._addDeclaration(d);
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

// cssom-1 #the-cssstyledeclaration-interface
// WebIDL #interface-prototype-object
Object.defineProperty(CSSStyleDeclaration.prototype, Symbol.toStringTag, {
  value: 'CSSStyleDeclaration',
  configurable: true,
  writable: false,
  enumerable: false
});

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

const FONT_FACE_DESCRIPTORS = new Set([
  'ascent-override', 'descent-override', 'font-display', 'font-family',
  'font-stretch', 'font-style', 'font-weight', 'font-feature-settings',
  'font-variation-settings', 'line-gap-override', 'size-adjust', 'src',
  'unicode-range'
]);

// css-fonts-4 #om-fontface
export class CSSFontFaceDescriptors extends CSSStyleDeclaration {
  declare src?: string;
  declare fontDisplay?: string;
  declare unicodeRange?: string;

  // WebIDL #interface-prototype-object
  get [Symbol.toStringTag](): string {
    return 'CSSFontFaceDescriptors';
  }

  /** @internal */
  override _isPropertySupported(property: string): boolean {
    return super._isPropertySupported(property) || FONT_FACE_DESCRIPTORS.has(property);
  }
}

// css-page-3 #page-properties
const PAGE_ALLOWED_PROPERTIES = new Set<string>([
  'size', 'page-orientation', 'marks', 'bleed', 'page-margin-safety', 'margin',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-block-start', 'margin-block-end',
  'margin-inline', 'margin-inline-start', 'margin-inline-end',
  'page-break-before', 'page-break-after', 'page-break-inside',
  'break-before', 'break-after', 'break-inside', 'orphans', 'widows',
  'page', 'counter-increment', 'counter-reset', 'counter-set', 'quotes',
]);

export const PAGE_DESCRIPTORS_INTERNAL = Symbol('CSSPageDescriptors.internal');

export class CSSPageDescriptors extends CSSStyleDeclaration {
  /** @internal */
  protected override get _filterDeclarationsInConstructor(): boolean {
    return true;
  }

  constructor(declarations?: Declaration[], internalToken?: symbol) {
    if (internalToken !== PAGE_DESCRIPTORS_INTERNAL) {
      throw new TypeError('Illegal constructor');
    }
    super(declarations);
  }

  declare margin: string;
  declare marginTop: string;
  declare marginRight: string;
  declare marginBottom: string;
  declare marginLeft: string;
  declare 'margin-top': string;
  declare 'margin-right': string;
  declare 'margin-bottom': string;
  declare 'margin-left': string;
  declare size: string;
  declare pageOrientation: string;
  declare 'page-orientation': string;
  declare marks: string;
  declare bleed: string;
  declare pageMarginSafety?: string;

  /** @internal */
  override _isPropertySupported(property: string): boolean {
    return PAGE_ALLOWED_PROPERTIES.has(property);
  }

  get [Symbol.toStringTag](): string {
    return 'CSSPageDescriptors';
  }
}

const PAGE_DESCRIPTOR_PROPERTIES = [
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'size', 'pageOrientation', 'page-orientation', 'marks', 'bleed',
] as const;

// WebIDL #es-attributes
for (const prop of PAGE_DESCRIPTOR_PROPERTIES) {
  const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
  Object.defineProperty(CSSPageDescriptors.prototype, prop, {
    get(this: unknown): string {
      return (this as CSSPageDescriptors).getPropertyValue(cssProp);
    },
    set(this: unknown, val: unknown): void {
      (this as CSSPageDescriptors).setProperty(cssProp, val === null || val === undefined ? '' : String(val));
    },
    enumerable: true,
    configurable: true,
  });
}

export class CSSMarginDescriptors extends CSSStyleDeclaration {}

applyWebIDLInterface(CSSFontFaceDescriptors);
applyWebIDLInterface(CSSPageDescriptors);
applyWebIDLInterface(CSSMarginDescriptors);

