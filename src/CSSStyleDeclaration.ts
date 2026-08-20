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
import { ParseHooks } from './parse-hooks.ts';
import { serialize, serializeDeclarations, serializeFontFamily } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import type { Declaration, CSSRule, ComponentValue } from './types.ts';
import { SHORTHANDS, LONGHAND_TO_SHORTHAND } from './shorthands.ts';
import { SHORTHANDS_DATA } from './data/gen/shorthands.ts';
import { resolveLogicalProperty } from './data/gen/LogicalMapping.ts';
import { SUPPORTED_PROPERTIES } from './data/gen/property-list.ts';
import { camelToDashed } from './utils.ts';
import { CSSStyleProperties } from './data/gen/properties.ts';

export function createStyleProxy<T extends CSSStyleDeclaration>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          const index = Number(prop);
          const decl = (t as unknown as { declarations: Declaration[] }).declarations[index];
          return decl ? decl.name : undefined;
        }
        
        if (prop in t && (typeof (t as unknown as Record<string, unknown>)[prop] !== 'undefined' || prop.startsWith('_'))) {
          return Reflect.get(t, prop, receiver);
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
      return Reflect.get(t, prop, receiver);
    },
    set(t, prop, value, receiver) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          return false;
        }
        if (prop in t && (typeof (t as unknown as Record<string, unknown>)[prop] !== 'undefined' || prop.startsWith('_'))) {
          return Reflect.set(t, prop, value, receiver);
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
      return Reflect.set(t, prop, value, receiver);
    },
    has(t, prop) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          const index = Number(prop);
          return index >= 0 && index < (t as unknown as { declarations: Declaration[] }).declarations.length;
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
    }
  }) as unknown as T;
}

export class CSSStyleDeclaration extends CSSStyleProperties {
  [index: number]: string;
  [property: string]: unknown;
  protected _declarations: Declaration[];
  private _declMap: Map<string, Declaration>;
  private _readonly: boolean;
  public parentRule: CSSRule | null = null;
  public _onChange: ((force?: boolean) => void) | null = null;

