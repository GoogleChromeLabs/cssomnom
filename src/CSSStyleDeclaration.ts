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
import { serialize, serializeDeclarations } from './serializer.ts';
import { tokenize } from './tokenizer.ts';
import type { Declaration, CSSRule, ComponentValue } from './types.ts';
import { SHORTHANDS } from './shorthands.ts';
import { resolveLogicalProperty, resolvePhysicalProperty } from './data/LogicalMapping.ts';
import { SUPPORTED_PROPERTIES } from './data/property-list.ts';
import { camelToDashed } from './utils.ts';
import { CSSStyleProperties } from './data/properties.ts';

export function createStyleProxy<T extends CSSStyleDeclaration>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string') {
        if (!isNaN(Number(prop))) {
          const index = Number(prop);
          const decl = (t as unknown as { declarations: Declaration[] }).declarations[index];
          return decl ? decl.name : undefined;
        }
        
        if (!(prop in t) || (typeof (t as unknown as Record<string, unknown>)[prop] === 'undefined' && !prop.startsWith('_'))) {
          const isCustomProp = prop.startsWith('--');
          let cssProp = prop;
          if (!isCustomProp) {
            if (prop === 'cssFloat') {
              cssProp = 'float';
            } else {
              cssProp = camelToDashed(prop);
            }
          }
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
        if (!(prop in t) || (typeof (t as unknown as Record<string, unknown>)[prop] === 'undefined' && !prop.startsWith('_'))) {
          const isCustomProp = prop.startsWith('--');
          let cssProp = prop;
          if (!isCustomProp) {
            if (prop === 'cssFloat') {
              cssProp = 'float';
            } else {
              cssProp = camelToDashed(prop);
            }
          }
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
        if (camelToDashed(prop) !== prop) return true;
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
  private _declarations: Declaration[];
  private _declMap: Map<string, Declaration>;
  private _readonly: boolean;
  public parentRule: CSSRule | null = null;

  constructor(declarations: Declaration[] = [], readonlyFlag: boolean = false) {
    super();
    this._declarations = [];
    this._declMap = new Map();
    this._readonly = readonlyFlag;
    const addDeclarationRecursive = (decl: Declaration) => {
      const shorthand = SHORTHANDS[decl.name];
      if (shorthand) {
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
      this._addDeclaration(decl);
    };

    for (const d of declarations) {
      addDeclarationRecursive(d);
    }
    
    return createStyleProxy(this);

  }

  private _addDeclaration(d: Declaration) {
    if (this._declMap.has(d.name)) {
      const existing = this._declMap.get(d.name)!;
      existing.value = d.value;
      existing.important = d.important;
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

  getPropertyValue(property: string): string {
    if (!property.startsWith('--')) property = property.toLowerCase();
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
        const physicalToLogicalSet = new Map<string, string>();
        for (const lh of Object.keys(longhandValues)) {
          const physicalProp = resolveLogicalProperty(lh, wm, dir);
          if (physicalToLogicalSet.has(physicalProp)) {
            const otherLh = physicalToLogicalSet.get(physicalProp)!;
            const val1 = serialize(longhandValues[lh]);
            const val2 = serialize(longhandValues[otherLh]);
            if (val1 !== val2) {
              return '';
            }
          }
          physicalToLogicalSet.set(physicalProp, lh);
        }

        

        const physicalSides = new Set<string>();
        for (const lh of shorthand.longhands) {
          physicalSides.add(resolveLogicalProperty(lh, wm, dir));
        }
        if (shorthand.logicalLonghands) {
          for (const lh of shorthand.logicalLonghands) {
            physicalSides.add(resolveLogicalProperty(lh, wm, dir));
          }
        }

        // Direct conflict detection for each physical side
        for (const side of physicalSides) {
          const logical = resolvePhysicalProperty(side, wm, dir);
          if (logical !== side) {
            const sideWin = this._getWinningDeclaration(side);
            const logWin = this._getWinningDeclaration(logical);
            if (sideWin && logWin && sideWin !== logWin) return '';
          }
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
      if (isCustom && winner.value.length === 0) {
        return ' ';
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
    return this._getExactWinningDeclaration(property);
  }

  private _resolvePhysicalLogicalWinner(ph: string, lh: string): { winner: Declaration | null, prop: string } {
    const phWinner = this._getWinningDeclaration(ph);
    const lhWinner = this._getWinningDeclaration(lh);

    if (phWinner && lhWinner) {
      if (phWinner.important && !lhWinner.important) {
        return { winner: phWinner, prop: ph };
      } else if (!phWinner.important && lhWinner.important) {
        return { winner: lhWinner, prop: lh };
      } else {
        const phIdx = this._declarations.indexOf(phWinner);
        const lhIdx = this._declarations.indexOf(lhWinner);
        if (phIdx >= lhIdx) {
          return { winner: phWinner, prop: ph };
        } else {
          return { winner: lhWinner, prop: lh };
        }
      }
    } else if (phWinner) {
      return { winner: phWinner, prop: ph };
    } else if (lhWinner) {
      return { winner: lhWinner, prop: lh };
    }
    return { winner: null, prop: '' };
  }

  getPropertyPriority(property: string): string {
    if (!property.startsWith('--')) property = property.toLowerCase();
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      let physicals: readonly string[] = [];
      let logicals: readonly string[] = [];

      if (shorthand.logicalLonghands) {
        physicals = shorthand.longhands;
        logicals = shorthand.logicalLonghands;
      } else if (shorthand.physicalLonghands) {
        physicals = shorthand.physicalLonghands;
        logicals = shorthand.longhands;
      }

      if (physicals.length > 0 && logicals.length > 0 && physicals.length === logicals.length) {
        const resolvedWinners: Record<string, Declaration> = {};
        let anySet = false;
        
        for (let i = 0; i < physicals.length; i++) {
          const ph = physicals[i];
          const lh = logicals[i];
          const { winner, prop } = this._resolvePhysicalLogicalWinner(ph, lh);
          if (winner) {
            anySet = true;
            resolvedWinners[prop] = winner;
          }
        }

        if (anySet) {
          const keys = Object.keys(resolvedWinners);
          const hasPhysical = keys.some(k => physicals.includes(k));
          const hasLogical = keys.some(k => logicals.includes(k));
          
          if (hasPhysical && hasLogical) {
            return '';
          }

          if (keys.length === physicals.length) {
            const allImportant = keys.every(k => resolvedWinners[k].important);
            if (allImportant) {
              const values: Record<string, ComponentValue[]> = {};
              for (const k of keys) {
                values[k] = resolvedWinners[k].value;
              }
              if (shorthand.contract(values)) {
                return 'important';
              }
            }
          }
          return '';
        }
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

  setProperty(property: string, value: string | null, priority: string = '') {
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    if (property === '--') return;
    if (!property.startsWith('--')) property = property.toLowerCase();
    if (!property.startsWith('--') && !this._isPropertySupported(property)) {
      return;
    }
    if (priority !== '' && priority.toLowerCase() !== 'important') {
      return;
    }
    if (value === null || value === '') {
      this.removeProperty(property);
      return;
    }

    const tokens = tokenize(value);
    if (tokens.some(t => t.type === 'bad-string' || t.type === 'bad-url')) {
      return;
    }

    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const expanded = shorthand.expand(ParseHooks.parseComponentValues(tokens));
      if (expanded) {
        for (const [lh, val] of Object.entries(expanded)) {
          this.setProperty(lh, serialize(val), priority);
        }
        return;
      }
      if (!shorthand.stub) {
        return;
      }
    }

    const existing = this._declMap.get(property);
    
    if (property.startsWith('--')) {
      const componentValues = ParseHooks.parseComponentValues(tokens);
      if (!ParseHooks.validateCustomPropertyValue(componentValues)) {
        return;
      }
    }

    if (existing) {
      existing.value = tokens;
      existing.important = priority === 'important';
      
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
        value: tokens,
        important: priority === 'important',
      };
      this._declarations.push(decl);
      this._declMap.set(property, decl);
    }
  }

  removeProperty(property: string): string {
    if (this._readonly) {
      throw new DOMException('Modification is disallowed', 'NoModificationAllowedError');
    }
    if (!property.startsWith('--')) property = property.toLowerCase();
    const shorthand = SHORTHANDS[property];
    if (shorthand) {
      const value = this.getPropertyValue(property);
      const allLh = new Set([
        ...shorthand.longhands,
        ...(shorthand.logicalLonghands || [])
      ]);
      for (const lh of allLh) {
        this.removeProperty(lh);
      }
      const index = this._declarations.findIndex(d => d.name === property);
      if (index !== -1) {
        this._declarations.splice(index, 1);
        this._declMap.delete(property);
      }
      return value;
    }

    if (property === 'all') {
      const value = this.getPropertyValue('all');
      for (let i = this._declarations.length - 1; i >= 0; i--) {
        const d = this._declarations[i];
        if (d.name !== 'direction' && d.name !== 'unicode-bidi' && !d.name.startsWith('--')) {
          this._declarations.splice(i, 1);
          this._declMap.delete(d.name);
        }
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
    this._declarations.length = 0;
    this._declMap.clear();
    const tokens = tokenize(value);
    const newStyle = ParseHooks.parseStyleAttribute(tokens);
    
    for (const d of newStyle.declarations) {
      if (this._declMap.has(d.name)) {
        const existing = this._declMap.get(d.name)!;
        existing.value = d.value;
        existing.important = d.important;
      } else {
        this._declarations.push(d);
        this._declMap.set(d.name, d);
      }
    }
  }

  protected _isPropertySupported(property: string): boolean {
    return SUPPORTED_PROPERTIES.has(property);
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.length; i++) {
      yield this.item(i);
    }
  }
}
