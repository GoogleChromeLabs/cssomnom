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
import test from 'node:test';
import assert from 'node:assert';
import { Parser, parse } from '../src/parser.ts';

test('Validate pseudo-classes against generated list', () => {
  // Valid pseudo-classes
  assert.ok(Parser.parseSelectorAST(':hover'));
  assert.ok(Parser.parseSelectorAST(':active'));
  assert.ok(Parser.parseSelectorAST(':is(.foo)'));
  
  // Invalid pseudo-classes
  assert.strictEqual(Parser.parseSelectorAST(':non-existent-pseudo-class'), null);
  assert.strictEqual(Parser.parseSelectorAST(':bogus'), null);
});

test('Allow -webkit- prefixed pseudo-classes as quirks', () => {
  assert.ok(Parser.parseSelectorAST(':-webkit-autofill'));
  assert.ok(Parser.parseSelectorAST(':-webkit-any-link'));
  assert.ok(Parser.parseSelectorAST(':-webkit-drag'));
});

test('Validate pseudo-elements against generated list', () => {
  // Valid pseudo-elements
  assert.ok(Parser.parseSelectorAST('::before'));
  assert.ok(Parser.parseSelectorAST('::after'));
  assert.ok(Parser.parseSelectorAST('::placeholder'));
  
  // Legacy pseudo-elements (single colon)
  assert.ok(Parser.parseSelectorAST(':before'));
  assert.ok(Parser.parseSelectorAST(':after'));
  
  // Invalid pseudo-elements
  assert.strictEqual(Parser.parseSelectorAST('::non-existent-pseudo-element'), null);
  assert.strictEqual(Parser.parseSelectorAST('::bogus'), null);
});

test('Forbid pseudo-elements inside logical pseudos', () => {
  // :not is not forgiving, should fail completely
  assert.strictEqual(Parser.parseSelectorAST(':not(::before)'), null);
  assert.strictEqual(Parser.parseSelectorAST(':not(:before)'), null);
});

test('Allow logical pseudo-classes after pseudo-elements', () => {
  assert.ok(Parser.parseSelectorAST('::before:not(:hover)'));
  assert.ok(Parser.parseSelectorAST('::before:not(.foo)'));
  assert.ok(Parser.parseSelectorAST('div::before:is(.hover)'));
  assert.ok(Parser.parseSelectorAST('div::before:where(.foo)'));
  assert.ok(Parser.parseSelectorAST('div::before:has(.foo)'));
});

test('Reject non-webkit vendor pseudos by default (strict mode)', () => {
  // selectors-4 § 3.2 #pseudo-classes & § 3.3 #pseudo-elements
  assert.strictEqual(Parser.parseSelectorAST(':-moz-ui-invalid'), null);
  assert.strictEqual(Parser.parseSelectorAST(':-ms-input-placeholder'), null);
  assert.strictEqual(Parser.parseSelectorAST('::-moz-selection'), null);

  const sheet = parse('a:-moz-ui-invalid { color: red; } c:-ms-input-placeholder { color: blue; } d::-moz-selection { background: yellow; }');
  assert.strictEqual(sheet.cssRules.length, 0);
});

test('Allow cross-browser vendor pseudos when allowVendorPseudos: true', () => {
  // selectors-4 § 3.2 #pseudo-classes & § 3.3 #pseudo-elements
  const css = 'a:-moz-ui-invalid { color: red; } b::-webkit-scrollbar { width: 0; } c:-ms-input-placeholder { color: blue; } d::-moz-selection { background: yellow; }';
  const sheet = parse(css, { allowVendorPseudos: true });
  assert.strictEqual(sheet.cssRules.length, 4);

  assert.ok(Parser.parseSelectorAST(':-moz-ui-invalid', { allowVendorPseudos: true }));
  assert.ok(Parser.parseSelectorAST('::-moz-selection', { allowVendorPseudos: true }));
  assert.ok(Parser.parseSelectorAST(':-ms-input-placeholder', { allowVendorPseudos: true }));
  assert.ok(Parser.parseSelectorAST(':-o-prefocus', { allowVendorPseudos: true }));
});

test('Non-vendor unknown pseudos remain rejected even when allowVendorPseudos: true', () => {
  // selectors-4 § 3.2 #pseudo-classes & § 3.3 #pseudo-elements
  assert.strictEqual(Parser.parseSelectorAST(':bogus', { allowVendorPseudos: true }), null);
  assert.strictEqual(Parser.parseSelectorAST('::fake-thing', { allowVendorPseudos: true }), null);
  assert.strictEqual(Parser.parseSelectorAST(':non-existent-pseudo-class', { allowVendorPseudos: true }), null);
  assert.strictEqual(Parser.parseSelectorAST('::non-existent-pseudo-element', { allowVendorPseudos: true }), null);

  const sheet = parse(':bogus { color: red; } ::fake-thing { color: blue; }', { allowVendorPseudos: true });
  assert.strictEqual(sheet.cssRules.length, 0);
});

test('Functional vendor pseudos and nested vendor selectors with allowVendorPseudos: true', () => {
  // selectors-4 § 3.2 #pseudo-classes
  assert.ok(Parser.parseSelectorAST(':-moz-any(.foo, .bar)', { allowVendorPseudos: true }));
  assert.ok(Parser.parseSelectorAST(':is(:-moz-ui-invalid)', { allowVendorPseudos: true }));

  const sheet = parse('div { &:-moz-ui-invalid { color: red; } }', { allowVendorPseudos: true });
  assert.strictEqual(sheet.cssRules.length, 1);
});



