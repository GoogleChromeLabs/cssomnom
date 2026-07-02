/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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



test('Media parsing with unknown functions replaced with "not all"', () => {
  const css = '@media unknown-func(val), (unknown-prop: val) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.length, 2);
  // They should serialize to 'not all' for client-visible text!
  assert.strictEqual(mediaRule.media.item(0), 'not all');
  assert.strictEqual(mediaRule.media.item(1), 'not all');

  // But they should be preserved in AST!
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

test('Invalid media range parsing (width: >= 600px) replaced with "not all"', () => {
  const css = '@media (width: >= 600px) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, 'not all');
});

test('Inconsistent media range operators (100px < width > 200px) replaced with "not all"', () => {
  const css = '@media (100px < width > 200px) { body { color: red; } }';
  const tokens = tokenize(css);
  const parser = new Parser(tokens);
  const stylesheet = parser.parseStyleSheet();
  const mediaRule = stylesheet.cssRules[0] as CSSMediaRule;

  assert.strictEqual(mediaRule.media.mediaText, 'not all');
});

import { MediaParser, serializeMediaQuery } from '../src/MediaParser.ts';

test('Media query list error handling: invalid queries are replaced with "not all"', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#error-handling
  // "A media query that does not match the grammar in the previous section must be replaced by 'not all' during parsing."
  
  // Spec example 1:
  const queries1 = MediaParser.parse('(example, all,), speech').map(serializeMediaQuery);
  assert.strictEqual(queries1.length, 2);
  assert.strictEqual(queries1[0], 'not all');
  assert.strictEqual(queries1[1], 'speech');

  // Spec example 2:
  const queries2 = MediaParser.parse('&test, speech').map(serializeMediaQuery);
  assert.strictEqual(queries2.length, 2);
  assert.strictEqual(queries2[0], 'not all');
  assert.strictEqual(queries2[1], 'speech');
});

test('Media query list error handling: unclosed blocks', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#error-handling
  // "Because the parenthesized block is unclosed, it will contain the entire rest of the stylesheet ... and turn the entire thing into a 'not all' media query."
  const queries = MediaParser.parse('(example, speech { body { color: red; } }').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0], 'not all');
});

test('Media query parsing: unknown media types', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#error-handling
  // "An unknown <media-type> must be treated as not matching. For example, the media query unknown is false, as unknown is an unknown media type. But not unknown is true, as the not negates the false media type."
  // Note: they are NOT replaced with "not all", they are parsed as is and evaluate to false.
  const queries = MediaParser.parse('unknown, not unknown').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 2);
  assert.strictEqual(queries[0], 'unknown');
  assert.strictEqual(queries[1], 'not unknown');
});

test('Media query error handling: restricted keywords', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#error-handling
  // "the media query 'or and (color)' is turned into 'not all' during parsing, rather than just treating the 'or' as an unknown media type."
  const queries = MediaParser.parse('or and (color)').map(serializeMediaQuery);
  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0], 'not all');
});

test('Media query error handling: unknown features', () => {
  // https://drafts.csswg.org/css-mediaqueries-4/#error-handling
  // "An unknown <mf-name> or <mf-value>, or a feature value which does not match the value syntax for that media feature, results in the value "unknown". A <media-query> whose value is "unknown" must be replaced with 'not all'."
  const queries1 = MediaParser.parse('screen and (max-weight: 3kg) and (color), (color)').map(serializeMediaQuery);
  assert.strictEqual(queries1.length, 2);
  assert.strictEqual(queries1[0], 'not all');
  assert.strictEqual(queries1[1], '(color)');

  const queries2 = MediaParser.parse('(min-orientation: portrait)').map(serializeMediaQuery);
  assert.strictEqual(queries2.length, 1);
  assert.strictEqual(queries2[0], 'not all');
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
