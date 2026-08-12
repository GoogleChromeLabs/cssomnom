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
import type { ComponentValue, CSSFunction } from './types.ts';
import { CSSNumericValue, CSSUnitValue, CSSMathSum, CSSMathProduct, CSSMathNegate, CSSMathInvert, CSSMathMin, CSSMathMax, CSSMathClamp, CSSMathFunction, CSSMathRound, CSSKeywordValue, type CSSNumericType } from './typed-om.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds, type CSSUnit } from './data/gen/units.ts';

import { MATH_FUNCTIONS } from './data/gen/math-functions.ts';


function isSameType(a: CSSNumericType, b: CSSNumericType): boolean {
  if (a.percentHint !== b.percentHint) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'percentHint') continue;
    const valA = (a as Record<string, number | undefined>)[key] || 0;
    const valB = (b as Record<string, number | undefined>)[key] || 0;
    if (valA !== valB) return false;
  }
  return true;
}

// 10 Mathematical Expressions
export function parseMathFunction(name: string, values: ComponentValue[]): CSSNumericValue | null {
  // Remove whitespace and EOF tokens
  const tokens = values.filter(v => v.type !== 'whitespace' && v.type !== 'EOF');
  
  let index = 0;
  
  function consumeSum(): CSSNumericValue | null {
    let left = consumeProduct();
    if (!left) return null;
    
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === 'delim' && (token.value === '+' || token.value === '-')) {
        index++;
        const right = consumeProduct();
        if (!right) return null;
        
        if (token.value === '+') {
          left = new CSSMathSum(left, right);
        } else {
          left = new CSSMathSum(left, new CSSMathNegate(right));
        }
      } else {
        break;
      }
    }
    return left;
  }
  
  function consumeProduct(): CSSNumericValue | null {
    let left = consumeValue();
    if (!left) return null;
    
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === 'delim' && (token.value === '*' || token.value === '/')) {
        index++;
        const right = consumeValue();
        if (!right) return null;
        
        if (token.value === '*') {
          left = new CSSMathProduct(left, right);
        } else {
          left = new CSSMathProduct(left, new CSSMathInvert(right));
        }
      } else {
        break;
      }
    }
    return left;
  }
  
  function consumeValue(): CSSNumericValue | null {
    if (index >= tokens.length) return null;
    const token = tokens[index];
    index++;
    
    if (token.type === 'number') {
      return new CSSUnitValue(token.value, 'number');
    }
    if (token.type === 'percentage') {
      return new CSSUnitValue(token.value, 'percent');
    }
    if (token.type === 'dimension') {
      const unit = token.unit;
      if (!(unit in unitToBase)) {
        throw new DOMException(`Invalid unit: ${unit}`, 'SyntaxError');
      }
      return new CSSUnitValue(token.value, unit as CSSUnit);
    }

    if (token.type === 'simple-block' && token.associatedToken.type === '(') {
      return parseMathFunction('calc', token.value);
    }
    if (token.type === 'function') {
      const functionToken = token as CSSFunction;
      return parseMathFunction(functionToken.name, functionToken.value);
    }
    
    if (token.type === 'ident') {
      const val = token.value.toLowerCase();
      if (val === 'infinity') {
        return new CSSUnitValue(Infinity, 'number');
      }
      if (val === '-infinity') {
        return new CSSUnitValue(-Infinity, 'number');
      }
      if (val === 'nan') {
        return new CSSUnitValue(NaN, 'number');
      }
      if (val === 'e') {
        return new CSSUnitValue(Math.E, 'number');
      }
      if (val === 'pi') {
        return new CSSUnitValue(Math.PI, 'number');
      }
    }

    if (token.type === 'delim' && (token.value === '+' || token.value === '-')) {
      const val = consumeValue();
      if (!val) return null;
      if (token.value === '-') {
        return new CSSMathNegate(val);
      }
      return val;
    }

    return null;
  }
  
  const nameLower = name.toLowerCase();
  
  // 10.1 Basic Arithmetic: calc()
  if (nameLower === 'calc') {
    const result = consumeSum();
    if (index < tokens.length) return null;
    return result;
  }
  
  // 10.2 Comparison Functions: min(), max(), and clamp()
  if (nameLower === 'min' || nameLower === 'max') {
    const args: CSSNumericValue[] = [];
    const firstArg = consumeSum();
    if (!firstArg) return null;
    args.push(firstArg);
    
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === 'comma') {
        index++;
        const nextArg = consumeSum();
        if (!nextArg) return null;
        args.push(nextArg);
      } else {
        break;
      }
    }
    
    if (index < tokens.length) return null;
    
    const result = nameLower === 'min' ? new CSSMathMin(...args) : new CSSMathMax(...args);
    return result;
  }
  
  // 10.2 Comparison Functions: min(), max(), and clamp()
  if (nameLower === 'clamp') {
    let lower: CSSNumericValue | CSSKeywordValue | null = null;
    let valueNode: CSSNumericValue | null = null;
    let upper: CSSNumericValue | CSSKeywordValue | null = null;
    
    // Parse first argument (min)
    {
      const token = tokens[index];
      if (token && token.type === 'ident' && token.value.toLowerCase() === 'none') {
        index++;
        lower = new CSSKeywordValue('none');
      } else {
        lower = consumeSum();
      }
    }

    if (!lower) return null;
    
    // Parse second argument (value)
    if (index >= tokens.length || tokens[index].type !== 'comma') return null;
    index++;
    valueNode = consumeSum();
    if (!valueNode) return null;
    
    // Parse third argument (max)
    if (index >= tokens.length || tokens[index].type !== 'comma') return null;
    index++;
    {
      const token = tokens[index];
      if (token && token.type === 'ident' && token.value.toLowerCase() === 'none') {
        index++;
        upper = new CSSKeywordValue('none');
      } else {
        upper = consumeSum();
      }
    }

    if (!upper) return null;
    
    if (index < tokens.length) return null;
    
    const result = new CSSMathClamp(lower, valueNode, upper);
    return result;
  }

  if (nameLower === 'round') {
    let strategy = 'nearest';
    const firstToken = tokens[index];
    if (firstToken && firstToken.type === 'ident') {
      const val = firstToken.value.toLowerCase();
      if (['nearest', 'up', 'down', 'to-zero', 'line-width'].includes(val)) {
        strategy = val;
        index++;
        if (index >= tokens.length || tokens[index].type !== 'comma') {
           return null;
        }
        index++; // consume comma
      }
    }

    const value = consumeSum();
    if (!value) return null;

    let precision: CSSNumericValue | null = null;
    if (index < tokens.length) {
      const token = tokens[index];
      if (token.type === 'comma') {
        index++;
        precision = consumeSum();
        if (!precision) return null;
      }
    }

    if (index < tokens.length) return null;

    let precisionOmitted = false;
    if (!precision) {
      precision = new CSSUnitValue(1, 'number');
      precisionOmitted = true;
    }

    return new CSSMathRound(strategy, value, precision, precisionOmitted);
  }

  // 10.3 Trigonometric Functions: sin(), cos(), tan(), etc.
  // 10.4 Exponential Functions: pow(), sqrt(), exp(), log(), hypot()
  // 10.5 Sign-Related Functions: abs(), sign()
  // 10.6 Stepped-Value Functions: round(), mod(), rem()
  if (MATH_FUNCTIONS.includes(nameLower)) {

    const args: CSSNumericValue[] = [];
    const firstArg = consumeSum();
    if (!firstArg) return null;
    args.push(firstArg);

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === 'comma') {
        index++;
        const nextArg = consumeSum();
        if (!nextArg) return null;
        args.push(nextArg);
      } else {
        break;
      }
    }

    if (index < tokens.length) return null;

    // Strict arity requirements
    let minArgs = 1;
    let maxArgs = 1;

    switch (nameLower) {
      case 'atan2':
      case 'mod':
      case 'pow':
      case 'rem':
        minArgs = 2;
        maxArgs = 2;
        break;
      case 'hypot':
        minArgs = 1;
        maxArgs = Infinity;
        break;
      case 'log':
        minArgs = 1;
        maxArgs = 2;
        break;
      case 'abs':
      case 'acos':
      case 'asin':
      case 'atan':
      case 'cos':
      case 'exp':
      case 'sign':
      case 'sin':
      case 'sqrt':
      case 'tan':
        minArgs = 1;
        maxArgs = 1;
        break;
    }

    if (args.length < minArgs || args.length > maxArgs) {
      return null;
    }

    if (nameLower === 'mod' || nameLower === 'rem') {
      if (!isSameType(args[0].type(), args[1].type())) {
        throw new DOMException(`Incompatible types in ${nameLower}`, 'SyntaxError');
      }
    }

    const result = new CSSMathFunction(nameLower, ...args);
    return result;
  }

  return null;
}

