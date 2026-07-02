/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
