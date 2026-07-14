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
import { test } from 'node:test';
import assert from 'node:assert';
import { tokenize } from '../src/tokenizer.ts';
import { StreamingTokenizer } from '../src/streaming-tokenizer.ts';
import type { Token } from '../src/types.ts';
import { Parser } from '../src/parser.ts';
import { StreamingTokenizerStream } from '../src/TokenStream.ts';

function assertTokensEqual(actual: Token[], expected: Token[]) {
  assert.strictEqual(actual.length, expected.length, `Expected \${expected.length} tokens, got \${actual.length}`);
  for (let i = 0; i < actual.length; i++) {
    assert.deepStrictEqual(actual[i], expected[i], `Token at index \${i} mismatch`);
  }
}

test('streaming: single chunk', () => {
  const input = 'div { color: red; }';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk(input);
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split identifier', () => {
  const input = 'ident';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('id');
  tokenizer.appendChunk('ent');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split string', () => {
  const input = '"hello world"';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('"hello ');
  tokenizer.appendChunk('world"');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split number', () => {
  const input = '123.456';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('123');
  tokenizer.appendChunk('.456');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split comment', () => {
  const input = '/* comment */';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('/* com');
  tokenizer.appendChunk('ment */');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split CDO', () => {
  const input = '<!--';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('<!');
  tokenizer.appendChunk('--');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split CDC', () => {
  const input = '-->';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('--');
  tokenizer.appendChunk('>');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: split escape', () => {
  const input = '\\\\21 ';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  tokenizer.appendChunk('\\\\');
  tokenizer.appendChunk('21 ');
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: character by character', () => {
  const input = 'div { color: red; } /* comment */ 123.45e-2 "str"';
  const expectedTokens = tokenize(input);
  
  const tokenizer = new StreamingTokenizer();
  for (const char of input) {
    tokenizer.appendChunk(char);
  }
  tokenizer.close();
  const actualTokens = tokenizer.getTokens();
  
  assertTokensEqual(actualTokens, expectedTokens);
});

test('streaming: parser integration', () => {
  const input = 'div { color: red; } @media (min-width: 600px) { .bar { color: green; } }';
  
  // Non-streaming baseline
  const normalTokens = tokenize(input);
  const normalParser = new Parser(normalTokens);
  const normalSheet = normalParser.parseStyleSheet();
  
  // Streaming
  const tokenizer = new StreamingTokenizer();
  const stream = new StreamingTokenizerStream(tokenizer);
  const streamingParser = new Parser(stream);
  
  tokenizer.appendChunk('div { color: red; } ');
  tokenizer.appendChunk('@media (min-width: 600px) { .bar { color: green; } }');
  tokenizer.close();
  
  const streamingSheet = streamingParser.parseStyleSheet();
  
  const getRulesText = (sheet: { cssRules: ArrayLike<{ cssText: string }> }) => Array.from(sheet.cssRules).map(r => r.cssText);
  assert.deepStrictEqual(getRulesText(streamingSheet), getRulesText(normalSheet));
});
