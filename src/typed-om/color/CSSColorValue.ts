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

import { CSSStyleValue } from '../values/CSSStyleValue.ts';
import type { CSSKeywordValue } from '../values/CSSKeywordValue.ts';

// Spec: CSS Typed OM Level 2 § 2 #colorvalue-objects
export abstract class CSSColorValue extends CSSStyleValue {
  constructor() {
    super();
    if (this.constructor === CSSColorValue) {
      throw new TypeError("CSSColorValue cannot be directly constructed");
    }
  }

  static override parse(_css: string): CSSColorValue | CSSKeywordValue {
    if (arguments.length < 1) {
      throw new TypeError("Failed to execute 'parse' on 'CSSColorValue': 1 argument required, but only 0 present.");
    }
    throw new Error("CSSColorValue.parse not initialized");
  }
}
