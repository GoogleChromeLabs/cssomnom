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

import { privateToken } from '../utils/validation.ts';

let parseAllImpl: ((property: string, css: string) => CSSStyleValue[]) | null = null;
let parseImpl: ((property: string, css: string) => CSSStyleValue) | null = null;

export function registerStyleValueParsers(
  parseAll: (property: string, css: string) => CSSStyleValue[],
  parse: (property: string, css: string) => CSSStyleValue
): void {
  parseAllImpl = parseAll;
  parseImpl = parse;
}

// Spec: CSS Typed OM Level 1 § 3 #stylevalue-objects
export class CSSStyleValue {
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
  private _cssText?: string;
  _associatedProperty: string | null = null;

  constructor(cssText?: string, token?: unknown) {
    if (token !== privateToken && this.constructor === CSSStyleValue) {
      throw new TypeError("CSSStyleValue cannot be directly constructed");
    }
    this._cssText = cssText;
  }

  toString(): string {
    return this._cssText || '';
  }

  static parseAll(property: string, css: string): CSSStyleValue[] {
    if (arguments.length < 2) {
      throw new TypeError("Failed to execute 'parseAll' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
    }
    if (!parseAllImpl) {
      throw new Error("StyleValue parser not initialized");
    }
    return parseAllImpl(property, css);
  }

  static parse(property: string, css: string): CSSStyleValue {
    if (arguments.length < 2) {
      throw new TypeError("Failed to execute 'parse' on 'CSSStyleValue': 2 arguments required, but only " + arguments.length + " present.");
    }
    if (!parseImpl) {
      throw new Error("StyleValue parser not initialized");
    }
    return parseImpl(property, css);
  }
}
