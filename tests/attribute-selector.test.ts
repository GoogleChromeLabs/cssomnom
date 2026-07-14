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

test('SelectorParser: Attribute selector flags and trailing garbage', () => {
  const validSelectors = [
    '[attr]',
    '[attr=val]',
    '[attr="val"]',
    '[attr=val i]',
    '[attr=val s]',
    '[attr="val" i]',
    '[attr="val" s]',
    '[attr=val  i]', // whitespace allowed
    '[attr=val I]', // case insensitive
    '[attr=val S]'
  ];

  for (const sel of validSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.ok(ast, `Should parse valid selector: ${sel}`);
  }

  const invalidSelectors = [
    '[attr=val x]', // invalid flag
    '[attr=val ix]', // invalid flag
    '[attr=val i s]', // multiple flags
    '[attr=val i x]', // trailing garbage after flag
    '[attr=val i garbage]',
    '[attr=val garbage]',
    '[attr=val s garbage]',
    '[attr=val "i"]', // flag must be ident
    '[attr=val i ;]' // garbage inside block
  ];

  for (const sel of invalidSelectors) {
    const ast = Parser.parseSelectorAST(sel);
    assert.strictEqual(ast, null, `Should reject invalid selector: ${sel}`);
  }
});
