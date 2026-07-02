/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { serialize } from '../src/serializer.ts';

test('Preserve :nth-child() arguments', () => {
  const css = ':nth-child(2n + 1 of .active)';
  const ast = Parser.parseSelectorAST(css);
  assert.ok(ast, 'Failed to parse');
  
  const pseudo = ((ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0];
  assert.strictEqual(pseudo.type, 'pseudo-class-selector');
  assert.strictEqual(pseudo.name, 'nth-child');
  
  // Verify that the argument contains both the formula and the selector
  assert.ok(pseudo.nth, 'Missing nth formula');
  assert.strictEqual(serialize(pseudo.nth).trim(), '2n + 1');
  assert.ok(pseudo.argument, 'Missing argument (selector list)');
});
