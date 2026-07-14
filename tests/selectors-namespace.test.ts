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

test('Selector namespace support (|)', () => {
  const cases = [
    ['ns|div', 'ns', 'div'],
    ['*|div', '*', 'div'],
    ['|div', '', 'div'],
    ['ns|*', 'ns', '*'],
    ['*|*', '*', '*'],
    ['|*', '', '*'],
  ];

  for (const [input, ns, name] of cases) {
    const ast = Parser.parseSelectorAST(input);
    assert.ok(ast, `Failed to parse: ${input}`);
    assert.strictEqual((ast.selectors[0] as import('../src/types.ts').ComplexSelector).items.length, 1, `Should have 1 item for ${input}`);
    const compound = (ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector;
    assert.strictEqual(compound.type, 'compound-selector');
    const simple = compound.selectors[0] as import('../src/types.ts').TypeSelector;
    assert.strictEqual(simple.namespace, ns, `Namespace mismatch for ${input}`);
    if (name === '*') {
      assert.strictEqual(simple.type, 'universal-selector');
    } else {
      assert.strictEqual(simple.type, 'type-selector');
      assert.strictEqual(simple.name, name);
    }
  }
});

test('Attribute selector namespace support', () => {
    const ast = Parser.parseSelectorAST('[ns|attr]');
    assert.ok(ast);
    const simple = ((ast.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0];
    assert.strictEqual(simple.type, 'attribute-selector');
    assert.strictEqual(simple.namespace, 'ns');
    assert.strictEqual(simple.name, 'attr');

    const ast2 = Parser.parseSelectorAST('[*|attr]');
    assert.ok(ast2);
    const simple2 = ((ast2.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0] as import('../src/types.ts').UniversalSelector;
    assert.strictEqual(simple2.namespace, '*');

    const ast3 = Parser.parseSelectorAST('[|attr]');
    assert.ok(ast3);
    const simple3 = ((ast3.selectors[0] as import('../src/types.ts').ComplexSelector).items[0] as import('../src/types.ts').CompoundSelector).selectors[0] as import('../src/types.ts').AttributeSelector;
    assert.strictEqual(simple3.namespace, '');
});
