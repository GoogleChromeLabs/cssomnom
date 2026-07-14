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
import { AbstractTokenizer } from './AbstractTokenizer.ts';
import type { Token, ParseError } from './types.ts';

export function tokenize(input: string, unicodeRangesAllowed: boolean = false, errors?: ParseError[]): Token[] {
  const tokenizer = new Tokenizer(input);
  tokenizer.unicodeRangesAllowed = unicodeRangesAllowed;
  const tokens = tokenizer.tokenize();
  if (errors) {
    errors.push(...tokenizer.errors);
  }
  return tokens;
}

class Tokenizer extends AbstractTokenizer {
  private input: string;
  private pos: number = 0;

  constructor(input: string) {
    super();
    this.input = this.preprocess(input);
  }

  private preprocess(input: string): string {
    // 3.3. Preprocessing the Input Stream
    // Any surrogate code point (U+D800 to U+DFFF) is replaced by U+FFFD REPLACEMENT CHARACTER.
    // We use a regex to replace lone surrogates while preserving valid surrogate pairs.
    return input
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\f/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/\0/g, '\uFFFD')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const start = this.getPosition();
      const token = this.consumeToken();
      token.startIndex = start;
      token.endIndex = this.getPosition();
      token.originalText = this.input.slice(start, token.endIndex);
      tokens.push(token);
      if (token.type === 'EOF') {
        break;
      }
    }
    return tokens;
  }

  protected get cp(): number {
    return this.pos < this.input.length ? this.input.codePointAt(this.pos)! : -1;
  }

  protected peek(offset: number): number {
    let index = this.pos;
    for (let i = 0; i < offset; i++) {
      if (index >= this.input.length) return -1;
      const cp = this.input.codePointAt(index)!;
      index += cp > 0xFFFF ? 2 : 1;
    }
    return index < this.input.length ? this.input.codePointAt(index)! : -1;
  }

  protected consume(): number {
    const cp = this.cp;
    if (cp !== -1) {
      this.pos += cp > 0xFFFF ? 2 : 1;
    }
    return cp;
  }

  protected reconsume(): void {
    // We can't trivially reconsume without knowing the previous character length in UTF-16.
    // However, in CSS parsing, we usually reconsume exactly 1 code point.
    // Let's step back 1 unit, and if it's a trail surrogate, step back another unit.
    if (this.pos > 0) {
      this.pos--;
      const codeUnit = this.input.charCodeAt(this.pos);
      if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF && this.pos > 0) {
        const prevCodeUnit = this.input.charCodeAt(this.pos - 1);
        if (prevCodeUnit >= 0xD800 && prevCodeUnit <= 0xDBFF) {
          this.pos--;
        }
      }
    }
  }

  protected slice(start: number, end: number): string {
    return this.input.slice(start, end);
  }

  protected getPosition(): number {
    return this.pos;
  }
}