function toCanonical(val: CSSUnitValue): { value: number, unit: CSSUnit } {
  const base = unitToBase[val.unit] || 'other';
  if (base === 'length' && unitToPixels[val.unit]) {
    return { value: val.value * unitToPixels[val.unit], unit: 'px' };
  } else if (base === 'angle' && unitToRadians[val.unit]) {
    return { value: val.value * (unitToRadians[val.unit] / unitToRadians['deg']), unit: 'deg' };
  } else if (base === 'time' && unitToSeconds[val.unit]) {
    return { value: val.value * unitToSeconds[val.unit], unit: 's' };
  } else if (base === 'resolution') {
    if (val.unit === 'dpi') return { value: val.value, unit: 'dpi' };
    if (val.unit === 'dpcm') return { value: val.value * 2.54, unit: 'dpi' };
    if (val.unit === 'dppx' || val.unit === 'x') return { value: val.value * 96, unit: 'dpi' };
  }
  return { value: val.value, unit: val.unit };
}

function fromCanonical(value: number, targetUnit: CSSUnit): number {
  const base = unitToBase[targetUnit] || 'other';
  if (base === 'length' && unitToPixels[targetUnit]) {
    return value / unitToPixels[targetUnit];
  } else if (base === 'angle' && unitToRadians[targetUnit]) {
    return value / (unitToRadians[targetUnit] / unitToRadians['deg']);
  } else if (base === 'time' && unitToSeconds[targetUnit]) {
    return value / unitToSeconds[targetUnit];
  } else if (base === 'resolution') {
    if (targetUnit === 'dpi') return value;
    if (targetUnit === 'dpcm') return value / 2.54;
    if (targetUnit === 'dppx' || targetUnit === 'x') return value / 96;
  }
  return value;
}

