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

import type { ComponentValue, CSSFunction, IdentToken } from '../../types.ts';
import type { CSSUnit } from '../../data/gen/units.ts';
import { CSSStyleValue } from './CSSStyleValue.ts';
import { CSSKeywordValue } from './CSSKeywordValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSMathSum } from '../numeric/math/CSSMathOperations.ts';
import { CSSUnparsedValue, tokensToUnparsedSegments } from './CSSUnparsedValue.ts';
import { CSSVariableReferenceValue } from './CSSVariableReferenceValue.ts';
import { CSSImageValue } from './CSSImageValue.ts';
import { serialize } from '../../serializer.ts';
import { parseMathFunction, simplify } from '../../math-parser.ts';
import { STANDARD_PROPERTIES_SYNTAX } from '../../data/gen/standard-syntax.ts';
import { PropertyRegistry } from '../../PropertyRegistry.ts';
import { isToken } from '../utils/validation.ts';

/**
 * Converts a parsed component value into a Typed OM CSSStyleValue.
 */
export function createCSSStyleValue(v: ComponentValue, property?: string): CSSStyleValue | null {
  if (v.type === 'function') {
    const fn = v as CSSFunction;
    const nameLower = fn.name.toLowerCase();
    if (['calc', 'min', 'max', 'clamp'].includes(nameLower)) {
      const mathNode = parseMathFunction(fn.name, fn.value);
      if (mathNode) {
        if (nameLower === 'calc') {
          const simplified = simplify(mathNode);
          if (simplified instanceof CSSUnitValue) {
            return new CSSMathSum(simplified);
          }
          return simplified;
        }
        return mathNode;
      }
    }
    if (nameLower === 'var') {
      const args = fn.value.filter(t => t.type !== 'whitespace' && t.type !== 'comment');
      if (args.length === 0 || args[0].type !== 'ident' || !(args[0] as IdentToken).value.startsWith('--') || (args[0] as IdentToken).value === '--') {
        // Invalid var()
        return new CSSUnparsedValue([serialize([v]).trim()]);
      }
      const varName = (args[0] as IdentToken).value;

      if (args.length > 1 && args[1].type !== 'comma') {
        // Invalid var() - fallback must be comma-separated
        return new CSSUnparsedValue([serialize([v]).trim()]);
      }
      let fallback: CSSUnparsedValue | null = null;

      // Find first comma
      let commaIdx = -1;
      for (let i = 0; i < fn.value.length; i++) {
        if (fn.value[i].type === 'comma') {
          commaIdx = i;
          break;
        }
      }

      if (commaIdx !== -1) {
        const fallbackTokens = fn.value.slice(commaIdx + 1);
        let start = 0;
        while (start < fallbackTokens.length && (fallbackTokens[start].type === 'whitespace' || fallbackTokens[start].type === 'comment')) {
          start++;
        }
        let end = fallbackTokens.length - 1;
        while (end >= start && (fallbackTokens[end].type === 'whitespace' || fallbackTokens[end].type === 'comment')) {
          end--;
        }
        const trimmedFallback = fallbackTokens.slice(start, end + 1);
        fallback = new CSSUnparsedValue(tokensToUnparsedSegments(trimmedFallback));
      }

      return new CSSUnparsedValue([new CSSVariableReferenceValue(varName, fallback)]);
    }
    if (nameLower === 'url') {
      // CSSImageValue for url()
      return new (class extends CSSImageValue {
        override toString() { return `url(${serialize(fn.value).trim()})`; }
      })();
    }
    if (nameLower.endsWith('gradient')) {
      return new (class extends CSSImageValue {
        override toString() { return serialize([v]).trim(); }
      })();
    }
  }
  if (isToken(v)) {
    switch (v.type) {
      case 'ident':
        return new CSSKeywordValue(v.value);
      case 'number':
        if (v.value === 0 && property) {
          const propLower = property.toLowerCase();
          let syntax: string | undefined = STANDARD_PROPERTIES_SYNTAX[propLower];
          if (!syntax && property.startsWith('--')) {
            syntax = PropertyRegistry.get(property)?.syntax;
          }
          if (syntax && (syntax.includes('<length>') || syntax.includes('<length-percentage>') || syntax.includes('<dimension>'))) {
            return new CSSUnitValue(0, 'px');
          }
        }
        return new CSSUnitValue(v.value, 'number');
      case 'percentage':
        return new CSSUnitValue(v.value, 'percent');
      case 'dimension':
        return new CSSUnitValue(v.value, (v.unit || '') as CSSUnit);

      case 'url':
        // CSSImageValue for url()
        return new (class extends CSSImageValue {
          override toString() { return `url("${v.value}")`; }
        })();
      default:
        return null;
    }
  }
  return null;
}
