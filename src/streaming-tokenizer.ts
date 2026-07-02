/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { AbstractTokenizer } from './AbstractTokenizer.ts';
import type { Token } from './types.ts';

export class NeedMoreDataError extends Error {
  constructor() {
    super('Need more data');
    this.name = 'NeedMoreDataError';
  }
}

export class StreamingTokenizer extends AbstractTokenizer {
  private codePoints: number[] = [];
  private pos: number = 0;
  private isEOF: boolean = false;
  private tokens: Token[] = [];
  private remnant: string = '';

  constructor() {
    super();
  }

  appendChunk(chunk: string): void {
    const text = this.preprocessChunk(chunk, false);
    if (text.length > 0) {
      const newCodePoints = Array.from(text).map(c => {
        const cp = c.codePointAt(0);
        if (cp === undefined) {
          throw new Error('Unexpected undefined code point');
        }
        return cp;
      });
      this.codePoints.push(...newCodePoints);
    }
    this.tokenizeLoop();
  }

  close(): void {
    this.isEOF = true;
    const text = this.preprocessChunk('', true);
    if (text.length > 0) {
      const newCodePoints = Array.from(text).map(c => {
        const cp = c.codePointAt(0);
        if (cp === undefined) {
          throw new Error('Unexpected undefined code point');
        }
        return cp;
      });
      this.codePoints.push(...newCodePoints);
    }
    this.tokenizeLoop();
  }

  getTokens(): Token[] {
    const result = [...this.tokens];
    this.tokens = [];
    
    // Fix memory leak: Truncate codePoints after tokens are emitted
    if (this.pos > 0) {
      this.codePoints = this.codePoints.slice(this.pos);
      this.pos = 0;
    }
    
    return result;
  }

  private preprocessChunk(chunk: string, isLast: boolean): string {
    let text = this.remnant + chunk;
    this.remnant = '';

    if (!isLast && text.endsWith('\r')) {
      this.remnant = '\r';
      text = text.slice(0, -1);
    }

    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\f/g, '\n')
      // oxlint-disable-next-line no-control-regex
      .replace(/\u0000/g, '\uFFFD');
  }

  private tokenizeLoop(): void {
    while (true) {
      const startPos = this.pos;
      try {
        const token = this.consumeToken();
        token.startIndex = startPos;
        token.endIndex = this.pos;
        token.originalText = String.fromCodePoint(...this.codePoints.slice(startPos, token.endIndex));
        this.tokens.push(token);
        if (token.type === 'EOF') {
          break;
        }
      } catch (e) {
        if (e instanceof NeedMoreDataError) {
          this.pos = startPos;
          break;
        }
        throw e;
      }
    }
  }

  protected get cp(): number {
    if (this.pos >= this.codePoints.length) {
      if (this.isEOF) return -1;
      throw new NeedMoreDataError();
    }
    return this.codePoints[this.pos];
  }

  protected peek(offset: number): number {
    const index = this.pos + offset;
    if (index >= this.codePoints.length) {
      if (this.isEOF) return -1;
      throw new NeedMoreDataError();
    }
    return this.codePoints[index];
  }

  protected consume(): number {
    const cp = this.cp;
    if (cp !== -1) {
      this.pos++;
    }
    return cp;
  }

  protected reconsume(): void {
    if (this.pos > 0) {
      this.pos--;
    }
  }

  protected slice(start: number, end: number): string {
    return String.fromCodePoint(...this.codePoints.slice(start, end));
  }

  protected getPosition(): number {
    return this.pos;
  }
}