function isCanonicalizable(val: CSSUnitValue): boolean {
  const base = unitToBase[val.unit] || 'other';
  if (base === 'length') return !!unitToPixels[val.unit];
  if (base === 'angle') return !!unitToRadians[val.unit];
  if (base === 'time') return !!unitToSeconds[val.unit];
  if (base === 'resolution') return true;
  if (base === 'number') return true;
  return false;
}

function areCompatibleForSimplification(values: CSSUnitValue[]): boolean {
  if (values.length === 0) return true;
  const firstUnit = values[0].unit;
  if (values.every(v => v.unit === firstUnit)) return true;
  return values.every(v => isCanonicalizable(v));
}

export function simplify(node: CSSNumericValue): CSSNumericValue {
  if (node instanceof CSSMathSum) {
    const values: CSSNumericValue[] = [];
    for (const child of node.values) {
      const simplifiedChild = simplify(child);
      if (simplifiedChild instanceof CSSMathSum) {
        values.push(...simplifiedChild.values);
      } else {
        values.push(simplifiedChild);
      }
    }
    
    const combinedChildren: CSSNumericValue[] = [];
    const numericByBase = new Map<string, { value: number, unit: CSSUnit }>();
    
    for (const child of values) {
      if (child instanceof CSSUnitValue) {
        const base = unitToBase[child.unit] || 'other';
        let canonicalValue = child.value;
        let canonicalUnit = child.unit;
        let key: string = child.unit;
        
        if (base === 'length' && unitToPixels[child.unit]) {
          canonicalValue *= unitToPixels[child.unit];
          canonicalUnit = 'px';
          key = 'length';
        } else if (base === 'angle' && unitToRadians[child.unit]) {
          canonicalValue *= unitToRadians[child.unit] / unitToRadians['deg'];
          canonicalUnit = 'deg';
          key = 'angle';
        } else if (base === 'time' && unitToSeconds[child.unit]) {
          canonicalValue *= unitToSeconds[child.unit];
          canonicalUnit = 's';
          key = 'time';
        } else if (base === 'resolution') {
          if (child.unit === 'dpcm') {
            canonicalValue *= 2.54;
          } else if (child.unit === 'dppx' || child.unit === 'x') {
            canonicalValue *= 96;
          }
          canonicalUnit = 'dpi';
          key = 'resolution';
        } else if (base === 'number') {
          key = 'number';
        }

        const existing = numericByBase.get(key);
        if (existing) {
          existing.value += canonicalValue;
        } else {
          numericByBase.set(key, { value: canonicalValue, unit: canonicalUnit });
        }
      } else {
        combinedChildren.push(child);
      }
    }
    
    for (const { value, unit } of numericByBase.values()) {
      combinedChildren.push(new CSSUnitValue(value, unit));
    }
    
    if (combinedChildren.length === 1) {
      return combinedChildren[0];
    }
    return new CSSMathSum(...combinedChildren);
  }
  
  if (node instanceof CSSMathProduct) {
    const values: CSSNumericValue[] = [];
    for (const child of node.values) {
      const simplifiedChild = simplify(child);
      if (simplifiedChild instanceof CSSMathProduct) {
        values.push(...simplifiedChild.values);
      } else {
        values.push(simplifiedChild);
      }
    }
    
    // Split into numeric (CSSUnitValue or CSSMathInvert of CSSUnitValue) and other
    const numericChildren: { value: number; unit: CSSUnit; inverted: boolean; original: CSSNumericValue }[] = [];
    const otherChildren: CSSNumericValue[] = [];
    
    for (const child of values) {
      if (child instanceof CSSUnitValue) {
        numericChildren.push({ value: child.value, unit: child.unit, inverted: false, original: child });
      } else if (child instanceof CSSMathInvert && child.value instanceof CSSUnitValue) {
        numericChildren.push({ value: child.value.value, unit: child.value.unit, inverted: true, original: child });
      } else {
        otherChildren.push(child);
      }
    }

    if (numericChildren.length > 0) {
      // Calculate net exponents for base dimensions
      const baseExponents = new Map<string, number>();
      for (const child of numericChildren) {
        if (child.unit !== 'number') {
          const base = unitToBase[child.unit];
          const delta = child.inverted ? -1 : 1;
          baseExponents.set(base, (baseExponents.get(base) || 0) + delta);
        }
      }
      
      // Clean up zero exponents
      for (const [base, exp] of baseExponents) {
        if (exp === 0) {
          baseExponents.delete(base);
        }
      }
      
      // We can simplify the numeric parts to a single CSSUnitValue if they represent a valid CSS dimension
      // (i.e. at most one base dimension with exponent 1, all others 0)
      if (baseExponents.size === 0 || (baseExponents.size === 1 && Array.from(baseExponents.values())[0] === 1)) {
        let scalarProduct = 1;
        for (const child of numericChildren) {
          const canonicalInfo = toCanonical(new CSSUnitValue(child.value, child.unit));
          const canonicalVal = canonicalInfo.value;
          
          if (child.inverted) {
            scalarProduct /= canonicalVal;
          } else {
            scalarProduct *= canonicalVal;
          }
        }
        
        let targetUnit: CSSUnit = 'number';
        if (baseExponents.size === 1) {
          const targetBase = Array.from(baseExponents.keys())[0];
          const matchingChild = numericChildren.find(c => !c.inverted && unitToBase[c.unit] === targetBase);
          targetUnit = matchingChild ? matchingChild.unit : (targetBase === 'length' ? 'px' : (targetBase === 'angle' ? 'deg' : (targetBase === 'time' ? 's' : 'number')));
        }
        
        const finalValue = fromCanonical(scalarProduct, targetUnit);
        const combinedUnitValue = new CSSUnitValue(finalValue, targetUnit);
        
        if (otherChildren.length === 0) {
          return combinedUnitValue;
        }
        
        // If combinedUnitValue is unit 'number' and value is 1, it's a multiplicative identity, we can omit it if there are other children.
        if (combinedUnitValue.unit === 'number' && combinedUnitValue.value === 1) {
          if (otherChildren.length === 1) {
            return otherChildren[0];
          }
          return new CSSMathProduct(...otherChildren);
        }
        
        // Put the combined numeric child at the front or back
        if (combinedUnitValue.unit === 'number') {
          otherChildren.unshift(combinedUnitValue);
        } else {
          otherChildren.push(combinedUnitValue);
        }
      } else {
        // If they cannot be simplified to a single CSSUnitValue, fall back to adding them as they are
        for (const child of numericChildren) {
          otherChildren.push(child.original);
        }
      }
    }
    
    // Distribution of numbers over sums
    const numberNode = otherChildren.find((c): c is CSSUnitValue => c instanceof CSSUnitValue && c.unit === 'number');
    const sumNode = otherChildren.find((c): c is CSSMathSum => c instanceof CSSMathSum);
    
    if (numberNode && sumNode && otherChildren.length === 2 && sumNode.values.every(c => c instanceof CSSUnitValue)) {
      const distributedChildren = sumNode.values.map(child => {
        return simplify(new CSSMathProduct(numberNode, child));
      });
      return simplify(new CSSMathSum(...distributedChildren));
    }
    
    if (otherChildren.length === 1) {
      return otherChildren[0];
    }
    return new CSSMathProduct(...otherChildren);
  }
  
  if (node instanceof CSSMathNegate) {
    const simplifiedChild = simplify(node.value);
    if (simplifiedChild instanceof CSSMathNegate) {
      return simplifiedChild.value;
    }
    if (simplifiedChild instanceof CSSUnitValue) {
      return new CSSUnitValue(-simplifiedChild.value, simplifiedChild.unit);
    }
    return new CSSMathNegate(simplifiedChild);
  }
  
  if (node instanceof CSSMathInvert) {
    const simplifiedChild = simplify(node.value);
    if (simplifiedChild instanceof CSSUnitValue && simplifiedChild.value === 0) {
      throw new DOMException('Division by zero', 'SyntaxError');
    }
    if (simplifiedChild instanceof CSSUnitValue && simplifiedChild.unit === 'number') {
      return new CSSUnitValue(1 / simplifiedChild.value, 'number');
    }
    if (simplifiedChild instanceof CSSMathInvert) {
      return simplifiedChild.value;
    }
    return new CSSMathInvert(simplifiedChild);
  }
  
  if (node instanceof CSSMathMin) {
    const values = node.values.map(c => simplify(c));
    return simplifyMinMax('min', values);
  }
  
  if (node instanceof CSSMathMax) {
    const values = node.values.map(c => simplify(c));
    return simplifyMinMax('max', values);
  }
  
  if (node instanceof CSSMathClamp) {
    const min = node.lower instanceof CSSKeywordValue ? node.lower : simplify(node.lower);
    const val = simplify(node.value);
    const max = node.upper instanceof CSSKeywordValue ? node.upper : simplify(node.upper);
    return new CSSMathClamp(min, val, max);
  }

  if (node instanceof CSSMathRound) {
    const val = simplify(node.value);
    const precision = simplify(node.precision);
    
    if (val instanceof CSSUnitValue && precision instanceof CSSUnitValue) {
      if (val.unit === precision.unit || precision.unit === 'number') {
        const v = val.value;
        const p = precision.value;
        let result = v;
        
        if (p !== 0) {
          if (node.strategy === 'nearest') {
            result = Math.round(v / p) * p;
          } else if (node.strategy === 'up') {
            result = Math.ceil(v / p) * p;
          } else if (node.strategy === 'down') {
            result = Math.floor(v / p) * p;
          } else if (node.strategy === 'to-zero') {
            result = Math.trunc(v / p) * p;
          }
        }
        
        return new CSSUnitValue(result, val.unit);
      }
    }
    return new CSSMathRound(node.strategy, val, precision);
  }

  if (node instanceof CSSMathFunction) {
    const values = node.values.map(v => simplify(v));
    
    if (node.name === 'abs' && values.length === 1 && values[0] instanceof CSSUnitValue) {
      return new CSSUnitValue(Math.abs(values[0].value), values[0].unit);
    }
    
    if (node.name === 'hypot' && values.length > 0 && values.every(v => v instanceof CSSUnitValue)) {
      const unitValues = values as CSSUnitValue[];
      const firstUnit = unitValues[0].unit;
      const base = unitToBase[firstUnit];
      if (base && unitValues.every(v => unitToBase[v.unit] === base) && areCompatibleForSimplification(unitValues)) {
        const canonicalValues = unitValues.map(v => toCanonical(v));
        const sumOfSquares = canonicalValues.reduce((sum, v) => sum + v.value * v.value, 0);
        const resultValue = Math.sqrt(sumOfSquares);
        const canonicalUnit = canonicalValues[0].unit;
        return new CSSUnitValue(resultValue, canonicalUnit);
      }
    }

    if (['sin', 'cos', 'tan'].includes(node.name) && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      if (val.unit === 'deg' || val.unit === 'rad' || val.unit === 'grad' || val.unit === 'turn' || val.unit === 'number') {
        let rad = val.value;
        if (val.unit === 'deg') rad = val.value * Math.PI / 180;
        else if (val.unit === 'grad') rad = val.value * Math.PI / 200;
        else if (val.unit === 'turn') rad = val.value * 2 * Math.PI;
        
        let result = 0;
        if (node.name === 'sin') result = Math.sin(rad);
        else if (node.name === 'cos') result = Math.cos(rad);
        else if (node.name === 'tan') result = Math.tan(rad);
        
        return new CSSUnitValue(result, 'number');
      }
    }

    if (['asin', 'acos', 'atan'].includes(node.name) && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      if (val.unit === 'number') {
        let result = 0;
        if (node.name === 'asin') result = Math.asin(val.value);
        else if (node.name === 'acos') result = Math.acos(val.value);
        else if (node.name === 'atan') result = Math.atan(val.value);
        
        return new CSSUnitValue(result * 180 / Math.PI, 'deg');
      }
    }

    if (node.name === 'sqrt' && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      if (val.unit === 'number' && val.value >= 0) {
        return new CSSUnitValue(Math.sqrt(val.value), 'number');
      }
    }

    if (node.name === 'pow' && values.length === 2 && values.every(v => v instanceof CSSUnitValue)) {
      const val1 = values[0] as CSSUnitValue;
      const val2 = values[1] as CSSUnitValue;
      if (val1.unit === 'number' && val2.unit === 'number') {
        return new CSSUnitValue(Math.pow(val1.value, val2.value), 'number');
      }
    }

    if (node.name === 'atan2' && values.length === 2 && values.every(v => v instanceof CSSUnitValue)) {
      const y = values[0] as CSSUnitValue;
      const x = values[1] as CSSUnitValue;
      const yBase = unitToBase[y.unit] || 'other';
      const xBase = unitToBase[x.unit] || 'other';
      if (yBase === xBase && areCompatibleForSimplification([y, x])) {
        const yCanonical = toCanonical(y);
        const xCanonical = toCanonical(x);
        const resultRad = Math.atan2(yCanonical.value, xCanonical.value);
        return new CSSUnitValue(resultRad * 180 / Math.PI, 'deg');
      }
    }

    if ((node.name === 'mod' || node.name === 'rem') && values.length === 2 && values.every(v => v instanceof CSSUnitValue)) {
      const a = values[0] as CSSUnitValue;
      const b = values[1] as CSSUnitValue;
      const aBase = unitToBase[a.unit] || 'other';
      const bBase = unitToBase[b.unit] || 'other';
      if (aBase === bBase && areCompatibleForSimplification([a, b])) {
        const aCanonical = toCanonical(a);
        const bCanonical = toCanonical(b);
        let resultCanonicalVal: number;
        if (node.name === 'mod') {
          resultCanonicalVal = ((aCanonical.value % bCanonical.value) + bCanonical.value) % bCanonical.value;
        } else {
          resultCanonicalVal = aCanonical.value % bCanonical.value;
        }
        const resultVal = fromCanonical(resultCanonicalVal, a.unit);
        return new CSSUnitValue(resultVal, a.unit);
      }
    }

    if (node.name === 'exp' && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      if (val.unit === 'number') {
        return new CSSUnitValue(Math.exp(val.value), 'number');
      }
    }

    if (node.name === 'log' && (values.length === 1 || values.length === 2) && values.every(v => v instanceof CSSUnitValue)) {
      const a = values[0] as CSSUnitValue;
      if (a.unit === 'number') {
        if (values.length === 1) {
          return new CSSUnitValue(Math.log(a.value), 'number');
        } else {
          const b = values[1] as CSSUnitValue;
          if (b.unit === 'number') {
            return new CSSUnitValue(Math.log(a.value) / Math.log(b.value), 'number');
          }
        }
      }
    }

    if (node.name === 'sign' && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      return new CSSUnitValue(Math.sign(val.value), 'number');
    }
    
    return new CSSMathFunction(node.name, ...values);
  }

  return node;
}

function simplifyMinMax(nodeName: 'min' | 'max', values: CSSNumericValue[]): CSSNumericValue {
  const isMin = nodeName === 'min';
  const flattened: CSSNumericValue[] = [];
  
  for (const child of values) {
    if ((isMin && child instanceof CSSMathMin) || (!isMin && child instanceof CSSMathMax)) {
      flattened.push(...child.values);
    } else {
      flattened.push(child);
    }
  }
  
  if (flattened.length === 1) {
    return flattened[0];
  }
  
  return isMin ? new CSSMathMin(...flattened) : new CSSMathMax(...flattened);
}
