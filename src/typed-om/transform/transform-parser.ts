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

import type { ComponentValue, Token, CSSFunction } from '../../types.ts';
import type { CSSTransformComponent } from './CSSTransformComponent.ts';
import { CSSNumericValue } from '../numeric/CSSNumericValue.ts';
import { CSSUnitValue } from '../numeric/CSSUnitValue.ts';
import { CSSKeywordValue } from '../values/CSSKeywordValue.ts';
import {
  CSSTranslate,
  CSSScale,
  CSSRotate,
  CSSSkew,
  CSSSkewX,
  CSSSkewY,
  CSSPerspective,
  CSSMatrixComponent
} from './transform-components.ts';
import { DOMMatrixReadOnly } from '../../DOMMatrix.ts';
import { parseMathFunction, simplify } from '../../math-parser.ts';
import { createCSSStyleValue } from '../values/style-value-factory.ts';

export function parseNumeric(v: ComponentValue): CSSNumericValue {
  if (v.type === 'number' || v.type === 'percentage' || v.type === 'dimension') {
    const sv = createCSSStyleValue(v as Token);
    if (sv instanceof CSSNumericValue) return sv;
  }
  if (v.type === 'function') {
    const mathNode = parseMathFunction((v as CSSFunction).name, (v as CSSFunction).value);
    if (mathNode instanceof CSSNumericValue) return simplify(mathNode);
  }
  return new CSSUnitValue(0, 'number');
}

export function parseTranslate(name: string, args: ComponentValue[]): CSSTranslate {
  if (name === 'translatex' || name === 'translatey' || name === 'translatez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'translate3d') {
    if (args.length !== 3) throw new TypeError(`translate3d() expects 3 arguments, got ${args.length}`);
  } else if (name === 'translate') {
    if (args.length < 1 || args.length > 3) throw new TypeError(`translate() expects 1, 2, or 3 arguments, got ${args.length}`);
  }

  const x = parseNumeric(args[0]);
  let y: CSSNumericValue = new CSSUnitValue(0, 'px');
  let z: CSSNumericValue | undefined = undefined;

  if (name === 'translate' || name === 'translate3d') {
    if (args.length > 1) y = parseNumeric(args[1]);
    if (args.length > 2) z = parseNumeric(args[2]);
  } else if (name === 'translatex') {
    // defaults ok
  } else if (name === 'translatey') {
    return new CSSTranslate(new CSSUnitValue(0, 'px'), x);
  } else if (name === 'translatez') {
    return new CSSTranslate(new CSSUnitValue(0, 'px'), new CSSUnitValue(0, 'px'), x);
  }

  return new CSSTranslate(x, y, z);
}

export function parseScale(name: string, args: ComponentValue[]): CSSScale {
  if (name === 'scalex' || name === 'scaley' || name === 'scalez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'scale3d') {
    if (args.length !== 3) throw new TypeError(`scale3d() expects 3 arguments, got ${args.length}`);
  } else if (name === 'scale') {
    if (args.length < 1 || args.length > 3) throw new TypeError(`scale() expects 1, 2, or 3 arguments, got ${args.length}`);
  }

  const x = parseNumeric(args[0]);
  let y = x;
  let z: CSSNumericValue | undefined = undefined;

  if (name === 'scale' || name === 'scale3d') {
    if (args.length > 1) y = parseNumeric(args[1]);
    if (args.length > 2) z = parseNumeric(args[2]);
  } else if (name === 'scalex') {
    y = new CSSUnitValue(1, 'number');
  } else if (name === 'scaley') {
    return new CSSScale(new CSSUnitValue(1, 'number'), x);
  } else if (name === 'scalez') {
    return new CSSScale(new CSSUnitValue(1, 'number'), new CSSUnitValue(1, 'number'), x);
  }

  return new CSSScale(x, y, z);
}

export function parseRotate(name: string, args: ComponentValue[]): CSSRotate {
  if (name === 'rotatex' || name === 'rotatey' || name === 'rotatez') {
    if (args.length !== 1) throw new TypeError(`${name}() expects 1 argument, got ${args.length}`);
  } else if (name === 'rotate3d') {
    if (args.length !== 4) throw new TypeError(`rotate3d() expects 4 arguments, got ${args.length}`);
  } else if (name === 'rotate') {
    if (args.length !== 1 && args.length !== 4) throw new TypeError(`rotate() expects 1 or 4 arguments, got ${args.length}`);
  }

  if (name === 'rotatex') {
    return new CSSRotate(new CSSUnitValue(1, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotatey') {
    return new CSSRotate(new CSSUnitValue(0, 'number'), new CSSUnitValue(1, 'number'), new CSSUnitValue(0, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotatez') {
    return new CSSRotate(new CSSUnitValue(0, 'number'), new CSSUnitValue(0, 'number'), new CSSUnitValue(1, 'number'), parseNumeric(args[0]));
  }
  if (name === 'rotate') {
    if (args.length === 1) return new CSSRotate(parseNumeric(args[0]));
    return new CSSRotate(parseNumeric(args[0]), parseNumeric(args[1]), parseNumeric(args[2]), parseNumeric(args[3]));
  }
  if (name === 'rotate3d') {
    return new CSSRotate(parseNumeric(args[0]), parseNumeric(args[1]), parseNumeric(args[2]), parseNumeric(args[3]));
  }
  return new CSSRotate(parseNumeric(args[0]));
}

export function parseSkew(name: string, args: ComponentValue[]): CSSTransformComponent {
  if (name === 'skewx') return new CSSSkewX(parseNumeric(args[0]));
  if (name === 'skewy') return new CSSSkewY(parseNumeric(args[0]));
  const ax = parseNumeric(args[0]);
  const ay = args.length > 1 ? parseNumeric(args[1]) : new CSSUnitValue(0, 'deg');
  return new CSSSkew(ax, ay);
}

export function parsePerspective(args: ComponentValue[]): CSSPerspective {
  const arg = args[0];
  if (arg.type === 'ident' && arg.value.toLowerCase() === 'none') {
    return new CSSPerspective(new CSSKeywordValue('none'));
  }

  return new CSSPerspective(parseNumeric(arg));
}

export function parseMatrix(name: string, args: ComponentValue[]): CSSMatrixComponent {
  const vals = args.map(a => {
    if (a.type === 'number') return a.value;
    return 0;
  });

  return new CSSMatrixComponent(new DOMMatrixReadOnly(vals));
}
