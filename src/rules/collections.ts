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

import type { MediaQuery } from '../types.ts';
import { ParseHooks } from '../parse-hooks.ts';
import { createIndexedProxy } from '../utils.ts';
import type { CSSStyleSheet, CSSRule } from '../CSSOM.ts';

export class StyleSheetList {
  private _sheets: CSSStyleSheet[];

  constructor(sheets: CSSStyleSheet[]) {
    this._sheets = sheets;
    return createIndexedProxy(this, (t) => t._sheets) as StyleSheetList;
  }

  get length(): number {
    return this._sheets.length;
  }

  item(index: number): CSSStyleSheet | null {
    return this._sheets[index] || null;
  }

  get [Symbol.toStringTag](): string {
    return 'StyleSheetList';
  }

  *[Symbol.iterator](): Iterator<CSSStyleSheet> {
    for (let i = 0; i < this.length; i++) {
      yield this._sheets[i];
    }
  }
}

export interface LinkStyle {
  readonly sheet: CSSStyleSheet | null;
}

// cssom-1 #the-medialist-interface
export class MediaList {
  [index: number]: string;
  private _mediaQueries: MediaQuery[] = [];

  constructor(mediaText: string = '') {
    this.mediaText = mediaText;
    return createIndexedProxy(this, (t) => t._mediaQueries.map(q => ParseHooks.serializeMediaQuery(q)));
  }

  get [Symbol.toStringTag](): string {
    return 'MediaList';
  }

  get mediaText(): string {
    return this._mediaQueries.map(q => ParseHooks.serializeMediaQuery(q)).join(', ');
  }

  set mediaText(value: string) {
    if (!value) {
      this._mediaQueries = [];
      return;
    }
    this._mediaQueries = ParseHooks.parseMediaQueryList(value);
  }

  get length(): number {
    return this._mediaQueries.length;
  }

  item(index: number): string | null {
    const q = this._mediaQueries[index];
    return q ? ParseHooks.serializeMediaQuery(q) : null;
  }

  toString(): string {
    return this.mediaText;
  }

  get mediaQueriesAST(): MediaQuery[] {
    return this._mediaQueries;
  }

  // cssom-1 #dom-medialist-appendmedium
  appendMedium(medium: string): void {
    const parsed = ParseHooks.parseMediaQueryList(medium);
    if (parsed.length !== 1) {
      return;
    }
    const m = parsed[0];
    const mText = ParseHooks.serializeMediaQuery(m);
    if (this._mediaQueries.some(q => ParseHooks.serializeMediaQuery(q) === mText)) {
      return;
    }
    this._mediaQueries.push(m);
  }

  // cssom-1 #dom-medialist-deletemedium
  deleteMedium(medium: string): void {
    const parsed = ParseHooks.parseMediaQueryList(medium);
    if (parsed.length !== 1) {
      return;
    }
    const mText = ParseHooks.serializeMediaQuery(parsed[0]);
    let i = this._mediaQueries.length;
    let found = false;
    while (i--) {
      if (ParseHooks.serializeMediaQuery(this._mediaQueries[i]) === mText) {
        this._mediaQueries.splice(i, 1);
        found = true;
      }
    }
    if (!found) {
      throw new DOMException(`The medium '${medium}' does not exist in the MediaList.`, 'NotFoundError');
    }
  }

  *[Symbol.iterator](): Iterator<string> {
    for (let i = 0; i < this.length; i++) {
      yield ParseHooks.serializeMediaQuery(this._mediaQueries[i]);
    }
  }
}

export class CSSRuleList {
  [index: number]: CSSRule;
  private _getRules: () => CSSRule[];

  constructor(rulesOrGetter: CSSRule[] | (() => CSSRule[])) {
    this._getRules = typeof rulesOrGetter === 'function' ? rulesOrGetter : () => rulesOrGetter;
    return createIndexedProxy(this, (t) => t._getRules(), (v) => v as CSSRule);
  }

  get length(): number {
    return this._getRules().length;
  }

  item(index: number): CSSRule | null {
    return (this._getRules()[index] as CSSRule) || null;
  }

  get [Symbol.toStringTag](): string {
    return 'CSSRuleList';
  }

  *[Symbol.iterator](): Iterator<CSSRule> {
    const rules = this._getRules();
    for (let i = 0; i < rules.length; i++) {
      yield rules[i] as CSSRule;
    }
  }
}