  constructor(declarations: Declaration[] = [], readonlyFlag: boolean = false) {
    super();
    this._declarations = [];
    this._declMap = new Map();
    this._readonly = readonlyFlag;
    const addDeclarationRecursive = (decl: Declaration) => {
      if (decl.name === '--') return;
      const normalizedName = decl.name.startsWith('--') ? decl.name : decl.name.toLowerCase();
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
                important: decl.important
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

  // cssom-1 § 6.4.1 #concept-declarations-specified-order
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

  get declarations() {
    return this._declarations;
  }

  get length() {
    return this._declarations.length;
  }

  item(index: number): string {
    return this._declarations[index]?.name || '';
  }

  // cssom-1 § 6.6.2 #dom-cssstyledeclaration-getpropertyvalue
  getPropertyValue(property: string): string {
    if (!property.startsWith('--')) property = property.toLowerCase();
    else if (!ParseHooks.isValidDashedIdent(property)) return '';
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

      const allLonghandsToCheck = [
        ...shorthand.longhands,
        ...(shorthand.logicalLonghands || []),
        ...(shorthand.physicalLonghands || [])
      ];
      
      for (const lh of allLonghandsToCheck) {
        const val = this.getPropertyValue(lh);
        if (val) {
          anySet = true;
          longhandValues[lh] = tokenize(val);
          const prio = this.getPropertyPriority(lh);
          if (important === null) important = prio === 'important';
          else if (important !== (prio === 'important')) {
            consistentImportant = false;
          }
        }
      }

      if (anySet && consistentImportant) {
        const wm = this.getPropertyValue('writing-mode') || 'horizontal-tb';
        const dir = this.getPropertyValue('direction') || 'ltr';

        // Conflict detection for dynamic logical property mappings
        const physicalToLogicalSet = new Map<string, { lh: string; decl: Declaration | null }>();
        for (const lh of Object.keys(longhandValues)) {
          const physicalProp = resolveLogicalProperty(lh, wm, dir);
          const decl = this._getWinningDeclaration(lh);
          if (physicalToLogicalSet.has(physicalProp)) {
            const other = physicalToLogicalSet.get(physicalProp)!;
            const val1 = serialize(longhandValues[lh]).trim();
            const val2 = serialize(longhandValues[other.lh]).trim();
            if (val1 !== val2) {
              return '';
            }
          }
          physicalToLogicalSet.set(physicalProp, { lh, decl });
        }

        const valuesForContractor: Record<string, ComponentValue[]> = {};
        let anyLogical = false;

        const allLonghands = shorthand.logicalLonghands 
          ? [...shorthand.longhands, ...shorthand.logicalLonghands]
          : shorthand.longhands;

        for (const lh of allLonghands) {
          const val = this.getPropertyValue(lh);
          if (val) {
            valuesForContractor[lh] = tokenize(val);
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
          if (res && !res.startsWith('logical') && ['margin', 'padding', 'inset', 'scroll-margin', 'scroll-padding'].includes(property)) {
            res = 'logical ' + res;
          }
          return res || '';
        }
      }

      const directDecl = this._getWinningDeclaration(property);
      if (directDecl) {
        const directIdx = this._declarations.indexOf(directDecl);
        const hasOverridingLonghand = this._declarations.some((d, idx) => {
          if (!shorthand.longhands.includes(d.name)) return false;
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

  private _getExactWinningDeclaration(property: string): Declaration | null {
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

  private _getWinningDeclaration(property: string): Declaration | null {
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

  // cssom-1 § 6.6.2 #dom-cssstyledeclaration-getpropertypriority
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
          const val = this.getPropertyValue(lh);
          if (val) {
            values[lh] = tokenize(val);
            if (this.getPropertyPriority(lh) === 'important') importantCount++;
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

  // cssom-1 § 6.7.1 #the-cssstyledeclaration-interface
  setProperty(property: string, value: string | null, priority: string = '', notify: boolean = true) {
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

    if (property.startsWith('--')) {
      if (!ParseHooks.isValidDashedIdent(property)) {
        return;
      }
      const tokens = tokenize(value);
      if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
        return;
      }
      const componentValues = ParseHooks.parseComponentValues(tokens);
      if (!ParseHooks.validateCustomPropertyValue(componentValues)) {
        return;
      }
    }

    const tokens = tokenize(value, property === 'unicode-range');
    if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
      return;
    }

    if (property === 'all') {
      this._declarations = this._declarations.filter(d => d.name !== 'all');
      this._declMap.delete('all');
    }

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const compVals = ParseHooks.parseComponentValues(tokens);
      const hasVar = value.includes('var(') || value.includes('env(');
      if (!hasVar) {
        const expanded = shorthand.expand(compVals);
        if (expanded) {
          for (const [lh, val] of Object.entries(expanded)) {
            this.setProperty(lh, serialize(val), normalizedPriority, false);
          }
          if (notify) {
            this._onChange?.();
          }
          return;
        }
      }
      if (hasVar && ParseHooks.validateDeclarationValue(compVals)) {
        for (const lh of shorthand.longhands) {
          this.removeProperty(lh);
        }
      } else if (!shorthand.stub) {
        return;
      }
    } else if (!property.startsWith('--')) {
      if (ParseHooks.validatePropertyValue && !ParseHooks.validatePropertyValue(property, value)) {
        return;
      }
    }

    const existing = this._declMap.get(property);

    const componentValues = ParseHooks.parseComponentValues(tokens);

    if (property === 'unicode-range') {
      const assembled = ParseHooks.assembleUnicodeRanges(componentValues);
      if (!assembled) {
        return;
      }
      componentValues.splice(0, componentValues.length, ...assembled);
    }

    // cssom-1 § 6.7.1 #set-a-css-declaration
    if (existing) {
      existing.value = componentValues;
      existing.important = isImportant;
      if (property.startsWith('--')) {
        existing.raw = value ?? undefined;
      }
      
      const idx = this._declarations.indexOf(existing);
      if (idx !== -1) {
        const hasAllLater = this._declarations.slice(idx + 1).some(d => d.name === 'all');
        if (hasAllLater) {
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
        raw: property.startsWith('--') ? (value ?? undefined) : undefined,
      };
      this._declarations.push(decl);
      this._declMap.set(property, decl);
    }

    if (notify) {
      this._onChange?.();
    }
  }

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

    const index = this._declarations.findIndex(d => d.name === property);
    if (index !== -1) {
      const decl = this._declarations[index];
      this._declarations.splice(index, 1);
      this._declMap.delete(property);
      let val = serialize(decl.value, property.startsWith('--'));
      if (property.startsWith('--') && decl.value.length === 0) {
        val = ' ';
      }
      this._onChange?.();
      return val;
    }
    return '';
  }

  get cssText() {
    if (this._declarations.length === 0) return '';
    return serializeDeclarations(this._declarations);
  }

  set cssText(value: string) {
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    const tokens = tokenize(value);
    let newStyle;
    try {
      newStyle = ParseHooks.parseStyleAttribute(tokens);
    } catch {
      return;
    }
    if (!newStyle) return;

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
                important: d.important
              });
            }
            continue;
          }
        }
      }
      this._addDeclaration(d);
    }

    this._onChange?.(true);
  }


  _isPropertySupported(property: string): boolean {
    return SUPPORTED_PROPERTIES.has(property);
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.length; i++) {
      yield this.item(i);
    }
  }
}
