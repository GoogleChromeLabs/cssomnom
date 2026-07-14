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
import type { Token, TokenStream, ComponentValue, ComponentValueStream } from './types.ts';
import type { StreamingTokenizer } from './streaming-tokenizer.ts';

export class ArrayTokenStream implements TokenStream {
  private tokens: Token[];
  private index: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  next(): Token {
    const token = this.peek();
    if (token.type !== 'EOF') {
      this.index++;
    }
    return token;
  }

  peek(): Token {
    return this.tokens[this.index] || { type: 'EOF', value: '' };
  }
}

export class ArrayComponentValueStream implements ComponentValueStream {
  private values: ComponentValue[];
  private index: number = 0;

  constructor(values: ComponentValue[]) {
    this.values = values;
  }

  next(): ComponentValue {
    const val = this.peek();
    if (val.type !== 'EOF') {
      this.index++;
    }
    return val;
  }

  peek(): ComponentValue {
    return this.values[this.index] || { type: 'EOF', value: '' };
  }

  get position(): number {
    return this.index;
  }

  set position(pos: number) {
    this.index = pos;
  }
}

export class StreamingTokenizerStream implements TokenStream {
  private tokenizer: StreamingTokenizer;
  private bufferedTokens: Token[] = [];

  constructor(tokenizer: StreamingTokenizer) {
    this.tokenizer = tokenizer;
  }

  next(): Token {
    const token = this.peek();
    if (token.type !== 'EOF' && this.bufferedTokens.length > 0) {
      this.bufferedTokens.shift();
    }
    return token;
  }

  peek(): Token {
    if (this.bufferedTokens.length === 0) {
      this.bufferedTokens.push(...this.tokenizer.getTokens());
    }
    return this.bufferedTokens[0] || { type: 'EOF', value: '' };
  }
}

export class LazyComponentValueStream implements ComponentValueStream {
  private fetchNext: () => ComponentValue;
  private mirrorToken: string;
  private buffer: ComponentValue[] = [];
  private index: number = 0;
  private done: boolean = false;

  constructor(fetchNext: () => ComponentValue, mirrorToken: string) {
    this.fetchNext = fetchNext;
    this.mirrorToken = mirrorToken;
  }

  next(): ComponentValue {
    const val = this.peek();
    if (val.type !== 'EOF') {
      this.index++;
    }
    return val;
  }

  peek(): ComponentValue {
    if (this.index < this.buffer.length) {
      return this.buffer[this.index];
    }
    if (this.done) {
      return { type: 'EOF', value: '' };
    }
    
    const val = this.fetchNext();
    
    if (val.type === this.mirrorToken) {
      this.done = true;
      return { type: 'EOF', value: '' };
    }
    
    if (val.type === 'EOF') {
      this.done = true;
      return val;
    }

    this.buffer.push(val);
    return val;
  }

  get position(): number {
    return this.index;
  }

  set position(pos: number) {
    if (pos > this.buffer.length) {
      throw new Error('Cannot seek past buffered content in LazyComponentValueStream');
    }
    this.index = pos;
  }
}
