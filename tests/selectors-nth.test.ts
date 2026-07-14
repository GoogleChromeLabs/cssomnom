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
