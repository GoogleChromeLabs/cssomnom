/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { ComponentValue, CSSFunction } from './types.ts';
import { CSSNumericValue, CSSUnitValue, CSSMathSum, CSSMathProduct, CSSMathNegate, CSSMathInvert, CSSMathMin, CSSMathMax, CSSMathClamp, CSSMathFunction, CSSMathRound, CSSKeywordValue, type CSSNumericType } from './typed-om.ts';
import { unitToBase, unitToPixels, unitToRadians, unitToSeconds, type CSSUnit } from './data/units.ts';

import { MATH_FUNCTIONS } from './data/math-functions.ts';


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
    
    const allNumeric = values.every(c => c instanceof CSSUnitValue);
    const hasInfinityOrNaN = values.some(c => c instanceof CSSUnitValue && (c.value === Infinity || c.value === -Infinity || Number.isNaN(c.value)));
    
    if (allNumeric && !hasInfinityOrNaN) {
      const numericChildren = values as CSSUnitValue[];
      let product = 1;
      let unit: CSSUnit = 'number';
      let nonNumberUnitCount = 0;
      
      for (const child of numericChildren) {
        product *= child.value;
        if (child.unit !== 'number') {
          unit = child.unit;
          nonNumberUnitCount++;
        }
      }
      
      if (nonNumberUnitCount <= 1) {
        return new CSSUnitValue(product, unit);
      }
    }
    
    const combinedChildren: CSSNumericValue[] = [];
    let numberProduct = 1;
    let hasNumbers = false;
    
    for (const child of values) {
      if (child instanceof CSSUnitValue && child.unit === 'number') {
        numberProduct *= child.value;
        hasNumbers = true;
      } else {
        combinedChildren.push(child);
      }
    }
    
    if (hasNumbers) {
      combinedChildren.unshift(new CSSUnitValue(numberProduct, 'number'));
    }
    
    // Distribution of numbers over sums
    const numberNode = combinedChildren.find((c): c is CSSUnitValue => c instanceof CSSUnitValue && c.unit === 'number');
    const sumNode = combinedChildren.find((c): c is CSSMathSum => c instanceof CSSMathSum);
    
    if (numberNode && sumNode && combinedChildren.length === 2 && sumNode.values.every(c => c instanceof CSSUnitValue)) {
      const distributedChildren = sumNode.values.map(child => {
        return simplify(new CSSMathProduct(numberNode, child));
      });
      return simplify(new CSSMathSum(...distributedChildren));
    }
    
    if (combinedChildren.length === 1) {
      return combinedChildren[0];
    }
    return new CSSMathProduct(...combinedChildren);
  }
  
  if (node instanceof CSSMathNegate) {
    const simplifiedChild = simplify(node.value);
    if (simplifiedChild instanceof CSSUnitValue) {
      return new CSSUnitValue(-simplifiedChild.value, simplifiedChild.unit);
    }
    if (simplifiedChild instanceof CSSMathNegate) {
      return simplifiedChild.value;
    }
    return new CSSMathNegate(simplifiedChild);
  }
  
  if (node instanceof CSSMathInvert) {
    const simplifiedChild = simplify(node.value);
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
    const allNumeric = values.every(c => c instanceof CSSUnitValue);
    if (allNumeric && values.length > 0) {
      const unitValues = values as CSSUnitValue[];
      const firstUnit = unitValues[0].unit;
      const firstBase = unitToBase[firstUnit] || 'other';
      const supportedBases = ['length', 'angle', 'time', 'number', 'percent'];
      
      if (supportedBases.includes(firstBase)) {
        const allSameBase = unitValues.every(c => (unitToBase[c.unit] || 'other') === firstBase);
        if (allSameBase) {
          const canonicalValues: number[] = [];
          let canonicalUnit: CSSUnit = firstUnit;
          let canCompare = true;
          for (const child of unitValues) {
            let val = child.value;
            const u = child.unit;
            if (firstBase === 'length') {
              if (unitToPixels[u]) { val *= unitToPixels[u]; canonicalUnit = 'px'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'angle') {
              if (unitToRadians[u]) { val *= unitToRadians[u] / unitToRadians['deg']; canonicalUnit = 'deg'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'time') {
              if (unitToSeconds[u]) { val *= unitToSeconds[u]; canonicalUnit = 's'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'number') { canonicalUnit = 'number'; }
            else if (firstBase === 'percent') { canonicalUnit = 'percent'; }
            canonicalValues.push(val);
          }
          if (canCompare) {
            return new CSSUnitValue(Math.min(...canonicalValues), canonicalUnit);
          }
        }
      }
      const allSameUnit = unitValues.every(c => c.unit === firstUnit);
      if (allSameUnit) {
        const numericValues = unitValues.map(c => c.value);
        return new CSSUnitValue(Math.min(...numericValues), firstUnit);
      }
    }
    return new CSSMathMin(...values);
  }
  
  if (node instanceof CSSMathMax) {
    const values = node.values.map(c => simplify(c));
    const allNumeric = values.every(c => c instanceof CSSUnitValue);
    if (allNumeric && values.length > 0) {
      const unitValues = values as CSSUnitValue[];
      const firstUnit = unitValues[0].unit;
      const firstBase = unitToBase[firstUnit] || 'other';
      const supportedBases = ['length', 'angle', 'time', 'number', 'percent'];
      
      if (supportedBases.includes(firstBase)) {
        const allSameBase = unitValues.every(c => (unitToBase[c.unit] || 'other') === firstBase);
        if (allSameBase) {
          const canonicalValues: number[] = [];
          let canonicalUnit: CSSUnit = firstUnit;
          let canCompare = true;
          for (const child of unitValues) {
            let val = child.value;
            const u = child.unit;
            if (firstBase === 'length') {
              if (unitToPixels[u]) { val *= unitToPixels[u]; canonicalUnit = 'px'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'angle') {
              if (unitToRadians[u]) { val *= unitToRadians[u] / unitToRadians['deg']; canonicalUnit = 'deg'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'time') {
              if (unitToSeconds[u]) { val *= unitToSeconds[u]; canonicalUnit = 's'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'number') { canonicalUnit = 'number'; }
            else if (firstBase === 'percent') { canonicalUnit = 'percent'; }
            canonicalValues.push(val);
          }
          if (canCompare) {
            return new CSSUnitValue(Math.max(...canonicalValues), canonicalUnit);
          }
        }
      }
      const allSameUnit = unitValues.every(c => c.unit === firstUnit);
      if (allSameUnit) {
        const numericValues = unitValues.map(c => c.value);
        return new CSSUnitValue(Math.max(...numericValues), firstUnit);
      }
    }
    return new CSSMathMax(...values);
  }
  
  if (node instanceof CSSMathClamp) {
    const min = node.lower instanceof CSSKeywordValue ? node.lower : simplify(node.lower);
    const val = simplify(node.value);
    const max = node.upper instanceof CSSKeywordValue ? node.upper : simplify(node.upper);
    
    if (min instanceof CSSUnitValue && val instanceof CSSUnitValue && max instanceof CSSUnitValue) {
      const unitValues = [min, val, max];
      const firstUnit = val.unit;
      const firstBase = unitToBase[firstUnit] || 'other';
      const supportedBases = ['length', 'angle', 'time', 'number', 'percent'];
      
      if (supportedBases.includes(firstBase)) {
        const allSameBase = unitValues.every(c => (unitToBase[c.unit] || 'other') === firstBase);
        if (allSameBase) {
          const canonicalValues: number[] = [];
          let canonicalUnit: CSSUnit = firstUnit;
          let canCompare = true;
          for (const child of unitValues) {
            let v = child.value;
            const u = child.unit;
            if (firstBase === 'length') {
              if (unitToPixels[u]) { v *= unitToPixels[u]; canonicalUnit = 'px'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'angle') {
              if (unitToRadians[u]) { v *= unitToRadians[u] / unitToRadians['deg']; canonicalUnit = 'deg'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'time') {
              if (unitToSeconds[u]) { v *= unitToSeconds[u]; canonicalUnit = 's'; }
              else { canCompare = false; break; }
            } else if (firstBase === 'number') { canonicalUnit = 'number'; }
            else if (firstBase === 'percent') { canonicalUnit = 'percent'; }
            canonicalValues.push(v);
          }
          if (canCompare) {
            const [minVal, valVal, maxVal] = canonicalValues;
            return new CSSUnitValue(Math.min(Math.max(valVal, minVal), maxVal), canonicalUnit);
          }
        }
      }
      if (min.unit === val.unit && val.unit === max.unit) {
        return new CSSUnitValue(Math.min(Math.max(val.value, min.value), max.value), val.unit);
      }
    }
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
      if (unitValues.every(v => v.unit === firstUnit)) {
        const sumOfSquares = unitValues.reduce((sum, v) => sum + v.value * v.value, 0);
        return new CSSUnitValue(Math.sqrt(sumOfSquares), firstUnit);
      }
    }

    if (['sin', 'cos', 'tan'].includes(node.name) && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      if (val.unit === 'deg' || val.unit === 'rad' || val.unit === 'grad' || val.unit === 'turn') {
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

    if (node.name === 'sign' && values.length === 1 && values[0] instanceof CSSUnitValue) {
      const val = values[0];
      return new CSSUnitValue(Math.sign(val.value), 'number');
    }
    
    return new CSSMathFunction(node.name, ...values);
  }

  return node;
}
