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

import { CSSNumericValue } from '../CSSNumericValue.ts';
import { stripOuterParens } from '../../utils/formatting.ts';

// Spec: CSS Typed OM Level 1 § 4.4 #mathvalue-objects
export abstract class CSSMathValue extends CSSNumericValue {
  constructor() {
    super();
    if (this.constructor === CSSMathValue) {
      throw new TypeError("CSSMathValue cannot be directly constructed");
    }
  }
  abstract serialize(): string;
  override toString(): string {
    const s = this.serialize();
    if (this.operator === 'number') return s;
    if (['min', 'max', 'clamp'].includes(this.operator)) return s;
    return `calc(${stripOuterParens(s)})`;
  }
  abstract get operator(): string;
}
