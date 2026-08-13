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

// Types & Units
export type { CSSUnit } from '../data/gen/units.ts';
export type { CSSNumericType } from './numeric/CSSNumericType.ts';

// Side-effect registrations: arithmetic methods & style value parsers
import './numeric/numeric-methods.ts';
import './values/style-value-parser.ts';
import './color/color-reify.ts';

// Values
export { CSSStyleValue } from './values/CSSStyleValue.ts';
export { CSSKeywordValue } from './values/CSSKeywordValue.ts';
export { CSSImageValue } from './values/CSSImageValue.ts';
export { CSSVariableReferenceValue } from './values/CSSVariableReferenceValue.ts';
export { CSSUnparsedValue } from './values/CSSUnparsedValue.ts';
export { createCSSStyleValue } from './values/style-value-factory.ts';

// Numeric
export { CSSNumericValue } from './numeric/CSSNumericValue.ts';
export { CSSUnitValue } from './numeric/CSSUnitValue.ts';
export { CSSNumericArray } from './numeric/CSSNumericArray.ts';
export { CSSMathValue } from './numeric/math/CSSMathValue.ts';
export {
  CSSMathNegate,
  CSSMathInvert,
  CSSMathSum,
  CSSMathProduct,
  CSSMathMin,
  CSSMathMax,
  CSSMathClamp,
  CSSMathRound,
  CSSMathFunction
} from './numeric/math/CSSMathOperations.ts';

// Colors
export { CSSColorValue } from './color/CSSColorValue.ts';
export {
  CSSRGB,
  CSSHSL,
  CSSHWB,
  CSSLab,
  CSSLCH,
  CSSOKLab,
  CSSOKLCH,
  CSSColor
} from './color/color-spaces.ts';

// Transforms
export { CSSTransformComponent } from './transform/CSSTransformComponent.ts';
export {
  CSSTranslate,
  CSSScale,
  CSSRotate,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSPerspective,
  CSSMatrixComponent,
  type CSSMatrixComponentOptions
} from './transform/transform-components.ts';
export { CSSTransformValue } from './transform/CSSTransformValue.ts';

// Position
export { CSSPositionValue } from './position/CSSPositionValue.ts';

// Style Property Maps
export { type StyleReadOnlyLike, StylePropertyMapReadOnly } from './style-map/StylePropertyMapReadOnly.ts';
export { type StyleLike, StylePropertyMap } from './style-map/StylePropertyMap.ts';

// Geometry & Parser API
export { DOMMatrixReadOnly, DOMMatrix } from '../DOMMatrix.ts';
export { CSS } from '../parser-api.ts';

// Register transform parsing hook on DOMMatrix
import { CSSTransformValue } from './transform/CSSTransformValue.ts';
import { setParseTransformListHook } from '../DOMMatrix.ts';

setParseTransformListHook((str) => {
  try {
    const transformVal = CSSTransformValue.parse(str);
    const matrix = transformVal.toMatrix();
    // matrix.toFloat64Array() returns a column-major Float64Array.
    // The parseMatrixString fallback expects row-major. So we transpose it back to row-major!
    const colMajor = matrix.toFloat64Array();
    const rowMajor = new Float64Array(16);
    rowMajor[0] = colMajor[0];  rowMajor[1] = colMajor[4];  rowMajor[2] = colMajor[8];  rowMajor[3] = colMajor[12];
    rowMajor[4] = colMajor[1];  rowMajor[5] = colMajor[5];  rowMajor[6] = colMajor[9];  rowMajor[7] = colMajor[13];
    rowMajor[8] = colMajor[2];  rowMajor[9] = colMajor[6];  rowMajor[10] = colMajor[10]; rowMajor[11] = colMajor[14];
    rowMajor[12] = colMajor[3]; rowMajor[13] = colMajor[7]; rowMajor[14] = colMajor[11]; rowMajor[15] = colMajor[15];
    return { is2D: matrix.is2D, values: rowMajor };
  } catch (err) {
    throw new DOMException(`Failed to parse transform list: "${str}"`, 'SyntaxError');
  }
});
