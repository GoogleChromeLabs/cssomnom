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
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSMediaRule } from '../src/index.ts';

test('MediaList behavior', () => {
  const css = '@media screen, print { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, 'screen, print');
  assert.strictEqual(mediaRule.media.length, 2);
  assert.strictEqual(mediaRule.media.item(0), 'screen');
  assert.strictEqual(mediaRule.media.item(1), 'print');
  assert.strictEqual((mediaRule.media as unknown as ArrayLike<string>)[0], 'screen');
  assert.strictEqual((mediaRule.media as unknown as ArrayLike<string>)[1], 'print');

  // Appending "speech"
  mediaRule.media.appendMedium('speech');
  assert.strictEqual(mediaRule.media.mediaText, 'screen, print, speech');
  assert.strictEqual(mediaRule.media.length, 3);

  // Deleting "print"
  mediaRule.media.deleteMedium('print');
  assert.strictEqual(mediaRule.media.mediaText, 'screen, speech');
  assert.strictEqual(mediaRule.media.length, 2);

  // Setting mediaText directly
  mediaRule.media.mediaText = 'screen and (min-width: 600px)';
  assert.strictEqual(mediaRule.media.mediaText, 'screen and (min-width: 600px)');
  assert.strictEqual(mediaRule.media.length, 1);
  assert.strictEqual(mediaRule.media.item(0), 'screen and (min-width: 600px)');
});



test('Media parsing with unknown functions preserved in general-enclosed', () => {
  const css = '@media unknown-func(val), (unknown-prop: val) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.length, 2);
  // Preserved in serialization per MQ4 § 2.4
  assert.strictEqual(mediaRule.media.item(0), 'unknown-func(val)');
  assert.strictEqual(mediaRule.media.item(1), '(unknown-prop: val)');

  // Preserved in AST
  const ast = (mediaRule.media as unknown as { mediaQueriesAST: import('../src/types.ts').MediaQuery[] }).mediaQueriesAST;
  assert.ok(ast);
  assert.strictEqual(ast.length, 2);
  
  const cond0 = ast[0].condition;
  if (cond0 && cond0.type === 'general-enclosed') {
    assert.strictEqual(cond0.name, 'unknown-func');
  } else {
    assert.fail('Expected general-enclosed condition');
  }

  const cond1 = ast[1].condition;
  if (cond1 && cond1.type === 'media-feature') {
    assert.strictEqual(cond1.name, 'unknown-prop');
  } else {
    assert.fail('Expected media-feature condition');
  }
});

test('Media range parsing (width >= 600px)', () => {
  const css = '@media (width >= 600px) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, '(width >= 600px)');
});

test('Invalid media range parsing (width: >= 600px) preserved in general-enclosed', () => {
  const css = '@media (width: >= 600px) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, '(width: >= 600px)');
  assert.strictEqual(MediaParser.evaluate(mediaRule.media.mediaText), false);
});

test('Inconsistent media range operators (100px < width > 200px) preserved in general-enclosed', () => {
  const css = '@media (100px < width > 200px) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, '(100px < width > 200px)');
  assert.strictEqual(MediaParser.evaluate(mediaRule.media.mediaText), false);
});

import { MediaParser, serializeMediaQuery } from '../src/MediaParser.ts';

test('Media query list error handling: invalid queries are replaced with "not all"', () => {
  // Spec example 1 (general enclosed parenthesized):
  const queries1 = MediaParser.parse('(example, all,), speech').map(serializeMediaQuery);
  assert.strictEqual(queries1.length, 2);
  assert.strictEqual(queries1[0], '(example, all,)');
  assert.strictEqual(queries1[1], 'speech');

  // Spec example 2 (top level invalid token):
  const queries2 = MediaParser.parse('&test, speech').map(serializeMediaQuery);
  assert.strictEqual(queries2.length, 2);
  assert.strictEqual(queries2[0], 'not all');
  assert.strictEqual(queries2[1], 'speech');
});

test('Media query list error handling: unclosed blocks', () => {
  const queries = MediaParser.parse('(example, speech { body { color: red; } }').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0], '(example, speech {body {color: red;}})');
  assert.strictEqual(MediaParser.evaluate(queries[0]), false);
});

test('Media query parsing: unknown media types', () => {
  const queries = MediaParser.parse('unknown, not unknown').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 2);
  assert.strictEqual(queries[0], 'unknown');
  assert.strictEqual(queries[1], 'not unknown');
});

test('Media query error handling: restricted keywords', () => {
  const queries = MediaParser.parse('or and (color)').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0], 'not all');
});

test('Media query error handling: unknown features preserved in serialization but evaluate to false', () => {
  const queries1 = MediaParser.parse('screen and (max-weight: 3kg) and (color), (color)').map(serializeMediaQuery);
  assert.strictEqual(queries1.length, 2);
  assert.strictEqual(queries1[0], 'screen and (max-weight: 3kg) and (color)');
  assert.strictEqual(queries1[1], '(color)');
  assert.strictEqual(MediaParser.evaluate(queries1[0]), false);

  const queries2 = MediaParser.parse('(min-orientation: portrait)').map(serializeMediaQuery);
  assert.strictEqual(queries2.length, 1);
  assert.strictEqual(queries2[0], '(min-orientation: portrait)');
  assert.strictEqual(MediaParser.evaluate(queries2[0]), false);
});

test('Media query list: empty list', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#mq-syntax
  // "Note: This definition of <media-query-list> parsing intentionally accepts an empty list."
  // Note: It evaluates to true. Our parse returns an empty array.
  const queries = MediaParser.parse('').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 0);
});

test('Media query parsing: reject trailing operators', () => {
  const queries1 = MediaParser.parse('(color) and').map(serializeMediaQuery);
  assert.strictEqual(queries1.length, 1);
  assert.strictEqual(queries1[0], 'not all');

  const queries2 = MediaParser.parse('screen and').map(serializeMediaQuery);
  assert.strictEqual(queries2.length, 1);
  assert.strictEqual(queries2[0], 'not all');
});
