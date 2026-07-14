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

test('Tokenizer: Hash token id flag', () => {
  const tokens1 = tokenize('#id');
  assert.strictEqual(tokens1.length, 2); // hash, EOF
  assert.strictEqual(tokens1[0].type, 'hash');
  assert.strictEqual(tokens1[0].value, 'id');
  assert.strictEqual(tokens1[0].hashType, 'id');

  const tokens2 = tokenize('#123');
  assert.strictEqual(tokens2.length, 2); // hash, EOF
  assert.strictEqual(tokens2[0].type, 'hash');
  assert.strictEqual(tokens2[0].value, '123');
  assert.strictEqual(tokens2[0].hashType, 'unrestricted');
});

// https://drafts.csswg.org/css-syntax-3/#consume-string-token
test('Tokenizer: Consume string token', () => {
  const t1 = tokenize('"test"');
  assert.strictEqual(t1[0].type, 'string');
  assert.strictEqual(t1[0].value, 'test');

  const t2 = tokenize("'test'");
  assert.strictEqual(t2[0].type, 'string');
  assert.strictEqual(t2[0].value, 'test');
});

// https://drafts.csswg.org/css-syntax-3/#consume-numeric-token
test('Tokenizer: Consume numeric token', () => {
  const t1 = tokenize('123');
  assert.strictEqual(t1[0].type, 'number');
  assert.strictEqual(t1[0].value, 123);

  const t2 = tokenize('12.3px');
  assert.strictEqual(t2[0].type, 'dimension');
  assert.strictEqual(t2[0].value, 12.3);
  assert.strictEqual(t2[0].unit, 'px');

  const t3 = tokenize('45%');
  assert.strictEqual(t3[0].type, 'percentage');
  assert.strictEqual(t3[0].value, 45);
  // Spec says percentage tokens don't preserve integer/number distinction
  assert.strictEqual('numberType' in t3[0], false, 'Percentage token should not have numberType');
});

// https://drafts.csswg.org/css-syntax-3/#consume-ident-like-token
test('Tokenizer: Consume ident-like token', () => {
  const t1 = tokenize('ident');
  assert.strictEqual(t1[0].type, 'ident');
  assert.strictEqual(t1[0].value, 'ident');

  const t2 = tokenize('url("http://example.com")');
  assert.strictEqual(t2[0].type, 'function');
  assert.strictEqual(t2[0].value, 'url');
});

// https://drafts.csswg.org/css-syntax-3/#consume-url-token
test('Tokenizer: Consume url token', () => {
  const t1 = tokenize('url(http://example.com)');
  assert.strictEqual(t1[0].type, 'url');
  assert.strictEqual(t1[0].value, 'http://example.com');
});

// https://drafts.csswg.org/css-syntax-3/#consume-comment
test('Tokenizer: Absorbs comments', () => {
  const t1 = tokenize('/* comment */');
  assert.strictEqual(t1[0].type, 'EOF');

  const t2 = tokenize('a /* c */ b');
  assert.strictEqual(t2.length, 5);
  assert.strictEqual(t2[0].type, 'ident');
  assert.strictEqual(t2[0].value, 'a');
  assert.strictEqual(t2[1].type, 'whitespace');
  assert.strictEqual(t2[2].type, 'whitespace');
  assert.strictEqual(t2[3].type, 'ident');
  assert.strictEqual(t2[3].value, 'b');
});

// https://drafts.csswg.org/css-syntax-3/#consume-unicode-range-token
test('Tokenizer: Consume unicode-range token', () => {
  const t1 = tokenize('U+002B', true);
  assert.strictEqual(t1[0].type, 'unicode-range');
  assert.strictEqual(t1[0].value, 'U+002B');

  const t2 = tokenize('U+1234-5678', true);
  assert.strictEqual(t2[0].type, 'unicode-range');
  assert.strictEqual(t2[0].value, 'U+1234-5678');

  const t3 = tokenize('U+12??', true);
  assert.strictEqual(t3[0].type, 'unicode-range');
  assert.strictEqual(t3[0].value, 'U+1200-12FF');
});

// https://drafts.csswg.org/css-syntax-3/#consume-remnants-of-bad-url
test('Tokenizer: Consume remnants of bad url', () => {
  const t1 = tokenize('url(foo(bar))');
  assert.strictEqual(t1[0].type, 'bad-url');
});

test('Tokenizer: Preprocessing handles surrogate pairs correctly', () => {
  // Valid surrogate pair (emoji 😀)
  const t1 = tokenize('"😀"');
  assert.strictEqual(t1[0].type, 'string');
  assert.strictEqual(t1[0].value, '😀');

  // Lone high surrogate
  const t2 = tokenize('"\uD83D"');
  assert.strictEqual(t2[0].type, 'string');
  assert.strictEqual(t2[0].value, '\uFFFD');

  // Lone low surrogate
  const t3 = tokenize('"\uDE00"');
  assert.strictEqual(t3[0].type, 'string');
  assert.strictEqual(t3[0].value, '\uFFFD');
});
